/**
 * Google Backup Upload & Serialization Types (Phase 7B-2)
 */

import type { BackupRecordCounts } from './backup';

export type GoogleBackupUploadStage =
  | 'IDLE'
  | 'SNAPSHOT'
  | 'PREPARING_SHEETS'
  | 'UPLOADING_METADATA'
  | 'UPLOADING_ENTITIES'
  | 'UPLOADING_INDEX'
  | 'VERIFYING'
  | 'COMPLETED'
  | 'FAILED';

export interface GoogleBackupUploadProgress {
  stage: GoogleBackupUploadStage;
  currentEntity?: string;
  processedRecords: number;
  totalRecords: number;
  percentage: number;
  message: string;
}

export interface GoogleBackupUploadResult {
  success: boolean;
  backupId: string;
  spreadsheetId: string;
  spreadsheetUrl: string;
  uploadedAt: string;
  totalRecords: number;
  sizeBytes: number;
  checksum: string;
  recordCounts: BackupRecordCounts;
  errorMessage?: string;
}

export interface LastSuccessfulBackupInfo {
  backupId: string;
  businessId: string;
  spreadsheetId: string;
  spreadsheetUrl: string;
  uploadedAt: string;
  status: 'VERIFIED' | 'FAILED';
  totalRecords: number;
  sizeBytes: number;
  checksum: string;
  recordCounts: BackupRecordCounts;
}
