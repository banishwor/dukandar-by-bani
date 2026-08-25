/**
 * Google Sheets Backup Uploader Service (Phase 7B-2)
 *
 * Implements chunked, staged upload of validated local snapshots into private Google Sheets.
 * - Point-in-time snapshot reuse from Phase 7B-1
 * - Batching & exponential backoff for large collections
 * - Control tabs: README, BackupMeta (append-only history), BackupIndex
 * - Remote verification before marking VERIFIED
 * - Local metadata persistence without modifying transactional sync state
 */

import { db } from '../../db/database';
import { googleAuthService } from './googleAuthService';
import { googleSheetsService, GoogleSheetsApiError } from './googleSheetsService';
import { googleBackupService } from './googleBackupService';
import { googleSheetsMapper, type TabData } from './googleSheetsMapper';
import { backupSnapshotService } from '../backup/backupSnapshotService';
import type {
  GoogleBackupUploadProgress,
  GoogleBackupUploadResult,
  LastSuccessfulBackupInfo,
} from '../../types/googleBackupUpload';

const BATCH_ROW_SIZE = 300;
const MAX_RETRIES = 3;

export class GoogleBackupUploaderService {
  private lastBackupKey(businessId: string): string {
    return `last_backup_${businessId}`;
  }

  /**
   * Retrieves the last successful verified backup metadata from local storage.
   */
  async getLastSuccessfulBackup(businessId: string): Promise<LastSuccessfulBackupInfo | null> {
    try {
      const record = await db.appSettings.get(this.lastBackupKey(businessId));
      if (!record || !record.value) return null;
      return record.value as LastSuccessfulBackupInfo;
    } catch {
      return null;
    }
  }

  /**
   * Saves last successful backup metadata locally.
   */
  private async saveLastSuccessfulBackup(info: LastSuccessfulBackupInfo): Promise<void> {
    await db.appSettings.put({
      key: this.lastBackupKey(info.businessId),
      value: info,
    });
  }

  /**
   * Helper to execute an async API call with exponential backoff on rate limits / network blips.
   */
  private async executeWithRetry<T>(fn: () => Promise<T>, operationDesc: string): Promise<T> {
    let attempt = 0;
    let delay = 500;

    while (true) {
      try {
        return await fn();
      } catch (err: any) {
        attempt++;
        const isRateLimit = err?.statusCode === 429 || (err?.message || '').includes('429');
        const isTransient = err?.statusCode >= 500 || err?.statusCode === 0;

        if ((isRateLimit || isTransient) && attempt < MAX_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 2;
          continue;
        }

        throw err;
      }
    }
  }

