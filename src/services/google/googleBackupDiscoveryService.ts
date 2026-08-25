/**
 * Google Backup Discovery & Restore Candidate Selection Service (Phase 7C-1)
 *
 * Discovers and parses verified remote backups from the user's private Google Spreadsheet.
 * - Reads authoritative BackupMeta control tab
 * - Strictly enforces business isolation (matching active businessId)
 * - Excludes unverified/failed attempts from selectable candidates
 * - Validates metadata & cryptographic checksum format
 * - Checks schema and backup format compatibility
 * - Operates 100% read-only with zero local DB mutations and zero entity downloads
 */

import { googleAuthService } from './googleAuthService';
import { googleSheetsService } from './googleSheetsService';
import { googleBackupService } from './googleBackupService';
import { BACKUP_FORMAT_VERSION, CURRENT_SCHEMA_VERSION } from '../../types/backup';
import type {
  RemoteBackupSnapshot,
  RemoteBackupDiscoveryResult,
  RemoteBackupCompatibility,
} from '../../types/remoteBackup';

export class GoogleBackupDiscoveryService {
  /**
   * Evaluates format and schema compatibility.
   */
  checkCompatibility(
    formatVersion: number,
    schemaVersion: number
  ): { compatibility: RemoteBackupCompatibility; message?: string } {
    if (formatVersion > BACKUP_FORMAT_VERSION) {
      return {
        compatibility: 'INCOMPATIBLE',
        message: `Unsupported backup format (v${formatVersion}). Please update the application.`,
      };
    }

    if (schemaVersion > CURRENT_SCHEMA_VERSION) {
      return {
        compatibility: 'INCOMPATIBLE',
        message: `Backup schema (v${schemaVersion}) is newer than current database version (v${CURRENT_SCHEMA_VERSION}).`,
      };
    }

    if (schemaVersion < CURRENT_SCHEMA_VERSION) {
      return {
        compatibility: 'SUPPORTED_WITH_WARNING',
        message: `Legacy schema (v${schemaVersion}) is supported and can be migrated upon future restore.`,
      };
    }

    return {
      compatibility: 'COMPATIBLE',
      message: '100% compatible with current application version.',
    };
  }

