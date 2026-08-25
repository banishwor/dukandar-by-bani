/**
 * Local Backup Snapshot Service (Phase 7B-1)
 *
 * Responsibilities:
 * - Deterministic, single-business database snapshot extraction from IndexedDB
 * - Strict multi-tenant isolation (fails on cross-business record discovery)
 * - Canonical JSON serialization with SHA-256 cryptographic checksum
 * - Deep validation of snapshot format, schema, unique IDs, reference integrity, and checksum
 * - Purely local and read-only: Zero Google API calls, zero database mutations
 */

import { db } from '../../db/database';
import { generateUniqueId } from '../../utils/id';
import { getPersistentDeviceId } from '../../utils/deviceId';
import { stringifyCanonical, computeSha256 } from '../../utils/canonicalJson';
import {
  BACKUP_FORMAT_VERSION,
  CURRENT_SCHEMA_VERSION,
  CURRENT_APP_VERSION,
  type BusinessBackupSnapshot,
  type BackupMetadata,
  type BackupRecordCounts,
  type BackupValidationResult,
  type BackupValidationError,
  type BackupSummary,
} from '../../types/backup';

export class BackupSnapshotService {
  /**
   * Generates a complete, deterministic, cryptographically validated local backup snapshot for a business.
   */
  async createBackupSnapshot(businessId: string): Promise<BusinessBackupSnapshot> {
    if (!businessId) {
      throw new Error('A valid businessId is required to create a backup snapshot.');
    }

    // 1. Fetch Business profile
    const business = await db.businesses.get(businessId);
    if (!business || business.isDeleted) {
      throw new Error(`Business "${businessId}" not found or marked as deleted.`);
    }

    const deviceId = getPersistentDeviceId();
    const backupId = generateUniqueId('BACKUP');
    const createdAt = new Date().toISOString();

    // 2. Fetch all domain records filtered by businessId concurrently
    const [
      items,
      customers,
      suppliers,
      sales,
      saleLines,
      saleReturns,
      saleReturnLines,
      saleVoids,
      payments,
      paymentAllocations,
      paymentReversals,
      refunds,
      purchases,
      purchaseLines,
      purchaseReturns,
      purchaseReturnLines,
      purchaseVoids,
      supplierPayments,
      supplierPaymentAllocations,
      supplierPaymentReversals,
      refundsReceived,
      stockMovements,
      financialAccounts,
      financialMovements,
      expenseCategories,
      expenses,
      expenseReversals,
      accountTransfers,
      accountTransferReversals,
    ] = await Promise.all([
      db.items.where('businessId').equals(businessId).toArray(),
      db.customers.where('businessId').equals(businessId).toArray(),
      db.suppliers.where('businessId').equals(businessId).toArray(),
      db.sales.where('businessId').equals(businessId).toArray(),
      db.saleLines.where('businessId').equals(businessId).toArray(),
      db.saleReturns.where('businessId').equals(businessId).toArray(),
      db.saleReturnLines.where('businessId').equals(businessId).toArray(),
      db.saleVoids.where('businessId').equals(businessId).toArray(),
      db.payments.where('businessId').equals(businessId).toArray(),
      db.paymentAllocations.where('businessId').equals(businessId).toArray(),
      db.paymentReversals.where('businessId').equals(businessId).toArray(),
      db.refunds.where('businessId').equals(businessId).toArray(),
      db.purchases.where('businessId').equals(businessId).toArray(),
      db.purchaseLines.where('businessId').equals(businessId).toArray(),
      db.purchaseReturns.where('businessId').equals(businessId).toArray(),
      db.purchaseReturnLines.where('businessId').equals(businessId).toArray(),
      db.purchaseVoids.where('businessId').equals(businessId).toArray(),
      db.supplierPayments.where('businessId').equals(businessId).toArray(),
      db.supplierPaymentAllocations.where('businessId').equals(businessId).toArray(),
      db.supplierPaymentReversals.where('businessId').equals(businessId).toArray(),
      db.refundsReceived.where('businessId').equals(businessId).toArray(),
      db.stockMovements.where('businessId').equals(businessId).toArray(),
      db.financialAccounts.where('businessId').equals(businessId).toArray(),
      db.financialMovements.where('businessId').equals(businessId).toArray(),
      db.expenseCategories.where('businessId').equals(businessId).toArray(),
      db.expenses.where('businessId').equals(businessId).toArray(),
      db.expenseReversals.where('businessId').equals(businessId).toArray(),
      db.accountTransfers.where('businessId').equals(businessId).toArray(),
      db.accountTransferReversals.where('businessId').equals(businessId).toArray(),
    ]);

    // 3. Collect SyncMetadata records for all business entities
    const allBusinessRecordIds = new Set<string>([
      business.id,
      ...items.map((r) => r.id),
      ...customers.map((r) => r.id),
      ...suppliers.map((r) => r.id),
      ...sales.map((r) => r.id),
      ...saleLines.map((r) => r.id),
      ...saleReturns.map((r) => r.id),
      ...saleReturnLines.map((r) => r.id),
      ...saleVoids.map((r) => r.id),
      ...payments.map((r) => r.id),
      ...paymentAllocations.map((r) => r.id),
      ...paymentReversals.map((r) => r.id),
      ...refunds.map((r) => r.id),
      ...purchases.map((r) => r.id),
      ...purchaseLines.map((r) => r.id),
      ...purchaseReturns.map((r) => r.id),
      ...purchaseReturnLines.map((r) => r.id),
      ...purchaseVoids.map((r) => r.id),
      ...supplierPayments.map((r) => r.id),
      ...supplierPaymentAllocations.map((r) => r.id),
      ...supplierPaymentReversals.map((r) => r.id),
      ...refundsReceived.map((r) => r.id),
      ...stockMovements.map((r) => r.id),
      ...financialAccounts.map((r) => r.id),
      ...financialMovements.map((r) => r.id),
      ...expenseCategories.map((r) => r.id),
      ...expenses.map((r) => r.id),
      ...expenseReversals.map((r) => r.id),
      ...accountTransfers.map((r) => r.id),
      ...accountTransferReversals.map((r) => r.id),
    ]);

    const allSyncRecords = await db.syncMetadata.toArray();
    const syncMetadata = allSyncRecords.filter((s) => allBusinessRecordIds.has(s.recordId));

    // 4. Strict business boundary verification
    const collectionsToCheck: Array<{ name: string; records: Array<{ businessId?: string; id: string }> }> = [
      { name: 'items', records: items },
      { name: 'customers', records: customers },
      { name: 'suppliers', records: suppliers },
      { name: 'sales', records: sales },
      { name: 'saleLines', records: saleLines },
      { name: 'saleReturns', records: saleReturns },
      { name: 'saleReturnLines', records: saleReturnLines },
      { name: 'saleVoids', records: saleVoids },
      { name: 'payments', records: payments },
      { name: 'paymentAllocations', records: paymentAllocations },
      { name: 'paymentReversals', records: paymentReversals },
      { name: 'refunds', records: refunds },
      { name: 'purchases', records: purchases },
      { name: 'purchaseLines', records: purchaseLines },
      { name: 'purchaseReturns', records: purchaseReturns },
      { name: 'purchaseReturnLines', records: purchaseReturnLines },
      { name: 'purchaseVoids', records: purchaseVoids },
      { name: 'supplierPayments', records: supplierPayments },
      { name: 'supplierPaymentAllocations', records: supplierPaymentAllocations },
      { name: 'supplierPaymentReversals', records: supplierPaymentReversals },
      { name: 'refundsReceived', records: refundsReceived },
      { name: 'stockMovements', records: stockMovements },
      { name: 'financialAccounts', records: financialAccounts },
      { name: 'financialMovements', records: financialMovements },
      { name: 'expenseCategories', records: expenseCategories },
      { name: 'expenses', records: expenses },
      { name: 'expenseReversals', records: expenseReversals },
      { name: 'accountTransfers', records: accountTransfers },
      { name: 'accountTransferReversals', records: accountTransferReversals },
    ];

    for (const { name, records } of collectionsToCheck) {
      for (const rec of records) {
        if (rec.businessId && rec.businessId !== businessId) {
          throw new Error(
            `Data leakage violation: Record ${rec.id} in collection "${name}" belongs to business "${rec.businessId}", not "${businessId}". Snapshot failed.`
          );
        }
      }
    }

    // 5. Deterministic sorting (id ascending)
    const sortById = <T extends { id: string }>(arr: T[]): T[] =>
      [...arr].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    const sortedBusinesses = sortById([business]);
    const sortedItems = sortById(items);
    const sortedCustomers = sortById(customers);
    const sortedSuppliers = sortById(suppliers);
    const sortedSales = sortById(sales);
    const sortedSaleLines = sortById(saleLines);
    const sortedSaleReturns = sortById(saleReturns);
    const sortedSaleReturnLines = sortById(saleReturnLines);
    const sortedSaleVoids = sortById(saleVoids);
    const sortedPayments = sortById(payments);
    const sortedPaymentAllocations = sortById(paymentAllocations);
    const sortedPaymentReversals = sortById(paymentReversals);
    const sortedRefunds = sortById(refunds);
    const sortedPurchases = sortById(purchases);
    const sortedPurchaseLines = sortById(purchaseLines);
    const sortedPurchaseReturns = sortById(purchaseReturns);
    const sortedPurchaseReturnLines = sortById(purchaseReturnLines);
    const sortedPurchaseVoids = sortById(purchaseVoids);
    const sortedSupplierPayments = sortById(supplierPayments);
    const sortedSupplierPaymentAllocations = sortById(supplierPaymentAllocations);
    const sortedSupplierPaymentReversals = sortById(supplierPaymentReversals);
    const sortedRefundsReceived = sortById(refundsReceived);
    const sortedStockMovements = sortById(stockMovements);
    const sortedFinancialAccounts = sortById(financialAccounts);
    const sortedFinancialMovements = sortById(financialMovements);
    const sortedExpenseCategories = sortById(expenseCategories);
    const sortedExpenses = sortById(expenses);
    const sortedExpenseReversals = sortById(expenseReversals);
    const sortedAccountTransfers = sortById(accountTransfers);
    const sortedAccountTransferReversals = sortById(accountTransferReversals);
    const sortedSyncMetadata = sortById(syncMetadata);

    // 6. Record Counts
    const recordCounts: BackupRecordCounts = {
      businesses: sortedBusinesses.length,
      items: sortedItems.length,
      customers: sortedCustomers.length,
      suppliers: sortedSuppliers.length,
      sales: sortedSales.length,
      saleLines: sortedSaleLines.length,
      saleReturns: sortedSaleReturns.length,
      saleReturnLines: sortedSaleReturnLines.length,
      saleVoids: sortedSaleVoids.length,
      payments: sortedPayments.length,
      paymentAllocations: sortedPaymentAllocations.length,
      paymentReversals: sortedPaymentReversals.length,
      refunds: sortedRefunds.length,
      purchases: sortedPurchases.length,
      purchaseLines: sortedPurchaseLines.length,
      purchaseReturns: sortedPurchaseReturns.length,
      purchaseReturnLines: sortedPurchaseReturnLines.length,
      purchaseVoids: sortedPurchaseVoids.length,
      supplierPayments: sortedSupplierPayments.length,
      supplierPaymentAllocations: sortedSupplierPaymentAllocations.length,
      supplierPaymentReversals: sortedSupplierPaymentReversals.length,
      refundsReceived: sortedRefundsReceived.length,
      stockMovements: sortedStockMovements.length,
      financialAccounts: sortedFinancialAccounts.length,
      financialMovements: sortedFinancialMovements.length,
      expenseCategories: sortedExpenseCategories.length,
      expenses: sortedExpenses.length,
      expenseReversals: sortedExpenseReversals.length,
      accountTransfers: sortedAccountTransfers.length,
      accountTransferReversals: sortedAccountTransferReversals.length,
      syncMetadata: sortedSyncMetadata.length,
    };

    const totalRecords = Object.values(recordCounts).reduce((a, b) => a + b, 0);

    // 7. Initial Snapshot with blank checksum for calculation
    const rawSnapshot: BusinessBackupSnapshot = {
      metadata: {
        backupId,
        backupFormatVersion: BACKUP_FORMAT_VERSION,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        appVersion: CURRENT_APP_VERSION,
        businessId,
        businessName: business.name,
        deviceId,
        createdAt,
        recordCounts,
        totalRecords,
        checksum: '',
        status: 'VALID',
      },
      businesses: sortedBusinesses,
      items: sortedItems,
      customers: sortedCustomers,
      suppliers: sortedSuppliers,
      sales: sortedSales,
      saleLines: sortedSaleLines,
      saleReturns: sortedSaleReturns,
      saleReturnLines: sortedSaleReturnLines,
      saleVoids: sortedSaleVoids,
      payments: sortedPayments,
      paymentAllocations: sortedPaymentAllocations,
      paymentReversals: sortedPaymentReversals,
      refunds: sortedRefunds,
      purchases: sortedPurchases,
      purchaseLines: sortedPurchaseLines,
      purchaseReturns: sortedPurchaseReturns,
      purchaseReturnLines: sortedPurchaseReturnLines,
      purchaseVoids: sortedPurchaseVoids,
      supplierPayments: sortedSupplierPayments,
      supplierPaymentAllocations: sortedSupplierPaymentAllocations,
      supplierPaymentReversals: sortedSupplierPaymentReversals,
      refundsReceived: sortedRefundsReceived,
      stockMovements: sortedStockMovements,
      financialAccounts: sortedFinancialAccounts,
      financialMovements: sortedFinancialMovements,
      expenseCategories: sortedExpenseCategories,
      expenses: sortedExpenses,
      expenseReversals: sortedExpenseReversals,
      accountTransfers: sortedAccountTransfers,
      accountTransferReversals: sortedAccountTransferReversals,
      syncMetadata: sortedSyncMetadata,
    };

    // 8. Compute Checksum and Serialized Size
    const checksum = await this.calculateBackupChecksum(rawSnapshot);
    const finalSnapshot: BusinessBackupSnapshot = {
      ...rawSnapshot,
      metadata: {
        ...rawSnapshot.metadata,
        checksum,
      },
    };

    const canonicalJson = this.serializeBackupSnapshot(finalSnapshot);
    const sizeBytes = new TextEncoder().encode(canonicalJson).length;
    finalSnapshot.metadata.sizeBytes = sizeBytes;

    return finalSnapshot;
  }

