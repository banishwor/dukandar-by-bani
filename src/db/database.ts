import Dexie, { type Table } from 'dexie';
import type {
  Business,
  Item,
  Customer,
  Supplier,
  Sale,
  SaleLine,
  Purchase,
  PurchaseLine,
  StockMovement,
  Payment,
  SupplierPayment,
  PaymentAllocation,
  SupplierPaymentAllocation,
  SaleReturn,
  SaleReturnLine,
  PurchaseReturn,
  PurchaseReturnLine,
  SaleVoid,
  PurchaseVoid,
  Refund,
  RefundReceived,
  PaymentReversal,
  SupplierPaymentReversal,
  FinancialAccount,
  FinancialMovement,
  ExpenseCategory,
  Expense,
  ExpenseReversal,
  AccountTransfer,
  AccountTransferReversal,
  AppSettings,
  SyncMetadata,
} from '../types';
import { generateUniqueId } from '../utils/id';

export class BusinessAppDatabase extends Dexie {
  businesses!: Table<Business, string>;
  items!: Table<Item, string>;
  customers!: Table<Customer, string>;
  suppliers!: Table<Supplier, string>;
  sales!: Table<Sale, string>;
  saleLines!: Table<SaleLine, string>;
  purchases!: Table<Purchase, string>;
  purchaseLines!: Table<PurchaseLine, string>;
  stockMovements!: Table<StockMovement, string>;
  payments!: Table<Payment, string>;
  supplierPayments!: Table<SupplierPayment, string>;
  paymentAllocations!: Table<PaymentAllocation, string>;
  supplierPaymentAllocations!: Table<SupplierPaymentAllocation, string>;
  saleReturns!: Table<SaleReturn, string>;
  saleReturnLines!: Table<SaleReturnLine, string>;
  purchaseReturns!: Table<PurchaseReturn, string>;
  purchaseReturnLines!: Table<PurchaseReturnLine, string>;
  saleVoids!: Table<SaleVoid, string>;
  purchaseVoids!: Table<PurchaseVoid, string>;
  refunds!: Table<Refund, string>;
  refundsReceived!: Table<RefundReceived, string>;
  paymentReversals!: Table<PaymentReversal, string>;
  supplierPaymentReversals!: Table<SupplierPaymentReversal, string>;
  financialAccounts!: Table<FinancialAccount, string>;
  financialMovements!: Table<FinancialMovement, string>;
  expenseCategories!: Table<ExpenseCategory, string>;
  expenses!: Table<Expense, string>;
  expenseReversals!: Table<ExpenseReversal, string>;
  accountTransfers!: Table<AccountTransfer, string>;
  accountTransferReversals!: Table<AccountTransferReversal, string>;
  appSettings!: Table<AppSettings, string>;
  syncMetadata!: Table<SyncMetadata, string>;