  /**
   * Validates metadata structure of a discovered backup.
   */
  validateMetadata(meta: Partial<RemoteBackupSnapshot>): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!meta.backupId || typeof meta.backupId !== 'string' || meta.backupId.trim() === '') {
      errors.push('Missing or invalid backupId.');
    }

    if (!meta.businessId || typeof meta.businessId !== 'string' || meta.businessId.trim() === '') {
      errors.push('Missing or invalid businessId.');
    }

    if (!meta.checksum || !/^sha256:[a-f0-9]{64}$/i.test(meta.checksum)) {
      errors.push('Invalid SHA-256 checksum format.');
    }

    if (typeof meta.totalRecords !== 'number' || meta.totalRecords < 0 || isNaN(meta.totalRecords)) {
      errors.push('Invalid totalRecords count.');
    }

    if (!meta.createdAt || isNaN(new Date(meta.createdAt).getTime())) {
      errors.push('Invalid createdAt timestamp.');
    }

    if (!meta.uploadedAt || isNaN(new Date(meta.uploadedAt).getTime())) {
      errors.push('Invalid uploadedAt timestamp.');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Parses a raw row from BackupMeta tab into a typed RemoteBackupSnapshot object.
   */
  parseBackupMetaRow(
    row: any[],
    spreadsheetId: string,
    activeBusinessId: string
  ): RemoteBackupSnapshot | null {
    // Header row skip or insufficient columns
    if (!row || row.length < 10 || row[0] === 'backupId' || row[0] === 'Field') {
      return null;
    }

    const backupId = String(row[0] || '').trim();
    const businessId = String(row[1] || '').trim();
    const businessName = String(row[2] || '').trim();
    const backupFormatVersion = parseInt(String(row[3]), 10) || 1;
    const schemaVersion = parseInt(String(row[4]), 10) || 5;
    const appVersion = String(row[5] || '1.0.0').trim();
    const deviceId = String(row[6] || '').trim();
    const createdAt = String(row[7] || '').trim();
    const uploadedAt = String(row[8] || '').trim();
    const status = String(row[9] || 'STARTED').trim().toUpperCase() as any;
    const totalRecords = parseInt(String(row[10]), 10) || 0;
    const sizeBytes = parseInt(String(row[11]), 10) || 0;
    const checksum = String(row[12] || '').trim();

    let recordCounts: any = {};
    try {
      if (row[13]) {
        recordCounts = typeof row[13] === 'string' ? JSON.parse(row[13]) : row[13];
      }
    } catch {
      recordCounts = {};
    }

    // Strictly enforce multi-tenant business isolation:
    // If the backup belongs to another business, do NOT parse or expose it
    if (businessId !== activeBusinessId) {
      return null;
    }

    const { compatibility, message: compatibilityMessage } = this.checkCompatibility(
      backupFormatVersion,
      schemaVersion
    );

    const validation = this.validateMetadata({
      backupId,
      businessId,
      checksum,
      totalRecords,
      createdAt,
      uploadedAt,
    });

    return {
      backupId,
      businessId,
      businessName,
      backupFormatVersion,
      schemaVersion,
      appVersion,
      deviceId,
      createdAt,
      uploadedAt,
      status,
      totalRecords,
      sizeBytes,
      checksum,
      recordCounts,
      spreadsheetId,
      compatibility,
      compatibilityMessage,
      isValid: validation.isValid,
      validationErrors: validation.errors,
    };
  }

  /**
   * Lists remote backup snapshots from Google Sheets for the active business.
   */
  async listRemoteBackups(businessId: string): Promise<RemoteBackupDiscoveryResult> {
    const localMeta = await googleBackupService.getLocalMetadata(businessId);
    if (!localMeta || !localMeta.spreadsheetId) {
      throw new Error(
        'No Google backup spreadsheet configured for this business. Please connect Google Backup first.'
      );
    }

    const spreadsheetId = localMeta.spreadsheetId;

    let accessToken = googleAuthService.getAccessToken();
    if (!accessToken) {
      accessToken = await googleAuthService.requestAccessToken();
    }

    // Check spreadsheet access
    const check = await googleSheetsService.verifySpreadsheetAccess(accessToken, spreadsheetId);
    if (!check.accessible) {
      throw new Error(
        `Backup spreadsheet is not accessible (${check.errorMessage || 'Access Denied'}). Please reauthorize or reconnect.`
      );
    }

    // Read BackupMeta tab values
    let rawRows: any[][] = [];
    try {
      rawRows = await googleSheetsService.readSheetValues(accessToken, spreadsheetId, 'BackupMeta!A1:N');
    } catch (err: any) {
      // If BackupMeta tab doesn't exist yet or is empty
      rawRows = [];
    }

    const allAttempts: RemoteBackupSnapshot[] = [];
    const verifiedMap = new Map<string, RemoteBackupSnapshot>();

    for (const row of rawRows) {
      const parsed = this.parseBackupMetaRow(row, spreadsheetId, businessId);
      if (!parsed) continue;

      allAttempts.push(parsed);

      // Only VERIFIED entries with valid metadata and compatible format are candidate candidates
      if (parsed.status === 'VERIFIED' && parsed.isValid && parsed.compatibility !== 'INCOMPATIBLE') {
        // Idempotent deduplication by backupId (latest verified record wins)
        verifiedMap.set(parsed.backupId, parsed);
      }
    }

    // Sort verified backups: newest first (uploadedAt DESC, then backupId DESC)
    const verifiedBackups = Array.from(verifiedMap.values()).sort((a, b) => {
      const timeDiff = new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
      if (timeDiff !== 0) return timeDiff;
      return b.backupId.localeCompare(a.backupId);
    });

    // Sort all attempts: newest first
    allAttempts.sort((a, b) => {
      const timeDiff = new Date(b.uploadedAt || b.createdAt).getTime() - new Date(a.uploadedAt || a.createdAt).getTime();
      if (timeDiff !== 0) return timeDiff;
      return b.backupId.localeCompare(a.backupId);
    });

    return {
      spreadsheetId,
      spreadsheetTitle: check.title || localMeta.spreadsheetName,
      verifiedBackups,
      allAttempts,
      lastFetchedAt: new Date().toISOString(),
    };
  }

  /**
   * Fetches full metadata details for a specific backupId.
   */
  async getRemoteBackupDetails(
    businessId: string,
    backupId: string
  ): Promise<RemoteBackupSnapshot | null> {
    const list = await this.listRemoteBackups(businessId);
    const candidate = list.verifiedBackups.find((b) => b.backupId === backupId);
    if (candidate) return candidate;
    return list.allAttempts.find((b) => b.backupId === backupId) || null;
  }
}

export const googleBackupDiscoveryService = new GoogleBackupDiscoveryService();
