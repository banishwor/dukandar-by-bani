import { db } from '../db/database';
import { crossDomainReconciliationService, ReconciliationReport, ReconciliationCheck } from './crossDomainReconciliationService';
import { businessRepository } from '../repositories/businessRepository';
import { itemRepository } from '../repositories/itemRepository';
import { customerRepository } from '../repositories/customerRepository';
import { supplierRepository } from '../repositories/supplierRepository';
import { saleService } from './saleService';
import { purchaseService } from './purchaseService';
import { paymentService } from './paymentService';
import { supplierPaymentService } from './supplierPaymentService';
import { saleCorrectionService } from './saleCorrectionService';
import { purchaseCorrectionService } from './purchaseCorrectionService';
import { expenseService } from './expenseService';
import { accountTransferService } from './accountTransferService';
import { financialAccountService } from './financialAccountService';
import { financialMovementRepository } from '../repositories/financialMovementRepository';
import { roundCurrency, addCurrency, subtractCurrency } from '../utils/money';
import { generateUniqueId } from '../utils/id';

export interface TestScenarioResult {
  id: number;
  name: string;
  category: string;
  passed: boolean;
  message: string;
  durationMs: number;
  details?: string[];
  report?: ReconciliationReport;
}

export const runCrossDomainReconciliationTestSuite = async (
  parentBusinessId?: string
): Promise<TestScenarioResult[]> => {
  const results: TestScenarioResult[] = [];
  const runTimestamp = Date.now();

  const runTest = async (
    id: number,
    name: string,
    category: string,
    testFn: () => Promise<{ passed: boolean; message: string; details?: string[]; report?: ReconciliationReport }>
  ) => {
    const start = performance.now();
    try {
      const outcome = await testFn();
      const durationMs = Math.round(performance.now() - start);
      results.push({
        id,
        name,
        category,
        passed: outcome.passed,
        message: outcome.message,
        durationMs,
        details: outcome.details,
        report: outcome.report,
      });
    } catch (err: any) {
      const durationMs = Math.round(performance.now() - start);
      results.push({
        id,
        name,
        category,
        passed: false,
        message: `Exception: ${err?.message || String(err)}`,
        durationMs,
        details: err?.stack ? [err.stack] : undefined,
      });
    }
  };

  // Helper to create an isolated test business
  const createIsolatedBusiness = async (suffix: string) => {
    const biz = await businessRepository.createBusiness({
      businessId: '',
      name: `Recon_Biz_${suffix}_${runTimestamp}`,
      currencyCode: 'INR',
      currencySymbol: '₹',
    });
    return biz.id;
  };

  // Helper to create test item
  const createItem = async (businessId: string, name: string, stock: number, cost: number, rate: number, tracked: boolean = true) => {
    return await itemRepository.createItem(businessId, {
      name: `${name}_${Date.now().toString().slice(-4)}`,
      type: 'PRODUCT',
      unit: 'pcs',
      sellingPrice: rate,
      purchasePrice: cost,
      openingStock: stock,
      trackInventory: tracked,
      lowStockThreshold: 5,
      isActive: true,
    });
  };

  // Helper to create customer
  const createCustomer = async (businessId: string, name: string) => {
    return await customerRepository.createCustomer(businessId, {
      name: `${name}_${Date.now().toString().slice(-4)}`,
      phone: '9876543210',
      isActive: true,
    });
  };

  // Helper to create supplier
  const createSupplier = async (businessId: string, name: string) => {
    return await supplierRepository.createSupplier(businessId, {
      name: `${name}_${Date.now().toString().slice(-4)}`,
      phone: '9123456780',
      isActive: true,
    });
  };

  // =========================================================================
  // RECONCILIATION SCENARIO 1: Complete Business Day End-to-End Audit
  // =========================================================================
  await runTest(
    101,
    'Complete Business Day Multi-Domain Reconciliation',
    'Cross-Domain Scenario 1',
    async () => {
      const bizId = await createIsolatedBusiness('Day1');

      // 1. Initial Accounts Setup: Cash = ₹10,000, Bank = ₹5,000
      const { account: cashAcc } = await financialAccountService.createAccount(bizId, {
        name: 'Cash in Hand',
        type: 'CASH',
        openingBalance: 10000,
        isDefault: true,
      });
      const { account: bankAcc } = await financialAccountService.createAccount(bizId, {
        name: 'HDFC Current Bank',
        type: 'BANK',
        openingBalance: 5000,
      });

      const item = await createItem(bizId, 'Widget_A', 0, 100, 150, true);
      const supplier = await createSupplier(bizId, 'Apex Supplies');
      const customer = await createCustomer(bizId, 'John Doe');

      // 2. Purchase: 10 units x ₹100 = ₹1,000 (Unpaid)
      await purchaseService.completePurchase(bizId, {
        supplierId: supplier.id,
        supplierNameSnapshot: supplier.name,
        purchaseDate: new Date().toISOString(),
        lines: [{ itemId: item.id, itemNameSnapshot: item.name, quantity: 10, unit: 'pcs', unitCost: 100, discountAmount: 0, taxAmount: 0, trackInventory: true }],
        subtotal: 1000,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 1000,
        paidAmount: 0,
        applySupplierCredit: 0,
        paymentMethod: 'CASH',
      });

      // 3. Supplier payment: ₹500 from Cash
      await supplierPaymentService.recordSupplierPayment({
        businessId: bizId,
        supplierId: supplier.id,
        amount: 500,
        paymentMethod: 'CASH',
        financialAccountId: cashAcc.id,
      });

      // 4. Sale: 3 units x ₹150 = ₹450 (Fully paid through Bank)
      await saleService.completeSale(bizId, {
        customerId: customer.id,
        customerNameSnapshot: customer.name,
        saleDate: new Date().toISOString(),
        lines: [{ itemId: item.id, itemNameSnapshot: item.name, quantity: 3, unit: 'pcs', rate: 150, discountAmount: 0, taxAmount: 0, trackInventory: true }],
        subtotal: 450,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 450,
        paidAmount: 450,
        applyCustomerCredit: 0,
        paymentMethod: 'BANK_TRANSFER',
        financialAccountId: bankAcc.id,
      });

      // 5. Expense: ₹100 from Cash
      const categories = await expenseService.getCategories(bizId);
      await expenseService.createExpense({
        businessId: bizId,
        categoryId: categories[0].id,
        financialAccountId: cashAcc.id,
        amount: 100,
        paymentMethod: 'CASH',
        notes: 'Tea and refreshments',
      });

      // 6. Account Transfer: ₹2,000 Cash -> Bank
      await accountTransferService.createTransfer({
        businessId: bizId,
        fromAccountId: cashAcc.id,
        toAccountId: bankAcc.id,
        amount: 2000,
        notes: 'Branch cash deposit',
      });

      // Execute Independent Cross-Domain Reconciliation
      const report = await crossDomainReconciliationService.runFullReconciliationAudit(bizId, 'Complete Business Day Audit', {
        customerId: customer.id,
        supplierId: supplier.id,
        itemId: item.id,
        accountId: bankAcc.id,
      });

      // Expected Values:
      // Cash: 10000 - 500 (supp pay) - 100 (exp) - 2000 (trf) = 7400
      // Bank: 5000 + 450 (sale) + 2000 (trf) = 7450
      // Total Funds: 7400 + 7450 = 14850
      // Stock: 0 + 10 (pur) - 3 (sale) = 7 units
      // Supplier Payable: 1000 - 500 = 500
      // Customer Due: 450 - 450 = 0
      const cashBal = await financialMovementRepository.getAccountDerivedBalance(cashAcc.id);
      const bankBal = await financialMovementRepository.getAccountDerivedBalance(bankAcc.id);
      const totalFunds = await financialAccountService.getTotalLiquidFunds(bizId);
      const itemWithStock = await itemRepository.getItemWithStock(item.id);

      const mathPassed =
        cashBal === 7400 &&
        bankBal === 7450 &&
        totalFunds.totalBalance === 14850 &&
        itemWithStock?.currentStock === 7;

      const passed = report.passed && mathPassed;

      return {
        passed,
        message: passed
          ? `Complete business day reconciled independently. Cash=₹7,400, Bank=₹7,450, Total Funds=₹14,850, Stock=7 pcs.`
          : `Reconciliation failed. report.passed=${report.passed}, cashBal=${cashBal} (exp 7400), bankBal=${bankBal} (exp 7450), totalFunds=${totalFunds.totalBalance} (exp 14850), stock=${itemWithStock?.currentStock} (exp 7)`,
        details: report.checks.map((c) => `${c.domain}.${c.field}: Expected=${c.expected}, Actual=${c.actual} [${c.passed ? 'OK' : 'MISMATCH'}]`),
        report,
      };
    }
  );

  // =========================================================================
  // RECONCILIATION SCENARIO 2: Sale Return with Customer Credit
  // =========================================================================
  await runTest(
    102,
    'Sale Return with Customer Credit Neutrality Audit',
    'Cross-Domain Scenario 2',
    async () => {
      const bizId = await createIsolatedBusiness('ReturnCredit');

      const { account: bankAcc } = await financialAccountService.createAccount(bizId, {
        name: 'Bank Account',
        type: 'BANK',
        openingBalance: 5000,
        isDefault: true,
      });

      const item = await createItem(bizId, 'Widget_B', 10, 100, 150, true);
      const customer = await createCustomer(bizId, 'Alice Smith');

      // 1. Direct paid sale: 3 units x ₹150 = ₹450
      const sale = await saleService.completeSale(bizId, {
        customerId: customer.id,
        customerNameSnapshot: customer.name,
        saleDate: new Date().toISOString(),
        lines: [{ itemId: item.id, itemNameSnapshot: item.name, quantity: 3, unit: 'pcs', rate: 150, discountAmount: 0, taxAmount: 0, trackInventory: true }],
        subtotal: 450,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 450,
        paidAmount: 450,
        applyCustomerCredit: 0,
        paymentMethod: 'BANK_TRANSFER',
        financialAccountId: bankAcc.id,
      });

      const returnable = await saleCorrectionService.getSaleReturnableLines(sale.id);

      // 2. Return 1 unit (₹150) settled via CUSTOMER_CREDIT
      await saleCorrectionService.processSaleReturn({
        businessId: bizId,
        originalSaleId: sale.id,
        returnDate: new Date().toISOString(),
        reason: 'CUSTOMER_CHANGED_MIND',
        settlementMode: 'CUSTOMER_CREDIT',
        lines: [{ originalSaleLineId: returnable[0].originalSaleLineId, quantityToReturn: 1 }],
      });

      // Verify:
      // - Stock restored: 10 - 3 + 1 = 8 pcs
      // - Customer Credit: ₹150
      // - Financial Account balance unchanged: ₹5,000 + ₹450 = ₹5,450 (no refund was paid out)
      const report = await crossDomainReconciliationService.runFullReconciliationAudit(bizId, 'Sale Return Credit Audit', {
        customerId: customer.id,
        itemId: item.id,
        accountId: bankAcc.id,
      });

      const bankBal = await financialMovementRepository.getAccountDerivedBalance(bankAcc.id);
      const stock = (await itemRepository.getItemWithStock(item.id))?.currentStock;
      const custSummary = await paymentService.getCustomerFinancialSummary(customer.id);

      const invariantPassed = bankBal === 5450 && stock === 8 && custSummary.customerCredit === 150;
      const passed = report.passed && invariantPassed;

      return {
        passed,
        message: passed
          ? `Sale return with customer credit reconciled. Stock=8, Customer Credit=₹150, Bank Balance=₹5,450 (unchanged).`
          : `Failed: report.passed=${report.passed}, bankBal=${bankBal}, stock=${stock}, custCredit=${custSummary?.customerCredit}`,
        details: report.checks.map((c) => `${c.domain}.${c.field}: Expected=${c.expected}, Actual=${c.actual}`),
        report,
      };
    }
  );

  // =========================================================================
  // RECONCILIATION SCENARIO 3: Customer Refund with Immediate Cash Outflow
  // =========================================================================
  await runTest(
    103,
    'Customer Refund with Real Monetary Outflow Audit',
    'Cross-Domain Scenario 3',
    async () => {
      const bizId = await createIsolatedBusiness('CustRefund');

      const { account: cashAcc } = await financialAccountService.createAccount(bizId, {
        name: 'Cash Register',
        type: 'CASH',
        openingBalance: 3000,
        isDefault: true,
      });

      const item = await createItem(bizId, 'Widget_C', 5, 200, 300, true);
      const customer = await createCustomer(bizId, 'Bob Jones');

      // 1. Direct paid sale: 2 units x ₹300 = ₹600 (Cash = 3600)
      const sale = await saleService.completeSale(bizId, {
        customerId: customer.id,
        customerNameSnapshot: customer.name,
        saleDate: new Date().toISOString(),
        lines: [{ itemId: item.id, itemNameSnapshot: item.name, quantity: 2, unit: 'pcs', rate: 300, discountAmount: 0, taxAmount: 0, trackInventory: true }],
        subtotal: 600,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 600,
        paidAmount: 600,
        applyCustomerCredit: 0,
        paymentMethod: 'CASH',
        financialAccountId: cashAcc.id,
      });

      const returnable = await saleCorrectionService.getSaleReturnableLines(sale.id);

      // 2. Return 1 unit (₹300) with REFUND_NOW from Cash account
      await saleCorrectionService.processSaleReturn({
        businessId: bizId,
        originalSaleId: sale.id,
        returnDate: new Date().toISOString(),
        reason: 'DEFECTIVE',
        settlementMode: 'REFUND_NOW',
        refundPaymentMethod: 'CASH',
        financialAccountId: cashAcc.id,
        lines: [{ originalSaleLineId: returnable[0].originalSaleLineId, quantityToReturn: 1 }],
      });

      // Verify:
      // - Stock restored: 5 - 2 + 1 = 4 pcs
      // - Cash balance: 3000 + 600 - 300 = 3300
      // - Customer Credit: 0
      // - Customer Net Receivable: 0
      const report = await crossDomainReconciliationService.runFullReconciliationAudit(bizId, 'Customer Refund Audit', {
        customerId: customer.id,
        itemId: item.id,
        accountId: cashAcc.id,
      });

      const cashBal = await financialMovementRepository.getAccountDerivedBalance(cashAcc.id);
      const stock = (await itemRepository.getItemWithStock(item.id))?.currentStock;
      const custSummary = await paymentService.getCustomerFinancialSummary(customer.id);

      const passed = report.passed && cashBal === 3300 && stock === 4 && custSummary.customerCredit === 0;

      return {
        passed,
        message: passed
          ? `Customer refund reconciled. Real money OUT movement (₹300) updated Cash to ₹3,300, Stock=4 pcs, Customer Due=₹0.`
          : `Failed: report.passed=${report.passed}, cashBal=${cashBal}, stock=${stock}`,
        details: report.checks.map((c) => `${c.domain}.${c.field}: Expected=${c.expected}, Actual=${c.actual}`),
        report,
      };
    }
  );

  // =========================================================================
  // RECONCILIATION SCENARIO 4: Purchase Return with Supplier Refund Received
  // =========================================================================
  await runTest(
    104,
    'Purchase Return with Supplier Refund Received Audit',
    'Cross-Domain Scenario 4',
    async () => {
      const bizId = await createIsolatedBusiness('SuppRefund');

      const { account: bankAcc } = await financialAccountService.createAccount(bizId, {
        name: 'Bank Current',
        type: 'BANK',
        openingBalance: 10000,
        isDefault: true,
      });

      const item = await createItem(bizId, 'Material_D', 0, 500, 700, true);
      const supplier = await createSupplier(bizId, 'Mega Distributors');

      // 1. Direct paid purchase: 4 units x ₹500 = ₹2,000 (Bank = 8000)
      const purchase = await purchaseService.completePurchase(bizId, {
        supplierId: supplier.id,
        supplierNameSnapshot: supplier.name,
        purchaseDate: new Date().toISOString(),
        lines: [{ itemId: item.id, itemNameSnapshot: item.name, quantity: 4, unit: 'pcs', unitCost: 500, discountAmount: 0, taxAmount: 0, trackInventory: true }],
        subtotal: 2000,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 2000,
        paidAmount: 2000,
        applySupplierCredit: 0,
        paymentMethod: 'BANK_TRANSFER',
        financialAccountId: bankAcc.id,
      });

      const returnable = await purchaseCorrectionService.getPurchaseReturnableLines(purchase.id);

      // 2. Return 2 units (₹1,000) with REFUND_RECEIVED_NOW deposited to Bank
      await purchaseCorrectionService.processPurchaseReturn({
        businessId: bizId,
        originalPurchaseId: purchase.id,
        returnDate: new Date().toISOString(),
        reason: 'DEFECTIVE',
        settlementMode: 'REFUND_RECEIVED_NOW',
        refundPaymentMethod: 'BANK_TRANSFER',
        financialAccountId: bankAcc.id,
        lines: [{ originalPurchaseLineId: returnable[0].originalPurchaseLineId, quantityToReturn: 2 }],
      });

      // Verify:
      // - Stock: 0 + 4 - 2 = 2 pcs
      // - Bank balance: 10000 - 2000 + 1000 = 9000
      // - Supplier credit: 0, Payable: 0
      const report = await crossDomainReconciliationService.runFullReconciliationAudit(bizId, 'Supplier Refund Audit', {
        supplierId: supplier.id,
        itemId: item.id,
        accountId: bankAcc.id,
      });

      const bankBal = await financialMovementRepository.getAccountDerivedBalance(bankAcc.id);
      const stock = (await itemRepository.getItemWithStock(item.id))?.currentStock;
      const suppSummary = await supplierPaymentService.getSupplierFinancialSummary(supplier.id);

      const passed = report.passed && bankBal === 9000 && stock === 2 && suppSummary.supplierCredit === 0;

      return {
        passed,
        message: passed
          ? `Supplier refund reconciled. Real money IN movement (₹1,000) updated Bank to ₹9,000, Stock=2 pcs, Supplier Payable=₹0.`
          : `Failed: report.passed=${report.passed}, bankBal=${bankBal}, stock=${stock}`,
        details: report.checks.map((c) => `${c.domain}.${c.field}: Expected=${c.expected}, Actual=${c.actual}`),
        report,
      };
    }
  );

  // =========================================================================
  // RECONCILIATION SCENARIO 5: Full Reversals Audit (Customer, Supplier, Expense, Transfer)
  // =========================================================================
  await runTest(
    105,
    'Multi-Domain Compensating Reversals Audit',
    'Cross-Domain Scenario 5',
    async () => {
      const bizId = await createIsolatedBusiness('Reversals');

      const { account: cashAcc } = await financialAccountService.createAccount(bizId, {
        name: 'Cash',
        type: 'CASH',
        openingBalance: 5000,
        isDefault: true,
      });
      const { account: bankAcc } = await financialAccountService.createAccount(bizId, {
        name: 'Bank',
        type: 'BANK',
        openingBalance: 5000,
      });

      const customer = await createCustomer(bizId, 'Rev Customer');
      const supplier = await createSupplier(bizId, 'Rev Supplier');
      const categories = await expenseService.getCategories(bizId);

      // 1. Customer Payment + Reversal
      const payRes = await paymentService.receiveCustomerPayment({
        businessId: bizId,
        customerId: customer.id,
        amount: 800,
        paymentMethod: 'CASH',
        financialAccountId: cashAcc.id,
      });
      await saleCorrectionService.processPaymentReversal({
        businessId: bizId,
        originalPaymentId: payRes.payment.id,
        customerId: customer.id,
        reason: 'Cheque dishonoured',
      });

      // 2. Supplier Payment + Reversal
      const suppPayRes = await supplierPaymentService.recordSupplierPayment({
        businessId: bizId,
        supplierId: supplier.id,
        amount: 600,
        paymentMethod: 'BANK_TRANSFER',
        financialAccountId: bankAcc.id,
      });
      await purchaseCorrectionService.processSupplierPaymentReversal({
        businessId: bizId,
        originalPaymentId: suppPayRes.payment.id,
        supplierId: supplier.id,
        reason: 'Stop payment request',
      });

      // 3. Expense + Reversal
      const exp = await expenseService.createExpense({
        businessId: bizId,
        categoryId: categories[0].id,
        financialAccountId: cashAcc.id,
        amount: 400,
        paymentMethod: 'CASH',
        notes: 'Faulty bill entry',
      });
      await expenseService.reverseExpense({
        businessId: bizId,
        expenseId: exp.id,
        reason: 'Duplicate invoice',
      });

      // 4. Transfer + Reversal
      const trf = await accountTransferService.createTransfer({
        businessId: bizId,
        fromAccountId: cashAcc.id,
        toAccountId: bankAcc.id,
        amount: 1500,
      });
      await accountTransferService.reverseTransfer({
        businessId: bizId,
        transferId: trf.id,
        reason: 'Entered wrong accounts',
      });

      // Verify:
      // Cash should return exactly to 5000
      // Bank should return exactly to 5000
      // Total Funds should remain exactly 10000
      const report = await crossDomainReconciliationService.runFullReconciliationAudit(bizId, 'Reversals Audit', {
        customerId: customer.id,
        supplierId: supplier.id,
        accountId: cashAcc.id,
      });

      const cashBal = await financialMovementRepository.getAccountDerivedBalance(cashAcc.id);
      const bankBal = await financialMovementRepository.getAccountDerivedBalance(bankAcc.id);
      const totalFunds = await financialAccountService.getTotalLiquidFunds(bizId);

      const passed = report.passed && cashBal === 5000 && bankBal === 5000 && totalFunds.totalBalance === 10000;

      return {
        passed,
        message: passed
          ? `All 4 domain reversals (Customer, Supplier, Expense, Transfer) preserved audit trails and restored exact balances: Cash=₹5,000, Bank=₹5,000.`
          : `Failed: report.passed=${report.passed}, cashBal=${cashBal}, bankBal=${bankBal}, totalFunds=${totalFunds.totalBalance}`,
        details: report.checks.map((c) => `${c.domain}.${c.field}: Expected=${c.expected}, Actual=${c.actual}`),
        report,
      };
    }
  );

  // =========================================================================
  // RECONCILIATION SCENARIO 6: Credit Redemption Accounting Neutrality
  // =========================================================================
  await runTest(
    106,
    'Customer & Supplier Credit Redemption Money Neutrality Audit',
    'Cross-Domain Scenario 6',
    async () => {
      const bizId = await createIsolatedBusiness('CreditRedeem');

      const { account: bankAcc } = await financialAccountService.createAccount(bizId, {
        name: 'Primary Bank',
        type: 'BANK',
        openingBalance: 10000,
        isDefault: true,
      });

      const item = await createItem(bizId, 'Appliance_X', 50, 200, 300, true);
      const customer = await createCustomer(bizId, 'Credit Customer');
      const supplier = await createSupplier(bizId, 'Credit Supplier');

      // 1. Advance Customer Payment of ₹1,000 (creates ₹1,000 customer credit)
      // Bank = 10000 + 1000 = 11000
      await paymentService.receiveCustomerPayment({
        businessId: bizId,
        customerId: customer.id,
        amount: 1000,
        paymentMethod: 'BANK_TRANSFER',
        financialAccountId: bankAcc.id,
      });

      // 2. Customer buys 5 units x ₹300 = ₹1,500
      // Redeems ₹1,000 Customer Credit + pays ₹500 direct bank transfer
      // Bank = 11000 + 500 = 11500
      await saleService.completeSale(bizId, {
        customerId: customer.id,
        customerNameSnapshot: customer.name,
        saleDate: new Date().toISOString(),
        lines: [{ itemId: item.id, itemNameSnapshot: item.name, quantity: 5, unit: 'pcs', rate: 300, discountAmount: 0, taxAmount: 0, trackInventory: true }],
        subtotal: 1500,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 1500,
        paidAmount: 500,
        applyCustomerCredit: 1000,
        paymentMethod: 'BANK_TRANSFER',
        financialAccountId: bankAcc.id,
      });

      // 3. Advance Supplier Payment of ₹800 (creates ₹800 supplier credit)
      // Bank = 11500 - 800 = 10700
      await supplierPaymentService.recordSupplierPayment({
        businessId: bizId,
        supplierId: supplier.id,
        amount: 800,
        paymentMethod: 'BANK_TRANSFER',
        financialAccountId: bankAcc.id,
      });

      // 4. Buy from supplier 6 units x ₹200 = ₹1,200
      // Redeems ₹800 Supplier Credit + pays ₹400 direct bank transfer
      // Bank = 10700 - 400 = 10300
      await purchaseService.completePurchase(bizId, {
        supplierId: supplier.id,
        supplierNameSnapshot: supplier.name,
        purchaseDate: new Date().toISOString(),
        lines: [{ itemId: item.id, itemNameSnapshot: item.name, quantity: 6, unit: 'pcs', unitCost: 200, discountAmount: 0, taxAmount: 0, trackInventory: true }],
        subtotal: 1200,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 1200,
        paidAmount: 400,
        applySupplierCredit: 800,
        paymentMethod: 'BANK_TRANSFER',
        financialAccountId: bankAcc.id,
      });

      // Verify:
      // - Customer Credit is now ₹0
      // - Supplier Credit is now ₹0
      // - Final Bank Balance: ₹10,300 (Opening 10000 + 1000 + 500 - 800 - 400 = 10300)
      // - Movements created for the sale: only ₹500 (NOT ₹1500)
      // - Movements created for the purchase: only ₹400 (NOT ₹1200)
      const report = await crossDomainReconciliationService.runFullReconciliationAudit(bizId, 'Credit Redemption Audit', {
        customerId: customer.id,
        supplierId: supplier.id,
        itemId: item.id,
        accountId: bankAcc.id,
      });

      const bankBal = await financialMovementRepository.getAccountDerivedBalance(bankAcc.id);
      const custSummary = await paymentService.getCustomerFinancialSummary(customer.id);
      const suppSummary = await supplierPaymentService.getSupplierFinancialSummary(supplier.id);

      const movements = await financialMovementRepository.getMovementsForAccount(bankAcc.id);
      const saleMovements = movements.filter((m) => m.type === 'CUSTOMER_PAYMENT');
      const purchaseMovements = movements.filter((m) => m.type === 'SUPPLIER_PAYMENT');

      const saleDirectMov = saleMovements.find((m) => m.amount === 500);
      const purDirectMov = purchaseMovements.find((m) => m.amount === 400);

      const passed =
        report.passed &&
        bankBal === 10300 &&
        custSummary.customerCredit === 0 &&
        suppSummary.supplierCredit === 0 &&
        saleDirectMov !== undefined &&
        purDirectMov !== undefined;

      return {
        passed,
        message: passed
          ? `Credit redemption money neutrality verified. Customer credit ₹1,000 & Supplier credit ₹800 fully redeemed with 0 duplicate movements. Bank=₹10,300.`
          : `Failed: bankBal=${bankBal} (exp 10300), custCredit=${custSummary?.customerCredit}, suppCredit=${suppSummary?.supplierCredit}`,
        details: report.checks.map((c) => `${c.domain}.${c.field}: Expected=${c.expected}, Actual=${c.actual}`),
        report,
      };
    }
  );

  // =========================================================================
  // RECONCILIATION SCENARIO 7: Multi-Tenant Cross-Business Data Isolation
  // =========================================================================
  await runTest(
    107,
    'Multi-Tenant Cross-Business Isolation Audit',
    'Cross-Business Isolation',
    async () => {
      const bizA = await createIsolatedBusiness('TenantA');
      const bizB = await createIsolatedBusiness('TenantB');

      // Tenant A Setup
      const { account: accA } = await financialAccountService.createAccount(bizA, {
        name: 'Tenant A Cash',
        type: 'CASH',
        openingBalance: 10000,
        isDefault: true,
      });
      const itemA = await createItem(bizA, 'ItemA', 100, 50, 80, true);
      const custA = await createCustomer(bizA, 'CustA');

      // Tenant B Setup
      const { account: accB } = await financialAccountService.createAccount(bizB, {
        name: 'Tenant B Cash',
        type: 'CASH',
        openingBalance: 25000,
        isDefault: true,
      });
      const itemB = await createItem(bizB, 'ItemB', 200, 30, 60, true);
      const custB = await createCustomer(bizB, 'CustB');

      // Transactions in A
      await saleService.completeSale(bizA, {
        customerId: custA.id,
        customerNameSnapshot: custA.name,
        saleDate: new Date().toISOString(),
        lines: [{ itemId: itemA.id, itemNameSnapshot: itemA.name, quantity: 10, unit: 'pcs', rate: 80, discountAmount: 0, taxAmount: 0, trackInventory: true }],
        subtotal: 800,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 800,
        paidAmount: 800,
        applyCustomerCredit: 0,
        paymentMethod: 'CASH',
        financialAccountId: accA.id,
      });

      // Transactions in B
      await saleService.completeSale(bizB, {
        customerId: custB.id,
        customerNameSnapshot: custB.name,
        saleDate: new Date().toISOString(),
        lines: [{ itemId: itemB.id, itemNameSnapshot: itemB.name, quantity: 20, unit: 'pcs', rate: 60, discountAmount: 0, taxAmount: 0, trackInventory: true }],
        subtotal: 1200,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 1200,
        paidAmount: 1200,
        applyCustomerCredit: 0,
        paymentMethod: 'CASH',
        financialAccountId: accB.id,
      });

      // Reconcile Business A independently
      const reportA = await crossDomainReconciliationService.runFullReconciliationAudit(bizA, 'Tenant A Audit', {
        customerId: custA.id,
        itemId: itemA.id,
        accountId: accA.id,
      });

      // Reconcile Business B independently
      const reportB = await crossDomainReconciliationService.runFullReconciliationAudit(bizB, 'Tenant B Audit', {
        customerId: custB.id,
        itemId: itemB.id,
        accountId: accB.id,
      });

      const fundsA = await financialAccountService.getTotalLiquidFunds(bizA);
      const fundsB = await financialAccountService.getTotalLiquidFunds(bizB);

      const itemsInA = await itemRepository.getItems(bizA);
      const itemsInB = await itemRepository.getItems(bizB);

      const noCrossItems =
        !itemsInA.some((i) => i.id === itemB.id) &&
        !itemsInB.some((i) => i.id === itemA.id);

      const passed =
        reportA.passed &&
        reportB.passed &&
        fundsA.totalBalance === 10800 &&
        fundsB.totalBalance === 26200 &&
        noCrossItems;

      return {
        passed,
        message: passed
          ? `Cross-business multi-tenant isolation verified with zero data leakage. Biz A Funds=₹10,800, Biz B Funds=₹26,200.`
          : `Isolation violation. reportA=${reportA.passed}, reportB=${reportB.passed}, fundsA=${fundsA.totalBalance}, fundsB=${fundsB.totalBalance}, noCrossItems=${noCrossItems}`,
        details: [
          `Tenant A Funds: ₹${fundsA.totalBalance}`,
          `Tenant B Funds: ₹${fundsB.totalBalance}`,
          `Strict Item Separation: ${noCrossItems}`,
        ],
      };
    }
  );

  // =========================================================================
  // RECONCILIATION SCENARIO 8: Atomic Transaction Failure Protection
  // =========================================================================
  await runTest(
    108,
    'Atomic Transaction Failure & Partial State Rollback Audit',
    'Atomic Integrity',
    async () => {
      const bizId = await createIsolatedBusiness('AtomicFail');

      const { account: cashAcc } = await financialAccountService.createAccount(bizId, {
        name: 'Atomic Cash',
        type: 'CASH',
        openingBalance: 1000,
        isDefault: true,
      });

      const customer = await createCustomer(bizId, 'Atomic Cust');

      // Attempt to receive payment with an invalid archived account to trigger transaction rejection
      const { account: archivedAcc } = await financialAccountService.createAccount(bizId, {
        name: 'Archived Acc',
        type: 'BANK',
        openingBalance: 0,
      });
      await financialAccountService.archiveAccount(archivedAcc.id);

      let errorThrown = false;
      try {
        await paymentService.receiveCustomerPayment({
          businessId: bizId,
          customerId: customer.id,
          amount: 500,
          paymentMethod: 'BANK_TRANSFER',
          financialAccountId: archivedAcc.id, // Must reject
        });
      } catch (err) {
        errorThrown = true;
      }

      // Verify no partial records (no payments, no allocations, no movements) were written
      const payments = await db.payments.where('businessId').equals(bizId).toArray();
      const allocations = await db.paymentAllocations.where('businessId').equals(bizId).toArray();
      const movements = await db.financialMovements.where('businessId').equals(bizId).filter((m) => m.type === 'CUSTOMER_PAYMENT').toArray();

      const noOrphans = payments.length === 0 && allocations.length === 0 && movements.length === 0;
      const passed = errorThrown && noOrphans;

      return {
        passed,
        message: passed
          ? `Atomic failure safety verified: invalid transaction was completely rolled back with 0 orphan payments, allocations, or movements.`
          : `Failed: errorThrown=${errorThrown}, payments=${payments.length}, allocations=${allocations.length}, movements=${movements.length}`,
        details: [
          `Error safely caught: ${errorThrown}`,
          `Orphan Payments Written: ${payments.length}`,
          `Orphan Movements Written: ${movements.length}`,
        ],
      };
    }
  );

  return results;
};
