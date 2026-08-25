/**
 * Google Backup Restore Preview Coordinator Service (Phase 7C-2)
 *
 * Coordinates the safe, read-only restore preview flow:
 * 1. Validates candidate selection
 * 2. Downloads and reconstructs remote snapshot in memory
 * 3. Validates structural and cryptographic checksum integrity
 * 4. Generates in-memory local snapshot
 * 5. Runs snapshotComparatorService
 * 6. Returns structured RestorePreviewResult
 *
 * CRITICAL SAFETY: ZERO DATABASE WRITES OCCUR IN THIS SERVICE.
 */

import { googleBackupDownloaderService } from './googleBackupDownloaderService';
import { backupSnapshotService } from '../backup/backupSnapshotService';
import { snapshotComparatorService } from '../backup/snapshotComparatorService';
import type { RestorePreviewResult, DownloadProgress } from '../../types/restorePreview';
import type { BusinessBackupSnapshot } from '../../types/backup';

export class GoogleRestorePreviewService {
  /**
   * Generates a complete, verified restore preview comparing remote candidate vs local database.
   */
  async generateRestorePreview(
    businessId: string,
    backupId: string,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<{
    preview: RestorePreviewResult;
    remoteSnapshot: BusinessBackupSnapshot;
    localSnapshot: BusinessBackupSnapshot;
  }> {
    // 1. Download and Reconstruct Remote Snapshot
    const { snapshot: remoteSnapshot } = await googleBackupDownloaderService.downloadAndReconstructSnapshot(
      businessId,
      backupId,
      onProgress
    );

    // 2. Generate In-Memory Local Snapshot for Comparison
    if (onProgress) {
      onProgress({
        stage: 'COMPARING',
        completedTabs: 33,
        totalTabs: 33,
        percentage: 95,
        message: 'Comparing remote snapshot records with local database state...',
      });
    }

    const localSnapshot = await backupSnapshotService.createBackupSnapshot(businessId);

    // 3. Compare Snapshots
    const preview = snapshotComparatorService.compareSnapshots(localSnapshot, remoteSnapshot);

    if (onProgress) {
      onProgress({
        stage: 'READY',
        completedTabs: 33,
        totalTabs: 33,
        percentage: 100,
        message: 'Restore preview generated successfully.',
      });
    }

    return {
      preview,
      remoteSnapshot,
      localSnapshot,
    };
  }
}

export const googleRestorePreviewService = new GoogleRestorePreviewService();
