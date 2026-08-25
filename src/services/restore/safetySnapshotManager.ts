/**
 * Local Restore Safety Snapshot Manager (Phase 7C-3)
 *
 * Creates, validates, persists, and verifies local pre-restore safety snapshots.
 * Guarantees that live business state is 100% recoverable before any restore mutation occurs.
 */

import { db } from '../../db/database';
import { backupSnapshotService } from '../backup/backupSnapshotService';
import type { BusinessBackupSnapshot } from '../../types/backup';
import type { SafetySnapshotRecord } from '../../types/restore';

export const safetySnapshotManager = {
  getStorageKey(businessId: string): string {
    return `SAFETY_SNAPSHOT_${businessId}`;
  },

  getMetaKey(businessId: string): string {
    return `SAFETY_SNAPSHOT_META_${businessId}`;
  },

  /**
   * Creates a complete, validated local safety snapshot and persists it to local Dexie storage.
   */
  async createAndPersistSafetySnapshot(businessId: string): Promise<SafetySnapshotRecord> {
    // 1. Create in-memory snapshot of current business state
    const snapshot = await backupSnapshotService.createBackupSnapshot(businessId);

    // 2. Validate snapshot structural & multi-tenant integrity
    const validation = await backupSnapshotService.validateBackupSnapshot(snapshot);
    if (!validation.isValid) {
      const errMsgs = validation.errors.map((e) => e.message).join('; ');
      throw new Error(`Cannot create safety snapshot — local data validation failed: ${errMsgs}`);
    }

    // 3. Verify SHA-256 checksum
    const computedChecksum = await backupSnapshotService.calculateBackupChecksum(snapshot);
    if (computedChecksum !== snapshot.metadata.checksum) {
      throw new Error('Safety snapshot checksum calculation failed.');
    }

    const record: SafetySnapshotRecord = {
      businessId,
      snapshot,
      createdAt: new Date().toISOString(),
      checksum: computedChecksum,
      totalRecords: snapshot.metadata.totalRecords,
      deviceOriginId: snapshot.metadata.deviceId,
    };

    // 4. Persist to Dexie appSettings table
    await db.appSettings.put({
      key: this.getStorageKey(businessId),
      value: JSON.stringify(record),
    });

    await db.appSettings.put({
      key: this.getMetaKey(businessId),
      value: JSON.stringify({
        businessId,
        createdAt: record.createdAt,
        checksum: record.checksum,
        totalRecords: record.totalRecords,
      }),
    });

    return record;
  },

  /**
   * Retrieves the most recent safety snapshot for a business and verifies its cryptographic checksum.
   */
  async getLatestSafetySnapshot(businessId: string): Promise<SafetySnapshotRecord | null> {
    const entry = await db.appSettings.get(this.getStorageKey(businessId));
    if (!entry || !entry.value) return null;

    try {
      const record = JSON.parse(entry.value) as SafetySnapshotRecord;

      // Verify checksum integrity
      const recomputedChecksum = await backupSnapshotService.calculateBackupChecksum(record.snapshot);
      if (recomputedChecksum !== record.checksum) {
        throw new Error('Persisted safety snapshot is corrupted (checksum mismatch).');
      }

      return record;
    } catch (err: any) {
      console.error('Failed to read or verify safety snapshot', err);
      return null;
    }
  },

  /**
   * Clears the safety snapshot after explicit dismissal or retirement.
   */
  async clearSafetySnapshot(businessId: string): Promise<void> {
    await db.appSettings.delete(this.getStorageKey(businessId));
    await db.appSettings.delete(this.getMetaKey(businessId));
  },
};
