import { db } from '../../db/database';
import { roundCurrency, addCurrency } from '../../utils/money';
import { isDateInRange, getDailyBuckets, type DateRangeBounds } from '../../utils/reportDateRange';
import type { Expense, ExpenseReversal, ExpenseCategory, FinancialAccount } from '../../types';

export interface ExpenseReportFilter {
  dateRange: DateRangeBounds;
  categoryId?: string;
  accountId?: string;
  searchQuery?: string;
}

export interface ExpenseCategoryBreakdown {
  categoryId: string;
  categoryName: string;
  color?: string;
  expenseCount: number;
  totalAmount: number;
  percentageOfTotal: number;
}

export interface ExpenseAccountBreakdown {
  accountId: string;
  accountName: string;
  accountType: string;
  expenseCount: number;
  totalAmount: number;
  percentageOfTotal: number;
}

export interface ExpenseReportDailyPoint {
  dateStr: string;
  label: string;
  totalExpenses: number;
  expenseCount: number;
}

export interface ExpenseReportMetrics {
  totalExpensesAmount: number;
  activeExpensesCount: number;
  reversedExpensesCount: number;
  reversedExpensesAmount: number;
  averageExpenseAmount: number;
  topCategoryName?: string;
  topCategoryAmount: number;
}

export interface ExpenseReportResult {
  metrics: ExpenseReportMetrics;
  expenses: Array<Expense & { categoryName?: string; accountName?: string; isReversed?: boolean }>;
  categoryBreakdown: ExpenseCategoryBreakdown[];
  accountBreakdown: ExpenseAccountBreakdown[];
  dailyTrend: ExpenseReportDailyPoint[];
}

