import { db } from '../../db/database';
import { roundCurrency, addCurrency, subtractCurrency } from '../../utils/money';
import { isDateInRange, getDailyBuckets, type DateRangeBounds } from '../../utils/reportDateRange';
import type { FinancialMovement, FinancialAccount, FinancialMovementType } from '../../types';

export interface CashFlowReportFilter {
  dateRange: DateRangeBounds;
  accountId?: string;
  typeFilter?: 'ALL' | 'INFLOW_ONLY' | 'OUTFLOW_ONLY' | FinancialMovementType;
  includeOpeningBalances?: boolean;
}

export interface CashFlowTypeSummary {
  type: FinancialMovementType;
  label: string;
  direction: 'IN' | 'OUT' | 'NEUTRAL';
  count: number;
  totalAmount: number;
  percentageOfFlow: number;
}

export interface CashFlowAccountSummary {
  accountId: string;
  accountName: string;
  accountType: string;
  totalIn: number;
  totalOut: number;
  netFlow: number;
  currentBalance: number;
}

export interface CashFlowDailyPoint {
  dateStr: string;
  label: string;
  moneyIn: number;
  moneyOut: number;
  netCashFlow: number;
}

export interface CashFlowReportMetrics {
  totalMoneyIn: number;
  totalMoneyOut: number;
  netCashFlow: number;
  internalTransfersAmount: number; // For reporting transparency (excluded from net cash flow)
  totalMovementsCount: number;
  activeAccountsCount: number;
  totalLiquidFunds: number;
}

export interface CashFlowReportResult {
  metrics: CashFlowReportMetrics;
  movements: Array<FinancialMovement & { accountName?: string; isInternalTransfer?: boolean }>;
  inflowByType: CashFlowTypeSummary[];
  outflowByType: CashFlowTypeSummary[];
  accountBreakdown: CashFlowAccountSummary[];
  dailyTrend: CashFlowDailyPoint[];
}

