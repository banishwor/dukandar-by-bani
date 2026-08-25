/**
 * Remote Backup Download, Reconstruction & Restore Preview Types (Phase 7C-2)
 */

import type { BackupRecordCounts, BusinessBackupSnapshot } from './backup';
import type { RemoteBackupSnapshot } from './remoteBackup';

export type RecordChangeStatus =
  | 'UNCHANGED'
  | 'NEW_REMOTE'
  | 'MISSING_REMOTE'
  | 'CHANGED_VERSION'
  | 'CHANGED_DATA'
  | 'DELETED_REMOTE'
  | 'DELETED_LOCAL';

export type VersionComparison =
  | 'REMOTE_NEWER'
  | 'LOCAL_NEWER'
  | 'SAME_VERSION_SAME_DATA'
  | 'SAME_VERSION_DIFFERENT_DATA'
  | 'REMOTE_ONLY'
  | 'LOCAL_ONLY';

export interface EntityDiffSummary {
  entityName: string;
  localCount: number;
  remoteCount: number;
  netDifference: number;
  unchangedCount: number;
  newRemoteCount: number;
  missingRemoteCount: number;
  changedCount: number;
  deletedCount: number;
}

export interface RecordDiffItem {
  recordType: string;
  recordId: string;
  changeStatus: RecordChangeStatus;
  versionComparison: VersionComparison;
  localVersion?: number;
  remoteVersion?: number;
  localUpdatedAt?: string;
  remoteUpdatedAt?: string;
  summaryLabel?: string;
}

export interface RestorePreviewResult {
  backupId: string;
  businessId: string;
  businessName: string;
  backupCreatedAt: string;
  backupUploadedAt: string;
  deviceId: string;
  schemaVersion: number;
  backupFormatVersion: number;
  isOlderThanLocal: boolean;
  timeDifferenceDescription?: string;

  // Verification
  integrityValid: boolean;
  checksumMatched: boolean;
  checksum: string;
  backupIndexValid: boolean;
  validationErrors: string[];

  // Totals
  currentLocalRecordCount: number;
  remoteRecordCount: number;
  netRecordDifference: number;
  totalUnchanged: number;
  totalNewRemote: number;
  totalMissingRemote: number;
  totalChanged: number;
  totalDeleted: number;

  // Breakdown
  entitySummaries: EntityDiffSummary[];
  significantChanges: RecordDiffItem[];
  warnings: string[];
}

export interface DownloadProgress {
  stage: 'VERIFYING_CANDIDATE' | 'DOWNLOADING_METADATA' | 'DOWNLOADING_ENTITIES' | 'RECONSTRUCTING' | 'VALIDATING' | 'COMPARING' | 'READY' | 'FAILED';
  currentTab?: string;
  completedTabs: number;
  totalTabs: number;
  percentage: number;
  message: string;
}
