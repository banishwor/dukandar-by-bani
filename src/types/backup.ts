/**
 * Backup Snapshot Type Definitions (Phase 7B-1)
 *
 * Dedicated Format Version: 1
 * Represents a complete, deterministic, versioned snapshot of a single business.
 */

import type {
  Business,
  Item,
  Customer,
  Supplier,
  Sale,
  SaleLine,
  SaleReturn,
  SaleReturnLine,
  SaleVoid,
  Payment,
  PaymentAllocation,
  PaymentReversal,
  Refund,
  Purchase,
  PurchaseLine,
  PurchaseReturn,
  PurchaseReturnLine,
  PurchaseVoid,
  SupplierPayment,
  SupplierPaymentAllocation,
  SupplierPaymentReversal,
  RefundReceived,
  StockMovement,
  FinancialAccount,
  FinancialMovement,
  ExpenseCategory,
  Expense,
  ExpenseReversal,
  AccountTransfer,
  AccountTransferReversal,
  SyncMetadata,
} from './index';

export const BACKUP_FORMAT_VERSION = 1;
export const CURRENT_SCHEMA_VERSION = 5;
export const CURRENT_APP_VERSION = '1.0.0';

export interface BackupRecordCounts {
  businesses: number;
  items: number;
  customers: number;
  suppliers: number;
  sales: number;
  saleLines: number;
  saleReturns: number;
  saleReturnLines: number;
  saleVoids: number;
  payments: number;
  paymentAllocations: number;
  paymentReversals: number;
  refunds: number;
  purchases: number;
  purchaseLines: number;
  purchaseReturns: number;
  purchaseReturnLines: number;
  purchaseVoids: number;
  supplierPayments: number;
  supplierPaymentAllocations: number;
  supplierPaymentReversals: number;
  refundsReceived: number;
  stockMovements: number;
  financialAccounts: number;
  financialMovements: number;
  expenseCategories: number;
  expenses: number;
  expenseReversals: number;
  accountTransfers: number;
  accountTransferReversals: number;
  syncMetadata: number;
}

export interface BackupMetadata {
  backupId: string;
  backupFormatVersion: number;
  schemaVersion: number;
  appVersion: string;
  businessId: string;
  businessName: string;
  deviceId: string;
  createdAt: string;
  recordCounts: BackupRecordCounts;
  totalRecords: number;
  sizeBytes?: number;
  checksum: string;
  status: 'VALID' | 'TAMPERED' | 'CORRUPTED';
}

export interface BusinessBackupSnapshot {
  metadata: BackupMetadata;

  businesses: Business[];
  items: Item[];
  customers: Customer[];
  suppliers: Supplier[];

  sales: Sale[];
  saleLines: SaleLine[];
  saleReturns: SaleReturn[];
  saleReturnLines: SaleReturnLine[];
  saleVoids: SaleVoid[];

  payments: Payment[];
  paymentAllocations: PaymentAllocation[];
  paymentReversals: PaymentReversal[];
  refunds: Refund[];

  purchases: Purchase[];
  purchaseLines: PurchaseLine[];
  purchaseReturns: PurchaseReturn[];
  purchaseReturnLines: PurchaseReturnLine[];
  purchaseVoids: PurchaseVoid[];

  supplierPayments: SupplierPayment[];
  supplierPaymentAllocations: SupplierPaymentAllocation[];
  supplierPaymentReversals: SupplierPaymentReversal[];
  refundsReceived: RefundReceived[];

  stockMovements: StockMovement[];

  financialAccounts: FinancialAccount[];
  financialMovements: FinancialMovement[];

  expenseCategories: ExpenseCategory[];
  expenses: Expense[];
  expenseReversals: ExpenseReversal[];

  accountTransfers: AccountTransfer[];
  accountTransferReversals: AccountTransferReversal[];

  syncMetadata: SyncMetadata[];
}

export interface BackupValidationError {
  code: string;
  entityType?: string;
  recordId?: string;
  message: string;
}

export interface BackupValidationResult {
  isValid: boolean;
  errors: BackupValidationError[];
  warnings: string[];
}

export interface BackupSummary {
  backupId: string;
  businessId: string;
  businessName: string;
  createdAt: string;
  totalRecords: number;
  sizeBytes: number;
  sizeFormatted: string;
  checksum: string;
  schemaVersion: number;
  backupFormatVersion: number;
  recordCounts: BackupRecordCounts;
}
