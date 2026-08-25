export interface BaseRecord {
  id: string;
  businessId: string;
  createdAt: string;
  updatedAt: string;
  createdByDeviceId: string;
  updatedByDeviceId: string;
  version: number;
  isDeleted: boolean;
}

export interface Business extends BaseRecord {
  name: string;
  type?: string;
  logo?: string;
  currencyCode: string;
  currencySymbol: string;
  financialYearStart?: string;
  paymentTermsDays?: number;
  phone?: string;
  email?: string;
  address?: string;
}

export type ItemType = 'PRODUCT' | 'SERVICE';

export interface Item extends BaseRecord {
  name: string;
  type: ItemType;
  sku?: string;
  barcode?: string;
  category?: string;
  unit: string;
  sellingPrice: number;
  purchasePrice?: number;
  costPrice?: number; // Optional alias for purchasePrice
  openingStock: number;
  lowStockThreshold?: number;
  trackInventory: boolean;
  isActive: boolean;
}

export type StockMovementType =
  | 'OPENING_STOCK'
  | 'SALE'
  | 'PURCHASE'
  | 'SALE_RETURN'
  | 'PURCHASE_RETURN'
  | 'ADJUSTMENT'
  | 'DAMAGE';

export interface StockMovement {
  id: string;
  businessId: string;
  itemId: string;
  type: StockMovementType;
  quantityChange: number; // positive for addition, negative for deduction
  reason?: string;
  referenceId?: string; // saleId, adjustmentId, etc.
  createdAt: string;
  createdByDeviceId: string;
  version: number;
}

export interface Customer extends BaseRecord {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  isActive: boolean;
}

export interface Supplier extends BaseRecord {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  taxId?: string;
  paymentTerms?: string;
  notes?: string;
  isActive: boolean;
}

export type DiscountType = 'NONE' | 'PERCENTAGE' | 'FLAT';
export type SaleStatus = 'PAID' | 'UNPAID' | 'PARTIAL' | 'VOIDED' | 'RETURNED';
export type PurchaseStatus = 'PAID' | 'UNPAID' | 'PARTIAL' | 'VOIDED' | 'RETURNED';

export interface Sale extends BaseRecord {
  invoiceNumber: string;
  customerId?: string;
  customerNameSnapshot: string;
  saleDate: string;
  status: SaleStatus;
  subtotal: number;
  discountType?: DiscountType;
  discountValue?: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  notes?: string;
}

export interface Purchase extends BaseRecord {
  purchaseNumber: string;
  supplierId?: string;
  supplierNameSnapshot: string;
  purchaseDate: string;
  status: PurchaseStatus;
  subtotal: number;
  discountType?: DiscountType;
  discountValue?: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  notes?: string;
}

