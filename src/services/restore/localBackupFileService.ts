// Local Backup File Service
//
// Parses a Dukandar JSON backup file chosen by the user (Sync tab →
// "Restore from Backup File") and classifies it:
//
//  - 'snapshot': the current full backup format produced by
//    backupSnapshotService (metadata + checksum + all collections).
//    These files go through the tested googleBackupRestoreService
//    pipeline: validation, checksum verification, safety snapshot,
//    atomic replace, reconciliation, automatic rollback on failure.
//  - 'legacy': the pre-Batch-C ad-hoc export ({ exportedAt, version,
//    data: {...} }). That export only ever contained 17 of the 31 data
//    collections (no returns, voids, refunds, reversals or allocations)
//    and mixed every business on the device into one file. Restoring it
//    over a live business would silently delete the missing collections,
//    so legacy files are REFUSED with an explanation rather than applied.
//
// Nothing here writes to the database; parsing and classification only.

import type { BusinessBackupSnapshot } from '../../types/backup';

export type ParsedBackupFile =
  | { kind: 'snapshot'; snapshot: BusinessBackupSnapshot }
  | { kind: 'legacy'; exportedAt?: string };

/** Cheap structural check for the current snapshot format. Deep validation
 *  (checksum, referential integrity) is done by the restore pipeline. */
export function looksLikeSnapshot(value: unknown): value is BusinessBackupSnapshot {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  const metadata = v.metadata as Record<string, unknown> | undefined;
  return Boolean(
    metadata &&
      typeof metadata === 'object' &&
      typeof metadata.backupId === 'string' &&
      typeof metadata.businessId === 'string' &&
      typeof metadata.checksum === 'string' &&
      Array.isArray(v.businesses) &&
      Array.isArray(v.items) &&
      Array.isArray(v.sales) &&
      Array.isArray(v.purchases)
  );
}

export function looksLikeLegacyExport(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  const data = v.data as Record<string, unknown> | undefined;
  return Boolean(
    data &&
      typeof data === 'object' &&
      Array.isArray(data.businesses) &&
      typeof v.version === 'number' &&
      !('metadata' in v)
  );
}

export function parseBackupFileText(text: string): ParsedBackupFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON — it may be truncated or not a Dukandar backup at all.');
  }

  if (looksLikeSnapshot(parsed)) {
    return { kind: 'snapshot', snapshot: parsed };
  }
  if (looksLikeLegacyExport(parsed)) {
    const exportedAt = (parsed as { exportedAt?: unknown }).exportedAt;
    return {
      kind: 'legacy',
      exportedAt: typeof exportedAt === 'string' ? exportedAt : undefined,
    };
  }
  throw new Error(
    'Unrecognised backup file. Only Dukandar JSON backups exported from the Sync tab can be restored.'
  );
}

export const LEGACY_EXPORT_MESSAGE =
  'This is an old-format export. Those files were only a partial copy (they never included returns, ' +
  'voids, refunds or payment allocations) and mixed all businesses on the device together, so restoring ' +
  'one would silently delete data. For safety it cannot be restored. If this file is your only copy, keep ' +
  'it — the records in it are still readable as plain JSON text.';
