/**
 * In-Memory Snapshot Comparator Service (Phase 7C-2)
 *
 * Compares Local BusinessBackupSnapshot vs Remote Reconstructed BusinessBackupSnapshot.
 * - 100% pure function / in-memory operation (0 database writes)
 * - Identifies UNCHANGED, NEW_REMOTE, MISSING_REMOTE, CHANGED_VERSION, CHANGED_DATA
 * - Detects time differences and generates financial warnings
 */

import type { BusinessBackupSnapshot } from '../../types/backup';
import type {
  EntityDiffSummary,
  RecordDiffItem,
  RecordChangeStatus,
  VersionComparison,
  RestorePreviewResult,
} from '../../types/restorePreview';
import { stringifyCanonical } from '../../utils/canonicalJson';

export const snapshotComparatorService = {
  /**
   * Compares an individual entity collection between local and remote snapshots.
   */
  compareEntityCollection<T extends { id: string; version?: number; updatedAt?: string; createdAt?: string; isDeleted?: boolean }>(
    entityName: string,
    localRecords: T[],
    remoteRecords: T[]
  ): { summary: EntityDiffSummary; items: RecordDiffItem[] } {
    const localMap = new Map<string, T>();
    const remoteMap = new Map<string, T>();

    for (const r of localRecords) localMap.set(r.id, r);
    for (const r of remoteRecords) remoteMap.set(r.id, r);

    const allIds = new Set<string>([...localMap.keys(), ...remoteMap.keys()]);

    let unchangedCount = 0;
    let newRemoteCount = 0;
    let missingRemoteCount = 0;
    let changedCount = 0;
    let deletedCount = 0;

    const items: RecordDiffItem[] = [];

    for (const id of allIds) {
      const local = localMap.get(id);
      const remote = remoteMap.get(id);

      if (local && !remote) {
        // Exists locally, missing in remote backup
        missingRemoteCount++;
        items.push({
          recordType: entityName,
          recordId: id,
          changeStatus: 'MISSING_REMOTE',
          versionComparison: 'LOCAL_ONLY',
          localVersion: local.version,
          localUpdatedAt: local.updatedAt || local.createdAt,
        });
      } else if (!local && remote) {
        // Exists in remote backup, missing locally
        newRemoteCount++;
        items.push({
          recordType: entityName,
          recordId: id,
          changeStatus: 'NEW_REMOTE',
          versionComparison: 'REMOTE_ONLY',
          remoteVersion: remote.version,
          remoteUpdatedAt: remote.updatedAt || remote.createdAt,
        });
      } else if (local && remote) {
        const localVersion = local.version || 1;
        const remoteVersion = remote.version || 1;
        const localCanonical = stringifyCanonical(local);
        const remoteCanonical = stringifyCanonical(remote);

        let changeStatus: RecordChangeStatus = 'UNCHANGED';
        let versionComp: VersionComparison = 'SAME_VERSION_SAME_DATA';

        if (remote.isDeleted && !local.isDeleted) {
          changeStatus = 'DELETED_REMOTE';
          deletedCount++;
        } else if (!remote.isDeleted && local.isDeleted) {
          changeStatus = 'DELETED_LOCAL';
          deletedCount++;
        } else if (remoteVersion > localVersion) {
          changeStatus = 'CHANGED_VERSION';
          versionComp = 'REMOTE_NEWER';
          changedCount++;
        } else if (localVersion > remoteVersion) {
          changeStatus = 'CHANGED_VERSION';
          versionComp = 'LOCAL_NEWER';
          changedCount++;
        } else if (localCanonical !== remoteCanonical) {
          changeStatus = 'CHANGED_DATA';
          versionComp = 'SAME_VERSION_DIFFERENT_DATA';
          changedCount++;
        } else {
          unchangedCount++;
        }

        if (changeStatus !== 'UNCHANGED') {
          items.push({
            recordType: entityName,
            recordId: id,
            changeStatus,
            versionComparison: versionComp,
            localVersion,
            remoteVersion,
            localUpdatedAt: local.updatedAt || local.createdAt,
            remoteUpdatedAt: remote.updatedAt || remote.createdAt,
          });
        }
      }
    }

    const summary: EntityDiffSummary = {
      entityName,
      localCount: localRecords.length,
      remoteCount: remoteRecords.length,
      netDifference: remoteRecords.length - localRecords.length,
      unchangedCount,
      newRemoteCount,
      missingRemoteCount,
      changedCount,
      deletedCount,
    };

    return { summary, items };
  },

  /**
   * Generates a comprehensive comparison report between local and remote snapshots.
   */
  compareSnapshots(
    localSnapshot: BusinessBackupSnapshot,
    remoteSnapshot: BusinessBackupSnapshot
  ): RestorePreviewResult {
    const entitySummaries: EntityDiffSummary[] = [];
    const significantChanges: RecordDiffItem[] = [];

    const compareAndAdd = (name: string, local: any[], remote: any[]) => {
      const diff = this.compareEntityCollection(name, local, remote);
      entitySummaries.push(diff.summary);
      significantChanges.push(...diff.items.slice(0, 10)); // Keep top 10 items for detail view
    };

    compareAndAdd('Businesses', localSnapshot.businesses, remoteSnapshot.businesses);
    compareAndAdd('Items', localSnapshot.items, remoteSnapshot.items);
    compareAndAdd('Customers', localSnapshot.customers, remoteSnapshot.customers);
    compareAndAdd('Suppliers', localSnapshot.suppliers, remoteSnapshot.suppliers);
    compareAndAdd('Sales', localSnapshot.sales, remoteSnapshot.sales);
    compareAndAdd('SaleLines', localSnapshot.saleLines, remoteSnapshot.saleLines);
    compareAndAdd('SaleReturns', localSnapshot.saleReturns, remoteSnapshot.saleReturns);
    compareAndAdd('SaleReturnLines', localSnapshot.saleReturnLines, remoteSnapshot.saleReturnLines);
    compareAndAdd('SaleVoids', localSnapshot.saleVoids, remoteSnapshot.saleVoids);
    compareAndAdd('Payments', localSnapshot.payments, remoteSnapshot.payments);
    compareAndAdd('PaymentAllocations', localSnapshot.paymentAllocations, remoteSnapshot.paymentAllocations);
    compareAndAdd('PaymentReversals', localSnapshot.paymentReversals, remoteSnapshot.paymentReversals);
    compareAndAdd('Refunds', localSnapshot.refunds, remoteSnapshot.refunds);
    compareAndAdd('Purchases', localSnapshot.purchases, remoteSnapshot.purchases);
    compareAndAdd('PurchaseLines', localSnapshot.purchaseLines, remoteSnapshot.purchaseLines);
    compareAndAdd('PurchaseReturns', localSnapshot.purchaseReturns, remoteSnapshot.purchaseReturns);
    compareAndAdd('PurchaseReturnLines', localSnapshot.purchaseReturnLines, remoteSnapshot.purchaseReturnLines);
    compareAndAdd('PurchaseVoids', localSnapshot.purchaseVoids, remoteSnapshot.purchaseVoids);
    compareAndAdd('SupplierPayments', localSnapshot.supplierPayments, remoteSnapshot.supplierPayments);
    compareAndAdd('SupplierPaymentAllocations', localSnapshot.supplierPaymentAllocations, remoteSnapshot.supplierPaymentAllocations);
    compareAndAdd('SupplierPaymentReversals', localSnapshot.supplierPaymentReversals, remoteSnapshot.supplierPaymentReversals);
    compareAndAdd('RefundsReceived', localSnapshot.refundsReceived, remoteSnapshot.refundsReceived);
    compareAndAdd('StockMovements', localSnapshot.stockMovements, remoteSnapshot.stockMovements);
    compareAndAdd('FinancialAccounts', localSnapshot.financialAccounts, remoteSnapshot.financialAccounts);
    compareAndAdd('FinancialMovements', localSnapshot.financialMovements, remoteSnapshot.financialMovements);
    compareAndAdd('ExpenseCategories', localSnapshot.expenseCategories, remoteSnapshot.expenseCategories);
    compareAndAdd('Expenses', localSnapshot.expenses, remoteSnapshot.expenses);
    compareAndAdd('ExpenseReversals', localSnapshot.expenseReversals, remoteSnapshot.expenseReversals);
    compareAndAdd('AccountTransfers', localSnapshot.accountTransfers, remoteSnapshot.accountTransfers);
    compareAndAdd('AccountTransferReversals', localSnapshot.accountTransferReversals, remoteSnapshot.accountTransferReversals);
    compareAndAdd('SyncMetadata', localSnapshot.syncMetadata, remoteSnapshot.syncMetadata);

    const totalUnchanged = entitySummaries.reduce((a, b) => a + b.unchangedCount, 0);
    const totalNewRemote = entitySummaries.reduce((a, b) => a + b.newRemoteCount, 0);
    const totalMissingRemote = entitySummaries.reduce((a, b) => a + b.missingRemoteCount, 0);
    const totalChanged = entitySummaries.reduce((a, b) => a + b.changedCount, 0);
    const totalDeleted = entitySummaries.reduce((a, b) => a + b.deletedCount, 0);

    // Time difference detection
    const remoteTime = new Date(remoteSnapshot.metadata.createdAt).getTime();
    const localLatestRecordTime = Math.max(
      ...localSnapshot.sales.map((s) => new Date(s.updatedAt || s.createdAt).getTime()),
      ...localSnapshot.payments.map((p) => new Date(p.updatedAt || p.createdAt).getTime()),
      ...localSnapshot.expenses.map((e) => new Date(e.updatedAt || e.createdAt).getTime()),
      0
    );

    const isOlderThanLocal = localLatestRecordTime > remoteTime;
    let timeDifferenceDescription = '';
    const warnings: string[] = [];

    if (isOlderThanLocal) {
      const diffMs = localLatestRecordTime - remoteTime;
      const diffHours = Math.round(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffHours / 24);

      if (diffDays > 0) {
        timeDifferenceDescription = `Selected backup was created ${diffDays} day(s) before latest local activity.`;
      } else {
        timeDifferenceDescription = `Selected backup is approx ${diffHours} hour(s) older than local changes.`;
      }

      warnings.push(
        'Selected backup is older than current local device state. Restoring will replace newer local entries created since this backup.'
      );
    }

    if (totalMissingRemote > 0) {
      warnings.push(
        `There are ${totalMissingRemote} local record(s) on this device that do not exist in the remote backup.`
      );
    }

    return {
      backupId: remoteSnapshot.metadata.backupId,
      businessId: remoteSnapshot.metadata.businessId,
      businessName: remoteSnapshot.metadata.businessName,
      backupCreatedAt: remoteSnapshot.metadata.createdAt,
      backupUploadedAt: (remoteSnapshot.metadata as any).uploadedAt || remoteSnapshot.metadata.createdAt,
      deviceId: remoteSnapshot.metadata.deviceId,
      schemaVersion: remoteSnapshot.metadata.schemaVersion,
      backupFormatVersion: remoteSnapshot.metadata.backupFormatVersion,
      isOlderThanLocal,
      timeDifferenceDescription,

      integrityValid: true,
      checksumMatched: true,
      checksum: remoteSnapshot.metadata.checksum,
      backupIndexValid: true,
      validationErrors: [],

      currentLocalRecordCount: localSnapshot.metadata.totalRecords,
      remoteRecordCount: remoteSnapshot.metadata.totalRecords,
      netRecordDifference: remoteSnapshot.metadata.totalRecords - localSnapshot.metadata.totalRecords,
      totalUnchanged,
      totalNewRemote,
      totalMissingRemote,
      totalChanged,
      totalDeleted,

      entitySummaries,
      significantChanges,
      warnings,
    };
  },
};