  /**
   * Main backup upload pipeline.
   */
  async uploadBackup(
    businessId: string,
    onProgress?: (progress: GoogleBackupUploadProgress) => void
  ): Promise<GoogleBackupUploadResult> {
    const notify = (p: GoogleBackupUploadProgress) => {
      if (onProgress) onProgress(p);
    };

    // Step 1: Snapshot & Local Validation
    notify({
      stage: 'SNAPSHOT',
      processedRecords: 0,
      totalRecords: 0,
      percentage: 5,
      message: 'Generating and cryptographically validating local database snapshot...',
    });

    const snapshot = await backupSnapshotService.createBackupSnapshot(businessId);
    const validation = await backupSnapshotService.validateBackupSnapshot(snapshot);
    if (!validation.isValid) {
      const errMsgs = validation.errors.map((e) => e.message).join('; ');
      throw new Error(`Local snapshot validation failed: ${errMsgs}`);
    }

    const totalRecords = snapshot.metadata.totalRecords;
    let processedRecords = 0;

    // Step 2: Ensure Access Token and Backup Spreadsheet
    let accessToken = googleAuthService.getAccessToken();
    if (!accessToken) {
      accessToken = await googleAuthService.requestAccessToken();
    }

    const localMeta = await googleBackupService.getLocalMetadata(businessId);
    let spreadsheetId = localMeta?.spreadsheetId;
    let spreadsheetUrl = localMeta?.spreadsheetUrl || '';

    if (!spreadsheetId) {
      const provisioned = await googleBackupService.provisionBackupSpreadsheet(
        businessId,
        snapshot.metadata.businessName
      );
      spreadsheetId = provisioned.metadata.spreadsheetId!;
      spreadsheetUrl = provisioned.metadata.spreadsheetUrl || '';
    } else {
      // Verify accessibility
      const check = await googleSheetsService.verifySpreadsheetAccess(accessToken, spreadsheetId);
      if (!check.accessible) {
        throw new Error(
          `Backup spreadsheet "${spreadsheetId}" is not accessible (${check.errorMessage || 'Access Denied'}). Please reauthorize or recreate your backup spreadsheet.`
        );
      }
      spreadsheetUrl = check.spreadsheetUrl || spreadsheetUrl;
    }

    const uploadedAt = new Date().toISOString();

    try {
      // Step 3: Preparing Sheets & Tabs
      notify({
        stage: 'PREPARING_SHEETS',
        processedRecords: 0,
        totalRecords,
        percentage: 15,
        message: 'Configuring Google Spreadsheet tabs and schema structure...',
      });

      const entityTabs = googleSheetsMapper.mapAllEntities(snapshot);
      const requiredTitles = [
        'README',
        'BackupMeta',
        'BackupIndex',
        ...entityTabs.map((t) => t.title),
      ];

      await this.executeWithRetry(
        () => googleSheetsService.ensureSheetsExist(accessToken, spreadsheetId!, requiredTitles),
        'ensureSheetsExist'
      );

      // Step 4: Record Initial STARTED in BackupMeta
      notify({
        stage: 'UPLOADING_METADATA',
        processedRecords: 0,
        totalRecords,
        percentage: 20,
        message: 'Recording backup transaction in BackupMeta history...',
      });

      const metaStarted = googleSheetsMapper.mapBackupMeta(snapshot.metadata, uploadedAt, 'UPLOADING');
      // Append row to BackupMeta
      await this.executeWithRetry(
        () =>
          googleSheetsService.appendValues(
            accessToken,
            spreadsheetId!,
            'BackupMeta!A1:N',
            metaStarted.rows
          ),
        'appendBackupMetaStarted'
      );

      // Step 5: Upload Entity Tabs
      let currentProgress = 20;
      const progressPerEntity = 55 / Math.max(1, entityTabs.length);

      for (const tab of entityTabs) {
        notify({
          stage: 'UPLOADING_ENTITIES',
          currentEntity: tab.title,
          processedRecords,
          totalRecords,
          percentage: Math.min(75, Math.round(currentProgress)),
          message: `Uploading ${tab.title} (${tab.rows.length} records)...`,
        });

        // 1. Clear existing tab
        await this.executeWithRetry(
          () => googleSheetsService.clearSheetValues(accessToken, spreadsheetId!, `${tab.title}!A1:Z`),
          `clearSheet:${tab.title}`
        );

        // 2. Write headers + data rows in chunks
        const allRows = [tab.headers, ...tab.rows];
        for (let i = 0; i < allRows.length; i += BATCH_ROW_SIZE) {
          const chunk = allRows.slice(i, i + BATCH_ROW_SIZE);
          await this.executeWithRetry(
            () =>
              googleSheetsService.appendValues(
                accessToken,
                spreadsheetId!,
                `${tab.title}!A1`,
                chunk
              ),
            `appendChunk:${tab.title}:${i}`
          );
        }

        processedRecords += tab.rows.length;
        currentProgress += progressPerEntity;
      }

      // Step 6: Upload BackupIndex Tab
      notify({
        stage: 'UPLOADING_INDEX',
        processedRecords,
        totalRecords,
        percentage: 80,
        message: 'Uploading BackupIndex transaction vector...',
      });

      const indexTab = googleSheetsMapper.mapBackupIndex(snapshot);
      await this.executeWithRetry(
        () => googleSheetsService.clearSheetValues(accessToken, spreadsheetId!, 'BackupIndex!A1:Z'),
        'clearBackupIndex'
      );

      const allIndexRows = [indexTab.headers, ...indexTab.rows];
      for (let i = 0; i < allIndexRows.length; i += BATCH_ROW_SIZE) {
        const chunk = allIndexRows.slice(i, i + BATCH_ROW_SIZE);
        await this.executeWithRetry(
          () =>
            googleSheetsService.appendValues(
              accessToken,
              spreadsheetId!,
              'BackupIndex!A1',
              chunk
            ),
          `appendIndexChunk:${i}`
        );
      }

      // Step 7: Remote Verification
      notify({
        stage: 'VERIFYING',
        processedRecords,
        totalRecords,
        percentage: 90,
        message: 'Verifying remote backup records and cryptographic checksum...',
      });

      // Read back latest BackupMeta row
      const remoteMetaRows = await this.executeWithRetry(
        () => googleSheetsService.readSheetValues(accessToken, spreadsheetId!, 'BackupMeta!A1:N'),
        'readBackupMetaForVerification'
      );

      // Verify that the backup entry exists and matches checksum
      const matchingRow = remoteMetaRows.find((r) => r[0] === snapshot.metadata.backupId);
      if (!matchingRow || matchingRow[12] !== snapshot.metadata.checksum) {
        throw new Error(
          'Remote verification failed: Checksum or BackupId did not match on Google Sheets.'
        );
      }

      // Append final VERIFIED record in BackupMeta
      const metaVerified = googleSheetsMapper.mapBackupMeta(
        snapshot.metadata,
        new Date().toISOString(),
        'VERIFIED'
      );
      await this.executeWithRetry(
        () =>
          googleSheetsService.appendValues(
            accessToken,
            spreadsheetId!,
            'BackupMeta!A1:N',
            metaVerified.rows
          ),
        'appendBackupMetaVerified'
      );

      // Step 8: Save Local Successful Backup State
      const successInfo: LastSuccessfulBackupInfo = {
        backupId: snapshot.metadata.backupId,
        businessId,
        spreadsheetId: spreadsheetId!,
        spreadsheetUrl,
        uploadedAt,
        status: 'VERIFIED',
        totalRecords,
        sizeBytes: snapshot.metadata.sizeBytes || 0,
        checksum: snapshot.metadata.checksum,
        recordCounts: snapshot.metadata.recordCounts,
      };

      await this.saveLastSuccessfulBackup(successInfo);

      // Note: syncMetadata.syncState is strictly LEFT UNCHANGED per prompt instructions.

      notify({
        stage: 'COMPLETED',
        processedRecords: totalRecords,
        totalRecords,
        percentage: 100,
        message: '✓ Backup verified successfully on Google Sheets.',
      });

      return {
        success: true,
        backupId: snapshot.metadata.backupId,
        spreadsheetId: spreadsheetId!,
        spreadsheetUrl,
        uploadedAt,
        totalRecords,
        sizeBytes: snapshot.metadata.sizeBytes || 0,
        checksum: snapshot.metadata.checksum,
        recordCounts: snapshot.metadata.recordCounts,
      };
    } catch (err: any) {
      notify({
        stage: 'FAILED',
        processedRecords,
        totalRecords,
        percentage: 100,
        message: `Backup failed: ${err?.message || String(err)}`,
      });

      // Attempt to record FAILED state in BackupMeta if accessible
      try {
        if (spreadsheetId && accessToken) {
          const metaFailed = googleSheetsMapper.mapBackupMeta(
            snapshot.metadata,
            new Date().toISOString(),
            'FAILED'
          );
          await googleSheetsService.appendValues(
            accessToken,
            spreadsheetId,
            'BackupMeta!A1:N',
            metaFailed.rows
          );
        }
      } catch {
        // Non-fatal logging for failure recording
      }

      throw err;
    }
  }
}

export const googleBackupUploaderService = new GoogleBackupUploaderService();