  constructor() {
    super('businessAppDB');

    // Version 1 of the schema
    this.version(1).stores({
      businesses: 'id, isDeleted, createdAt',
      items: 'id, businessId, name, type, category, sku, barcode, trackInventory, isActive, isDeleted, createdAt',
      customers: 'id, businessId, name, phone, isActive, isDeleted, createdAt',
      sales: 'id, businessId, invoiceNumber, customerId, saleDate, status, isDeleted, createdAt',
      saleLines: 'id, saleId, businessId, itemId, createdAt',
      stockMovements: 'id, businessId, itemId, type, referenceId, createdAt',
      payments: 'id, businessId, partyId, referenceId, paymentDate, isDeleted, createdAt',
      appSettings: 'key',
      syncMetadata: 'id, recordId, recordType, syncState, updatedAt',
    });

    // Version 2: Phase 2 payment allocations
    this.version(2)
      .stores({
        paymentAllocations: 'id, businessId, paymentId, saleId, customerId, isDeleted, createdAt',
      })
      .upgrade(async (tx) => {
        // Safe backward-compatible migration for existing payments attached to sales
        const paymentsTable = tx.table('payments');
        const allocationsTable = tx.table('paymentAllocations');
        const syncTable = tx.table('syncMetadata');
        const salesTable = tx.table('sales');

        const allPayments = await paymentsTable.toArray();
        for (const p of allPayments) {
          if (p.referenceId && (p.referenceType === 'SALE' || p.partyType === 'CUSTOMER')) {
            let customerId = p.partyId || '';
            if (!customerId && p.referenceId) {
              const sale = await salesTable.get(p.referenceId);
              if (sale && sale.customerId) {
                customerId = sale.customerId;
              }
            }

            const allocId = generateUniqueId('ALLOC');
            const now = p.createdAt || new Date().toISOString();
            const alloc: PaymentAllocation = {
              id: allocId,
              businessId: p.businessId,
              paymentId: p.id,
              saleId: p.referenceId,
              customerId,
              amount: p.amount,
              createdAt: now,
              updatedAt: now,
              createdByDeviceId: p.createdByDeviceId || 'SYSTEM_MIGRATION',
              updatedByDeviceId: p.updatedByDeviceId || 'SYSTEM_MIGRATION',
              version: 1,
              isDeleted: Boolean(p.isDeleted),
            };

            await allocationsTable.add(alloc);
            await syncTable.add({
              id: generateUniqueId('SYNC'),
              recordId: alloc.id,
              recordType: 'paymentAllocation',
              syncState: 'LOCAL_ONLY',
              lastSyncedVersion: 0,
              updatedAt: now,
              version: 1,
            });
          }
        }
      });

    // Version 3: Phase 3 returns, voids, refunds, and payment reversals
    this.version(3).stores({
      saleReturns: 'id, businessId, originalSaleId, customerId, returnNumber, returnDate, isDeleted, createdAt',
      saleReturnLines: 'id, businessId, saleReturnId, originalSaleId, originalSaleLineId, itemId, createdAt',
      saleVoids: 'id, businessId, originalSaleId, customerId, voidDate, isDeleted, createdAt',
      refunds: 'id, businessId, customerId, saleReturnId, saleVoidId, refundDate, isDeleted, createdAt',
      paymentReversals: 'id, businessId, originalPaymentId, customerId, reversalDate, isDeleted, createdAt',
    });

    // Version 4: Phase 4 Suppliers, Purchases, Inbound Stock & Payables
    this.version(4).stores({
      suppliers: 'id, businessId, name, phone, isActive, isDeleted, createdAt',
      purchases: 'id, businessId, purchaseNumber, supplierId, purchaseDate, status, isDeleted, createdAt',
      purchaseLines: 'id, purchaseId, businessId, itemId, createdAt',
      supplierPayments: 'id, businessId, supplierId, referenceId, paymentDate, isDeleted, createdAt',
      supplierPaymentAllocations: 'id, businessId, supplierPaymentId, purchaseId, supplierId, isDeleted, createdAt',
      purchaseReturns: 'id, businessId, originalPurchaseId, supplierId, returnNumber, returnDate, isDeleted, createdAt',
      purchaseReturnLines: 'id, businessId, purchaseReturnId, originalPurchaseId, originalPurchaseLineId, itemId, createdAt',
      purchaseVoids: 'id, businessId, originalPurchaseId, supplierId, voidDate, isDeleted, createdAt',
      refundsReceived: 'id, businessId, supplierId, purchaseReturnId, purchaseVoidId, refundDate, isDeleted, createdAt',
      supplierPaymentReversals: 'id, businessId, originalPaymentId, supplierId, reversalDate, isDeleted, createdAt',
    });

    // Version 5: Phase 5 Multi-Account, Expenses & Financial Movement Ledger
    this.version(5)
      .stores({
        financialAccounts: 'id, businessId, type, isDefault, isArchived, isDeleted, createdAt',
        financialMovements: 'id, businessId, accountId, type, direction, movementDate, referenceType, referenceId, isDeleted, createdAt',
        expenseCategories: 'id, businessId, name, isDefault, isArchived, isDeleted, createdAt',
        expenses: 'id, businessId, expenseNumber, categoryId, financialAccountId, expenseDate, isDeleted, createdAt',
        expenseReversals: 'id, businessId, originalExpenseId, financialAccountId, reversalDate, isDeleted, createdAt',
        accountTransfers: 'id, businessId, transferNumber, fromAccountId, toAccountId, transferDate, isDeleted, createdAt',
        accountTransferReversals: 'id, businessId, originalTransferId, reversalDate, isDeleted, createdAt',
      })
      .upgrade(async (tx) => {
        // Safe seeding of default Cash in Hand and default expense categories for existing businesses
        const businessesTable = tx.table('businesses');
        const accountsTable = tx.table('financialAccounts');
        const categoriesTable = tx.table('expenseCategories');
        const syncTable = tx.table('syncMetadata');

        const allBusinesses = await businessesTable.toArray();
        for (const biz of allBusinesses) {
          const now = new Date().toISOString();
          const devId = 'SYSTEM_MIGRATION';

          // Check if default Cash account already exists
          const existingCash = await accountsTable
            .where('businessId')
            .equals(biz.id)
            .filter((a: any) => a.type === 'CASH' && !a.isDeleted)
            .first();

          if (!existingCash) {
            const cashAccId = generateUniqueId('ACC');
            const cashAccount: FinancialAccount = {
              id: cashAccId,
              businessId: biz.id,
              name: 'Cash in Hand',
              type: 'CASH',
              isDefault: true,
              isArchived: false,
              createdAt: now,
              updatedAt: now,
              createdByDeviceId: devId,
              updatedByDeviceId: devId,
              version: 1,
              isDeleted: false,
            };
            await accountsTable.add(cashAccount);
            await syncTable.add({
              id: generateUniqueId('SYNC'),
              recordId: cashAccount.id,
              recordType: 'financialAccount',
              syncState: 'LOCAL_ONLY',
              lastSyncedVersion: 0,
              updatedAt: now,
              version: 1,
            });
          }

          // Seed default expense categories
          const defaultCategoryNames = [
            'Rent',
            'Utilities',
            'Salary/Payroll',
            'Transportation',
            'Internet',
            'Packaging',
            'Marketing',
            'Repairs',
            'Supplies',
            'Other',
          ];

          for (const catName of defaultCategoryNames) {
            const existingCat = await categoriesTable
              .where('businessId')
              .equals(biz.id)
              .filter((c: any) => c.name && c.name.toLowerCase() === catName.toLowerCase() && !c.isDeleted)
              .first();

            if (!existingCat) {
              const catId = generateUniqueId('CAT');
              const category: ExpenseCategory = {
                id: catId,
                businessId: biz.id,
                name: catName,
                isDefault: true,
                isArchived: false,
                createdAt: now,
                updatedAt: now,
                createdByDeviceId: devId,
                updatedByDeviceId: devId,
                version: 1,
                isDeleted: false,
              };
              await categoriesTable.add(category);
              await syncTable.add({
                id: generateUniqueId('SYNC'),
                recordId: category.id,
                recordType: 'expenseCategory',
                syncState: 'LOCAL_ONLY',
                lastSyncedVersion: 0,
                updatedAt: now,
                version: 1,
              });
            }
          }
        }
      });
  }
}

// Singleton database instance
export const db = new BusinessAppDatabase();
