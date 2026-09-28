import { db } from '../db/database';
import { cashDrawerRepository } from '../repositories/cashDrawerRepository';
import { financialAccountRepository } from '../repositories/financialAccountRepository';
import { financialMovementRepository } from '../repositories/financialMovementRepository';
import type {
  CashDrawerSession,
  CloseCashDrawerPayload,
  FinancialAccount,
  FinancialMovement,
  EODSummaryReport,
} from '../types';
import { roundCurrency, addCurrency, subtractCurrency } from '../utils/money';

export interface DrawerLiveStatus {
  cashAccount: FinancialAccount;
  lastClosedSession?: CashDrawerSession;
  todaySession?: CashDrawerSession;
  isClosedToday: boolean;
  openedAt: string;
  sessionDate: string;
  openingFloat: number;
  cashSales: number;
  cashCustomerPayments: number;
  cashExpenses: number;
  cashSupplierPayments: number;
  cashRefunds: number;
  cashTransfersIn: number;
  cashTransfersOut: number;
  otherCashIn: number;
  otherCashOut: number;
  totalCashIn: number;
  totalCashOut: number;
  expectedCash: number;
  expectedDrawerCash: number;
  isFirstSession: boolean;
}

export const cashDrawerService = {
  /**
   * Resolves the primary cash account for the business.
   * Prefers default cash account, or first active CASH account.
   */
  async resolveCashAccount(businessId: string): Promise<FinancialAccount> {
    const accounts = await financialAccountRepository.getActiveAccounts(businessId);
    const cashAcc =
      accounts.find((a) => a.type === 'CASH' && a.isDefault) ||
      accounts.find((a) => a.type === 'CASH') ||
      accounts[0];

    if (!cashAcc) {
      throw new Error(
        'No cash account found. Please ensure a "Cash in Hand" account is created.'
      );
    }
    return cashAcc;
  },

  /**
   * Computes the live expected cash in the drawer since the last close.
   * Completely non-blocking and safe even if days were left unclosed.
   * If today was already closed, computes cumulative full-day totals for re-close/update.
   */
  async getDrawerLiveStatus(
    businessId: string,
    customAccountId?: string
  ): Promise<DrawerLiveStatus> {
    const cashAccount = customAccountId
      ? (await financialAccountRepository.getAccountById(customAccountId)) ||
        (await this.resolveCashAccount(businessId))
      : await this.resolveCashAccount(businessId);

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    // Check if a session was already finalized today
    const todaySession = await cashDrawerRepository.getTodaySession(
      businessId,
      cashAccount.id,
      todayStr
    );

    // Get previous closed session prior to today (yesterday or earlier)
    const allPastSessions = await cashDrawerRepository.getSessions(businessId);
    const priorSession = allPastSessions.find(
      (s) => s.financialAccountId === cashAccount.id && s.sessionDate < todayStr
    );

    let openingFloat = 0;
    let openedAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString();
    let isFirstSession = false;
    const isClosedToday = Boolean(todaySession);

    if (todaySession) {
      // Re-closing/updating today: preserve today's start float and openedAt
      openingFloat = todaySession.openingFloat;
      openedAt = todaySession.openedAt;
    } else if (priorSession) {
      // Normal close: roll over from prior closed session
      openingFloat =
        priorSession.nextDayFloat !== undefined
          ? priorSession.nextDayFloat
          : priorSession.countedCash;
      openedAt = priorSession.closedAt;
    } else {
      isFirstSession = true;
      const openingMovements = await db.financialMovements
        .where('accountId')
        .equals(cashAccount.id)
        .filter((m) => !m.isDeleted && m.type === 'OPENING_BALANCE')
        .toArray();

      openingFloat = openingMovements.reduce(
        (sum, m) => sum + (m.direction === 'IN' ? m.amount : -m.amount),
        0
      );
      openedAt = cashAccount.createdAt;
    }

    // Query all financial movements for this cash account recorded since openedAt
    // (excluding OPENING_BALANCE and any GALLA_CLOSE adjustments so they don't corrupt cash sales)
    const movements = await db.financialMovements
      .where('accountId')
      .equals(cashAccount.id)
      .filter((m) => {
        if (m.isDeleted) return false;
        if (m.type === 'OPENING_BALANCE') return false;
        if (m.referenceType === 'GALLA_CLOSE') return false;
        if (todaySession) {
          return m.createdAt >= todaySession.openedAt;
        }
        if (priorSession) {
          return m.createdAt > priorSession.closedAt;
        }
        return true;
      })
      .toArray();

    // Look up associated payments for PAYMENT movements to distinguish Sale payments vs Khata collections
    const paymentIds = movements
      .filter((m) => m.referenceType === 'PAYMENT' && m.referenceId)
      .map((m) => m.referenceId as string);

    const paymentMap = new Map<string, any>();
    if (paymentIds.length > 0) {
      const payments = await db.payments.where('id').anyOf(paymentIds).toArray();
      for (const p of payments) {
        paymentMap.set(p.id, p);
      }
    }

    let cashSales = 0;
    let cashCustomerPayments = 0;
    let cashExpenses = 0;
    let cashSupplierPayments = 0;
    let cashRefunds = 0;
    let cashTransfersIn = 0;
    let cashTransfersOut = 0;
    let otherCashIn = 0;
    let otherCashOut = 0;

    for (const m of movements) {
      const amt = Number(m.amount) || 0;
      if (m.direction === 'IN') {
        if (m.referenceType === 'PAYMENT') {
          const payment = m.referenceId ? paymentMap.get(m.referenceId) : null;
          if (payment && payment.referenceType === 'SALE') {
            cashSales = addCurrency(cashSales, amt);
          } else {
            cashCustomerPayments = addCurrency(cashCustomerPayments, amt);
          }
        } else if (m.referenceType === 'TRANSFER') {
          cashTransfersIn = addCurrency(cashTransfersIn, amt);
        } else {
          otherCashIn = addCurrency(otherCashIn, amt);
        }
      } else if (m.direction === 'OUT') {
        if (m.referenceType === 'EXPENSE') {
          cashExpenses = addCurrency(cashExpenses, amt);
        } else if (m.referenceType === 'SUPPLIER_PAYMENT') {
          cashSupplierPayments = addCurrency(cashSupplierPayments, amt);
        } else if (m.referenceType === 'REFUND') {
          cashRefunds = addCurrency(cashRefunds, amt);
        } else if (m.referenceType === 'TRANSFER') {
          cashTransfersOut = addCurrency(cashTransfersOut, amt);
        } else {
          otherCashOut = addCurrency(otherCashOut, amt);
        }
      }
    }

    const totalCashIn = roundCurrency(
      cashSales + cashCustomerPayments + cashTransfersIn + otherCashIn
    );
    const totalCashOut = roundCurrency(
      cashExpenses + cashSupplierPayments + cashRefunds + cashTransfersOut + otherCashOut
    );
    const expectedCash = roundCurrency(
      openingFloat + totalCashIn - totalCashOut
    );

    return {
      cashAccount,
      lastClosedSession: todaySession || priorSession,
      todaySession,
      isClosedToday,
      openedAt,
      sessionDate: todayStr,
      openingFloat: roundCurrency(openingFloat),
      cashSales,
      cashCustomerPayments,
      cashExpenses,
      cashSupplierPayments,
      cashRefunds,
      cashTransfersIn,
      cashTransfersOut,
      otherCashIn,
      otherCashOut,
      totalCashIn,
      totalCashOut,
      expectedCash,
      expectedDrawerCash: expectedCash,
      isFirstSession,
    };
  },

  /**
   * Finalizes and closes a Cash Drawer / Galla session.
   * If today's session already exists, updates it cleanly (1 close per day).
   */
  async closeSession(
    payload: CloseCashDrawerPayload
  ): Promise<{ session: CashDrawerSession; movement?: FinancialMovement; isUpdate: boolean }> {
    return await cashDrawerRepository.createSession(payload);
  },

  /**
   * Retrieves past closing sessions for audit and history review.
   */
  async getPastSessions(businessId: string): Promise<CashDrawerSession[]> {
    return await cashDrawerRepository.getSessions(businessId);
  },

  /**
   * Generates End-of-Day (EOD) Z-Report metrics for a given session.
   */
  async getEODSummary(
    businessId: string,
    sessionId: string
  ): Promise<EODSummaryReport | null> {
    const session = await cashDrawerRepository.getSessionById(sessionId);
    if (!session) return null;

    const business = await db.businesses.get(businessId);
    const businessName = business?.name || 'My Store';
    const businessPhone = business?.phone;
    const currencySymbol = business?.currencySymbol || '₹';

    // Query sales between session.openedAt and session.closedAt
    const sales = await db.sales
      .where('businessId')
      .equals(businessId)
      .filter(
        (s) =>
          !s.isDeleted &&
          s.status !== 'VOIDED' &&
          (s.saleDate === session.sessionDate ||
            (s.createdAt >= session.openedAt && s.createdAt <= session.closedAt))
      )
      .toArray();

    let grossSales = 0;
    let discountTotal = 0;
    let netSales = 0;
    let cashSalesTotal = 0;
    let digitalSalesTotal = 0;
    let creditKhataTotal = 0;

    for (const s of sales) {
      grossSales = addCurrency(grossSales, s.subtotal);
      discountTotal = addCurrency(discountTotal, s.discountAmount || 0);
      netSales = addCurrency(netSales, s.totalAmount);
      if (s.dueAmount > 0) {
        creditKhataTotal = addCurrency(creditKhataTotal, s.dueAmount);
      }
    }

    // Query payments associated with these sales or in this session period
    const saleIds = sales.map((s) => s.id);
    const payments = await db.payments
      .where('businessId')
      .equals(businessId)
      .filter(
        (p) =>
          !p.isDeleted &&
          (p.paymentDate === session.sessionDate ||
            (p.createdAt >= session.openedAt && p.createdAt <= session.closedAt) ||
            Boolean(p.referenceId && saleIds.includes(p.referenceId)))
      )
      .toArray();

    for (const p of payments) {
      if (p.referenceType === 'SALE') {
        const amt = Number(p.amount) || 0;
        if (p.paymentMethod === 'CASH') {
          cashSalesTotal = addCurrency(cashSalesTotal, amt);
        } else {
          digitalSalesTotal = addCurrency(digitalSalesTotal, amt);
        }
      }
    }

    return {
      session,
      businessName,
      businessPhone,
      currencySymbol,
      grossSales: roundCurrency(grossSales),
      discountTotal: roundCurrency(discountTotal),
      netSales: roundCurrency(netSales),
      salesCount: sales.length,
      cashSalesTotal: roundCurrency(cashSalesTotal),
      digitalSalesTotal: roundCurrency(digitalSalesTotal),
      creditKhataTotal: roundCurrency(creditKhataTotal),
      customerCollectionsTotal: session.cashCustomerPayments,
      expensesTotal: session.cashExpenses,
      supplierPaymentsTotal: session.cashSupplierPayments,
    };
  },
};
