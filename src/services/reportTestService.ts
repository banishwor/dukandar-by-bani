import { db } from '../db/database';
import { salesReportService } from './reports/salesReportService';
import { purchaseReportService } from './reports/purchaseReportService';
import { expenseReportService } from './reports/expenseReportService';
import { cashFlowReportService } from './reports/cashFlowReportService';
import { receivablesReportService } from './reports/receivablesReportService';
import { payablesReportService } from './reports/payablesReportService';
import { inventoryReportService } from './reports/inventoryReportService';
import { reportExportService } from './reports/reportExportService';
import { resolveDateRange } from '../utils/reportDateRange';
import { saleService } from './saleService';
import { purchaseService } from './purchaseService';
import { saleCorrectionService } from './saleCorrectionService';
import { purchaseCorrectionService } from './purchaseCorrectionService';
import { expenseService } from './expenseService';
import { financialAccountService } from './financialAccountService';
import { accountTransferService } from './accountTransferService';
import { paymentService } from './paymentService';
import { supplierPaymentService } from './supplierPaymentService';
import { businessRepository } from '../repositories/businessRepository';
import { itemRepository } from '../repositories/itemRepository';
import { customerRepository } from '../repositories/customerRepository';
import { supplierRepository } from '../repositories/supplierRepository';

export interface ReportTestResult {
  name: string;
  passed: boolean;
  message: string;
  durationMs: number;
  details?: Record<string, any>;
}

