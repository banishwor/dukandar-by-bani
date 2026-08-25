import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/ui/Modal';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useBusiness } from '../../contexts/BusinessContext';
import { useToast } from '../../components/ui/Toast';
import { supplierPaymentService } from '../../services/supplierPaymentService';
import { financialAccountService } from '../../services/financialAccountService';
import type { Supplier, OutstandingPurchase, PaymentMethod, FinancialAccount } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { roundCurrency, isCurrencyGreaterThan } from '../../utils/money';
import { CreditCard, Banknote, Building2, Smartphone, AlertCircle, Check, ArrowRight, Wallet } from 'lucide-react';

interface PaySupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  supplier: Supplier;
}

export const PaySupplierModal: React.FC<PaySupplierModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  supplier,
}) => {
  const { business } = useBusiness();
  const { showSuccess, showError } = useToast();

  const [isMobile, setIsMobile] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [outstandingPurchases, setOutstandingPurchases] = useState<OutstandingPurchase[]>([]);
  const [totalDue, setTotalDue] = useState(0);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);

  // Form State
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [financialAccountId, setFinancialAccountId] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [allocationMode, setAllocationMode] = useState<'AUTO' | 'MANUAL'>('AUTO');
  const [manualAllocations, setManualAllocations] = useState<Record<string, string>>({});
  const [amountError, setAmountError] = useState('');

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const loadData = async () => {
    if (!business) return;
    try {
      setIsLoading(true);
      const [purchases, activeAccounts, defaultAcc] = await Promise.all([
        supplierPaymentService.getOutstandingPurchasesForSupplier(supplier.id),
        financialAccountService.getActiveAccounts(business.id),
        financialAccountService.getDefaultAccount(business.id),
      ]);
      setOutstandingPurchases(purchases);
      setAccounts(activeAccounts);

      if (defaultAcc) {
        setFinancialAccountId(defaultAcc.id);
      } else if (activeAccounts.length > 0) {
        setFinancialAccountId(activeAccounts[0].id);
      }

      const due = purchases.reduce((sum, p) => sum + p.dueAmount, 0);
      setTotalDue(roundCurrency(due));

      if (due > 0) {
        setAmount(due.toString());
      } else {
        setAmount('');
      }
    } catch (err) {
      console.error('Failed to load outstanding purchases for supplier', err);
      showError('Unable to fetch supplier due bills.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
      setPaymentMethod('CASH');
      setPaymentDate(new Date().toISOString().slice(0, 10));
      setNotes('');
      setAllocationMode('AUTO');
      setManualAllocations({});
      setAmountError('');
    }
  }, [isOpen, supplier.id]);

  const handleManualAllocChange = (purchaseId: string, value: string) => {
    setManualAllocations((prev) => ({
      ...prev,
      [purchaseId]: value,
    }));
  };

  const handleAutoFillManual = () => {
    const parsedAmount = parseFloat(amount) || 0;
    let remaining = parsedAmount;
    const newAlloc: Record<string, string> = {};

    for (const p of outstandingPurchases) {
      if (remaining <= 0) {
        newAlloc[p.purchaseId] = '';
      } else {
        const alloc = Math.min(remaining, p.dueAmount);
        newAlloc[p.purchaseId] = alloc.toString();
        remaining = roundCurrency(remaining - alloc);
      }
    }
    setManualAllocations(newAlloc);
  };

  const calculateManualTotal = (): number => {
    let total = 0;
    for (const val of Object.values(manualAllocations)) {
      total += parseFloat(String(val)) || 0;
    }
    return total;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!business) return;

    const numAmount = parseFloat(amount);
    if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
      setAmountError('Please enter a valid payment amount');
      return;
    }
    setAmountError('');

    if (allocationMode === 'MANUAL') {
      const manualTotal = calculateManualTotal();
      if (isCurrencyGreaterThan(manualTotal, numAmount)) {
        setAmountError(`Allocations (${formatCurrency(manualTotal, business.currencySymbol)}) exceed payment amount.`);
        return;
      }
    }

    try {
      setIsSubmitting(true);
      const plannedManual =
        allocationMode === 'MANUAL'
          ? Object.entries(manualAllocations)
              .map(([purchaseId, val]: [string, string]) => ({
                purchaseId,
                amount: parseFloat(val) || 0,
              }))
              .filter((a) => a.amount > 0)
          : undefined;

      const result = await supplierPaymentService.recordSupplierPayment({
        businessId: business.id,
        supplierId: supplier.id,
        amount: numAmount,
        paymentMethod,
        financialAccountId: financialAccountId || undefined,
        paymentDate: paymentDate ? new Date(paymentDate).toISOString() : new Date().toISOString(),
        notes: notes.trim() || undefined,
        allocationMode,
        manualAllocations: plannedManual,
      });

      if (result.unallocatedCredit > 0.005) {
        showSuccess(
          `Payment of ${formatCurrency(numAmount, business.currencySymbol)} recorded (${formatCurrency(result.unallocatedCredit, business.currencySymbol)} saved as Supplier Advance Credit).`
        );
      } else {
        showSuccess(`Payment of ${formatCurrency(numAmount, business.currencySymbol)} recorded.`);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to record supplier payment', err);
      showError(err.message || 'Unable to record payment to supplier.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const paymentMethods: Array<{ id: PaymentMethod; label: string; icon: React.FC<{ className?: string }> }> = [
    { id: 'CASH', label: 'Cash', icon: Banknote },
    { id: 'UPI', label: 'UPI / QR', icon: Smartphone },
    { id: 'BANK_TRANSFER', label: 'Bank Transfer', icon: Building2 },
    { id: 'CARD', label: 'Card', icon: CreditCard },
  ];

  const parsedAmount = parseFloat(amount) || 0;
  const advanceCredit = Math.max(0, parsedAmount - totalDue);

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Supplier Payable Summary Card */}
      <div className="p-3.5 rounded-2xl bg-slate-900 text-white flex items-center justify-between shadow-xs">
        <div>
          <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider block">
            Current Payable
          </span>
          <span className="text-xl font-extrabold text-amber-400">
            {formatCurrency(totalDue, business?.currencySymbol)}
          </span>
        </div>
        <div className="text-right">
          <span className="text-[11px] text-slate-400 font-medium block">Unpaid Bills</span>
          <span className="text-sm font-bold text-white">{outstandingPurchases.length}</span>
        </div>
      </div>

      {/* Amount Input */}
      <div>
        <Input
          label="Payment Amount"
          type="number"
          step="any"
          min="0.01"
          required
          autoFocus
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={amountError}
        />

        {totalDue > 0 && (
          <div className="flex items-center gap-2 mt-2">
            <button
              type="button"
              onClick={() => setAmount(totalDue.toString())}
              className="text-xs px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 font-semibold hover:bg-amber-100 transition-colors"
            >
              Pay Full Due ({formatCurrency(totalDue, business?.currencySymbol)})
            </button>
          </div>
        )}

        {advanceCredit > 0.005 && (
          <div className="mt-2 p-2.5 rounded-xl bg-blue-50 border border-blue-200/70 text-xs text-blue-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block">Advance / Overpayment</span>
              <span>
                {formatCurrency(advanceCredit, business?.currencySymbol)} exceeds outstanding bills and will be recorded as unallocated supplier advance credit for future purchases.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Financial Account & Payment Method Selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-700 block">Paid From Account *</label>
          <select
            value={financialAccountId}
            onChange={(e) => setFinancialAccountId(e.target.value)}
            required
            className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name} {acc.isDefault ? '(Default)' : ''} · {acc.type}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-700 block">Payment Mode</label>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
            className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            <option value="CASH">Cash</option>
            <option value="BANK_TRANSFER">Bank Transfer</option>
            <option value="UPI">UPI / QR Code</option>
            <option value="CARD">Card</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
      </div>

      {/* Payment Date & Reference */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          label="Payment Date"
          type="date"
          required
          value={paymentDate}
          onChange={(e) => setPaymentDate(e.target.value)}
        />
        <Input
          label="Reference / Transaction Note"
          placeholder="e.g. Cheque #1024, IMPS Ref #992"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {/* Allocation Mode (Only if there are unpaid bills) */}
      {outstandingPurchases.length > 0 && (
        <div className="pt-2 border-t border-slate-100 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-900">Bill Allocation Strategy</span>
            <div className="inline-flex p-0.5 rounded-xl bg-slate-100 border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => setAllocationMode('AUTO')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                  allocationMode === 'AUTO'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Auto (FIFO Oldest)
              </button>
              <button
                type="button"
                onClick={() => {
                  setAllocationMode('MANUAL');
                  handleAutoFillManual();
                }}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                  allocationMode === 'MANUAL'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Manual Select
              </button>
            </div>
          </div>

          {allocationMode === 'MANUAL' && (
            <div className="space-y-2 max-h-48 overflow-y-auto p-2 rounded-xl bg-slate-50 border border-slate-200/80">
              {outstandingPurchases.map((purchase) => {
                const currentAlloc = manualAllocations[purchase.purchaseId] || '';
                return (
                  <div
                    key={purchase.purchaseId}
                    className="p-2 rounded-lg bg-white border border-slate-200/80 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 truncate">
                        Bill #{purchase.purchaseNumber}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {new Date(purchase.purchaseDate).toLocaleDateString()} • Due:{' '}
                        <span className="font-bold text-amber-600">
                          {formatCurrency(purchase.dueAmount, business?.currencySymbol)}
                        </span>
                      </div>
                    </div>
                    <div className="w-28 shrink-0">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        max={purchase.dueAmount}
                        placeholder="0.00"
                        value={currentAlloc}
                        onChange={(e) => handleManualAllocChange(purchase.purchaseId, e.target.value)}
                        className="w-full px-2 py-1 text-right text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-slate-900 font-mono"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal Actions */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
        <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" isLoading={isSubmitting}>
          Confirm Payment
        </Button>
      </div>
    </form>
  );

  const title = `Pay ${supplier.name}`;
  const subtitle = 'Record outbound payment and settle purchase payables';

  if (isMobile) {
    return (
      <BottomSheet isOpen={isOpen} onClose={onClose} title={title} subtitle={subtitle}>
        {formContent}
      </BottomSheet>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} subtitle={subtitle} maxWidth="md">
      {formContent}
    </Modal>
  );
};
