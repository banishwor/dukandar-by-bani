/**
 * Deterministic Google Sheets Table Mappers (Phase 7B-2)
 *
 * Converts BusinessBackupSnapshot collections into tabular 2D arrays (headers + rows)
 * with stable, non-shifting schemas for Google Sheets tabs.
 */

import type { BusinessBackupSnapshot, BackupMetadata } from '../../types/backup';
import { stringifyCanonical } from '../../utils/canonicalJson';

export interface TabData {
  title: string;
  headers: string[];
  rows: (string | number | boolean)[][];
}

const formatCellValue = (val: any): string | number | boolean => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'number' || typeof val === 'boolean') return val;
  if (typeof val === 'string') return val;
  return stringifyCanonical(val);
};

export const googleSheetsMapper = {
  /**
   * Generates BackupMeta tab headers and data row.
   */
  mapBackupMeta(meta: BackupMetadata, uploadedAt: string, status: 'STARTED' | 'UPLOADING' | 'VERIFIED' | 'FAILED'): TabData {
    const headers = [
      'backupId',
      'businessId',
      'businessName',
      'backupFormatVersion',
      'schemaVersion',
      'appVersion',
      'deviceId',
      'createdAt',
      'uploadedAt',
      'status',
      'totalRecords',
      'sizeBytes',
      'checksum',
      'recordCountsJson',
    ];

    const row = [
      meta.backupId,
      meta.businessId,
      meta.businessName,
      meta.backupFormatVersion,
      meta.schemaVersion,
      meta.appVersion,
      meta.deviceId,
      meta.createdAt,
      uploadedAt,
      status,
      meta.totalRecords,
      meta.sizeBytes || 0,
      meta.checksum,
      JSON.stringify(meta.recordCounts),
    ];

    return {
      title: 'BackupMeta',
      headers,
      rows: [row],
    };
  },

  /**
   * Generates BackupIndex tab headers and rows for all entities in the snapshot.
   */
  mapBackupIndex(snapshot: BusinessBackupSnapshot): TabData {
    const headers = [
      'backupId',
      'recordType',
      'recordId',
      'version',
      'createdAt',
      'updatedAt',
      'isDeleted',
      'deviceId',
      'recordChecksum',
    ];

    const backupId = snapshot.metadata.backupId;
    const rows: (string | number | boolean)[][] = [];

    const addRecordsToIndex = (recordType: string, records: any[]) => {
      for (const r of records) {
        const row = [
          backupId,
          recordType,
          r.id || '',
          typeof r.version === 'number' ? r.version : 1,
          r.createdAt || '',
          r.updatedAt || r.createdAt || '',
          Boolean(r.isDeleted),
          r.createdByDeviceId || r.updatedByDeviceId || snapshot.metadata.deviceId,
          formatCellValue(stringifyCanonical(r)),
        ];
        rows.push(row);
      }
    };

    addRecordsToIndex('business', snapshot.businesses);
    addRecordsToIndex('item', snapshot.items);
    addRecordsToIndex('customer', snapshot.customers);
    addRecordsToIndex('supplier', snapshot.suppliers);
    addRecordsToIndex('sale', snapshot.sales);
    addRecordsToIndex('saleLine', snapshot.saleLines);
    addRecordsToIndex('saleReturn', snapshot.saleReturns);
    addRecordsToIndex('saleReturnLine', snapshot.saleReturnLines);
    addRecordsToIndex('saleVoid', snapshot.saleVoids);
    addRecordsToIndex('payment', snapshot.payments);
    addRecordsToIndex('paymentAllocation', snapshot.paymentAllocations);
    addRecordsToIndex('paymentReversal', snapshot.paymentReversals);
    addRecordsToIndex('refund', snapshot.refunds);
    addRecordsToIndex('purchase', snapshot.purchases);
    addRecordsToIndex('purchaseLine', snapshot.purchaseLines);
    addRecordsToIndex('purchaseReturn', snapshot.purchaseReturns);
    addRecordsToIndex('purchaseReturnLine', snapshot.purchaseReturnLines);
    addRecordsToIndex('purchaseVoid', snapshot.purchaseVoids);
    addRecordsToIndex('supplierPayment', snapshot.supplierPayments);
    addRecordsToIndex('supplierPaymentAllocation', snapshot.supplierPaymentAllocations);
    addRecordsToIndex('supplierPaymentReversal', snapshot.supplierPaymentReversals);
    addRecordsToIndex('refundReceived', snapshot.refundsReceived);
    addRecordsToIndex('stockMovement', snapshot.stockMovements);
    addRecordsToIndex('financialAccount', snapshot.financialAccounts);
    addRecordsToIndex('financialMovement', snapshot.financialMovements);
    addRecordsToIndex('expenseCategory', snapshot.expenseCategories);
    addRecordsToIndex('expense', snapshot.expenses);
    addRecordsToIndex('expenseReversal', snapshot.expenseReversals);
    addRecordsToIndex('accountTransfer', snapshot.accountTransfers);
    addRecordsToIndex('accountTransferReversal', snapshot.accountTransferReversals);
    addRecordsToIndex('syncMetadata', snapshot.syncMetadata);

    return {
      title: 'BackupIndex',
      headers,
      rows,
    };
  },

  /**
   * Maps an arbitrary record collection using a fixed list of column definitions.
   */
  mapEntityCollection<T extends Record<string, any>>(
    title: string,
    columns: (keyof T | string)[],
    records: T[]
  ): TabData {
    const headers = columns.map(String);
    const rows = records.map((rec) =>
      columns.map((col) => formatCellValue(rec[col as keyof T]))
    );

    return {
      title,
      headers,
      rows,
    };
  },

  /**
   * Maps all 29 domain entity collections in a snapshot to their corresponding TabData.
   */
  mapAllEntities(snapshot: BusinessBackupSnapshot): TabData[] {
    return [
      this.mapEntityCollection('Businesses', [
        'id', 'businessId', 'name', 'currencyCode', 'currencySymbol', 'phone', 'email', 'address', 'taxId',
        'fiscalYearStart', 'createdAt', 'createdByDeviceId', 'updatedAt', 'updatedByDeviceId',
        'version', 'isDeleted',
      ], snapshot.businesses),

      this.mapEntityCollection('Items', [
        'id', 'businessId', 'name', 'type', 'category', 'sku', 'barcode', 'unit', 'sellingPrice',
        'purchasePrice', 'openingStock', 'lowStockThreshold', 'trackInventory', 'isActive',
        'createdAt', 'createdByDeviceId', 'updatedAt', 'updatedByDeviceId', 'version', 'isDeleted',
      ], snapshot.items),

      this.mapEntityCollection('Customers', [
        'id', 'businessId', 'name', 'phone', 'email', 'address', 'notes', 'isActive',
        'createdAt', 'createdByDeviceId', 'updatedAt', 'updatedByDeviceId', 'version', 'isDeleted',
      ], snapshot.customers),

      this.mapEntityCollection('Suppliers', [
        'id', 'businessId', 'name', 'phone', 'email', 'address', 'taxId', 'paymentTerms', 'notes',
        'isActive', 'createdAt', 'createdByDeviceId', 'updatedAt', 'updatedByDeviceId', 'version', 'isDeleted',
      ], snapshot.suppliers),

      this.mapEntityCollection('Sales', [
        'id', 'businessId', 'invoiceNumber', 'customerId', 'customerNameSnapshot', 'saleDate', 'status',
        'subtotal', 'discountType', 'discountValue', 'discountAmount', 'taxAmount', 'totalAmount',
        'paidAmount', 'dueAmount', 'notes', 'createdAt', 'createdByDeviceId', 'updatedAt', 'updatedByDeviceId',
        'version', 'isDeleted',
      ], snapshot.sales),

      this.mapEntityCollection('SaleLines', [
        'id', 'businessId', 'saleId', 'itemId', 'itemNameSnapshot', 'quantity', 'unit', 'rate',
        'discountType', 'discountValue', 'discountAmount', 'taxAmount', 'lineTotal', 'createdAt',
        'updatedAt', 'version',
      ], snapshot.saleLines),

      this.mapEntityCollection('SaleReturns', [
        'id', 'businessId', 'originalSaleId', 'customerId', 'returnNumber', 'returnDate', 'totalAmount',
        'reason', 'notes', 'settlementMode', 'refundAmount', 'createdAt', 'createdByDeviceId', 'updatedAt',
        'updatedByDeviceId', 'version', 'isDeleted',
      ], snapshot.saleReturns),

      this.mapEntityCollection('SaleReturnLines', [
        'id', 'businessId', 'saleReturnId', 'originalSaleId', 'originalSaleLineId', 'itemId',
        'itemNameSnapshot', 'quantity', 'unit', 'rate', 'discountAmount', 'taxAmount', 'totalAmount',
        'trackInventory', 'createdAt', 'createdByDeviceId', 'updatedAt', 'updatedByDeviceId', 'version', 'isDeleted',
      ], snapshot.saleReturnLines),

      this.mapEntityCollection('SaleVoids', [
        'id', 'businessId', 'originalSaleId', 'customerId', 'reason', 'voidDate', 'settlementMode',
        'refundAmount', 'notes', 'createdAt', 'createdByDeviceId', 'updatedAt', 'updatedByDeviceId',
        'version', 'isDeleted',
      ], snapshot.saleVoids),

      this.mapEntityCollection('Payments', [
        'id', 'businessId', 'partyType', 'partyId', 'referenceType', 'referenceId', 'amount',
        'paymentDate', 'paymentMethod', 'notes', 'createdAt', 'createdByDeviceId', 'updatedAt',
        'updatedByDeviceId', 'version', 'isDeleted',
      ], snapshot.payments),

      this.mapEntityCollection('PaymentAllocations', [
        'id', 'businessId', 'paymentId', 'saleId', 'customerId', 'amount', 'createdAt',
        'createdByDeviceId', 'updatedAt', 'updatedByDeviceId', 'version', 'isDeleted',
      ], snapshot.paymentAllocations),

      this.mapEntityCollection('PaymentReversals', [
        'id', 'businessId', 'originalPaymentId', 'customerId', 'amount', 'reason', 'reversalDate',
        'notes', 'createdAt', 'createdByDeviceId', 'updatedAt', 'updatedByDeviceId', 'version', 'isDeleted',
      ], snapshot.paymentReversals),

      this.mapEntityCollection('Refunds', [
        'id', 'businessId', 'customerId', 'saleReturnId', 'saleVoidId', 'amount', 'refundDate',
        'paymentMethod', 'notes', 'createdAt', 'createdByDeviceId', 'updatedAt', 'updatedByDeviceId',
        'version', 'isDeleted',
      ], snapshot.refunds),

      this.mapEntityCollection('Purchases', [
        'id', 'businessId', 'purchaseNumber', 'supplierId', 'supplierNameSnapshot', 'purchaseDate',
        'status', 'subtotal', 'discountType', 'discountValue', 'discountAmount', 'taxAmount', 'totalAmount',
        'paidAmount', 'dueAmount', 'notes', 'createdAt', 'createdByDeviceId', 'updatedAt', 'updatedByDeviceId',
        'version', 'isDeleted',
      ], snapshot.purchases),

      this.mapEntityCollection('PurchaseLines', [
        'id', 'businessId', 'purchaseId', 'itemId', 'itemNameSnapshot', 'quantity', 'unit', 'unitCost',
        'discountType', 'discountValue', 'discountAmount', 'taxAmount', 'lineTotal', 'trackInventory',
        'createdAt', 'updatedAt', 'version',
      ], snapshot.purchaseLines),

      this.mapEntityCollection('PurchaseReturns', [
        'id', 'businessId', 'originalPurchaseId', 'supplierId', 'returnNumber', 'returnDate',
        'totalAmount', 'reason', 'notes', 'settlementMode', 'refundAmount', 'createdAt',
        'createdByDeviceId', 'updatedAt', 'updatedByDeviceId', 'version', 'isDeleted',
      ], snapshot.purchaseReturns),

      this.mapEntityCollection('PurchaseReturnLines', [
        'id', 'businessId', 'purchaseReturnId', 'originalPurchaseId', 'originalPurchaseLineId', 'itemId',
        'itemNameSnapshot', 'quantity', 'unit', 'unitCost', 'discountAmount', 'taxAmount', 'totalAmount',
        'trackInventory', 'createdAt', 'createdByDeviceId', 'updatedAt', 'updatedByDeviceId', 'version', 'isDeleted',
      ], snapshot.purchaseReturnLines),

      this.mapEntityCollection('PurchaseVoids', [
        'id', 'businessId', 'originalPurchaseId', 'supplierId', 'reason', 'voidDate', 'settlementMode',
        'refundAmount', 'notes', 'createdAt', 'createdByDeviceId', 'updatedAt', 'updatedByDeviceId',
        'version', 'isDeleted',
      ], snapshot.purchaseVoids),

      this.mapEntityCollection('SupplierPayments', [
        'id', 'businessId', 'supplierId', 'referenceType', 'referenceId', 'amount', 'paymentDate',
        'paymentMethod', 'direction', 'notes', 'createdAt', 'createdByDeviceId', 'updatedAt',
        'updatedByDeviceId', 'version', 'isDeleted',
      ], snapshot.supplierPayments),

      this.mapEntityCollection('SupplierPaymentAllocations', [
        'id', 'businessId', 'supplierPaymentId', 'purchaseId', 'supplierId', 'amount', 'createdAt',
        'createdByDeviceId', 'updatedAt', 'updatedByDeviceId', 'version', 'isDeleted',
      ], snapshot.supplierPaymentAllocations),

      this.mapEntityCollection('SupplierPaymentReversals', [
        'id', 'businessId', 'originalPaymentId', 'supplierId', 'amount', 'reason', 'reversalDate',
        'notes', 'createdAt', 'createdByDeviceId', 'updatedAt', 'updatedByDeviceId', 'version', 'isDeleted',
      ], snapshot.supplierPaymentReversals),

      this.mapEntityCollection('RefundsReceived', [
        'id', 'businessId', 'supplierId', 'purchaseReturnId', 'purchaseVoidId', 'amount', 'refundDate',
        'paymentMethod', 'notes', 'createdAt', 'createdByDeviceId', 'updatedAt', 'updatedByDeviceId',
        'version', 'isDeleted',
      ], snapshot.refundsReceived),

      this.mapEntityCollection('StockMovements', [
        'id', 'businessId', 'itemId', 'type', 'quantityChange', 'reason', 'referenceId', 'createdAt',
        'createdByDeviceId', 'version',
      ], snapshot.stockMovements),

      this.mapEntityCollection('FinancialAccounts', [
        'id', 'businessId', 'name', 'type', 'openingBalance', 'isDefault', 'isArchived', 'notes',
        'createdAt', 'createdByDeviceId', 'updatedAt', 'updatedByDeviceId', 'version', 'isDeleted',
      ], snapshot.financialAccounts),

      this.mapEntityCollection('FinancialMovements', [
        'id', 'businessId', 'accountId', 'type', 'direction', 'amount', 'movementDate', 'referenceType',
        'referenceId', 'description', 'createdAt', 'createdByDeviceId', 'version', 'isDeleted',
      ], snapshot.financialMovements),

      this.mapEntityCollection('ExpenseCategories', [
        'id', 'businessId', 'name', 'icon', 'color', 'isDefault', 'isArchived', 'createdAt', 'createdByDeviceId',
        'updatedAt', 'updatedByDeviceId', 'version', 'isDeleted',
      ], snapshot.expenseCategories),

      this.mapEntityCollection('Expenses', [
        'id', 'businessId', 'expenseNumber', 'categoryId', 'financialAccountId', 'amount',
        'paymentMethod', 'expenseDate', 'payee', 'notes', 'receiptUrl', 'createdAt',
        'createdByDeviceId', 'updatedAt', 'updatedByDeviceId', 'version', 'isDeleted',
      ], snapshot.expenses),

      this.mapEntityCollection('ExpenseReversals', [
        'id', 'businessId', 'originalExpenseId', 'financialAccountId', 'amount', 'reason',
        'reversalDate', 'notes', 'createdAt', 'createdByDeviceId', 'updatedAt', 'updatedByDeviceId',
        'version', 'isDeleted',
      ], snapshot.expenseReversals),

      this.mapEntityCollection('AccountTransfers', [
        'id', 'businessId', 'transferNumber', 'fromAccountId', 'toAccountId', 'amount',
        'transferDate', 'notes', 'createdAt', 'createdByDeviceId', 'updatedAt', 'updatedByDeviceId',
        'version', 'isDeleted',
      ], snapshot.accountTransfers),

      this.mapEntityCollection('AccountTransferReversals', [
        'id', 'businessId', 'originalTransferId', 'fromAccountId', 'toAccountId', 'amount',
        'reason', 'reversalDate', 'notes', 'createdAt', 'createdByDeviceId', 'updatedAt',
        'updatedByDeviceId', 'version', 'isDeleted',
      ], snapshot.accountTransferReversals),

      this.mapEntityCollection('SyncMetadata', [
        'id', 'recordId', 'recordType', 'syncState', 'lastSyncedAt', 'lastSyncedVersion',
        'updatedAt', 'version',
      ], snapshot.syncMetadata),
    ];
  },
};
