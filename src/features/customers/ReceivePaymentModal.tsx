import React, { useState, useEffect, useCallback } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import { paymentService, PaymentValidationError } from '../../services/paymentService';
import { financialAccountService } from '../../services/financialAccountService';
import type { Customer, OutstandingInvoice, PaymentMethod, FinancialAccount } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { roundCurrency, isCurrencyGreaterThan } from '../../utils/money';
import confetti from 'canvas-confetti';
import {
  CreditCard,
  CheckCircle2,
  DollarSign,
  AlertCircle,
  Clock,
  Sparkles,
  Layers,
  ArrowDownRight,
  ShieldCheck,
  Building2,
  Wallet,
} from 'lucide-react';

interface ReceivePaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
  currencySymbol?: string;
  onPaymentReceived?: () => void;
}

export const ReceivePaymentModal: React.FC<ReceivePaymentModalProps> = ({
  isOpen,
  onClose,
  customer,
  currencySymbol = '₹',
  onPaymentReceived,
}) => {
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [outstandingInvoices, setOutstandingInvoices] = useState<OutstandingInvoice[]>([]);
  const [customerCredit, setCustomerCredit] = useState<number>(0);
  const [totalOutstanding, setTotalOutstanding] = useState<number>(0);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);

  // Form fields
  const [amount, setAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [financialAccountId, setFinancialAccountId] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState<string>('');
  const [allocationMode, setAllocationMode] = useState<'AUTO' | 'MANUAL'>('AUTO');
  const [manualAllocations, setManualAllocations] = useState<Record<string, string>>({});

  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    if (!customer || !isOpen) return;
    try {
      setLoading(true);
      const [invoices, summary, activeAccounts, defaultAcc] = await Promise.all([
        paymentService.getOutstandingInvoicesForCustomer(customer.id),
        paymentService.getCustomerFinancialSummary(customer.id),
        financialAccountService.getActiveAccounts(customer.businessId),
        financialAccountService.getDefaultAccount(customer.businessId),
      ]);
      setOutstandingInvoices(invoices);
      setCustomerCredit(summary.customerCredit);
      setTotalOutstanding(summary.outstandingBalance);
      setAccounts(activeAccounts);

      if (defaultAcc) {
        setFinancialAccountId(defaultAcc.id);
      } else if (activeAccounts.length > 0) {
        setFinancialAccountId(activeAccounts[0].id);
      }

      // Pre-fill amount with outstanding due if empty
      if (!amount && summary.outstandingBalance > 0) {
        setAmount(String(summary.outstandingBalance));
      }
    } catch (err) {
      console.error('Failed to load customer outstanding invoices', err);
    } finally {
      setLoading(false);
    }
  }, [customer, isOpen]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setAmount('');
      setNotes('');
      setAllocationMode('AUTO');
      setManualAllocations({});
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const numAmount = roundCurrency(Math.max(0, parseFloat(amount) || 0));

  // Calculations for FIFO preview or Manual preview
  let totalAllocatedPreview = 0;
  let remainingCreditPreview = 0;

  if (allocationMode === 'AUTO') {
    let unallocated = numAmount;
    for (const inv of outstandingInvoices) {
      const alloc = Math.min(unallocated, inv.dueAmount);
      totalAllocatedPreview += alloc;
      unallocated = Math.max(0, unallocated - alloc);
    }
    totalAllocatedPreview = roundCurrency(totalAllocatedPreview);
    remainingCreditPreview = roundCurrency(Math.max(0, numAmount - totalAllocatedPreview));
  } else {
    for (const inv of outstandingInvoices) {
      const entered = parseFloat(manualAllocations[inv.saleId] || '0') || 0;
      totalAllocatedPreview += Math.min(entered, inv.dueAmount);
    }
    totalAllocatedPreview = roundCurrency(totalAllocatedPreview);
    remainingCreditPreview = roundCurrency(Math.max(0, numAmount - totalAllocatedPreview));
  }

  const handleManualAllocationChange = (saleId: string, val: string, maxDue: number) => {
    const num = parseFloat(val);
    if (!isNaN(num) && num > maxDue) {
      setManualAllocations((prev) => ({ ...prev, [saleId]: String(maxDue) }));
    } else {
      setManualAllocations((prev) => ({ ...prev, [saleId]: val }));
    }
  };

  const handleAllocateMax = (saleId: string, maxDue: number) => {
    // Determine how much is left from payment amount
    const otherAllocationsSum = Object.entries(manualAllocations)
      .filter(([id]) => id !== saleId)
      .reduce((sum, [, val]) => sum + (parseFloat(String(val)) || 0), 0);

    const availableFromPayment = Math.max(0, numAmount - otherAllocationsSum);
    const alloc = Math.min(maxDue, availableFromPayment);
    setManualAllocations((prev) => ({ ...prev, [saleId]: String(alloc) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer || isSubmitting) return;

    if (numAmount <= 0) {
      showError('Please enter a valid payment amount greater than 0.');
      return;
    }

    if (allocationMode === 'MANUAL' && isCurrencyGreaterThan(totalAllocatedPreview, numAmount)) {
      showError('Total allocated amount exceeds payment received.');
      return;
    }

    try {
      setIsSubmitting(true);

      const payloadManualAllocs =
        allocationMode === 'MANUAL'
          ? Object.entries(manualAllocations)
              .map(([saleId, val]) => ({
                saleId,
                amount: roundCurrency(parseFloat(String(val)) || 0),
              }))
              .filter((a) => a.amount > 0)
          : undefined;

      const result = await paymentService.receiveCustomerPayment({
        businessId: customer.businessId,
        customerId: customer.id,
        amount: numAmount,
        paymentMethod,
        financialAccountId: financialAccountId || undefined,
        paymentDate: paymentDate ? new Date(paymentDate).toISOString() : new Date().toISOString(),
        notes: notes.trim() || undefined,
        allocationMode,
        manualAllocations: payloadManualAllocs,
      });

      // Confetti celebration
      try {
        confetti({
          particleCount: 60,
          spread: 50,
          origin: { y: 0.6 },
        });
      } catch (e) {
        // ignore
      }

      const allocatedMsg =
        result.allocations.length > 0
          ? `Allocated to ${result.allocations.length} invoice(s).`
          : 'Added as customer credit.';
      showSuccess(
        `Received ${formatCurrency(numAmount, currencySymbol)} from ${customer.name}. ${allocatedMsg}`
      );

      onPaymentReceived?.();
      onClose();
    } catch (err: any) {
      console.error('Payment receipt error', err);
      if (err instanceof PaymentValidationError) {
        showError(err.message, 'Payment Validation');
      } else {
        showError(err.message || 'Failed to record payment. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!customer) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Receive Payment · ${customer.name}`}
      subtitle="Record payment and atomically allocate to outstanding invoices."
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Customer Balance Banner */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 bg-slate-50 border border-slate-200/90 rounded-2xl text-xs">
          <div>
            <span className="text-slate-500 font-medium block">Total Outstanding Due</span>
            <span
              className={`text-base font-bold font-mono mt-0.5 block ${
                totalOutstanding > 0 ? 'text-rose-600' : 'text-slate-800'
              }`}
            >
              {formatCurrency(totalOutstanding, currencySymbol)}
            </span>
          </div>

          <div>
            <span className="text-slate-500 font-medium block">Available Credit</span>
            <span className="text-base font-bold font-mono text-emerald-600 mt-0.5 block">
              {formatCurrency(customerCredit, currencySymbol)}
            </span>
          </div>

          <div className="col-span-2 sm:col-span-1 border-t sm:border-t-0 sm:border-l border-slate-200 pt-2 sm:pt-0 sm:pl-3">
            <span className="text-slate-500 font-medium block">Unpaid Invoices</span>
            <span className="text-base font-bold text-slate-900 mt-0.5 block">
              {outstandingInvoices.length} {outstandingInvoices.length === 1 ? 'invoice' : 'invoices'}
            </span>
          </div>
        </div>

        {/* Primary Payment Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Amount */}
          <div className="sm:col-span-1 space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-700 block">
              Amount Received *
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base font-bold text-slate-400 font-mono">
                {currencySymbol}
              </span>
              <input
                type="number"
                step="any"
                min="0.01"
                required
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full h-12 pl-8 pr-4 rounded-xl border border-slate-200 bg-white text-lg font-bold font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            {/* Quick Amount Pills */}
            {totalOutstanding > 0 && (
              <div className="flex items-center gap-1.5 pt-1 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setAmount(String(totalOutstanding))}
                  className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-bold transition-colors whitespace-nowrap"
                >
                  Pay Full Due ({formatCurrency(totalOutstanding, currencySymbol)})
                </button>
                {outstandingInvoices.slice(0, 2).map((inv) => (
                  <button
                    key={inv.saleId}
                    type="button"
                    onClick={() => setAmount(String(inv.dueAmount))}
                    className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium transition-colors whitespace-nowrap"
                  >
                    #{inv.invoiceNumber} ({formatCurrency(inv.dueAmount, currencySymbol)})
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Payment Method */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-700 block">
              Payment Mode
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              className="w-full h-12 px-3 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="CASH">Cash</option>
              <option value="UPI">UPI / QR Code</option>
              <option value="CARD">Debit / Credit Card</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="OTHER">Other</option>
            </select>
          </div>

          {/* Financial Account (Deposit Into) */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-700 block">
              Deposit Account *
            </label>
            <select
              value={financialAccountId}
              onChange={(e) => setFinancialAccountId(e.target.value)}
              required
              className="w-full h-12 px-3 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} {acc.isDefault ? '(Default)' : ''} · {acc.type}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Date & Reference Notes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 block">Payment Date</label>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs text-slate-800"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 block">Notes / Reference (Optional)</label>
            <input
              type="text"
              placeholder="e.g. UPI ref #123456 or Cheque #"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs text-slate-800"
            />
          </div>
        </div>

        {/* Allocation Strategy Switch */}
        {outstandingInvoices.length > 0 && (
          <div className="space-y-3 pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Invoice Allocation Method
              </label>

              <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs">
                <button
                  type="button"
                  onClick={() => setAllocationMode('AUTO')}
                  className={`px-3 py-1 rounded-lg font-bold transition-all ${
                    allocationMode === 'AUTO'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Auto FIFO (Oldest First)
                </button>
                <button
                  type="button"
                  onClick={() => setAllocationMode('MANUAL')}
                  className={`px-3 py-1 rounded-lg font-bold transition-all ${
                    allocationMode === 'MANUAL'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Manual Allocation
                </button>
              </div>
            </div>

            {/* Manual Allocation Invoices List */}
            {allocationMode === 'MANUAL' && (
              <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                      <th className="py-2.5 px-3">Invoice #</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3 text-right">Total</th>
                      <th className="py-2.5 px-3 text-right">Due</th>
                      <th className="py-2.5 px-3 text-right">Allocate Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {outstandingInvoices.map((inv) => {
                      const val = manualAllocations[inv.saleId] || '';
                      return (
                        <tr key={inv.saleId} className="hover:bg-slate-50/60">
                          <td className="py-2.5 px-3 font-bold font-mono text-slate-900">
                            {inv.invoiceNumber}
                          </td>
                          <td className="py-2.5 px-3 text-slate-500">{formatDate(inv.saleDate)}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                            {formatCurrency(inv.totalAmount, currencySymbol)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-600">
                            {formatCurrency(inv.dueAmount, currencySymbol)}
                          </td>
                          <td className="py-2 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <input
                                type="number"
                                step="any"
                                min="0"
                                max={inv.dueAmount}
                                placeholder="0.00"
                                value={val}
                                onChange={(e) =>
                                  handleManualAllocationChange(inv.saleId, e.target.value, inv.dueAmount)
                                }
                                className="w-24 h-8 px-2 rounded-lg border border-slate-200 text-right text-xs font-mono font-bold"
                              />
                              <button
                                type="button"
                                onClick={() => handleAllocateMax(inv.saleId, inv.dueAmount)}
                                className="px-1.5 py-1 text-[10px] font-bold bg-slate-100 hover:bg-slate-200 rounded text-slate-700"
                              >
                                Max
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Live Allocation Summary Box */}
        <div className="p-4 bg-emerald-50/70 border border-emerald-200/80 rounded-2xl space-y-2 text-xs">
          <div className="flex justify-between items-center text-slate-700">
            <span>Payment Received:</span>
            <span className="font-bold font-mono text-sm text-slate-900">
              {formatCurrency(numAmount, currencySymbol)}
            </span>
          </div>

          <div className="flex justify-between items-center text-emerald-800">
            <span>Allocated to Invoices:</span>
            <span className="font-bold font-mono text-sm text-emerald-700">
              {formatCurrency(totalAllocatedPreview, currencySymbol)}
            </span>
          </div>

          {remainingCreditPreview > 0 && (
            <div className="flex justify-between items-center text-blue-800 pt-1 border-t border-emerald-200">
              <span className="font-semibold flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-blue-600" />
                Unallocated / Customer Credit:
              </span>
              <span className="font-bold font-mono text-sm text-blue-700">
                +{formatCurrency(remainingCreditPreview, currencySymbol)}
              </span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="outline" type="button" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="success"
            type="submit"
            icon={CheckCircle2}
            isLoading={isSubmitting}
            disabled={numAmount <= 0 || isSubmitting}
          >
            Confirm & Receive {formatCurrency(numAmount, currencySymbol)}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