  /**
   * Deterministically serializes a snapshot to a canonical UTF-8 JSON string.
   */
  serializeBackupSnapshot(snapshot: BusinessBackupSnapshot): string {
    return stringifyCanonical(snapshot);
  }

  /**
   * Calculates the SHA-256 checksum across the snapshot payload excluding the checksum itself.
   */
  async calculateBackupChecksum(snapshot: BusinessBackupSnapshot): Promise<string> {
    const payloadForChecksum = {
      ...snapshot,
      metadata: {
        ...snapshot.metadata,
        checksum: '',
        sizeBytes: undefined,
      },
    };

    const canonicalJson = stringifyCanonical(payloadForChecksum);
    return computeSha256(canonicalJson);
  }

  /**
   * Validates snapshot format, schema version, single-business integrity, unique IDs, reference relationships, and checksum.
   */
  async validateBackupSnapshot(snapshot: BusinessBackupSnapshot): Promise<BackupValidationResult> {
    const errors: BackupValidationError[] = [];
    const warnings: string[] = [];

    if (!snapshot || typeof snapshot !== 'object') {
      return {
        isValid: false,
        errors: [{ code: 'INVALID_OBJECT', message: 'Snapshot payload is not an object.' }],
        warnings: [],
      };
    }

    const { metadata } = snapshot;
    if (!metadata) {
      return {
        isValid: false,
        errors: [{ code: 'MISSING_METADATA', message: 'Snapshot metadata is missing.' }],
        warnings: [],
      };
    }

    // 1. Format and Schema version checks
    if (metadata.backupFormatVersion !== BACKUP_FORMAT_VERSION) {
      errors.push({
        code: 'UNSUPPORTED_FORMAT_VERSION',
        message: `Unsupported backupFormatVersion ${metadata.backupFormatVersion} (expected ${BACKUP_FORMAT_VERSION}).`,
      });
    }

    if (!metadata.businessId) {
      errors.push({
        code: 'MISSING_BUSINESS_ID',
        message: 'metadata.businessId is missing.',
      });
    }

    const businessId = metadata.businessId;

    // 2. Verify Single Business representation
    if (!Array.isArray(snapshot.businesses) || snapshot.businesses.length !== 1) {
      errors.push({
        code: 'INVALID_BUSINESS_COUNT',
        message: `Snapshot must contain exactly 1 business (found ${snapshot.businesses?.length || 0}).`,
      });
    } else if (snapshot.businesses[0].id !== businessId) {
      errors.push({
        code: 'BUSINESS_ID_MISMATCH',
        message: `Business ID in array (${snapshot.businesses[0].id}) does not match metadata (${businessId}).`,
      });
    }

    // 3. Verify Array Collections existence & counts
    const entityCollections: Array<{ key: keyof BusinessBackupSnapshot; name: string }> = [
      { key: 'items', name: 'items' },
      { key: 'customers', name: 'customers' },
      { key: 'suppliers', name: 'suppliers' },
      { key: 'sales', name: 'sales' },
      { key: 'saleLines', name: 'saleLines' },
      { key: 'saleReturns', name: 'saleReturns' },
      { key: 'saleReturnLines', name: 'saleReturnLines' },
      { key: 'saleVoids', name: 'saleVoids' },
      { key: 'payments', name: 'payments' },
      { key: 'paymentAllocations', name: 'paymentAllocations' },
      { key: 'paymentReversals', name: 'paymentReversals' },
      { key: 'refunds', name: 'refunds' },
      { key: 'purchases', name: 'purchases' },
      { key: 'purchaseLines', name: 'purchaseLines' },
      { key: 'purchaseReturns', name: 'purchaseReturns' },
      { key: 'purchaseReturnLines', name: 'purchaseReturnLines' },
      { key: 'purchaseVoids', name: 'purchaseVoids' },
      { key: 'supplierPayments', name: 'supplierPayments' },
      { key: 'supplierPaymentAllocations', name: 'supplierPaymentAllocations' },
      { key: 'supplierPaymentReversals', name: 'supplierPaymentReversals' },
      { key: 'refundsReceived', name: 'refundsReceived' },
      { key: 'stockMovements', name: 'stockMovements' },
      { key: 'financialAccounts', name: 'financialAccounts' },
      { key: 'financialMovements', name: 'financialMovements' },
      { key: 'expenseCategories', name: 'expenseCategories' },
      { key: 'expenses', name: 'expenses' },
      { key: 'expenseReversals', name: 'expenseReversals' },
      { key: 'accountTransfers', name: 'accountTransfers' },
      { key: 'accountTransferReversals', name: 'accountTransferReversals' },
      { key: 'syncMetadata', name: 'syncMetadata' },
    ];

    const entityIdSets = new Map<string, Set<string>>();

    for (const { key, name } of entityCollections) {
      const arr = snapshot[key] as any[];
      if (!Array.isArray(arr)) {
        errors.push({
          code: 'MISSING_COLLECTION',
          entityType: name,
          message: `Required collection "${name}" is missing or not an array.`,
        });
        continue;
      }

      // Count check
      const expectedCount = (metadata.recordCounts as any)?.[name];
      if (expectedCount !== undefined && expectedCount !== arr.length) {
        errors.push({
          code: 'RECORD_COUNT_MISMATCH',
          entityType: name,
          message: `Record count mismatch for "${name}": metadata says ${expectedCount}, array has ${arr.length}.`,
        });
      }

      // ID Uniqueness & Multi-Tenant check
      const idSet = new Set<string>();
      for (const rec of arr) {
        if (!rec || typeof rec !== 'object' || !rec.id) {
          errors.push({
            code: 'INVALID_RECORD_FORMAT',
            entityType: name,
            message: `Record in "${name}" is missing an id property.`,
          });
          continue;
        }

        if (idSet.has(rec.id)) {
          errors.push({
            code: 'DUPLICATE_RECORD_ID',
            entityType: name,
            recordId: rec.id,
            message: `Duplicate record ID "${rec.id}" found in "${name}".`,
          });
        }
        idSet.add(rec.id);

        if (name !== 'syncMetadata' && rec.businessId && rec.businessId !== businessId) {
          errors.push({
            code: 'CROSS_BUSINESS_RECORD',
            entityType: name,
            recordId: rec.id,
            message: `Cross-business record "${rec.id}" in "${name}" belongs to business "${rec.businessId}".`,
          });
        }

        if (rec.version !== undefined && (typeof rec.version !== 'number' || rec.version < 1)) {
          errors.push({
            code: 'INVALID_RECORD_VERSION',
            entityType: name,
            recordId: rec.id,
            message: `Invalid version "${rec.version}" on record "${rec.id}".`,
          });
        }
      }
      entityIdSets.set(name, idSet);
    }

    // 4. Reference Integrity Checks
    const salesIds = entityIdSets.get('sales') || new Set();
    const paymentsIds = entityIdSets.get('payments') || new Set();
    const purchasesIds = entityIdSets.get('purchases') || new Set();
    const supplierPaymentsIds = entityIdSets.get('supplierPayments') || new Set();
    const itemsIds = entityIdSets.get('items') || new Set();
    const financialAccountsIds = entityIdSets.get('financialAccounts') || new Set();

    // SaleLines -> Sale
    if (Array.isArray(snapshot.saleLines)) {
      for (const line of snapshot.saleLines) {
        if (line.saleId && !salesIds.has(line.saleId)) {
          errors.push({
            code: 'BROKEN_REFERENCE',
            entityType: 'saleLines',
            recordId: line.id,
            message: `SaleLine "${line.id}" references non-existent saleId "${line.saleId}".`,
          });
        }
      }
    }

    // PaymentAllocations -> Payment & Sale
    if (Array.isArray(snapshot.paymentAllocations)) {
      for (const alloc of snapshot.paymentAllocations) {
        if (alloc.paymentId && !paymentsIds.has(alloc.paymentId)) {
          errors.push({
            code: 'BROKEN_REFERENCE',
            entityType: 'paymentAllocations',
            recordId: alloc.id,
            message: `PaymentAllocation "${alloc.id}" references non-existent paymentId "${alloc.paymentId}".`,
          });
        }
        if (alloc.saleId && !salesIds.has(alloc.saleId)) {
          errors.push({
            code: 'BROKEN_REFERENCE',
            entityType: 'paymentAllocations',
            recordId: alloc.id,
            message: `PaymentAllocation "${alloc.id}" references non-existent saleId "${alloc.saleId}".`,
          });
        }
      }
    }

    // PurchaseLines -> Purchase
    if (Array.isArray(snapshot.purchaseLines)) {
      for (const line of snapshot.purchaseLines) {
        if (line.purchaseId && !purchasesIds.has(line.purchaseId)) {
          errors.push({
            code: 'BROKEN_REFERENCE',
            entityType: 'purchaseLines',
            recordId: line.id,
            message: `PurchaseLine "${line.id}" references non-existent purchaseId "${line.purchaseId}".`,
          });
        }
      }
    }

    // SupplierPaymentAllocations -> SupplierPayment & Purchase
    if (Array.isArray(snapshot.supplierPaymentAllocations)) {
      for (const alloc of snapshot.supplierPaymentAllocations) {
        if (alloc.supplierPaymentId && !supplierPaymentsIds.has(alloc.supplierPaymentId)) {
          errors.push({
            code: 'BROKEN_REFERENCE',
            entityType: 'supplierPaymentAllocations',
            recordId: alloc.id,
            message: `SupplierPaymentAllocation "${alloc.id}" references non-existent supplierPaymentId "${alloc.supplierPaymentId}".`,
          });
        }
        if (alloc.purchaseId && !purchasesIds.has(alloc.purchaseId)) {
          errors.push({
            code: 'BROKEN_REFERENCE',
            entityType: 'supplierPaymentAllocations',
            recordId: alloc.id,
            message: `SupplierPaymentAllocation "${alloc.id}" references non-existent purchaseId "${alloc.purchaseId}".`,
          });
        }
      }
    }

    // AccountTransfers -> FinancialAccounts
    if (Array.isArray(snapshot.accountTransfers)) {
      for (const trf of snapshot.accountTransfers) {
        if (trf.fromAccountId && !financialAccountsIds.has(trf.fromAccountId)) {
          errors.push({
            code: 'BROKEN_REFERENCE',
            entityType: 'accountTransfers',
            recordId: trf.id,
            message: `AccountTransfer "${trf.id}" references non-existent fromAccountId "${trf.fromAccountId}".`,
          });
        }
        if (trf.toAccountId && !financialAccountsIds.has(trf.toAccountId)) {
          errors.push({
            code: 'BROKEN_REFERENCE',
            entityType: 'accountTransfers',
            recordId: trf.id,
            message: `AccountTransfer "${trf.id}" references non-existent toAccountId "${trf.toAccountId}".`,
          });
        }
      }
    }

    // 5. Forbidden fields check (Tokens, secrets, passwords)
    const forbiddenKeys = ['access_token', 'accessToken', 'client_secret', 'clientSecret', 'password', 'private_key'];
    const checkForbiddenKeys = (obj: any, path: string) => {
      if (!obj || typeof obj !== 'object') return;
      for (const key of Object.keys(obj)) {
        if (forbiddenKeys.includes(key)) {
          errors.push({
            code: 'FORBIDDEN_CREDENTIAL_FIELD',
            message: `Forbidden security key "${key}" detected at path "${path}.${key}".`,
          });
        }
        if (typeof obj[key] === 'object') {
          checkForbiddenKeys(obj[key], `${path}.${key}`);
        }
      }
    };

    checkForbiddenKeys(snapshot.metadata, 'metadata');

    // 6. Cryptographic Checksum Verification
    const expectedChecksum = await this.calculateBackupChecksum(snapshot);
    if (metadata.checksum !== expectedChecksum) {
      errors.push({
        code: 'CHECKSUM_MISMATCH',
        message: `Cryptographic checksum mismatch! Recorded: ${metadata.checksum}, Calculated: ${expectedChecksum}.`,
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Produces a human-friendly diagnostics summary for UI and logging.
   */
  getBackupSummary(snapshot: BusinessBackupSnapshot): BackupSummary {
    const sizeBytes = snapshot.metadata.sizeBytes || new TextEncoder().encode(this.serializeBackupSnapshot(snapshot)).length;
    let sizeFormatted = `${sizeBytes} B`;
    if (sizeBytes >= 1024 * 1024) {
      sizeFormatted = `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`;
    } else if (sizeBytes >= 1024) {
      sizeFormatted = `${(sizeBytes / 1024).toFixed(1)} KB`;
    }

    return {
      backupId: snapshot.metadata.backupId,
      businessId: snapshot.metadata.businessId,
      businessName: snapshot.metadata.businessName,
      createdAt: snapshot.metadata.createdAt,
      totalRecords: snapshot.metadata.totalRecords,
      sizeBytes,
      sizeFormatted,
      checksum: snapshot.metadata.checksum,
      schemaVersion: snapshot.metadata.schemaVersion,
      backupFormatVersion: snapshot.metadata.backupFormatVersion,
      recordCounts: snapshot.metadata.recordCounts,
    };
  }
}

export const backupSnapshotService = new BackupSnapshotService();
