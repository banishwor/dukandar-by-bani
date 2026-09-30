import { db } from '../db/database';
import { itemRepository } from '../repositories/itemRepository';
import { saleRepository } from '../repositories/saleRepository';
import { purchaseRepository } from '../repositories/purchaseRepository';
import { supplierRepository } from '../repositories/supplierRepository';
import type { DashboardMetrics, ItemWithStock, Sale, Purchase } from '../types';
import { roundCurrency } from '../utils/money';

export const dashboardService = {
  async getDashboardMetrics(businessId: string): Promise<DashboardMetrics> {
    const data = await this.getDashboardData(businessId);
    return data.metrics;
  },

  async getDashboardData(businessId: string): Promise<{
    metrics: DashboardMetrics;
    recentSales: Sale[];
    recentPurchases: Purchase[];
    lowStockItems: ItemWithStock[];
  }> {
    const sales = await saleRepository.getSales(businessId);
    const purchases = await purchaseRepository.getPurchases(businessId);
    const items = await itemRepository.getItemsWithStock(businessId);
    const customers = await db.customers
      .where('businessId')
      .equals(businessId)
      .filter((c) => !c.isDeleted)
      .toArray();
    const suppliers = await db.suppliers
      .where('businessId')
      .equals(businessId)
      .filter((s) => !s.isDeleted)
      .toArray();

    // Customer payments & corrections
    const payments = await db.payments
      .where('businessId')
      .equals(businessId)
      .filter((p) => !p.isDeleted)
      .toArray();

    const reversals = await db.paymentReversals
      .where('businessId')
      .equals(businessId)
      .filter((r) => !r.isDeleted)
      .toArray();
    const reversedPaymentIds = new Set(reversals.map((r) => r.originalPaymentId));

    const refunds = await db.refunds
      .where('businessId')
      .equals(businessId)
      .filter((r) => !r.isDeleted)
      .toArray();

    const returns = await db.saleReturns
      .where('businessId')
      .equals(businessId)
      .filter((r) => !r.isDeleted)
      .toArray();

    const totalReturnsAmount = returns.reduce((sum, r) => sum + (Number(r.totalAmount) || 0), 0);
    const totalRefundsAmount = refunds.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

    const activeSales = sales.filter((s) => s.status !== 'VOIDED');

    const todayStr = new Date().toISOString().slice(0, 10);
    const thisMonthStr = new Date().toISOString().slice(0, 7);

    const todaySales = activeSales.filter(
      (s) => (s.saleDate || s.createdAt).slice(0, 10) === todayStr
    );

    const todaySalesAmount = roundCurrency(
      todaySales.reduce((sum, s) => sum + (Number(s.totalAmount) || 0), 0)
    );

    // Today's returns (if any)
    const todayReturns = returns.filter(
      (r) => (r.returnDate || r.createdAt).slice(0, 10) === todayStr
    );
    const todayReturnsAmount = roundCurrency(
      todayReturns.reduce((sum, r) => sum + (Number(r.totalAmount) || 0), 0)
    );
    const todayNetSalesAmount = roundCurrency(Math.max(0, todaySalesAmount - todayReturnsAmount));

    // Calculate Today's Cost of Goods Sold (COGS) & Units Sold
    const todaySaleIds = new Set(todaySales.map((s) => s.id));
    let todayCogs = 0;
    let todayItemsSold = 0;

    if (todaySaleIds.size > 0) {
      const todaySaleLines = await db.saleLines
        .where('businessId')
        .equals(businessId)
        .filter((sl) => todaySaleIds.has(sl.saleId))
        .toArray();

      const itemCostMap = new Map<string, number>();
      for (const item of items) {
        itemCostMap.set(item.id, Number(item.costPrice ?? item.purchasePrice ?? 0));
      }

      for (const line of todaySaleLines) {
        const qty = Number(line.quantity) || 0;
        todayItemsSold += qty;
        const unitCost = itemCostMap.get(line.itemId) || 0;
        todayCogs += qty * unitCost;
      }
    }

    todayCogs = roundCurrency(todayCogs);
    const todayGrossProfit = roundCurrency(todayNetSalesAmount - todayCogs);
    const todayProfitMargin = todayNetSalesAmount > 0
      ? Number(((todayGrossProfit / todayNetSalesAmount) * 100).toFixed(1))
      : 0;

    const grossSalesAmount = activeSales.reduce((sum, s) => sum + (Number(s.totalAmount) || 0), 0);
    const totalSalesAmount = roundCurrency(Math.max(0, grossSalesAmount - totalReturnsAmount));

    const grossPaidAmount = payments
      .filter((p) => !reversedPaymentIds.has(p.id))
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const totalPaidAmount = roundCurrency(Math.max(0, grossPaidAmount - totalRefundsAmount));

    const totalDueAmount = roundCurrency(
      activeSales.reduce((sum, s) => sum + (Number(s.dueAmount) || 0), 0)
    );

    // Supplier & Purchases Calculations
    const activePurchases = purchases.filter((p) => p.status !== 'VOIDED');
    const thisMonthPurchases = activePurchases.filter(
      (p) => (p.purchaseDate || p.createdAt).slice(0, 7) === thisMonthStr
    );

    const purchaseReturns = await db.purchaseReturns
      .where('businessId')
      .equals(businessId)
      .filter((r) => !r.isDeleted)
      .toArray();
    const totalPurchaseReturnsAmount = purchaseReturns.reduce((sum, r) => sum + (Number(r.totalAmount) || 0), 0);

    const supplierPayments = await db.supplierPayments
      .where('businessId')
      .equals(businessId)
      .filter((p) => !p.isDeleted)
      .toArray();

    const supplierPaymentReversals = await db.supplierPaymentReversals
      .where('businessId')
      .equals(businessId)
      .filter((r) => !r.isDeleted)
      .toArray();
    const reversedSupplierPaymentIds = new Set(supplierPaymentReversals.map((r) => r.originalPaymentId));

    const refundsReceived = await db.refundsReceived
      .where('businessId')
      .equals(businessId)
      .filter((r) => !r.isDeleted)
      .toArray();
    const totalRefundsReceivedAmount = refundsReceived.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

    const grossPurchasesAmount = activePurchases.reduce((sum, p) => sum + (Number(p.totalAmount) || 0), 0);
    const totalPurchasesAmount = roundCurrency(Math.max(0, grossPurchasesAmount - totalPurchaseReturnsAmount));

    const grossSupplierPaidAmount = supplierPayments
      .filter((p) => !reversedSupplierPaymentIds.has(p.id))
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const totalSupplierPaidAmount = roundCurrency(Math.max(0, grossSupplierPaidAmount - totalRefundsReceivedAmount));

    const totalSupplierDueAmount = roundCurrency(
      activePurchases.reduce((sum, p) => sum + (Number(p.dueAmount) || 0), 0)
    );

    const thisMonthPurchasesAmount = roundCurrency(
      thisMonthPurchases.reduce((sum, p) => sum + (Number(p.totalAmount) || 0), 0)
    );

    // Financial Accounts & Expense Metrics (Phase 5)
    const financialMovements = await db.financialMovements
      .where('businessId')
      .equals(businessId)
      .filter((m) => !m.isDeleted)
      .toArray();

    const accounts = await db.financialAccounts
      .where('businessId')
      .equals(businessId)
      .filter((a) => !a.isDeleted && !a.isArchived)
      .toArray();

    const balanceByAccount: Record<string, number> = {};
    let todayMoneyIn = 0;
    let todayMoneyOut = 0;

    for (const m of financialMovements) {
      const amt = Number(m.amount) || 0;
      const cur = balanceByAccount[m.accountId] || 0;
      balanceByAccount[m.accountId] = m.direction === 'IN' ? cur + amt : cur - amt;

      const movementDateStr = (m.movementDate || m.createdAt).slice(0, 10);
      if (movementDateStr === todayStr) {
        // Exclude internal transfers and transfer reversals from cash flow totals
        const isTransfer =
          m.type === 'TRANSFER_IN' ||
          m.type === 'TRANSFER_OUT' ||
          m.type === 'TRANSFER_REVERSAL_IN' ||
          m.type === 'TRANSFER_REVERSAL_OUT';

        if (!isTransfer) {
          if (m.direction === 'IN') {
            todayMoneyIn += amt;
          } else {
            todayMoneyOut += amt;
          }
        }
      }
    }

    let totalLiquidFunds = 0;
    let totalCashInHand = 0;
    let totalBankBalances = 0;

    for (const a of accounts) {
      const bal = roundCurrency(balanceByAccount[a.id] || 0);
      totalLiquidFunds += bal;
      if (a.type === 'CASH') {
        totalCashInHand += bal;
      } else {
        totalBankBalances += bal;
      }
    }

    const expenses = await db.expenses
      .where('businessId')
      .equals(businessId)
      .filter((e) => !e.isDeleted)
      .toArray();

    const expenseReversals = await db.expenseReversals
      .where('businessId')
      .equals(businessId)
      .filter((r) => !r.isDeleted)
      .toArray();
    const reversedExpenseIds = new Set(expenseReversals.map((r) => r.originalExpenseId));

    const activeExpenses = expenses.filter((e) => !reversedExpenseIds.has(e.id));
    const thisMonthExpenses = activeExpenses.filter(
      (e) => (e.expenseDate || e.createdAt).slice(0, 7) === thisMonthStr
    );
    const thisMonthExpensesAmount = roundCurrency(
      thisMonthExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
    );

    const lowStockItems = items.filter((i) => i.isLowStock);

    const metrics: DashboardMetrics = {
      todaySalesCount: todaySales.length,
      todaySalesAmount,
      todayGrossProfit,
      todayCogs,
      todayProfitMargin,
      todayItemsSold,
      totalSalesAmount,
      totalPaidAmount,
      totalDueAmount,
      totalCustomersCount: customers.length,
      totalItemsCount: items.length,
      lowStockItemsCount: lowStockItems.length,
      thisMonthPurchasesCount: thisMonthPurchases.length,
      thisMonthPurchasesAmount,
      totalPurchasesAmount,
      totalSupplierPaidAmount,
      totalSupplierDueAmount,
      totalSuppliersCount: suppliers.length,
      totalLiquidFunds: roundCurrency(totalLiquidFunds),
      totalCashInHand: roundCurrency(totalCashInHand),
      totalBankBalances: roundCurrency(totalBankBalances),
      todayMoneyIn: roundCurrency(todayMoneyIn),
      todayMoneyOut: roundCurrency(todayMoneyOut),
      todayNetCashFlow: roundCurrency(todayMoneyIn - todayMoneyOut),
      thisMonthExpensesAmount,
      thisMonthExpensesCount: thisMonthExpenses.length,
    };

    return {
      metrics,
      recentSales: sales.slice(0, 6),
      recentPurchases: purchases.slice(0, 6),
      lowStockItems: lowStockItems.slice(0, 5),
    };
  },
};


