import { db } from '../db/database';
import { roundCurrency, addCurrency, subtractCurrency } from '../utils/money';
import { customerRepository } from '../repositories/customerRepository';
import { itemRepository } from '../repositories/itemRepository';
import { paymentService } from './paymentService';
import { supplierPaymentService } from './supplierPaymentService';
import { financialMovementRepository } from '../repositories/financialMovementRepository';
import { financialAccountService } from './financialAccountService';
import { dashboardService } from './dashboardService';
import type { FinancialMovement, CustomerStatementEntry, SupplierStatementEntry } from '../types';

export interface ReconciliationCheck {
  domain: string;
  field: string;
  expected: any;
  actual: any;
  passed: boolean;
  notes?: string;
}

export interface ReconciliationReport {
  scenario: string;
  passed: boolean;
  checks: ReconciliationCheck[];
  timestamp: string;
  businessId: string;
  summaryMessage?: string;
}

/**
 * Cross-Domain Reconciliation Engine
 *
 * PRINCIPLE:
 * Strictly read-only audit engine. Calculates expected state independently from raw,
 * immutable records in Dexie, completely separate from production computation functions,
 * then compares expected vs actual application state across all domains.
 */
export const crossDomainReconciliationService = {
  /**
   * 1. INDEPENDENT CUSTOMER RECONCILIATION
   * Reconciles Sales, Returns, Voids, Payments, Reversals, Refunds, and Allocations.
   */
  async reconcileCustomer(businessId: string, customerId: string): Promise<ReconciliationCheck[]> {
    const checks: ReconciliationCheck[] = [];

    // Query raw records directly from Dexie
    const rawSales = await db.sales
      .where('businessId')
      .equals(businessId)
      .filter((s) => !s.isDeleted && s.customerId === customerId)
      .toArray();

    const saleIds = new Set(rawSales.map((s) => s.id));

    const rawVoids = await db.saleVoids
      .where('businessId')
      .equals(businessId)
      .filter((v) => !v.isDeleted && (v.customerId === customerId || saleIds.has(v.originalSaleId)))
      .toArray();
    const voidSaleIds = new Set(rawVoids.map((v) => v.originalSaleId));

    const rawReturns = await db.saleReturns
      .where('businessId')
      .equals(businessId)
      .filter((r) => !r.isDeleted && (r.customerId === customerId || saleIds.has(r.originalSaleId)))
      .toArray();

    const returnSumBySale = new Map<string, number>();
    for (const r of rawReturns) {
      const cur = returnSumBySale.get(r.originalSaleId) || 0;
      returnSumBySale.set(r.originalSaleId, cur + (Number(r.totalAmount) || 0));
    }

    const rawPayments = await db.payments
      .where('businessId')
      .equals(businessId)
      .filter((p) => !p.isDeleted && p.partyId === customerId && p.partyType === 'CUSTOMER')
      .toArray();

    const rawReversals = await db.paymentReversals
      .where('businessId')
      .equals(businessId)
      .filter((r) => !r.isDeleted && (r.customerId === customerId || rawPayments.some((p) => p.id === r.originalPaymentId)))
      .toArray();
    const reversedPaymentIds = new Set(rawReversals.map((r) => r.originalPaymentId));

    const rawRefunds = await db.refunds
      .where('businessId')
      .equals(businessId)
      .filter((r) => !r.isDeleted && r.customerId === customerId)
      .toArray();

    const rawAllocations = await db.paymentAllocations
      .where('businessId')
      .equals(businessId)
      .filter((a) => !a.isDeleted && a.customerId === customerId && !reversedPaymentIds.has(a.paymentId))
      .toArray();

    // Independent Calculations
    let expectedGrossSales = 0;
    let expectedReturnsOnActiveSales = 0;
    for (const s of rawSales) {
      if (!voidSaleIds.has(s.id)) {
        expectedGrossSales += Number(s.totalAmount) || 0;
        expectedReturnsOnActiveSales += returnSumBySale.get(s.id) || 0;
      }
    }
    const expectedTotalSales = roundCurrency(Math.max(0, expectedGrossSales - expectedReturnsOnActiveSales));

    const expectedGrossPaid = rawPayments
      .filter((p) => !reversedPaymentIds.has(p.id))
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const expectedRefunds = rawRefunds.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const expectedTotalPaid = roundCurrency(Math.max(0, expectedGrossPaid - expectedRefunds));

    const validAllocations = rawAllocations.filter((a) => !voidSaleIds.has(a.saleId));

    let expectedOutstandingBalance = 0;
    let expectedEffectiveAllocated = 0;
    for (const s of rawSales) {
      if (voidSaleIds.has(s.id)) continue;
      const retAmount = returnSumBySale.get(s.id) || 0;
      const effectiveTotal = roundCurrency(Math.max(0, (Number(s.totalAmount) || 0) - retAmount));
      if (effectiveTotal <= 0.005) continue;

      const rawSaleAllocated = validAllocations
        .filter((a) => a.saleId === s.id)
        .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
      const saleAllocated = roundCurrency(Math.min(effectiveTotal, rawSaleAllocated));
      expectedEffectiveAllocated += saleAllocated;

      const due = Math.max(0, effectiveTotal - saleAllocated);
      expectedOutstandingBalance += due;
    }
    expectedOutstandingBalance = roundCurrency(expectedOutstandingBalance);
    const expectedTotalAllocated = roundCurrency(expectedEffectiveAllocated);

    const expectedCustomerCredit = roundCurrency(Math.max(0, expectedTotalPaid - expectedTotalAllocated));
    const expectedNetReceivable = roundCurrency(expectedOutstandingBalance - expectedCustomerCredit);

    // Compare with Production Customer Summary & Repository
    const actualSummary = await paymentService.getCustomerFinancialSummary(customerId);
    const actualWithBalance = await customerRepository.getCustomerWithBalance(customerId);

    checks.push({
      domain: 'Customer',
      field: 'totalSales',
      expected: expectedTotalSales,
      actual: actualSummary?.totalSales ?? actualWithBalance?.totalSales,
      passed: expectedTotalSales === (actualSummary?.totalSales ?? actualWithBalance?.totalSales),
    });

    checks.push({
      domain: 'Customer',
      field: 'totalPaid',
      expected: expectedTotalPaid,
      actual: actualSummary?.totalPaid ?? actualWithBalance?.totalPaid,
      passed: expectedTotalPaid === (actualSummary?.totalPaid ?? actualWithBalance?.totalPaid),
    });

    checks.push({
      domain: 'Customer',
      field: 'totalAllocated',
      expected: expectedTotalAllocated,
      actual: actualSummary?.totalAllocated ?? actualWithBalance?.totalAllocated,
      passed: expectedTotalAllocated === (actualSummary?.totalAllocated ?? actualWithBalance?.totalAllocated),
    });

    checks.push({
      domain: 'Customer',
      field: 'outstandingBalance',
      expected: expectedOutstandingBalance,
      actual: actualSummary?.outstandingBalance ?? actualWithBalance?.outstandingBalance,
      passed: expectedOutstandingBalance === (actualSummary?.outstandingBalance ?? actualWithBalance?.outstandingBalance),
    });

    checks.push({
      domain: 'Customer',
      field: 'customerCredit',
      expected: expectedCustomerCredit,
      actual: actualSummary?.customerCredit ?? actualWithBalance?.customerCredit,
      passed: expectedCustomerCredit === (actualSummary?.customerCredit ?? actualWithBalance?.customerCredit),
    });

    checks.push({
      domain: 'Customer',
      field: 'netReceivable',
      expected: expectedNetReceivable,
      actual: actualSummary?.netReceivable ?? actualWithBalance?.netReceivable,
      passed: expectedNetReceivable === (actualSummary?.netReceivable ?? actualWithBalance?.netReceivable),
    });

    return checks;
  },

  /**
   * 2. INDEPENDENT SUPPLIER RECONCILIATION
   * Reconciles Purchases, Returns, Voids, Payments, Reversals, Refunds Received, and Allocations.
   */
  async reconcileSupplier(businessId: string, supplierId: string): Promise<ReconciliationCheck[]> {
    const checks: ReconciliationCheck[] = [];

    // Query raw records directly from Dexie
    const rawPurchases = await db.purchases
      .where('businessId')
      .equals(businessId)
      .filter((p) => !p.isDeleted && p.supplierId === supplierId)
      .toArray();

    const purchaseIds = new Set(rawPurchases.map((p) => p.id));

    const rawVoids = await db.purchaseVoids
      .where('businessId')
      .equals(businessId)
      .filter((v) => !v.isDeleted && (v.supplierId === supplierId || purchaseIds.has(v.originalPurchaseId)))
      .toArray();
    const voidPurchaseIds = new Set(rawVoids.map((v) => v.originalPurchaseId));

    const rawReturns = await db.purchaseReturns
      .where('businessId')
      .equals(businessId)
      .filter((r) => !r.isDeleted && (r.supplierId === supplierId || purchaseIds.has(r.originalPurchaseId)))
      .toArray();

    const returnSumByPurchase = new Map<string, number>();
    for (const r of rawReturns) {
      const cur = returnSumByPurchase.get(r.originalPurchaseId) || 0;
      returnSumByPurchase.set(r.originalPurchaseId, cur + (Number(r.totalAmount) || 0));
    }

    const rawPayments = await db.supplierPayments
      .where('businessId')
      .equals(businessId)
      .filter((p) => !p.isDeleted && p.supplierId === supplierId)
      .toArray();

    const rawReversals = await db.supplierPaymentReversals
      .where('businessId')
      .equals(businessId)
      .filter((r) => !r.isDeleted && (r.supplierId === supplierId || rawPayments.some((p) => p.id === r.originalPaymentId)))
      .toArray();
    const reversedPaymentIds = new Set(rawReversals.map((r) => r.originalPaymentId));

    const rawRefunds = await db.refundsReceived
      .where('businessId')
      .equals(businessId)
      .filter((r) => !r.isDeleted && r.supplierId === supplierId)
      .toArray();

    const rawAllocations = await db.supplierPaymentAllocations
      .where('businessId')
      .equals(businessId)
      .filter((a) => !a.isDeleted && a.supplierId === supplierId && !reversedPaymentIds.has(a.supplierPaymentId))
      .toArray();

    // Independent Calculations
    let expectedGrossPurchases = 0;
    let expectedReturnsOnActivePurchases = 0;
    for (const p of rawPurchases) {
      if (!voidPurchaseIds.has(p.id)) {
        expectedGrossPurchases += Number(p.totalAmount) || 0;
        expectedReturnsOnActivePurchases += returnSumByPurchase.get(p.id) || 0;
      }
    }
    const expectedTotalPurchases = roundCurrency(Math.max(0, expectedGrossPurchases - expectedReturnsOnActivePurchases));

    const expectedGrossPaid = rawPayments
      .filter((p) => !reversedPaymentIds.has(p.id))
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const expectedRefunds = rawRefunds.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const expectedTotalPaid = roundCurrency(Math.max(0, expectedGrossPaid - expectedRefunds));

    const validAllocations = rawAllocations.filter((a) => !voidPurchaseIds.has(a.purchaseId));

    let expectedOutstandingPayable = 0;
    let expectedEffectiveAllocated = 0;
    for (const p of rawPurchases) {
      if (voidPurchaseIds.has(p.id)) continue;
      const retAmount = returnSumByPurchase.get(p.id) || 0;
      const effectiveTotal = roundCurrency(Math.max(0, (Number(p.totalAmount) || 0) - retAmount));
      if (effectiveTotal <= 0.005) continue;

      const rawAllocated = validAllocations
        .filter((a) => a.purchaseId === p.id)
        .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
      const effectiveAlloc = roundCurrency(Math.min(effectiveTotal, rawAllocated));
      expectedEffectiveAllocated += effectiveAlloc;

      const due = Math.max(0, effectiveTotal - effectiveAlloc);
      expectedOutstandingPayable += due;
    }
    expectedOutstandingPayable = roundCurrency(expectedOutstandingPayable);
    const expectedTotalAllocated = roundCurrency(expectedEffectiveAllocated);

    const expectedSupplierCredit = roundCurrency(Math.max(0, expectedTotalPaid - expectedTotalAllocated));
    const expectedNetPayable = roundCurrency(expectedOutstandingPayable - expectedSupplierCredit);

    // Compare with Production Supplier Summary
    const actualSummary = await supplierPaymentService.getSupplierFinancialSummary(supplierId);

    checks.push({
      domain: 'Supplier',
      field: 'totalPurchases',
      expected: expectedTotalPurchases,
      actual: actualSummary?.totalPurchases,
      passed: expectedTotalPurchases === actualSummary?.totalPurchases,
    });

    checks.push({
      domain: 'Supplier',
      field: 'totalPaid',
      expected: expectedTotalPaid,
      actual: actualSummary?.totalPaid,
      passed: expectedTotalPaid === actualSummary?.totalPaid,
    });

    checks.push({
      domain: 'Supplier',
      field: 'totalAllocated',
      expected: expectedTotalAllocated,
      actual: actualSummary?.totalAllocated,
      passed: expectedTotalAllocated === actualSummary?.totalAllocated,
    });

    checks.push({
      domain: 'Supplier',
      field: 'outstandingPayable',
      expected: expectedOutstandingPayable,
      actual: actualSummary?.outstandingPayable,
      passed: expectedOutstandingPayable === actualSummary?.outstandingPayable,
    });

    checks.push({
      domain: 'Supplier',
      field: 'supplierCredit',
      expected: expectedSupplierCredit,
      actual: actualSummary?.supplierCredit,
      passed: expectedSupplierCredit === actualSummary?.supplierCredit,
    });

    checks.push({
      domain: 'Supplier',
      field: 'netPayable',
      expected: expectedNetPayable,
      actual: actualSummary?.netPayable,
      passed: expectedNetPayable === actualSummary?.netPayable,
    });

    return checks;
  },

  /**
   * 3. INDEPENDENT INVENTORY RECONCILIATION
   * Reconciles raw StockMovements against reported Item Stock.
   */
  async reconcileInventory(businessId: string, itemId: string): Promise<ReconciliationCheck[]> {
    const checks: ReconciliationCheck[] = [];

    const item = await db.items.get(itemId);
    if (!item) {
      checks.push({
        domain: 'Inventory',
        field: 'itemExists',
        expected: true,
        actual: false,
        passed: false,
        notes: `Item ${itemId} not found in business ${businessId}`,
      });
      return checks;
    }

    // Query raw stock movements from Dexie
    const rawMovements = await db.stockMovements
      .where('itemId')
      .equals(itemId)
      .filter((m) => m.businessId === businessId)
      .toArray();

    // If item does not track inventory, stock is 0
    let expectedStock = 0;
    if (item.trackInventory) {
      for (const m of rawMovements) {
        expectedStock += Number(m.quantityChange) || 0;
      }
    }

    const actualItemWithStock = await itemRepository.getItemWithStock(itemId);
    const actualStock = actualItemWithStock?.currentStock ?? 0;

    checks.push({
      domain: 'Inventory',
      field: 'currentStock',
      expected: expectedStock,
      actual: actualStock,
      passed: expectedStock === actualStock,
      notes: `Item ${item.name} (${item.trackInventory ? 'Tracked' : 'Non-Tracked'}): ${rawMovements.length} raw movements`,
    });

    return checks;
  },

  /**
   * 4. INDEPENDENT FINANCIAL ACCOUNT RECONCILIATION
   * Reconciles raw FinancialMovements against derived Account Balances and Consolidated Liquidity.
   */
  async reconcileFinancialAccounts(businessId: string): Promise<ReconciliationCheck[]> {
    const checks: ReconciliationCheck[] = [];

    const rawAccounts = await db.financialAccounts
      .where('businessId')
      .equals(businessId)
      .filter((a) => !a.isDeleted)
      .toArray();

    const rawMovements = await db.financialMovements
      .where('businessId')
      .equals(businessId)
      .filter((m) => !m.isDeleted)
      .toArray();

    let expectedTotalLiquidFunds = 0;
    let expectedCashFunds = 0;
    let expectedBankFunds = 0;
    let expectedOtherFunds = 0;

    for (const account of rawAccounts) {
      const accMovements = rawMovements.filter((m) => m.accountId === account.id);

      let totalIn = 0;
      let totalOut = 0;

      for (const m of accMovements) {
        const amt = Number(m.amount) || 0;
        if (m.direction === 'IN') totalIn += amt;
        else if (m.direction === 'OUT') totalOut += amt;
      }

      const expectedAccBalance = roundCurrency(totalIn - totalOut);
      const actualAccBalance = await financialMovementRepository.getAccountDerivedBalance(account.id);

      checks.push({
        domain: 'FinancialAccount',
        field: `accountBalance_${account.name}`,
        expected: expectedAccBalance,
        actual: actualAccBalance,
        passed: expectedAccBalance === actualAccBalance,
        notes: `Account ID: ${account.id}, Movements: ${accMovements.length}, IN: ₹${totalIn}, OUT: ₹${totalOut}`,
      });

      if (!account.isArchived) {
        expectedTotalLiquidFunds = addCurrency(expectedTotalLiquidFunds, expectedAccBalance);
        if (account.type === 'CASH') {
          expectedCashFunds = addCurrency(expectedCashFunds, expectedAccBalance);
        } else if (account.type === 'BANK' || account.type === 'UPI') {
          expectedBankFunds = addCurrency(expectedBankFunds, expectedAccBalance);
        } else {
          expectedOtherFunds = addCurrency(expectedOtherFunds, expectedAccBalance);
        }
      }
    }

    const actualFunds = await financialAccountService.getTotalLiquidFunds(businessId);

    checks.push({
      domain: 'FinancialAccount',
      field: 'totalLiquidFunds',
      expected: roundCurrency(expectedTotalLiquidFunds),
      actual: actualFunds.totalBalance,
      passed: roundCurrency(expectedTotalLiquidFunds) === actualFunds.totalBalance,
    });

    checks.push({
      domain: 'FinancialAccount',
      field: 'cashFunds',
      expected: roundCurrency(expectedCashFunds),
      actual: actualFunds.cashBalance,
      passed: roundCurrency(expectedCashFunds) === actualFunds.cashBalance,
    });

    checks.push({
      domain: 'FinancialAccount',
      field: 'bankFunds',
      expected: roundCurrency(expectedBankFunds),
      actual: actualFunds.bankBalance,
      passed: roundCurrency(expectedBankFunds) === actualFunds.bankBalance,
    });

    return checks;
  },

  /**
   * 5. INDEPENDENT STATEMENT RECONCILIATION
   * Reconciles Customer, Supplier, and Account Statements running balances.
   */
  async reconcileStatements(
    businessId: string,
    params: { customerId?: string; supplierId?: string; accountId?: string }
  ): Promise<ReconciliationCheck[]> {
    const checks: ReconciliationCheck[] = [];

    // Customer Statement
    if (params.customerId) {
      const actualStatement = await paymentService.getCustomerStatement(params.customerId);
      let runningExpected = 0;
      let allEntriesMatch = true;

      for (let i = 0; i < actualStatement.length; i++) {
        const entry = actualStatement[i];
        runningExpected = roundCurrency(runningExpected + (Number(entry.debit) || 0) - (Number(entry.credit) || 0));
        if (entry.runningBalance !== runningExpected) {
          allEntriesMatch = false;
        }
      }

      checks.push({
        domain: 'CustomerStatement',
        field: 'runningBalanceIntegrity',
        expected: true,
        actual: allEntriesMatch,
        passed: allEntriesMatch,
        notes: `Checked ${actualStatement.length} customer statement chronological entries`,
      });
    }

    // Supplier Statement
    if (params.supplierId) {
      const actualStatement = await supplierPaymentService.getSupplierStatement(params.supplierId);
      let runningExpected = 0;
      let allEntriesMatch = true;

      for (let i = 0; i < actualStatement.length; i++) {
        const entry = actualStatement[i];
        runningExpected = roundCurrency(runningExpected + (Number(entry.payable) || 0) - (Number(entry.paid) || 0));
        if (entry.runningBalance !== runningExpected) {
          allEntriesMatch = false;
        }
      }

      checks.push({
        domain: 'SupplierStatement',
        field: 'runningBalanceIntegrity',
        expected: true,
        actual: allEntriesMatch,
        passed: allEntriesMatch,
        notes: `Checked ${actualStatement.length} supplier statement chronological entries`,
      });
    }

    // Account Details Statement
    if (params.accountId) {
      const accDetails = await financialAccountService.getAccountDetailsWithMovements(params.accountId);
      const movements = accDetails?.movements || [];

      let totalIn = 0;
      let totalOut = 0;
      for (const m of movements) {
        if (m.direction === 'IN') totalIn += Number(m.amount) || 0;
        else if (m.direction === 'OUT') totalOut += Number(m.amount) || 0;
      }
      const expectedBal = roundCurrency(totalIn - totalOut);

      checks.push({
        domain: 'AccountStatement',
        field: 'derivedBalance',
        expected: expectedBal,
        actual: accDetails?.derivedBalance,
        passed: expectedBal === accDetails?.derivedBalance,
        notes: `Account ${params.accountId}: ${movements.length} movements`,
      });
    }

    return checks;
  },

  /**
   * 6. INDEPENDENT DASHBOARD METRICS RECONCILIATION
   * Reconciles daily sales, purchases, expenses, and cash flow (excluding transfers).
   */
  async reconcileDashboard(businessId: string): Promise<ReconciliationCheck[]> {
    const checks: ReconciliationCheck[] = [];

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    // 1. Raw Today Sales
    const rawSales = await db.sales
      .where('businessId')
      .equals(businessId)
      .filter((s) => !s.isDeleted && (s.saleDate || s.createdAt) >= todayStart)
      .toArray();

    const saleIds = new Set(rawSales.map((s) => s.id));
    const rawVoids = await db.saleVoids
      .where('businessId')
      .equals(businessId)
      .filter((v) => !v.isDeleted && saleIds.has(v.originalSaleId))
      .toArray();
    const voidSaleIds = new Set(rawVoids.map((v) => v.originalSaleId));

    const rawReturns = await db.saleReturns
      .where('businessId')
      .equals(businessId)
      .filter((r) => !r.isDeleted && saleIds.has(r.originalSaleId))
      .toArray();

    let expectedTodaySales = 0;
    for (const s of rawSales) {
      if (!voidSaleIds.has(s.id)) {
        expectedTodaySales += Number(s.totalAmount) || 0;
      }
    }
    expectedTodaySales = roundCurrency(expectedTodaySales);

    // 2. Raw Today Purchases
    const rawPurchases = await db.purchases
      .where('businessId')
      .equals(businessId)
      .filter((p) => !p.isDeleted && (p.purchaseDate || p.createdAt) >= todayStart)
      .toArray();

    const purIds = new Set(rawPurchases.map((p) => p.id));
    const rawPurVoids = await db.purchaseVoids
      .where('businessId')
      .equals(businessId)
      .filter((v) => !v.isDeleted && purIds.has(v.originalPurchaseId))
      .toArray();
    const voidPurIds = new Set(rawPurVoids.map((v) => v.originalPurchaseId));

    let expectedTodayPurchases = 0;
    for (const p of rawPurchases) {
      if (!voidPurIds.has(p.id)) {
        expectedTodayPurchases += Number(p.totalAmount) || 0;
      }
    }
    expectedTodayPurchases = roundCurrency(expectedTodayPurchases);

    // 3. Raw Today Expenses
    const rawExpenses = await db.expenses
      .where('businessId')
      .equals(businessId)
      .filter((e) => !e.isDeleted && (e.expenseDate || e.createdAt) >= todayStart)
      .toArray();

    const expIds = new Set(rawExpenses.map((e) => e.id));
    const rawExpReversals = await db.expenseReversals
      .where('businessId')
      .equals(businessId)
      .filter((r) => !r.isDeleted && expIds.has(r.originalExpenseId))
      .toArray();
    const revExpIds = new Set(rawExpReversals.map((r) => r.originalExpenseId));

    let expectedTodayExpenses = 0;
    for (const e of rawExpenses) {
      if (!revExpIds.has(e.id)) {
        expectedTodayExpenses += Number(e.amount) || 0;
      }
    }
    expectedTodayExpenses = roundCurrency(expectedTodayExpenses);

    // 4. Raw Today Cash Flow (excluding transfers)
    const rawMovements = await db.financialMovements
      .where('businessId')
      .equals(businessId)
      .filter((m) => !m.isDeleted && (m.movementDate || m.createdAt) >= todayStart)
      .toArray();

    let expectedMoneyIn = 0;
    let expectedMoneyOut = 0;

    for (const m of rawMovements) {
      // Exclude transfers and transfer reversals
      if (
        m.type === 'TRANSFER_IN' ||
        m.type === 'TRANSFER_OUT' ||
        m.type === 'TRANSFER_REVERSAL_IN' ||
        m.type === 'TRANSFER_REVERSAL_OUT'
      ) {
        continue;
      }

      const amt = Number(m.amount) || 0;
      if (m.direction === 'IN') {
        expectedMoneyIn = addCurrency(expectedMoneyIn, amt);
      } else if (m.direction === 'OUT') {
        expectedMoneyOut = addCurrency(expectedMoneyOut, amt);
      }
    }

    const expectedNetCashFlow = subtractCurrency(expectedMoneyIn, expectedMoneyOut);

    // Compare with Production Dashboard Metrics
    const actualDashboard = await dashboardService.getDashboardMetrics(businessId);

    checks.push({
      domain: 'Dashboard',
      field: 'todaySalesAmount',
      expected: expectedTodaySales,
      actual: actualDashboard.todaySalesAmount,
      passed: expectedTodaySales === actualDashboard.todaySalesAmount,
    });

    checks.push({
      domain: 'Dashboard',
      field: 'thisMonthPurchasesAmount',
      expected: expectedTodayPurchases,
      actual: actualDashboard.thisMonthPurchasesAmount,
      passed: expectedTodayPurchases === actualDashboard.thisMonthPurchasesAmount,
    });

    checks.push({
      domain: 'Dashboard',
      field: 'thisMonthExpensesAmount',
      expected: expectedTodayExpenses,
      actual: actualDashboard.thisMonthExpensesAmount,
      passed: expectedTodayExpenses === actualDashboard.thisMonthExpensesAmount,
    });

    checks.push({
      domain: 'Dashboard',
      field: 'todayMoneyIn',
      expected: expectedMoneyIn,
      actual: actualDashboard.todayMoneyIn,
      passed: expectedMoneyIn === actualDashboard.todayMoneyIn,
    });

    checks.push({
      domain: 'Dashboard',
      field: 'todayMoneyOut',
      expected: expectedMoneyOut,
      actual: actualDashboard.todayMoneyOut,
      passed: expectedMoneyOut === actualDashboard.todayMoneyOut,
    });

    checks.push({
      domain: 'Dashboard',
      field: 'todayNetCashFlow',
      expected: expectedNetCashFlow,
      actual: actualDashboard.todayNetCashFlow,
      passed: expectedNetCashFlow === actualDashboard.todayNetCashFlow,
    });

    return checks;
  },

  /**
   * 7. RUN FULL RECONCILIATION AUDIT
   * Runs all domain reconciliations for a given business.
   */
  async runFullReconciliationAudit(
    businessId: string,
    scenarioName: string,
    context?: { customerId?: string; supplierId?: string; itemId?: string; accountId?: string }
  ): Promise<ReconciliationReport> {
    const allChecks: ReconciliationCheck[] = [];

    // Financial Accounts Audit
    const accChecks = await this.reconcileFinancialAccounts(businessId);
    allChecks.push(...accChecks);

    // Dashboard Audit
    const dashChecks = await this.reconcileDashboard(businessId);
    allChecks.push(...dashChecks);

    // Specific entity checks if provided
    if (context?.customerId) {
      const custChecks = await this.reconcileCustomer(businessId, context.customerId);
      allChecks.push(...custChecks);
    }

    if (context?.supplierId) {
      const suppChecks = await this.reconcileSupplier(businessId, context.supplierId);
      allChecks.push(...suppChecks);
    }

    if (context?.itemId) {
      const itemChecks = await this.reconcileInventory(businessId, context.itemId);
      allChecks.push(...itemChecks);
    }

    if (context?.customerId || context?.supplierId || context?.accountId) {
      const stmtChecks = await this.reconcileStatements(businessId, context);
      allChecks.push(...stmtChecks);
    }

    const passed = allChecks.every((c) => c.passed);

    return {
      scenario: scenarioName,
      passed,
      checks: allChecks,
      timestamp: new Date().toISOString(),
      businessId,
      summaryMessage: passed
        ? `Reconciliation PASSED: ${allChecks.length}/${allChecks.length} independent checks verified across domains.`
        : `Reconciliation FAILED: ${allChecks.filter((c) => !c.passed).length} checks failed.`,
    };
  },
};