export const runReportTestSuite = async (): Promise<ReportTestResult[]> => {
  const results: ReportTestResult[] = [];

  const runTest = async (
    name: string,
    testFn: () => Promise<{ passed: boolean; message: string; details?: Record<string, any> }>
  ) => {
    const start = performance.now();
    try {
      const outcome = await testFn();
      results.push({
        name,
        passed: outcome.passed,
        message: outcome.message,
        durationMs: Math.round(performance.now() - start),
        details: outcome.details,
      });
    } catch (err: any) {
      results.push({
        name,
        passed: false,
        message: `Exception: ${err?.message || String(err)}`,
        durationMs: Math.round(performance.now() - start),
        details: { error: String(err), stack: err?.stack },
      });
    }
  };

  const createBusiness = async (prefix: string) => {
    const b = await businessRepository.createBusiness({
      businessId: '',
      name: `${prefix}_${Date.now()}`,
      currencyCode: 'INR',
      currencySymbol: '₹',
    });
    return b.id;
  };

  // Test 1: Sales date range filtering
  await runTest('Report Test 1: Sales date range filtering', async () => {
    const bId = await createBusiness('RT1');
    const acc = await financialAccountService.createAccount(bId, { name: 'Cash', type: 'CASH', openingBalance: 10000 });
    const item = await itemRepository.createItem(bId, { name: 'P1', type: 'PRODUCT', unit: 'pcs', sellingPrice: 100, purchasePrice: 50, openingStock: 20, trackInventory: true, isActive: true });
    const cust = await customerRepository.createCustomer(bId, { name: 'C1', isActive: true });

    await saleService.completeSale(bId, {
      customerId: cust.id,
      customerNameSnapshot: cust.name,
      saleDate: new Date().toISOString(),
      lines: [{ itemId: item.id, itemNameSnapshot: item.name, quantity: 2, unit: 'pcs', rate: 100, discountType: 'NONE', discountValue: 0, trackInventory: true }],
      subtotal: 200,
      discountType: 'NONE',
      discountValue: 0,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 200,
      paidAmount: 200,
      paymentMethod: 'CASH',
      financialAccountId: acc.account.id,
    });

    const todayBounds = resolveDateRange('TODAY');
    const yesterdayBounds = resolveDateRange('YESTERDAY');

    const todayReport = await salesReportService.generateSalesReport(bId, { dateRange: todayBounds });
    const yesterdayReport = await salesReportService.generateSalesReport(bId, { dateRange: yesterdayBounds });

    const passed = todayReport.metrics.netRealizedSales === 200 && yesterdayReport.metrics.netRealizedSales === 0;
    return { passed, message: 'Today sales = ₹200, Yesterday sales = ₹0.', details: { today: todayReport.metrics, yest: yesterdayReport.metrics } };
  });

  // Test 2: Sales discounts projection
  await runTest('Report Test 2: Sales discounts projection (line and bill discounts)', async () => {
    const bId = await createBusiness('RT2');
    const acc = await financialAccountService.createAccount(bId, { name: 'Cash', type: 'CASH', openingBalance: 10000 });
    const item = await itemRepository.createItem(bId, { name: 'P2', type: 'PRODUCT', unit: 'pcs', sellingPrice: 100, purchasePrice: 50, openingStock: 20, trackInventory: true, isActive: true });
    const cust = await customerRepository.createCustomer(bId, { name: 'C2', isActive: true });

    await saleService.completeSale(bId, {
      customerId: cust.id,
      customerNameSnapshot: cust.name,
      saleDate: new Date().toISOString(),
      lines: [{ itemId: item.id, itemNameSnapshot: item.name, quantity: 2, unit: 'pcs', rate: 100, discountType: 'PERCENTAGE', discountValue: 10, trackInventory: true }],
      subtotal: 180,
      discountType: 'FLAT',
      discountValue: 10,
      discountAmount: 10,
      taxAmount: 0,
      totalAmount: 170,
      paidAmount: 170,
      paymentMethod: 'CASH',
      financialAccountId: acc.account.id,
    });

    const report = await salesReportService.generateSalesReport(bId, { dateRange: resolveDateRange('ALL_TIME') });
    const m = report.metrics;
    const passed = m.grossSales === 200 && m.lineDiscounts === 20 && m.overallDiscounts === 10 && m.totalDiscounts === 30 && m.netInvoicedSales === 170;
    return { passed, message: 'Gross=₹200, LineDisc=₹20, BillDisc=₹10, NetInvoiced=₹170.', details: m };
  });

  // Test 3: Sale returns impact on realized sales
  await runTest('Report Test 3: Sale returns deducted from net realized sales', async () => {
    const bId = await createBusiness('RT3');
    const acc = await financialAccountService.createAccount(bId, { name: 'Cash', type: 'CASH', openingBalance: 10000 });
    const item = await itemRepository.createItem(bId, { name: 'P3', type: 'PRODUCT', unit: 'pcs', sellingPrice: 100, purchasePrice: 50, openingStock: 20, trackInventory: true, isActive: true });
    const cust = await customerRepository.createCustomer(bId, { name: 'C3', isActive: true });

    const sale = await saleService.completeSale(bId, {
      customerId: cust.id,
      customerNameSnapshot: cust.name,
      saleDate: new Date().toISOString(),
      lines: [{ itemId: item.id, itemNameSnapshot: item.name, quantity: 5, unit: 'pcs', rate: 100, discountType: 'NONE', discountValue: 0, trackInventory: true }],
      subtotal: 500,
      discountType: 'NONE',
      discountValue: 0,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 500,
      paidAmount: 500,
      paymentMethod: 'CASH',
      financialAccountId: acc.account.id,
    });

    const returnable = await saleCorrectionService.getSaleReturnableLines(sale.id);
    await saleCorrectionService.processSaleReturn({
      businessId: bId,
      originalSaleId: sale.id,
      reason: 'DEFECTIVE',
      settlementMode: 'CUSTOMER_CREDIT',
      lines: [{ originalSaleLineId: returnable[0].originalSaleLineId, quantityToReturn: 2 }],
    });

    const report = await salesReportService.generateSalesReport(bId, { dateRange: resolveDateRange('ALL_TIME') });
    const m = report.metrics;
    const passed = m.netInvoicedSales === 500 && m.saleReturnsAmount === 200 && m.netRealizedSales === 300;
    return { passed, message: 'Invoiced=₹500, Returns=₹200, Net Realized=₹300.', details: m };
  });

  // Test 4: Sale voids cancellation in sales report
  await runTest('Report Test 4: Sale void properly cancels from active sales metrics', async () => {
    const bId = await createBusiness('RT4');
    const acc = await financialAccountService.createAccount(bId, { name: 'Cash', type: 'CASH', openingBalance: 10000 });
    const item = await itemRepository.createItem(bId, { name: 'P4', type: 'PRODUCT', unit: 'pcs', sellingPrice: 100, purchasePrice: 50, openingStock: 20, trackInventory: true, isActive: true });
    const cust = await customerRepository.createCustomer(bId, { name: 'C4', isActive: true });

    const sale = await saleService.completeSale(bId, {
      customerId: cust.id,
      customerNameSnapshot: cust.name,
      saleDate: new Date().toISOString(),
      lines: [{ itemId: item.id, itemNameSnapshot: item.name, quantity: 3, unit: 'pcs', rate: 100, discountType: 'NONE', discountValue: 0, trackInventory: true }],
      subtotal: 300,
      discountType: 'NONE',
      discountValue: 0,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 300,
      paidAmount: 0,
      paymentMethod: 'CASH',
      financialAccountId: acc.account.id,
    });

    await saleCorrectionService.processSaleVoid({
      businessId: bId,
      originalSaleId: sale.id,
      reason: 'Wrong entry',
    });

    const report = await salesReportService.generateSalesReport(bId, { dateRange: resolveDateRange('ALL_TIME') });
    const m = report.metrics;
    const passed = m.voidedInvoicesCount === 1 && m.saleVoidsAmount === 300 && m.netRealizedSales === 0;
    return { passed, message: 'Voided Count=1, Void Amount=₹300, Net Realized=₹0.', details: m };
  });

  // Test 5: Purchase date range filtering
  await runTest('Report Test 5: Purchase date range filtering', async () => {
    const bId = await createBusiness('RT5');
    const acc = await financialAccountService.createAccount(bId, { name: 'Bank', type: 'BANK', openingBalance: 10000 });
    const item = await itemRepository.createItem(bId, { name: 'P5', type: 'PRODUCT', unit: 'pcs', sellingPrice: 100, purchasePrice: 60, openingStock: 0, trackInventory: true, isActive: true });
    const supp = await supplierRepository.createSupplier(bId, { name: 'S5', isActive: true });

    await purchaseService.completePurchase(bId, {
      supplierId: supp.id,
      supplierNameSnapshot: supp.name,
      purchaseDate: new Date().toISOString(),
      lines: [{ itemId: item.id, itemNameSnapshot: item.name, quantity: 10, unit: 'pcs', unitCost: 60, discountType: 'NONE', discountValue: 0, trackInventory: true }],
      subtotal: 600,
      discountType: 'NONE',
      discountValue: 0,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 600,
      paidAmount: 600,
      paymentMethod: 'BANK_TRANSFER',
      financialAccountId: acc.account.id,
    });

    const todayReport = await purchaseReportService.generatePurchaseReport(bId, { dateRange: resolveDateRange('TODAY') });
    const yesterdayReport = await purchaseReportService.generatePurchaseReport(bId, { dateRange: resolveDateRange('YESTERDAY') });

    const passed = todayReport.metrics.netRealizedPurchases === 600 && yesterdayReport.metrics.netRealizedPurchases === 0;
    return { passed, message: 'Today purchases = ₹600, Yesterday purchases = ₹0.', details: { today: todayReport.metrics, yest: yesterdayReport.metrics } };
  });

  // Test 6: Purchase discounts projection
  await runTest('Report Test 6: Purchase discounts projection', async () => {
    const bId = await createBusiness('RT6');
    const acc = await financialAccountService.createAccount(bId, { name: 'Bank', type: 'BANK', openingBalance: 10000 });
    const item = await itemRepository.createItem(bId, { name: 'P6', type: 'PRODUCT', unit: 'pcs', sellingPrice: 150, purchasePrice: 100, openingStock: 0, trackInventory: true, isActive: true });
    const supp = await supplierRepository.createSupplier(bId, { name: 'S6', isActive: true });

    await purchaseService.completePurchase(bId, {
      supplierId: supp.id,
      supplierNameSnapshot: supp.name,
      purchaseDate: new Date().toISOString(),
      lines: [{ itemId: item.id, itemNameSnapshot: item.name, quantity: 10, unit: 'pcs', unitCost: 100, discountType: 'FLAT', discountValue: 100, trackInventory: true }],
      subtotal: 900,
      discountType: 'FLAT',
      discountValue: 50,
      discountAmount: 50,
      taxAmount: 0,
      totalAmount: 850,
      paidAmount: 850,
      paymentMethod: 'BANK_TRANSFER',
      financialAccountId: acc.account.id,
    });

    const report = await purchaseReportService.generatePurchaseReport(bId, { dateRange: resolveDateRange('ALL_TIME') });
    const m = report.metrics;
    const passed = m.grossPurchases === 1000 && m.lineDiscounts === 100 && m.overallDiscounts === 50 && m.totalDiscounts === 150 && m.netInvoicedPurchases === 850;
    return { passed, message: 'Gross=₹1,000, LineDisc=₹100, BillDisc=₹50, Net=₹850.', details: m };
  });

  // Test 7: Purchase returns impact on realized purchases
  await runTest('Report Test 7: Purchase returns deducted from net realized purchases', async () => {
    const bId = await createBusiness('RT7');
    const acc = await financialAccountService.createAccount(bId, { name: 'Bank', type: 'BANK', openingBalance: 10000 });
    const item = await itemRepository.createItem(bId, { name: 'P7', type: 'PRODUCT', unit: 'pcs', sellingPrice: 150, purchasePrice: 100, openingStock: 0, trackInventory: true, isActive: true });
    const supp = await supplierRepository.createSupplier(bId, { name: 'S7', isActive: true });

    const pur = await purchaseService.completePurchase(bId, {
      supplierId: supp.id,
      supplierNameSnapshot: supp.name,
      purchaseDate: new Date().toISOString(),
      lines: [{ itemId: item.id, itemNameSnapshot: item.name, quantity: 4, unit: 'pcs', unitCost: 100, discountType: 'NONE', discountValue: 0, trackInventory: true }],
      subtotal: 400,
      discountType: 'NONE',
      discountValue: 0,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 400,
      paidAmount: 400,
      paymentMethod: 'BANK_TRANSFER',
      financialAccountId: acc.account.id,
    });

    const returnable = await purchaseCorrectionService.getPurchaseReturnableLines(pur.id);
    await purchaseCorrectionService.processPurchaseReturn({
      businessId: bId,
      originalPurchaseId: pur.id,
      reason: 'DEFECTIVE',
      settlementMode: 'SUPPLIER_CREDIT',
      lines: [{ originalPurchaseLineId: returnable[0].originalPurchaseLineId, quantityToReturn: 1 }],
    });

    const report = await purchaseReportService.generatePurchaseReport(bId, { dateRange: resolveDateRange('ALL_TIME') });
    const m = report.metrics;
    const passed = m.netInvoicedPurchases === 400 && m.purchaseReturnsAmount === 100 && m.netRealizedPurchases === 300;
    return { passed, message: 'Invoiced=₹400, Returns=₹100, Realized=₹300.', details: m };
  });

  // Test 8: Purchase voids cancellation in purchase report
  await runTest('Report Test 8: Purchase void cancels from active purchase metrics', async () => {
    const bId = await createBusiness('RT8');
    const acc = await financialAccountService.createAccount(bId, { name: 'Bank', type: 'BANK', openingBalance: 10000 });
    const item = await itemRepository.createItem(bId, { name: 'P8', type: 'PRODUCT', unit: 'pcs', sellingPrice: 150, purchasePrice: 100, openingStock: 0, trackInventory: true, isActive: true });
    const supp = await supplierRepository.createSupplier(bId, { name: 'S8', isActive: true });

    const pur = await purchaseService.completePurchase(bId, {
      supplierId: supp.id,
      supplierNameSnapshot: supp.name,
      purchaseDate: new Date().toISOString(),
      lines: [{ itemId: item.id, itemNameSnapshot: item.name, quantity: 2, unit: 'pcs', unitCost: 100, discountType: 'NONE', discountValue: 0, trackInventory: true }],
      subtotal: 200,
      discountType: 'NONE',
      discountValue: 0,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 200,
      paidAmount: 0,
      paymentMethod: 'BANK_TRANSFER',
      financialAccountId: acc.account.id,
    });

    await purchaseCorrectionService.processPurchaseVoid({
      businessId: bId,
      originalPurchaseId: pur.id,
      reason: 'Cancelled order',
    });

    const report = await purchaseReportService.generatePurchaseReport(bId, { dateRange: resolveDateRange('ALL_TIME') });
    const m = report.metrics;
    const passed = m.voidedBillsCount === 1 && m.purchaseVoidsAmount === 200 && m.netRealizedPurchases === 0;
    return { passed, message: 'Voided Bills=1, Void Amount=₹200, Net Realized=₹0.', details: m };
  });

  // Test 9: Expense totals and category aggregation
  await runTest('Report Test 9: Expense totals and category breakdown', async () => {
    const bId = await createBusiness('RT9');
    const acc = await financialAccountService.createAccount(bId, { name: 'Cash', type: 'CASH', openingBalance: 10000 });
    const cat1 = await expenseService.createCategory(bId, { name: 'Utilities' });
    const cat2 = await expenseService.createCategory(bId, { name: 'Rent' });

    await expenseService.createExpense({
      businessId: bId,
      categoryId: cat1.id,
      financialAccountId: acc.account.id,
      amount: 500,
      paymentMethod: 'CASH',
      notes: 'Electricity bill',
      expenseDate: new Date().toISOString(),
    });

    await expenseService.createExpense({
      businessId: bId,
      categoryId: cat2.id,
      financialAccountId: acc.account.id,
      amount: 1500,
      paymentMethod: 'CASH',
      notes: 'Shop rent',
      expenseDate: new Date().toISOString(),
    });

    const report = await expenseReportService.generateExpenseReport(bId, { dateRange: resolveDateRange('ALL_TIME') });
    const m = report.metrics;
    const passed = m.totalExpensesAmount === 2000 && m.activeExpensesCount === 2 && report.categoryBreakdown.length === 2;
    return { passed, message: 'Total Expenses = ₹2,000 across 2 categories.', details: m };
  });

  // Test 10: Expense reversals exclusion from report
  await runTest('Report Test 10: Reversed expenses excluded from active expense totals', async () => {
    const bId = await createBusiness('RT10');
    const acc = await financialAccountService.createAccount(bId, { name: 'Cash', type: 'CASH', openingBalance: 10000 });
    const cat = await expenseService.createCategory(bId, { name: 'Misc' });

    const exp1 = await expenseService.createExpense({
      businessId: bId,
      categoryId: cat.id,
      financialAccountId: acc.account.id,
      amount: 400,
      paymentMethod: 'CASH',
      notes: 'Active expense',
      expenseDate: new Date().toISOString(),
    });

    const exp2 = await expenseService.createExpense({
      businessId: bId,
      categoryId: cat.id,
      financialAccountId: acc.account.id,
      amount: 600,
      paymentMethod: 'CASH',
      notes: 'Accidental entry',
      expenseDate: new Date().toISOString(),
    });

    await expenseService.reverseExpense({
      businessId: bId,
      expenseId: exp2.id,
      reason: 'Duplicate entry',
    });

    const report = await expenseReportService.generateExpenseReport(bId, { dateRange: resolveDateRange('ALL_TIME') });
    const m = report.metrics;
    const passed = m.totalExpensesAmount === 400 && m.activeExpensesCount === 1 && m.reversedExpensesCount === 1 && m.reversedExpensesAmount === 600;
    return { passed, message: 'Active Expenses = ₹400, Reversed = ₹600.', details: m };
  });

  // Test 11: Cash flow money in/out classification
  await runTest('Report Test 11: Cash flow classification of real money movements', async () => {
    const bId = await createBusiness('RT11');
    const acc = await financialAccountService.createAccount(bId, { name: 'Cash', type: 'CASH', openingBalance: 5000 });
    const item = await itemRepository.createItem(bId, { name: 'P11', type: 'PRODUCT', unit: 'pcs', sellingPrice: 100, purchasePrice: 50, openingStock: 20, trackInventory: true, isActive: true });
    const cust = await customerRepository.createCustomer(bId, { name: 'C11', isActive: true });
    const cat = await expenseService.createCategory(bId, { name: 'General' });

    await saleService.completeSale(bId, {
      customerId: cust.id,
      customerNameSnapshot: cust.name,
      saleDate: new Date().toISOString(),
      lines: [{ itemId: item.id, itemNameSnapshot: item.name, quantity: 3, unit: 'pcs', rate: 100, discountType: 'NONE', discountValue: 0, trackInventory: true }],
      subtotal: 300,
      discountType: 'NONE',
      discountValue: 0,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 300,
      paidAmount: 300,
      paymentMethod: 'CASH',
      financialAccountId: acc.account.id,
    });

    await expenseService.createExpense({
      businessId: bId,
      categoryId: cat.id,
      financialAccountId: acc.account.id,
      amount: 100,
      paymentMethod: 'CASH',
      notes: 'Tea & Snacks',
      expenseDate: new Date().toISOString(),
    });

    const report = await cashFlowReportService.generateCashFlowReport(bId, { dateRange: resolveDateRange('ALL_TIME'), includeOpeningBalances: false });
    const m = report.metrics;
    const passed = m.totalMoneyIn === 300 && m.totalMoneyOut === 100 && m.netCashFlow === 200;
    return { passed, message: 'Money In = ₹300, Money Out = ₹100, Net Flow = ₹200.', details: m };
  });

  // Test 12: Account transfer neutrality in cash flow
  await runTest('Report Test 12: Account transfer neutrality in aggregate cash flow', async () => {
    const bId = await createBusiness('RT12');
    const cashAcc = await financialAccountService.createAccount(bId, { name: 'Cash', type: 'CASH', openingBalance: 10000 });
    const bankAcc = await financialAccountService.createAccount(bId, { name: 'Bank', type: 'BANK', openingBalance: 10000 });

    await accountTransferService.createTransfer({
      businessId: bId,
      fromAccountId: cashAcc.account.id,
      toAccountId: bankAcc.account.id,
      amount: 3000,
      notes: 'Deposit cash to bank',
      transferDate: new Date().toISOString(),
    });

    const report = await cashFlowReportService.generateCashFlowReport(bId, { dateRange: resolveDateRange('ALL_TIME'), includeOpeningBalances: false });
    const m = report.metrics;
    const passed = m.totalMoneyIn === 0 && m.totalMoneyOut === 0 && m.netCashFlow === 0 && (m.internalTransfersAmount === 3000 || m.internalTransfersAmount === 6000);
    return { passed, message: 'Transfer ₹3,000 has 0 impact on business cash flow (Transfer neutrality verified).', details: m };
  });

  // Test 13: Customer receivables ledger projection
  await runTest('Report Test 13: Customer receivables ledger projection', async () => {
    const bId = await createBusiness('RT13');
    const acc = await financialAccountService.createAccount(bId, { name: 'Cash', type: 'CASH', openingBalance: 10000 });
    const item = await itemRepository.createItem(bId, { name: 'P13', type: 'PRODUCT', unit: 'pcs', sellingPrice: 100, purchasePrice: 50, openingStock: 20, trackInventory: true, isActive: true });
    const cust = await customerRepository.createCustomer(bId, { name: 'C13', isActive: true });

    await saleService.completeSale(bId, {
      customerId: cust.id,
      customerNameSnapshot: cust.name,
      saleDate: new Date().toISOString(),
      lines: [{ itemId: item.id, itemNameSnapshot: item.name, quantity: 5, unit: 'pcs', rate: 100, discountType: 'NONE', discountValue: 0, trackInventory: true }],
      subtotal: 500,
      discountType: 'NONE',
      discountValue: 0,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 500,
      paidAmount: 200,
      paymentMethod: 'CASH',
      financialAccountId: acc.account.id,
    });

    const report = await receivablesReportService.generateReceivablesReport(bId);
    const m = report.metrics;
    const passed = m.totalOutstandingBalance === 300 && m.customersWithDueCount === 1 && m.netReceivable === 300;
    return { passed, message: 'Outstanding Balance = ₹300, Net Receivable = ₹300.', details: m };
  });

  // Test 14: Customer credit balance projection
  await runTest('Report Test 14: Customer advance credit balance projection', async () => {
    const bId = await createBusiness('RT14');
    const acc = await financialAccountService.createAccount(bId, { name: 'Cash', type: 'CASH', openingBalance: 10000 });
    const cust = await customerRepository.createCustomer(bId, { name: 'C14', isActive: true });

    await paymentService.receiveCustomerPayment({
      businessId: bId,
      customerId: cust.id,
      amount: 800,
      paymentMethod: 'CASH',
      financialAccountId: acc.account.id,
      paymentDate: new Date().toISOString(),
    });

    const report = await receivablesReportService.generateReceivablesReport(bId);
    const m = report.metrics;
    const passed = m.totalCustomerCredit === 800 && m.customersWithCreditCount === 1 && m.netReceivable === -800;
    return { passed, message: 'Customer Credit = ₹800, Net Receivable = -₹800.', details: m };
  });

  // Test 15: Supplier payables ledger projection
  await runTest('Report Test 15: Supplier payables ledger projection', async () => {
    const bId = await createBusiness('RT15');
    const acc = await financialAccountService.createAccount(bId, { name: 'Bank', type: 'BANK', openingBalance: 10000 });
    const item = await itemRepository.createItem(bId, { name: 'P15', type: 'PRODUCT', unit: 'pcs', sellingPrice: 200, purchasePrice: 120, openingStock: 0, trackInventory: true, isActive: true });
    const supp = await supplierRepository.createSupplier(bId, { name: 'S15', isActive: true });

    await purchaseService.completePurchase(bId, {
      supplierId: supp.id,
      supplierNameSnapshot: supp.name,
      purchaseDate: new Date().toISOString(),
      lines: [{ itemId: item.id, itemNameSnapshot: item.name, quantity: 10, unit: 'pcs', unitCost: 120, discountType: 'NONE', discountValue: 0, trackInventory: true }],
      subtotal: 1200,
      discountType: 'NONE',
      discountValue: 0,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 1200,
      paidAmount: 400,
      paymentMethod: 'BANK_TRANSFER',
      financialAccountId: acc.account.id,
    });

    const report = await payablesReportService.generatePayablesReport(bId);
    const m = report.metrics;
    const passed = m.totalOutstandingPayable === 800 && m.suppliersWithDueCount === 1 && m.netPayable === 800;
    return { passed, message: 'Outstanding Payable = ₹800, Net Payable = ₹800.', details: m };
  });

  // Test 16: Supplier credit balance projection
  await runTest('Report Test 16: Supplier advance credit balance projection', async () => {
    const bId = await createBusiness('RT16');
    const acc = await financialAccountService.createAccount(bId, { name: 'Bank', type: 'BANK', openingBalance: 10000 });
    const supp = await supplierRepository.createSupplier(bId, { name: 'S16', isActive: true });

    await supplierPaymentService.recordSupplierPayment({
      businessId: bId,
      supplierId: supp.id,
      amount: 1200,
      paymentMethod: 'BANK_TRANSFER',
      financialAccountId: acc.account.id,
      paymentDate: new Date().toISOString(),
    });

    const report = await payablesReportService.generatePayablesReport(bId);
    const m = report.metrics;
    const passed = m.totalSupplierCredit === 1200 && m.suppliersWithCreditCount === 1 && m.netPayable === -1200;
    return { passed, message: 'Supplier Credit = ₹1,200, Net Payable = -₹1,200.', details: m };
  });

  // Test 17: Inventory stock quantity and catalog valuation
  await runTest('Report Test 17: Inventory stock quantity and catalog valuation', async () => {
    const bId = await createBusiness('RT17');
    await itemRepository.createItem(bId, { name: 'Item A', type: 'PRODUCT', unit: 'pcs', sellingPrice: 200, purchasePrice: 120, openingStock: 10, lowStockThreshold: 5, trackInventory: true, isActive: true });
    await itemRepository.createItem(bId, { name: 'Item B', type: 'PRODUCT', unit: 'pcs', sellingPrice: 50, purchasePrice: 30, openingStock: 20, lowStockThreshold: 5, trackInventory: true, isActive: true });

    const report = await inventoryReportService.generateInventoryReport(bId);
    const m = report.metrics;
    const passed = m.totalUnitsInStock === 30 && m.totalValuationAtCost === 1800 && m.totalValuationAtRetail === 3000 && m.estimatedPotentialGrossMargin === 1200;
    return { passed, message: 'Units = 30, Cost Valuation = ₹1,800, Retail Valuation = ₹3,000.', details: m };
  });

  // Test 18: Inventory movement history chronological running balance
  await runTest('Report Test 18: Inventory movement history chronological running balance', async () => {
    const bId = await createBusiness('RT18');
    const acc = await financialAccountService.createAccount(bId, { name: 'Cash', type: 'CASH', openingBalance: 10000 });
    const item = await itemRepository.createItem(bId, { name: 'Item 18', type: 'PRODUCT', unit: 'pcs', sellingPrice: 100, purchasePrice: 50, openingStock: 10, trackInventory: true, isActive: true });
    const cust = await customerRepository.createCustomer(bId, { name: 'C18', isActive: true });

    await saleService.completeSale(bId, {
      customerId: cust.id,
      customerNameSnapshot: cust.name,
      saleDate: new Date().toISOString(),
      lines: [{ itemId: item.id, itemNameSnapshot: item.name, quantity: 3, unit: 'pcs', rate: 100, discountType: 'NONE', discountValue: 0, trackInventory: true }],
      subtotal: 300,
      discountType: 'NONE',
      discountValue: 0,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 300,
      paidAmount: 300,
      paymentMethod: 'CASH',
      financialAccountId: acc.account.id,
    });

    const report = await inventoryReportService.generateInventoryReport(bId, { itemId: item.id });
    const movements = report.movementLedger;
    const passed = movements.length === 2 && movements[0].runningStock === 7 && movements[1].runningStock === 10;
    return { passed, message: 'Chronological running stock verified: 10 -> 7.', details: movements };
  });

  // Test 19: Cross-business report multi-tenant isolation
  await runTest('Report Test 19: Cross-business multi-tenant reporting isolation', async () => {
    const bId1 = await createBusiness('RT19_A');
    const bId2 = await createBusiness('RT19_B');

    const acc1 = await financialAccountService.createAccount(bId1, { name: 'Cash A', type: 'CASH', openingBalance: 5000 });
    const acc2 = await financialAccountService.createAccount(bId2, { name: 'Cash B', type: 'CASH', openingBalance: 9000 });

    const item1 = await itemRepository.createItem(bId1, { name: 'Prod A', type: 'PRODUCT', unit: 'pcs', sellingPrice: 100, purchasePrice: 50, openingStock: 10, trackInventory: true, isActive: true });
    const item2 = await itemRepository.createItem(bId2, { name: 'Prod B', type: 'PRODUCT', unit: 'pcs', sellingPrice: 200, purchasePrice: 100, openingStock: 5, trackInventory: true, isActive: true });

    const cust1 = await customerRepository.createCustomer(bId1, { name: 'Cust A', isActive: true });
    const cust2 = await customerRepository.createCustomer(bId2, { name: 'Cust B', isActive: true });

    await saleService.completeSale(bId1, {
      customerId: cust1.id,
      customerNameSnapshot: cust1.name,
      saleDate: new Date().toISOString(),
      lines: [{ itemId: item1.id, itemNameSnapshot: item1.name, quantity: 1, unit: 'pcs', rate: 100, discountType: 'NONE', discountValue: 0, trackInventory: true }],
      subtotal: 100,
      discountType: 'NONE',
      discountValue: 0,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 100,
      paidAmount: 100,
      paymentMethod: 'CASH',
      financialAccountId: acc1.account.id,
    });

    await saleService.completeSale(bId2, {
      customerId: cust2.id,
      customerNameSnapshot: cust2.name,
      saleDate: new Date().toISOString(),
      lines: [{ itemId: item2.id, itemNameSnapshot: item2.name, quantity: 2, unit: 'pcs', rate: 200, discountType: 'NONE', discountValue: 0, trackInventory: true }],
      subtotal: 400,
      discountType: 'NONE',
      discountValue: 0,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 400,
      paidAmount: 400,
      paymentMethod: 'CASH',
      financialAccountId: acc2.account.id,
    });

    const report1 = await salesReportService.generateSalesReport(bId1, { dateRange: resolveDateRange('ALL_TIME') });
    const report2 = await salesReportService.generateSalesReport(bId2, { dateRange: resolveDateRange('ALL_TIME') });

    const passed = report1.metrics.netRealizedSales === 100 && report2.metrics.netRealizedSales === 400;
    return { passed, message: 'Tenant A Sales = ₹100, Tenant B Sales = ₹400 (Zero data leakage).', details: { r1: report1.metrics, r2: report2.metrics } };
  });

  // Test 20: Empty date range handling
  await runTest('Report Test 20: Empty date range returns graceful zeroed metrics', async () => {
    const bId = await createBusiness('RT20');
    const futureBounds = {
      preset: 'CUSTOM' as const,
      startDateIso: new Date('2090-01-01').toISOString(),
      endDateIso: new Date('2090-01-02').toISOString(),
      label: 'Future',
    };

    const salesRep = await salesReportService.generateSalesReport(bId, { dateRange: futureBounds });
    const purRep = await purchaseReportService.generatePurchaseReport(bId, { dateRange: futureBounds });
    const expRep = await expenseReportService.generateExpenseReport(bId, { dateRange: futureBounds });
    const cashRep = await cashFlowReportService.generateCashFlowReport(bId, { dateRange: futureBounds });

    const passed =
      salesRep.metrics.grossSales === 0 &&
      purRep.metrics.grossPurchases === 0 &&
      expRep.metrics.totalExpensesAmount === 0 &&
      cashRep.metrics.totalMoneyIn === 0;

    return { passed, message: 'Empty date ranges return clean, structured zeroed results without exceptions.', details: salesRep.metrics };
  });

  // Test 21: Custom date range exact inclusive/exclusive boundaries
  await runTest('Report Test 21: Custom date range exact [start, end) boundary verification', async () => {
    const bounds = resolveDateRange('CUSTOM', '2026-06-01', '2026-06-05');
    const startDate = new Date(bounds.startDateIso);
    const endDate = new Date(bounds.endDateIso);

    const diffDays = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const passed = diffDays === 5 && startDate.getHours() === 0 && endDate.getHours() === 0;
    return { passed, message: `5-day boundary verified from ${bounds.startDateIso} to ${bounds.endDateIso}.`, details: { bounds, diffDays } };
  });

  // Test 22: Offline Dexie report availability
  await runTest('Report Test 22: Offline Dexie projection availability without network requirement', async () => {
    const bId = await createBusiness('RT22');
    const acc = await financialAccountService.createAccount(bId, { name: 'Cash', type: 'CASH', openingBalance: 1000 });

    const report = await cashFlowReportService.generateCashFlowReport(bId, { dateRange: resolveDateRange('ALL_TIME'), includeOpeningBalances: true });
    const passed = report.metrics.totalLiquidFunds === 1000 && report.movements.length === 1;
    return { passed, message: 'Pure offline Dexie projection succeeded instantaneously.', details: report.metrics };
  });

  // Test 23: CSV export data consistency
  await runTest('Report Test 23: CSV export utility consistency', async () => {
    const headers = ['Invoice', 'Amount', 'Status'];
    const rows = [
      ['INV-001', 500, 'PAID'],
      ['INV-002, Special', 1200, 'UNPAID'],
    ];

    const csv = reportExportService.convertToCsv(headers, rows);
    const lines = csv.split('\r\n');
    const passed = lines.length === 3 && lines[2].includes('"INV-002, Special"');
    return { passed, message: 'CSV properly formatted and escaped quotes/commas.', details: { csv } };
  });

  // Test 24: Dashboard and report metrics reconciliation consistency
  await runTest('Report Test 24: Dashboard and Sales Report metrics reconciliation consistency', async () => {
    const bId = await createBusiness('RT24');
    const acc = await financialAccountService.createAccount(bId, { name: 'Cash', type: 'CASH', openingBalance: 10000 });
    const item = await itemRepository.createItem(bId, { name: 'P24', type: 'PRODUCT', unit: 'pcs', sellingPrice: 100, purchasePrice: 50, openingStock: 20, trackInventory: true, isActive: true });
    const cust = await customerRepository.createCustomer(bId, { name: 'C24', isActive: true });

    await saleService.completeSale(bId, {
      customerId: cust.id,
      customerNameSnapshot: cust.name,
      saleDate: new Date().toISOString(),
      lines: [{ itemId: item.id, itemNameSnapshot: item.name, quantity: 4, unit: 'pcs', rate: 100, discountType: 'NONE', discountValue: 0, trackInventory: true }],
      subtotal: 400,
      discountType: 'NONE',
      discountValue: 0,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 400,
      paidAmount: 400,
      paymentMethod: 'CASH',
      financialAccountId: acc.account.id,
    });

    const report = await salesReportService.generateSalesReport(bId, { dateRange: resolveDateRange('TODAY') });
    const payments = await paymentService.getCustomerFinancialSummary(cust.id);

    const passed = report.metrics.netRealizedSales === 400 && payments.totalSales === 400;
    return { passed, message: 'Sales report matches customer statement reconciliation perfectly (₹400).', details: { rep: report.metrics, cust: payments } };
  });

  // Test 25: COGS and margin methodology transparency validation
  await runTest('Report Test 25: COGS & margin methodology transparency validation', async () => {
    const bId = await createBusiness('RT25');
    await itemRepository.createItem(bId, { name: 'Item 25', type: 'PRODUCT', unit: 'pcs', sellingPrice: 150, purchasePrice: 90, openingStock: 10, trackInventory: true, isActive: true });

    const report = await inventoryReportService.generateInventoryReport(bId);
    const passed =
      report.costingMethodologyNote.includes('standard catalog item costs') &&
      report.metrics.totalValuationAtCost === 900 &&
      report.metrics.totalValuationAtRetail === 1500;

    return {
      passed,
      message: 'Costing methodology explicitly documented without fabricating ungrounded FIFO profit.',
      details: { note: report.costingMethodologyNote, metrics: report.metrics },
    };
  });

  return results;
};
