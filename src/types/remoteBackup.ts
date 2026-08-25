/**
 * Remote Backup Discovery & Candidate Selection Types (Phase 7C-1)
 */

import type { BackupRecordCounts } from './backup';

export type RemoteBackupCompatibility = 'COMPATIBLE' | 'SUPPORTED_WITH_WARNING' | 'INCOMPATIBLE';

export interface RemoteBackupSnapshot {
  backupId: string;
  businessId: string;
  businessName: string;
  backupFormatVersion: number;
  schemaVersion: number;
  appVersion: string;
  deviceId: string;
  createdAt: string;
  uploadedAt: string;
  status: 'STARTED' | 'UPLOADING' | 'VERIFIED' | 'FAILED';
  totalRecords: number;
  sizeBytes: number;
  checksum: string;
  recordCounts: BackupRecordCounts;
  spreadsheetId: string;
  compatibility: RemoteBackupCompatibility;
  compatibilityMessage?: string;
  isValid: boolean;
  validationErrors: string[];
}

export interface RemoteBackupDiscoveryResult {
  spreadsheetId: string;
  spreadsheetTitle?: string;
  verifiedBackups: RemoteBackupSnapshot[];
  allAttempts: RemoteBackupSnapshot[];
  selectedCandidateId?: string;
  lastFetchedAt: string;
}
