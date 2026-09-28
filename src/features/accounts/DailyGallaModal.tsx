import React, { useState, useEffect, useCallback } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { useBusiness } from '../../contexts/BusinessContext';
import { useToast } from '../../components/ui/Toast';
import { cashDrawerService, type DrawerLiveStatus } from '../../services/cashDrawerService';
import { DenominationCounter } from './DenominationCounter';
import type { CashDrawerSession, CurrencyDenominations } from '../../types';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { roundCurrency } from '../../utils/money';
import {
  Wallet,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  Sparkles,
  Printer,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface DailyGallaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (session: CashDrawerSession) => void;
  onClosed?: (session: CashDrawerSession) => void;
  onViewEODReport?: (session: CashDrawerSession) => void;
  businessId?: string;
}

export const DailyGallaModal: React.FC<DailyGallaModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onClosed,
  onViewEODReport,
}) => {
  const { business } = useBusiness();
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [liveStatus, setLiveStatus] = useState<DrawerLiveStatus | null>(null);
  const [showFullBreakdown, setShowFullBreakdown] = useState(false);

  // Counting state
  const [denominations, setDenominations] = useState<CurrencyDenominations>({});
  const [countedTotal, setCountedTotal] = useState<number>(0);
  const [nextDayFloat, setNextDayFloat] = useState<string>('2000');
  const [takeHomeCash, setTakeHomeCash] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [reconcileWithMovement, setReconcileWithMovement] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const loadStatus = useCallback(async () => {
    if (!business) return;
    try {
      setLoading(true);
      const data = await cashDrawerService.getDrawerLiveStatus(business.id);
      setLiveStatus(data);

      if (data.isClosedToday && data.todaySession) {
        // Pre-fill existing count from today's previous close so user can adjust or confirm
        setDenominations(data.todaySession.denominations || {});
        setCountedTotal(data.todaySession.countedCash || 0);
        if (data.todaySession.nextDayFloat !== undefined) {
          setNextDayFloat(String(data.todaySession.nextDayFloat));
        }
        if (data.todaySession.notes) {
          setNotes(data.todaySession.notes);
        }
      } else {
        // Pre-set float suggestion from opening float or 2000
        const suggestedFloat = data.openingFloat > 0 ? data.openingFloat : 2000;
        setNextDayFloat(String(suggestedFloat));
      }
    } catch (err: any) {
      console.error('Failed to load drawer status', err);
      showError(err.message || 'Could not load drawer details');
    } finally {
      setLoading(false);
    }
  }, [business, showError]);

  useEffect(() => {
    if (isOpen) {
      loadStatus();
      setNotes('');
    }
  }, [isOpen, loadStatus]);

  // When countedTotal or nextDayFloat changes, update take-home recommendation
  useEffect(() => {
    const floatNum = parseFloat(nextDayFloat) || 0;
    const calcTakeHome = Math.max(0, countedTotal - floatNum);
    setTakeHomeCash(countedTotal > 0 ? String(calcTakeHome) : '');
  }, [countedTotal, nextDayFloat]);

  if (!business) return null;

  const expectedCash = liveStatus?.expectedCash || 0;
  const difference = roundCurrency(countedTotal - expectedCash);

  const handleDenominationChange = (denoms: CurrencyDenominations, total: number) => {
    setDenominations(denoms);
    setCountedTotal(total);
  };

  const handleCloseGalla = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!liveStatus) return;

    if (countedTotal === 0 && !window.confirm('You have counted ₹0 in the cash drawer. Are you sure you want to close with ₹0 cash?')) {
      return;
    }

    try {
      setIsSubmitting(true);
      const parsedFloat = parseFloat(nextDayFloat) || 0;
      const parsedTakeHome = parseFloat(takeHomeCash) || 0;

      const { session, isUpdate } = await cashDrawerService.closeSession({
        businessId: business.id,
        financialAccountId: liveStatus.cashAccount.id,
        sessionDate: liveStatus.sessionDate,
        openedAt: liveStatus.openedAt,
        closedAt: new Date().toISOString(),
        openingFloat: liveStatus.openingFloat,
        cashSales: liveStatus.cashSales,
        cashCustomerPayments: liveStatus.cashCustomerPayments,
        cashExpenses: liveStatus.cashExpenses,
        cashSupplierPayments: liveStatus.cashSupplierPayments,
        cashRefunds: liveStatus.cashRefunds,
        cashTransfersIn: liveStatus.cashTransfersIn,
        cashTransfersOut: liveStatus.cashTransfersOut,
        totalCashIn: liveStatus.totalCashIn,
        totalCashOut: liveStatus.totalCashOut,
        expectedCash: liveStatus.expectedCash,
        countedCash: countedTotal,
        difference,
        denominations,
        takeHomeCash: parsedTakeHome,
        nextDayFloat: parsedFloat,
        notes: notes.trim() || undefined,
        reconcileWithMovement,
      });

      showSuccess(
        isUpdate
          ? `Today's Galla updated successfully (${session.sessionNumber})!`
          : `Daily Galla closed successfully (${session.sessionNumber})!`
      );
      if (onSuccess) onSuccess(session);
      if (onClosed) onClosed(session);
      onClose();

      if (onViewEODReport) {
        onViewEODReport(session);
      }
    } catch (err: any) {
      console.error('Failed to close galla session', err);
      showError(err.message || 'Failed to close register');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={liveStatus?.isClosedToday ? "Update Today's Cash Drawer (Galla Close)" : "Daily Cash Drawer (Galla Close)"}
      subtitle={
        liveStatus?.isClosedToday
          ? "Galla was closed earlier today. Re-counting will update today's final report with full-day sales."
          : "Reconcile today's cash drawer, count physical notes, and set tomorrow's float"
      }
      maxWidth="2xl"
    >
      {loading ? (
        <div className="py-16 text-center text-sm text-slate-500">Calculating live drawer status...</div>
      ) : !liveStatus ? (
        <div className="py-8 text-center text-rose-600 text-sm">Failed to load cash drawer.</div>
      ) : (
        <form onSubmit={handleCloseGalla} className="space-y-5">
          {/* Today's Existing Close Notice */}
          {liveStatus.isClosedToday && liveStatus.todaySession && (
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="font-bold text-amber-900 dark:text-amber-200 block">
                  Updating Today&apos;s Existing Close ({liveStatus.todaySession.sessionNumber})
                </span>
                <span className="text-slate-600 dark:text-slate-300 block mt-0.5">
                  Closed earlier at {formatDateTime(liveStatus.todaySession.closedAt)} with{' '}
                  <strong className="text-slate-900 dark:text-white font-mono">
                    {formatCurrency(liveStatus.todaySession.countedCash, business.currencySymbol)}
                  </strong>{' '}
                  counted. Saving now will update today&apos;s single report with all sales made up to right now.
                </span>
              </div>
            </div>
          )}
          {/* 1. Executive Cash Drawer Summary Card */}
          <div className="p-4 bg-gradient-to-br from-slate-50 to-blue-50/40 rounded-2xl border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold">
                    <Wallet className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{liveStatus.cashAccount.name}</h3>
                    <span className="text-[11px] text-slate-500">
                      Session since {formatDateTime(liveStatus.openedAt)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  System Expected Cash
                </span>
                <span className="text-xl sm:text-2xl font-black font-mono text-slate-900">
                  {formatCurrency(expectedCash, business.currencySymbol)}
                </span>
              </div>
            </div>

            {/* Quick In/Out Summary Pills */}
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/60 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px]">Starting Float</span>
                <span className="font-semibold text-slate-700 font-mono">
                  {formatCurrency(liveStatus.openingFloat, business.currencySymbol)}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Cash Inflow (+)</span>
                <span className="font-semibold text-emerald-600 font-mono">
                  +{formatCurrency(liveStatus.totalCashIn, business.currencySymbol)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-slate-400 block text-[10px]">Cash Outflow (-)</span>
                <span className="font-semibold text-rose-600 font-mono">
                  -{formatCurrency(liveStatus.totalCashOut, business.currencySymbol)}
                </span>
              </div>
            </div>

            {/* Toggle Full Breakdown Accordion */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowFullBreakdown(!showFullBreakdown)}
                className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
              >
                {showFullBreakdown ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                <span>{showFullBreakdown ? 'Hide Detailed Breakdown' : 'View Detailed Cash Activity'}</span>
              </button>

              {showFullBreakdown && (
                <div className="mt-2.5 p-3 bg-white rounded-xl border border-slate-200 text-xs space-y-1.5 divide-y divide-slate-100 animate-in fade-in duration-150">
                  <div className="flex justify-between pb-1">
                    <span className="text-slate-600">POS Cash Sales</span>
                    <span className="font-mono font-bold text-emerald-700">
                      +{formatCurrency(liveStatus.cashSales, business.currencySymbol)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-600">Customer Khata Collections (Cash)</span>
                    <span className="font-mono font-bold text-emerald-700">
                      +{formatCurrency(liveStatus.cashCustomerPayments, business.currencySymbol)}
                    </span>
                  </div>
                  {liveStatus.cashTransfersIn > 0 && (
                    <div className="flex justify-between py-1">
                      <span className="text-slate-600">Transfers In (From Bank/Other)</span>
                      <span className="font-mono font-bold text-emerald-700">
                        +{formatCurrency(liveStatus.cashTransfersIn, business.currencySymbol)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between py-1">
                    <span className="text-slate-600">Petty Cash Expenses</span>
                    <span className="font-mono font-bold text-rose-700">
                      -{formatCurrency(liveStatus.cashExpenses, business.currencySymbol)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-600">Supplier Payments in Cash</span>
                    <span className="font-mono font-bold text-rose-700">
                      -{formatCurrency(liveStatus.cashSupplierPayments, business.currencySymbol)}
                    </span>
                  </div>
                  {liveStatus.cashRefunds > 0 && (
                    <div className="flex justify-between py-1">
                      <span className="text-slate-600">Customer Cash Refunds</span>
                      <span className="font-mono font-bold text-rose-700">
                        -{formatCurrency(liveStatus.cashRefunds, business.currencySymbol)}
                      </span>
                    </div>
                  )}
                  {liveStatus.cashTransfersOut > 0 && (
                    <div className="flex justify-between py-1">
                      <span className="text-slate-600">Transfers Out (Deposited to Bank)</span>
                      <span className="font-mono font-bold text-rose-700">
                        -{formatCurrency(liveStatus.cashTransfersOut, business.currencySymbol)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 2. Denomination Counter Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
                Physical Cash Count in Drawer
              </label>
              <span className="text-[11px] text-slate-400">
                Type quantity of each note in drawer
              </span>
            </div>

            <DenominationCounter
              value={denominations}
              onChange={handleDenominationChange}
              currencySymbol={business.currencySymbol}
              expectedAmount={expectedCash}
            />
          </div>

          {/* 3. Discrepancy Status Card */}
          <div
            className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 transition-all ${
              countedTotal === 0
                ? 'bg-slate-50 border-slate-200'
                : difference === 0
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : difference > 0
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {countedTotal === 0 ? (
                <div className="w-8 h-8 rounded-xl bg-slate-200 text-slate-600 flex items-center justify-center">
                  <Wallet className="w-4 h-4" />
                </div>
              ) : difference === 0 ? (
                <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              ) : difference > 0 ? (
                <div className="w-8 h-8 rounded-xl bg-amber-600 text-white flex items-center justify-center">
                  <TrendingUp className="w-4 h-4" />
                </div>
              ) : (
                <div className="w-8 h-8 rounded-xl bg-rose-600 text-white flex items-center justify-center">
                  <TrendingDown className="w-4 h-4" />
                </div>
              )}

              <div>
                <span className="text-xs font-bold block">
                  {countedTotal === 0
                    ? 'Enter physical cash count above'
                    : difference === 0
                    ? 'Drawer is 100% Balanced!'
                    : difference > 0
                    ? `Surplus: +${formatCurrency(difference, business.currencySymbol)} (Extra Cash)`
                    : `Shortage: -${formatCurrency(Math.abs(difference), business.currencySymbol)} (Missing Cash)`}
                </span>
                <span className="text-[11px] opacity-80 block mt-0.5">
                  {countedTotal === 0
                    ? `Expected: ${formatCurrency(expectedCash, business.currencySymbol)}`
                    : difference === 0
                    ? 'Physical cash exactly matches system turnover.'
                    : difference > 0
                    ? 'Physical cash exceeds system expectations.'
                    : 'Physical cash is lower than expected turnover.'}
                </span>
              </div>
            </div>

            <div className="text-right font-mono font-bold text-sm">
              {difference !== 0 && countedTotal > 0 && (
                <span className={difference > 0 ? 'text-amber-800' : 'text-rose-800'}>
                  {difference > 0 ? '+' : ''}{formatCurrency(difference, business.currencySymbol)}
                </span>
              )}
            </div>
          </div>

          {/* 4. Close Planning & Allocation (Next Day Float & Take Home) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-slate-50/80 rounded-2xl border border-slate-200">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Tomorrow's Starting Float (Leave in Drawer)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-400">
                  {business.currencySymbol}
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  value={nextDayFloat}
                  onChange={(e) => setNextDayFloat(e.target.value)}
                  placeholder="2000"
                  className="w-full h-10 pl-7 pr-3 rounded-xl border border-slate-200 bg-white text-slate-900 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                Cash kept in register for tomorrow morning
              </span>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Take-Home Cash (Deposit / Vault)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-400">
                  {business.currencySymbol}
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  value={takeHomeCash}
                  onChange={(e) => setTakeHomeCash(e.target.value)}
                  placeholder="0.00"
                  className="w-full h-10 pl-7 pr-3 rounded-xl border border-slate-200 bg-white text-slate-900 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                Cash withdrawn to take home or deposit
              </span>
            </div>
          </div>

          {/* Notes field */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Closing Notes (Optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. ₹20 shortage due to unbilled tea/auto fare"
              className="w-full h-9 px-3 rounded-xl border border-slate-200 bg-white text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          {/* Reconcile Ledger Checkbox */}
          {difference !== 0 && countedTotal > 0 && (
            <label className="flex items-start gap-2.5 p-3 rounded-xl border border-blue-200 bg-blue-50/50 cursor-pointer">
              <input
                type="checkbox"
                checked={reconcileWithMovement}
                onChange={(e) => setReconcileWithMovement(e.target.checked)}
                className="mt-0.5 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
              />
              <div>
                <span className="text-xs font-bold text-blue-900 block">
                  Post {difference > 0 ? 'Surplus (+)' : 'Shortage (-)'} to Cash Ledger
                </span>
                <span className="text-[11px] text-blue-700 block mt-0.5">
                  Automatically posts an adjusting financial movement so system cash balance matches your physical count of {formatCurrency(countedTotal, business.currencySymbol)}.
                </span>
              </div>
            </label>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <span className="text-xs text-slate-400">
              * Optional: Selling is never blocked if you close later.
            </span>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                icon={CheckCircle2}
                isLoading={isSubmitting}
                className="bg-slate-900 hover:bg-black text-white font-bold"
              >
                {liveStatus.isClosedToday ? "Update Today's Close & Save" : "Save & Close Galla"}
              </Button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
};
