/**
 * Safe Google Backup Restore & Local Safety Snapshot Types (Phase 7C-3)
 */

import type { BusinessBackupSnapshot } from './backup';
import type { ReconciliationReport } from '../services/crossDomainReconciliationService';

export type RestoreStatus =
  | 'IDLE'
  | 'CREATING_SAFETY_SNAPSHOT'
  | 'VALIDATING_REMOTE_DATA'
  | 'STAGING_DATA'
  | 'REPLACING_LIVE_DATA'
  | 'RUNNING_RECONCILIATION'
  | 'COMPLETED'
  | 'FAILED'
  | 'ROLLED_BACK';

export interface RestoreProgress {
  status: RestoreStatus;
  percentage: number;
  message: string;
  stageDetails?: string;
}

export interface RestoreHistoryEntry {
  restoreId: string;
  backupId: string;
  businessId: string;
  businessName: string;
  startedAt: string;
  completedAt?: string;
  status: 'SUCCESS' | 'FAILED' | 'ROLLED_BACK';
  preRestoreChecksum: string;
  restoredChecksum: string;
  restoredRecordCount: number;
  errorMessage?: string;
  reconciliationSummary?: {
    isFullyReconciled: boolean;
    totalAudits: number;
    passedAudits: number;
  };
}

export interface SafetySnapshotRecord {
  businessId: string;
  snapshot: BusinessBackupSnapshot;
  createdAt: string;
  checksum: string;
  totalRecords: number;
  deviceOriginId: string;
}

export interface RestoreExecutionResult {
  success: boolean;
  restoreId: string;
  businessId: string;
  restoredRecordCount: number;
  restoredChecksum: string;
  safetySnapshotChecksum: string;
  reconciliationReport: ReconciliationReport;
  error?: string;
  wasRolledBack?: boolean;
}