export const cashFlowReportService = {
  async generateCashFlowReport(
    businessId: string,
    filter: CashFlowReportFilter
  ): Promise<CashFlowReportResult> {
    const { dateRange, accountId, typeFilter = 'ALL', includeOpeningBalances = false } = filter;
    const { startDateIso, endDateIso } = dateRange;

    const [allMovements, allAccounts] = await Promise.all([
      db.financialMovements.where('businessId').equals(businessId).filter((m) => !m.isDeleted).toArray(),
      db.financialAccounts.where('businessId').equals(businessId).filter((a) => !a.isDeleted).toArray(),
    ]);

    const accountMap = new Map<string, FinancialAccount>();
    for (const a of allAccounts) {
      accountMap.set(a.id, a);
    }

    // Filter movements by date range and account
    const periodMovements = allMovements.filter((m) => {
      const txDate = m.movementDate || m.createdAt;
      if (!isDateInRange(txDate, startDateIso, endDateIso)) return false;
      if (accountId && m.accountId !== accountId) return false;
      if (!includeOpeningBalances && m.type === 'OPENING_BALANCE') return false;

      if (typeFilter === 'INFLOW_ONLY' && m.direction !== 'IN') return false;
      if (typeFilter === 'OUTFLOW_ONLY' && m.direction !== 'OUT') return false;
      if (typeFilter !== 'ALL' && typeFilter !== 'INFLOW_ONLY' && typeFilter !== 'OUTFLOW_ONLY' && m.type !== typeFilter) return false;

      return true;
    });

    let totalMoneyIn = 0;
    let totalMoneyOut = 0;
    let internalTransfersAmount = 0;

    const inflowTypeMap = new Map<FinancialMovementType, { count: number; amount: number }>();
    const outflowTypeMap = new Map<FinancialMovementType, { count: number; amount: number }>();
    const accountFlowMap = new Map<string, { totalIn: number; totalOut: number }>();

    // Transfer types that must be neutral for business cash flow (unless viewing a single account)
    const isTransferMovement = (type: string) =>
      type === 'TRANSFER_IN' ||
      type === 'TRANSFER_OUT' ||
      type === 'TRANSFER_REVERSAL_IN' ||
      type === 'TRANSFER_REVERSAL_OUT' ||
      type === 'ACCOUNT_TRANSFER' ||
      type === 'ACCOUNT_TRANSFER_REVERSAL';

    const enrichedMovements = periodMovements.map((m) => {
      const acc = accountMap.get(m.accountId);
      const isInternal = isTransferMovement(m.type);
      const amt = Number(m.amount) || 0;

      // When viewing aggregate business cash flow across all accounts,
      // internal transfers are pure fund shifts and must NOT affect business cash in/out.
      // If filtering by a SINGLE account, the movement is recorded as account flow.
      const shouldCountInBusinessCashFlow = !isInternal || !!accountId;

      if (isInternal) {
        internalTransfersAmount = addCurrency(internalTransfersAmount, amt);
      }

      if (m.direction === 'IN') {
        if (shouldCountInBusinessCashFlow) {
          totalMoneyIn = addCurrency(totalMoneyIn, amt);
        }

        const existing = inflowTypeMap.get(m.type) || { count: 0, amount: 0 };
        existing.count++;
        existing.amount = addCurrency(existing.amount, amt);
        inflowTypeMap.set(m.type, existing);

        const accFlow = accountFlowMap.get(m.accountId) || { totalIn: 0, totalOut: 0 };
        accFlow.totalIn = addCurrency(accFlow.totalIn, amt);
        accountFlowMap.set(m.accountId, accFlow);
      } else if (m.direction === 'OUT') {
        if (shouldCountInBusinessCashFlow) {
          totalMoneyOut = addCurrency(totalMoneyOut, amt);
        }

        const existing = outflowTypeMap.get(m.type) || { count: 0, amount: 0 };
        existing.count++;
        existing.amount = addCurrency(existing.amount, amt);
        outflowTypeMap.set(m.type, existing);

        const accFlow = accountFlowMap.get(m.accountId) || { totalIn: 0, totalOut: 0 };
        accFlow.totalOut = addCurrency(accFlow.totalOut, amt);
        accountFlowMap.set(m.accountId, accFlow);
      }

      return {
        ...m,
        accountName: acc?.name || 'Unknown Account',
        isInternalTransfer: isInternal,
      };
    });

    const netCashFlow = roundCurrency(subtractCurrency(totalMoneyIn, totalMoneyOut));

    // Calculate derived balances for all accounts from full movements history
    const accountBalances = new Map<string, number>();
    for (const m of allMovements) {
      const cur = accountBalances.get(m.accountId) || 0;
      const amt = Number(m.amount) || 0;
      if (m.direction === 'IN') {
        accountBalances.set(m.accountId, addCurrency(cur, amt));
      } else if (m.direction === 'OUT') {
        accountBalances.set(m.accountId, subtractCurrency(cur, amt));
      }
    }

    const totalLiquidFunds = roundCurrency(
      Array.from(accountBalances.values()).reduce((sum, bal) => addCurrency(sum, bal), 0)
    );

    // Friendly labels for movement types
    const typeLabels: Record<string, string> = {
      OPENING_BALANCE: 'Opening Balance',
      CUSTOMER_PAYMENT: 'Customer Payments',
      SUPPLIER_PAYMENT: 'Supplier Payments',
      EXPENSE: 'Business Expenses',
      EXPENSE_REVERSAL: 'Expense Reversals',
      CUSTOMER_REFUND: 'Customer Refunds',
      SUPPLIER_REFUND: 'Supplier Refunds Received',
      TRANSFER_IN: 'Transfer Received',
      TRANSFER_OUT: 'Transfer Sent',
      TRANSFER_REVERSAL_IN: 'Transfer Reversal In',
      TRANSFER_REVERSAL_OUT: 'Transfer Reversal Out',
      ACCOUNT_TRANSFER: 'Account Transfer',
      ACCOUNT_TRANSFER_REVERSAL: 'Transfer Reversal',
      PAYMENT_REVERSAL_COMPENSATION: 'Payment Reversal',
      SUPPLIER_PAYMENT_REVERSAL_COMPENSATION: 'Supplier Payment Reversal',
      EXPENSE_REVERSAL_COMPENSATION: 'Expense Reversal',
      OTHER_INCOME: 'Other Income',
      OTHER_EXPENSE: 'Other Outflow',
    };

    const inflowByType: CashFlowTypeSummary[] = Array.from(inflowTypeMap.entries())
      .map(([type, val]) => ({
        type,
        label: typeLabels[type] || type,
        direction: 'IN' as const,
        count: val.count,
        totalAmount: roundCurrency(val.amount),
        percentageOfFlow: totalMoneyIn > 0 ? roundCurrency((val.amount / totalMoneyIn) * 100) : 0,
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);

    const outflowByType: CashFlowTypeSummary[] = Array.from(outflowTypeMap.entries())
      .map(([type, val]) => ({
        type,
        label: typeLabels[type] || type,
        direction: 'OUT' as const,
        count: val.count,
        totalAmount: roundCurrency(val.amount),
        percentageOfFlow: totalMoneyOut > 0 ? roundCurrency((val.amount / totalMoneyOut) * 100) : 0,
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);

    const accountBreakdown: CashFlowAccountSummary[] = allAccounts.map((acc) => {
      const flow = accountFlowMap.get(acc.id) || { totalIn: 0, totalOut: 0 };
      const net = subtractCurrency(flow.totalIn, flow.totalOut);
      const curBal = accountBalances.get(acc.id) || 0;
      return {
        accountId: acc.id,
        accountName: acc.name,
        accountType: acc.type,
        totalIn: roundCurrency(flow.totalIn),
        totalOut: roundCurrency(flow.totalOut),
        netFlow: roundCurrency(net),
        currentBalance: roundCurrency(curBal),
      };
    });

    // Daily Trend
    const dailyBuckets = getDailyBuckets(startDateIso, endDateIso);
    const dailyTrend: CashFlowDailyPoint[] = dailyBuckets.map((bucket) => {
      const bucketMovements = enrichedMovements.filter((m) =>
        isDateInRange(m.movementDate || m.createdAt, bucket.dayStartIso, bucket.dayEndIso)
      );

      let bIn = 0;
      let bOut = 0;

      for (const m of bucketMovements) {
        const amt = Number(m.amount) || 0;
        const shouldCount = !m.isInternalTransfer || !!accountId;
        if (shouldCount) {
          if (m.direction === 'IN') bIn = addCurrency(bIn, amt);
          if (m.direction === 'OUT') bOut = addCurrency(bOut, amt);
        }
      }

      return {
        dateStr: bucket.dateStr,
        label: bucket.label,
        moneyIn: roundCurrency(bIn),
        moneyOut: roundCurrency(bOut),
        netCashFlow: roundCurrency(subtractCurrency(bIn, bOut)),
      };
    });

    return {
      metrics: {
        totalMoneyIn: roundCurrency(totalMoneyIn),
        totalMoneyOut: roundCurrency(totalMoneyOut),
        netCashFlow,
        internalTransfersAmount: roundCurrency(internalTransfersAmount),
        totalMovementsCount: periodMovements.length,
        activeAccountsCount: allAccounts.filter((a) => !a.isArchived).length,
        totalLiquidFunds,
      },
      movements: enrichedMovements,
      inflowByType,
      outflowByType,
      accountBreakdown,
      dailyTrend,
    };
  },
};