export interface SaleLine {
  id: string;
  saleId: string;
  businessId: string;
  itemId: string;
  itemNameSnapshot: string;
  quantity: number;
  unit: string;
  rate: number;
  discountType?: DiscountType;
  discountValue?: number;
  discountAmount: number;
  taxAmount: number;
  lineTotal: number;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface PurchaseLine {
  id: string;
  purchaseId: string;
  businessId: string;
  itemId: string;
  itemNameSnapshot: string;
  quantity: number;
  unit: string;
  unitCost: number; // Historical unit cost
  discountType?: DiscountType;
  discountValue?: number;
  discountAmount: number;
  taxAmount: number;
  lineTotal: number;
  trackInventory: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export type PaymentMethod = 'CASH' | 'CARD' | 'UPI' | 'BANK_TRANSFER' | 'OTHER';

export interface Payment extends BaseRecord {
  partyType: 'CUSTOMER' | 'SUPPLIER';
  partyId?: string;
  referenceType: 'SALE' | 'DIRECT' | 'INVOICE';
  referenceId?: string;
  amount: number;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  notes?: string;
}

export interface SupplierPayment extends BaseRecord {
  supplierId?: string;
  referenceType: 'PURCHASE' | 'DIRECT' | 'INVOICE';
  referenceId?: string; // purchaseId if direct
  amount: number;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  direction: 'OUT';
  notes?: string;
}

export interface PaymentAllocation extends BaseRecord {
  paymentId: string;
  saleId: string;
  customerId: string;
  amount: number;
}

export interface SupplierPaymentAllocation extends BaseRecord {
  supplierPaymentId: string;
  purchaseId: string;
  supplierId: string;
  amount: number;
}

export type SyncState = 'LOCAL_ONLY' | 'PENDING_UPLOAD' | 'SYNCED' | 'SYNC_ERROR';

export type ReturnReason =
  | 'DAMAGED'
  | 'WRONG_ITEM'
  | 'CUSTOMER_CHANGED_MIND'
  | 'DEFECTIVE'
  | 'EXPIRED'
  | 'OTHER';

export type PurchaseReturnReason = ReturnReason;

export type SettlementMode = 'REFUND_NOW' | 'REFUND_RECEIVED_NOW' | 'CUSTOMER_CREDIT' | 'SUPPLIER_CREDIT' | 'REDUCE_DUE' | 'NO_SETTLEMENT';

export type SupplierSettlementMode = SettlementMode;

export interface SaleReturn extends BaseRecord {
  originalSaleId: string;
  customerId?: string;
  returnNumber: string;
  returnDate: string;
  totalAmount: number;
  reason?: ReturnReason;
  notes?: string;
  settlementMode: SettlementMode;
  refundAmount?: number;
}

export interface PurchaseReturn extends BaseRecord {
  originalPurchaseId: string;
  supplierId?: string;
  returnNumber: string;
  returnDate: string;
  totalAmount: number;
  reason?: ReturnReason;
  notes?: string;
  settlementMode: SettlementMode;
  refundAmount?: number;
}

export interface SaleReturnLine extends BaseRecord {
  saleReturnId: string;
  originalSaleId: string;
  originalSaleLineId: string;
  itemId: string;
  itemNameSnapshot: string;
  quantity: number;
  unit: string;
  rate: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  trackInventory: boolean;
}

export interface PurchaseReturnLine extends BaseRecord {
  purchaseReturnId: string;
  originalPurchaseId: string;
  originalPurchaseLineId: string;
  itemId: string;
  itemNameSnapshot: string;
  quantity: number;
  unit: string;
  unitCost: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  trackInventory: boolean;
}

export interface SaleVoid extends BaseRecord {
  originalSaleId: string;
  customerId?: string;
  reason?: string;
  voidDate: string;
  settlementMode?: SettlementMode;
  refundAmount?: number;
  notes?: string;
}

export interface PurchaseVoid extends BaseRecord {
  originalPurchaseId: string;
  supplierId?: string;
  reason?: string;
  voidDate: string;
  settlementMode?: SettlementMode;
  refundAmount?: number;
  notes?: string;
}

export interface Refund extends BaseRecord {
  customerId?: string;
  saleReturnId?: string;
  saleVoidId?: string;
  amount: number;
  refundDate: string;
  paymentMethod: PaymentMethod;
  notes?: string;
}

export interface RefundReceived extends BaseRecord {
  supplierId?: string;
  purchaseReturnId?: string;
  purchaseVoidId?: string;
  amount: number;
  refundDate: string;
  paymentMethod: PaymentMethod;
  notes?: string;
}

export interface PaymentReversal extends BaseRecord {
  originalPaymentId: string;
  customerId?: string;
  amount: number;
  reason?: string;
  reversalDate: string;
  notes?: string;
}

export interface SupplierPaymentReversal extends BaseRecord {
  originalPaymentId: string;
  supplierId?: string;
  amount: number;
  reason?: string;
  reversalDate: string;
  notes?: string;
}

export interface SyncMetadata {
  id: string;
  recordId: string;
  recordType:
    | 'business'
    | 'item'
    | 'customer'
    | 'supplier'
    | 'sale'
    | 'saleLine'
    | 'purchase'
    | 'purchaseLine'
    | 'stockMovement'
    | 'payment'
    | 'paymentAllocation'
    | 'supplierPayment'
    | 'supplierPaymentAllocation'
    | 'saleReturn'
    | 'saleReturnLine'
    | 'purchaseReturn'
    | 'purchaseReturnLine'
    | 'saleVoid'
    | 'purchaseVoid'
    | 'refund'
    | 'refundReceived'
    | 'paymentReversal'
    | 'supplierPaymentReversal'
    | 'financialAccount'
    | 'financialMovement'
    | 'expenseCategory'
    | 'expense'
    | 'expenseReversal'
    | 'accountTransfer'
    | 'accountTransferReversal';
  syncState: SyncState;
  lastSyncedAt?: string;
  lastSyncedVersion: number;
  updatedAt: string;
  version: number;
}

export interface AppSettings {
  key: string;
  value: any;
}

// UI and DTO helper types
export interface ItemWithStock extends Item {
  currentStock: number;
  isLowStock: boolean;
}

export interface CustomerWithBalance extends Customer {
  totalSales: number;
  totalPaid: number;
  totalAllocated: number;
  outstandingBalance: number; // total unpaid due on sales
  customerCredit: number; // unallocated payment funds available to use
  netReceivable: number; // outstandingBalance - customerCredit
  lastActivityDate?: string;
}

export interface SupplierWithBalance extends Supplier {
  totalPurchases: number;
  totalPaid: number;
  totalAllocated: number;
  outstandingPayable: number; // total unpaid due on purchases
  supplierCredit: number; // unallocated payment funds (advance/overpaid to supplier)
  netPayable: number; // outstandingPayable - supplierCredit (+ = business owes supplier, - = supplier credit)
  lastActivityDate?: string;
}

export interface CustomerFinancialSummary {
  customerId: string;
  customerName: string;
  totalSales: number;
  totalPaid: number;
  totalAllocated: number;
  outstandingBalance: number; // sum of remaining unpaid balance on invoices
  customerCredit: number; // unallocated payments
  netReceivable: number; // outstandingBalance - customerCredit
  outstandingInvoicesCount: number;
}

export interface SupplierFinancialSummary {
  supplierId: string;
  supplierName: string;
  totalPurchases: number;
  totalPaid: number;
  totalAllocated: number;
  outstandingPayable: number; // sum of remaining unpaid balance on purchases
  supplierCredit: number; // unallocated payments / advances
  netPayable: number; // outstandingPayable - supplierCredit
  outstandingPurchasesCount: number;
}

export interface OutstandingInvoice {
  saleId: string;
  invoiceNumber: string;
  saleDate: string;
  totalAmount: number;
  paidAmount: number; // from allocations
  dueAmount: number; // totalAmount - paidAmount
  status: SaleStatus;
}

export interface OutstandingPurchase {
  purchaseId: string;
  purchaseNumber: string;
  purchaseDate: string;
  totalAmount: number;
  paidAmount: number; // from allocations
  dueAmount: number; // totalAmount - paidAmount
  status: PurchaseStatus;
}

export interface CustomerStatementEntry {
  id: string;
  date: string;
  type: 'SALE' | 'PAYMENT' | 'SALE_RETURN' | 'SALE_VOID' | 'REFUND' | 'PAYMENT_REVERSAL';
  referenceNumber: string; // Invoice #, Return #, Payment ID / Receipt
  referenceId: string;
  description: string;
  debit: number; // increases customer debt (Sale total, Refund, Payment Reversal)
  credit: number; // decreases customer debt (Payment, Return, Void)
  runningBalance: number; // Cumulative net receivable (+ = customer owes, - = in credit)
  paymentMethod?: PaymentMethod;
  notes?: string;
  allocations?: Array<{
    invoiceNumber: string;
    saleId: string;
    amount: number;
  }>;
}

export interface SupplierStatementEntry {
  id: string;
  date: string;
  type: 'PURCHASE' | 'SUPPLIER_PAYMENT' | 'PURCHASE_RETURN' | 'PURCHASE_VOID' | 'REFUND_RECEIVED' | 'PAYMENT_REVERSAL';
  referenceNumber: string; // Purchase #, Return #, Payment ID / Receipt
  referenceId: string;
  description: string;
  payable: number; // increases business payable (Purchase total, Refund Received, Payment Reversal)
  paid: number; // decreases business payable (Supplier Payment, Purchase Return, Purchase Void)
  runningBalance: number; // Cumulative net payable (+ = business owes supplier, - = supplier owes business / in credit)
  paymentMethod?: PaymentMethod;
  notes?: string;
  allocations?: Array<{
    purchaseNumber: string;
    purchaseId: string;
    amount: number;
  }>;
}

export interface ReceivePaymentPayload {
  businessId: string;
  customerId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  financialAccountId?: string; // Phase 5 Stage 2 integration
  paymentDate?: string;
  notes?: string;
  allocationMode?: 'AUTO' | 'MANUAL';
  manualAllocations?: Array<{
    saleId: string;
    amount: number;
  }>;
}

export interface PaySupplierPayload {
  businessId: string;
  supplierId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  financialAccountId?: string; // Phase 5 Stage 2 integration
  paymentDate?: string;
  notes?: string;
  allocationMode?: 'AUTO' | 'MANUAL';
  manualAllocations?: Array<{
    purchaseId: string;
    amount: number;
  }>;
}

export interface SaleCartLine {
  itemId: string;
  name: string;
  unit: string;
  rate: number;
  quantity: number;
  discountType?: DiscountType;
  discountValue?: number;
  discountAmount: number;
  taxAmount: number;
  trackInventory: boolean;
  availableStock: number;
}

export interface PurchaseCartLine {
  itemId: string;
  name: string;
  unit: string;
  unitCost: number;
  quantity: number;
  discountType?: DiscountType;
  discountValue?: number;
  discountAmount: number;
  taxAmount: number;
  trackInventory: boolean;
  availableStock: number;
}

export interface CompleteSalePayload {
  customerId?: string;
  customerNameSnapshot: string;
  saleDate: string;
  lines: Array<{
    itemId: string;
    itemNameSnapshot: string;
    quantity: number;
    unit: string;
    rate: number;
    discountType?: DiscountType;
    discountValue?: number;
    discountAmount?: number;
    taxAmount?: number;
    trackInventory: boolean;
  }>;
  subtotal: number;
  discountType?: DiscountType;
  discountValue?: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number; // New cash/direct payment received right now at sale
  paymentMethod: PaymentMethod;
  financialAccountId?: string; // Phase 5 Stage 2 integration
  applyCustomerCredit?: number; // Optional credit to apply from existing customer unallocated balance
  notes?: string;
}

export interface CompletePurchasePayload {
  supplierId?: string;
  supplierNameSnapshot: string;
  purchaseDate: string;
  lines: Array<{
    itemId: string;
    itemNameSnapshot: string;
    quantity: number;
    unit: string;
    unitCost: number;
    discountType?: DiscountType;
    discountValue?: number;
    discountAmount?: number;
    taxAmount?: number;
    trackInventory: boolean;
  }>;
  subtotal: number;
  discountType?: DiscountType;
  discountValue?: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number; // New cash/direct payment out right now at purchase
  paymentMethod: PaymentMethod;
  financialAccountId?: string; // Phase 5 Stage 2 integration
  applySupplierCredit?: number; // Optional credit to apply from existing supplier unallocated balance
  notes?: string;
}

export interface DashboardMetrics {
  todaySalesCount: number;
  todaySalesAmount: number;
  totalSalesAmount: number;
  totalPaidAmount: number;
  totalDueAmount: number;
  totalCustomersCount: number;
  totalItemsCount: number;
  lowStockItemsCount: number;
  // Supplier & Purchase Metrics
  thisMonthPurchasesCount?: number;
  thisMonthPurchasesAmount?: number;
  totalPurchasesAmount?: number;
  totalSupplierPaidAmount?: number;
  totalSupplierDueAmount?: number;
  totalSuppliersCount?: number;
  totalSupplierCredit?: number;
  // Financial Metrics
  totalCashInHand?: number;
  totalBankBalances?: number;
  totalLiquidFunds?: number;
  todayMoneyIn?: number;
  todayMoneyOut?: number;
  todayNetCashFlow?: number;
  thisMonthExpensesAmount?: number;
  thisMonthExpensesCount?: number;
}

// ==========================================
// PHASE 5: MULTI-ACCOUNT & FINANCIAL LEDGER
// ==========================================

export type FinancialAccountType = 'CASH' | 'BANK' | 'UPI' | 'DIGITAL_WALLET' | 'OTHER';

export interface FinancialAccount extends BaseRecord {
  name: string;
  type: FinancialAccountType;
  accountNumberLast4?: string;
  bankName?: string;
  notes?: string;
  isDefault: boolean;
  isArchived: boolean;
}

export interface FinancialAccountWithBalance extends FinancialAccount {
  derivedBalance: number;
  totalIn: number;
  totalOut: number;
  movementCount: number;
  lastMovementDate?: string;
}

export type FinancialMovementType =
  | 'OPENING_BALANCE'
  | 'EXPENSE'
  | 'EXPENSE_REVERSAL'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN'
  | 'TRANSFER_REVERSAL_IN'
  | 'TRANSFER_REVERSAL_OUT'
  | 'CUSTOMER_PAYMENT'
  | 'CUSTOMER_PAYMENT_REVERSAL'
  | 'SUPPLIER_PAYMENT'
  | 'SUPPLIER_PAYMENT_REVERSAL'
  | 'REFUND_TO_CUSTOMER'
  | 'REFUND_FROM_SUPPLIER'
  | 'ADJUSTMENT'
  | 'LEGACY_MAPPING';

export type FinancialMovementDirection = 'IN' | 'OUT';

export interface FinancialMovement {
  id: string;
  businessId: string;
  accountId: string;
  type: FinancialMovementType;
  direction: FinancialMovementDirection;
  amount: number;
  movementDate: string;
  referenceType?:
    | 'EXPENSE'
    | 'EXPENSE_REVERSAL'
    | 'TRANSFER'
    | 'TRANSFER_REVERSAL'
    | 'PAYMENT'
    | 'PAYMENT_REVERSAL'
    | 'SUPPLIER_PAYMENT'
    | 'SUPPLIER_PAYMENT_REVERSAL'
    | 'REFUND'
    | 'REFUND_RECEIVED'
    | 'MANUAL';
  referenceId?: string;
  description?: string;
  createdAt: string;
  createdByDeviceId: string;
  version: number;
  isDeleted: boolean;
}

export interface ExpenseCategory extends BaseRecord {
  name: string;
  icon?: string;
  color?: string;
  isDefault: boolean;
  isArchived: boolean;
}

export interface Expense extends BaseRecord {
  expenseNumber: string;
  categoryId: string;
  categoryNameSnapshot: string;
  financialAccountId: string;
  accountNameSnapshot: string;
  amount: number;
  paymentMethod: PaymentMethod;
  payee?: string;
  expenseDate: string;
  notes?: string;
  receiptUrl?: string;
}

export interface ExpenseReversal extends BaseRecord {
  originalExpenseId: string;
  financialAccountId: string;
  amount: number;
  reason?: string;
  notes?: string;
  reversalDate: string;
}

export interface ExpenseWithDetails {
  expense: Expense;
  reversal?: ExpenseReversal;
  isReversed: boolean;
  account?: FinancialAccount;
  category?: ExpenseCategory;
  movement?: FinancialMovement;
}

export interface AccountTransfer extends BaseRecord {
  transferNumber: string;
  fromAccountId: string;
  fromAccountNameSnapshot: string;
  toAccountId: string;
  toAccountNameSnapshot: string;
  amount: number;
  transferDate: string;
  notes?: string;
}

export interface AccountTransferReversal extends BaseRecord {
  originalTransferId: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  reason?: string;
  notes?: string;
  reversalDate: string;
}

export interface AccountTransferWithDetails {
  transfer: AccountTransfer;
  reversal?: AccountTransferReversal;
  isReversed: boolean;
  fromAccount?: FinancialAccount;
  toAccount?: FinancialAccount;
  outMovement?: FinancialMovement;
  inMovement?: FinancialMovement;
}

export interface CreateFinancialAccountPayload {
  name: string;
  type: FinancialAccountType;
  accountNumberLast4?: string;
  bankName?: string;
  notes?: string;
  isDefault?: boolean;
  openingBalance?: number;
}

export interface CreateExpensePayload {
  businessId: string;
  categoryId: string;
  financialAccountId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  payee?: string;
  expenseDate?: string;
  notes?: string;
  receiptUrl?: string;
}

export interface ReverseExpensePayload {
  businessId: string;
  expenseId: string;
  reason?: string;
  notes?: string;
  reversalDate?: string;
}

export interface CreateAccountTransferPayload {
  businessId: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  transferDate?: string;
  notes?: string;
}

export interface ReverseAccountTransferPayload {
  businessId: string;
  transferId: string;
  reason?: string;
  notes?: string;
  reversalDate?: string;
}