export const expenseReportService = {
  async generateExpenseReport(
    businessId: string,
    filter: ExpenseReportFilter
  ): Promise<ExpenseReportResult> {
    const { dateRange, categoryId, accountId, searchQuery = '' } = filter;
    const { startDateIso, endDateIso } = dateRange;

    const [allExpenses, allReversals, allCategories, allAccounts] = await Promise.all([
      db.expenses.where('businessId').equals(businessId).filter((e) => !e.isDeleted).toArray(),
      db.expenseReversals.where('businessId').equals(businessId).filter((r) => !r.isDeleted).toArray(),
      db.expenseCategories.where('businessId').equals(businessId).filter((c) => !c.isDeleted).toArray(),
      db.financialAccounts.where('businessId').equals(businessId).filter((a) => !a.isDeleted).toArray(),
    ]);

    const categoryMap = new Map<string, ExpenseCategory>();
    for (const c of allCategories) {
      categoryMap.set(c.id, c);
    }

    const accountMap = new Map<string, FinancialAccount>();
    for (const a of allAccounts) {
      accountMap.set(a.id, a);
    }

    const reversedExpenseIds = new Set<string>(allReversals.map((r) => r.originalExpenseId));

    const query = searchQuery.trim().toLowerCase();
    const periodExpenses = allExpenses.filter((expense) => {
      const txDate = expense.expenseDate || expense.createdAt;
      if (!isDateInRange(txDate, startDateIso, endDateIso)) return false;
      if (categoryId && expense.categoryId !== categoryId) return false;
      if (accountId && expense.financialAccountId !== accountId) return false;
      if (query) {
        const catName = (categoryMap.get(expense.categoryId)?.name || '').toLowerCase();
        const descMatch = (expense.notes || '').toLowerCase().includes(query);
        const payeeMatch = (expense.payee || '').toLowerCase().includes(query);
        if (!catName.includes(query) && !descMatch && !payeeMatch) return false;
      }
      return true;
    });

    let totalExpensesAmount = 0;
    let activeExpensesCount = 0;
    let reversedExpensesCount = 0;
    let reversedExpensesAmount = 0;

    const categoryAgg = new Map<string, { categoryId: string; categoryName: string; color?: string; count: number; amount: number }>();
    const accountAgg = new Map<string, { accountId: string; accountName: string; accountType: string; count: number; amount: number }>();

    const enrichedExpenses = periodExpenses.map((exp) => {
      const isReversed = reversedExpenseIds.has(exp.id);
      const cat = categoryMap.get(exp.categoryId);
      const acc = exp.financialAccountId ? accountMap.get(exp.financialAccountId) : undefined;
      const amt = Number(exp.amount) || 0;

      if (isReversed) {
        reversedExpensesCount++;
        reversedExpensesAmount = addCurrency(reversedExpensesAmount, amt);
      } else {
        activeExpensesCount++;
        totalExpensesAmount = addCurrency(totalExpensesAmount, amt);

        // Category Aggregation
        const catId = exp.categoryId || 'UNCLASSIFIED';
        const catName = cat?.name || 'General Expense';
        const existingCat = categoryAgg.get(catId) || {
          categoryId: catId,
          categoryName: catName,
          color: cat?.color,
          count: 0,
          amount: 0,
        };
        existingCat.count++;
        existingCat.amount = addCurrency(existingCat.amount, amt);
        categoryAgg.set(catId, existingCat);

        // Account Aggregation
        const accId = exp.financialAccountId || 'UNASSIGNED';
        const accName = acc?.name || 'Default Cash';
        const accType = acc?.type || 'CASH';
        const existingAcc = accountAgg.get(accId) || {
          accountId: accId,
          accountName: accName,
          accountType: accType,
          count: 0,
          amount: 0,
        };
        existingAcc.count++;
        existingAcc.amount = addCurrency(existingAcc.amount, amt);
        accountAgg.set(accId, existingAcc);
      }

      return {
        ...exp,
        categoryName: cat?.name || 'General Expense',
        accountName: acc?.name || 'Default Cash',
        isReversed,
      };
    });

    const categoryBreakdown: ExpenseCategoryBreakdown[] = Array.from(categoryAgg.values())
      .map((c) => ({
        categoryId: c.categoryId,
        categoryName: c.categoryName,
        color: c.color,
        expenseCount: c.count,
        totalAmount: roundCurrency(c.amount),
        percentageOfTotal: totalExpensesAmount > 0 ? roundCurrency((c.amount / totalExpensesAmount) * 100) : 0,
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);

    const accountBreakdown: ExpenseAccountBreakdown[] = Array.from(accountAgg.values())
      .map((a) => ({
        accountId: a.accountId,
        accountName: a.accountName,
        accountType: a.accountType,
        expenseCount: a.count,
        totalAmount: roundCurrency(a.amount),
        percentageOfTotal: totalExpensesAmount > 0 ? roundCurrency((a.amount / totalExpensesAmount) * 100) : 0,
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);

    const topCategory = categoryBreakdown.length > 0 ? categoryBreakdown[0] : undefined;
    const averageExpenseAmount = activeExpensesCount > 0 ? roundCurrency(totalExpensesAmount / activeExpensesCount) : 0;

    // Daily Trend
    const dailyBuckets = getDailyBuckets(startDateIso, endDateIso);
    const dailyTrend: ExpenseReportDailyPoint[] = dailyBuckets.map((bucket) => {
      const bucketExpenses = enrichedExpenses.filter(
        (e) => !e.isReversed && isDateInRange(e.expenseDate || e.createdAt, bucket.dayStartIso, bucket.dayEndIso)
      );

      const bTotal = bucketExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

      return {
        dateStr: bucket.dateStr,
        label: bucket.label,
        totalExpenses: roundCurrency(bTotal),
        expenseCount: bucketExpenses.length,
      };
    });

    return {
      metrics: {
        totalExpensesAmount: roundCurrency(totalExpensesAmount),
        activeExpensesCount,
        reversedExpensesCount,
        reversedExpensesAmount: roundCurrency(reversedExpensesAmount),
        averageExpenseAmount,
        topCategoryName: topCategory?.categoryName,
        topCategoryAmount: topCategory?.totalAmount || 0,
      },
      expenses: enrichedExpenses,
      categoryBreakdown,
      accountBreakdown,
      dailyTrend,
    };
  },
};
