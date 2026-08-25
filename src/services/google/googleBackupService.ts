import { db } from '../../db/database';
import { googleAuthService } from './googleAuthService';
import { googleSheetsService } from './googleSheetsService';
import type { GoogleBackupMetadata } from '../../types/google';
import { getPersistentDeviceId } from '../../utils/deviceId';

export class GoogleBackupService {
  private getSettingKey(businessId: string): string {
    return `google_backup_${businessId}`;
  }

  /**
   * Retrieves stored local Google Backup metadata for a business.
   */
  async getLocalMetadata(businessId: string): Promise<GoogleBackupMetadata | null> {
    try {
      const setting = await db.appSettings.get(this.getSettingKey(businessId));
      if (!setting || !setting.value) return null;
      return setting.value as GoogleBackupMetadata;
    } catch {
      return null;
    }
  }

  /**
   * Saves or updates local Google Backup metadata.
   */
  async saveLocalMetadata(metadata: GoogleBackupMetadata): Promise<void> {
    const key = this.getSettingKey(metadata.businessId);
    await db.appSettings.put({
      key,
      value: metadata,
    });
  }

  /**
   * Connects Google account by initiating the GIS OAuth flow.
   */
  async connectGoogleAccount(): Promise<{ accessToken: string; email?: string }> {
    const accessToken = await googleAuthService.requestAccessToken();
    const email = googleAuthService.getUserEmail() || undefined;
    return { accessToken, email };
  }

  /**
   * Ensures a dedicated backup spreadsheet exists for the business.
   * Reuses existing accessible spreadsheet or provisions a new one.
   */
  async provisionBackupSpreadsheet(
    businessId: string,
    businessName: string
  ): Promise<{
    metadata: GoogleBackupMetadata;
    reusedExisting: boolean;
  }> {
    let accessToken = googleAuthService.getAccessToken();
    if (!accessToken) {
      // Prompt user to connect if token is not in memory
      accessToken = await googleAuthService.requestAccessToken();
    }

    const deviceId = getPersistentDeviceId();
    const existingMeta = await this.getLocalMetadata(businessId);
    const userEmail = googleAuthService.getUserEmail() || existingMeta?.userEmail;
    const now = new Date().toISOString();

    // 1. If we already have a spreadsheetId, check if it is still accessible
    if (existingMeta?.spreadsheetId) {
      const check = await googleSheetsService.verifySpreadsheetAccess(
        accessToken,
        existingMeta.spreadsheetId
      );

      if (check.accessible) {
        const updatedMeta: GoogleBackupMetadata = {
          ...existingMeta,
          isConnected: true,
          spreadsheetName: check.title || existingMeta.spreadsheetName,
          spreadsheetUrl: check.spreadsheetUrl || existingMeta.spreadsheetUrl,
          userEmail,
          lastVerifiedAt: now,
          updatedAt: now,
        };
        await this.saveLocalMetadata(updatedMeta);
        return { metadata: updatedMeta, reusedExisting: true };
      }
    }

    // 2. Create a new dedicated spreadsheet
    const created = await googleSheetsService.createBackupSpreadsheet(accessToken, {
      businessId,
      businessName,
      deviceId,
    });

    const newMeta: GoogleBackupMetadata = {
      businessId,
      isConnected: true,
      spreadsheetId: created.spreadsheetId,
      spreadsheetName: created.spreadsheetTitle,
      spreadsheetUrl: created.spreadsheetUrl,
      userEmail,
      connectedAt: now,
      lastVerifiedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    await this.saveLocalMetadata(newMeta);
    return { metadata: newMeta, reusedExisting: false };
  }

  /**
   * Verifies current connection status against Google Sheets API.
   */
  async verifyConnection(businessId: string): Promise<{
    connected: boolean;
    accessible: boolean;
    metadata: GoogleBackupMetadata | null;
    error?: string;
  }> {
    const meta = await this.getLocalMetadata(businessId);
    if (!meta || !meta.spreadsheetId) {
      return { connected: false, accessible: false, metadata: meta };
    }

    const accessToken = googleAuthService.getAccessToken();
    if (!accessToken) {
      return {
        connected: false,
        accessible: false,
        metadata: meta,
        error: 'Session token expired. Re-authorization required.',
      };
    }

    const check = await googleSheetsService.verifySpreadsheetAccess(
      accessToken,
      meta.spreadsheetId
    );

    if (check.accessible) {
      const updatedMeta: GoogleBackupMetadata = {
        ...meta,
        isConnected: true,
        lastVerifiedAt: new Date().toISOString(),
      };
      await this.saveLocalMetadata(updatedMeta);
      return { connected: true, accessible: true, metadata: updatedMeta };
    }

    return {
      connected: false,
      accessible: false,
      metadata: meta,
      error: check.errorMessage || 'Spreadsheet is not accessible with current Google Account.',
    };
  }

  /**
   * Disconnects backup spreadsheet association.
   * Does NOT delete local business records and does NOT delete user's Google spreadsheet.
   */
  async disconnect(businessId: string): Promise<void> {
    const key = this.getSettingKey(businessId);
    await db.appSettings.delete(key);
    googleAuthService.disconnect();
  }
}

export const googleBackupService = new GoogleBackupService();
