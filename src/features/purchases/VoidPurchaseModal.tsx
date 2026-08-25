import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { useBusiness } from '../../contexts/BusinessContext';
import { purchaseCorrectionService } from '../../services/purchaseCorrectionService';
import { financialAccountService } from '../../services/financialAccountService';
import type { Purchase, SupplierSettlementMode, PaymentMethod, FinancialAccount } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import {
  AlertTriangle,
  RotateCcw,
  ShieldAlert,
  PackageMinus,
} from 'lucide-react';

interface VoidPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  purchase: Purchase | null;
  paidAmount?: number;
  onVoidSuccess?: () => void;
}

export const VoidPurchaseModal: React.FC<VoidPurchaseModalProps> = ({
  isOpen,
  onClose,
  purchase,
  paidAmount = 0,
  onVoidSuccess,
}) => {
  const { business } = useBusiness();
  const [reason, setReason] = useState('Vendor order cancelled / duplicate entry');
  const [notes, setNotes] = useState('');
  const [settlementMode, setSettlementMode] = useState<SupplierSettlementMode>('SUPPLIER_CREDIT');
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>('CASH');
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [financialAccountId, setFinancialAccountId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (business && isOpen) {
      Promise.all([
        financialAccountService.getActiveAccounts(business.id),
        financialAccountService.getDefaultAccount(business.id),
      ]).then(([activeAccounts, defaultAcc]) => {
        setAccounts(activeAccounts);
        if (defaultAcc) {
          setFinancialAccountId(defaultAcc.id);
        } else if (activeAccounts.length > 0) {
          setFinancialAccountId(activeAccounts[0].id);
        }
      });
    }
  }, [business, isOpen]);

  if (!purchase) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Please provide a reason for voiding this purchase bill.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      await purchaseCorrectionService.processPurchaseVoid({
        businessId: purchase.businessId,
        originalPurchaseId: purchase.id,
        reason: reason.trim(),
        notes: notes.trim() || undefined,
        voidDate: new Date().toISOString(),
        settlementMode: paidAmount > 0 ? settlementMode : 'NO_SETTLEMENT',
        refundPaymentMethod: settlementMode === 'REFUND_RECEIVED_NOW' ? refundMethod : undefined,
        financialAccountId: settlementMode === 'REFUND_RECEIVED_NOW' ? financialAccountId : undefined,
      });

      onVoidSuccess?.();
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to void purchase bill.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Void Purchase Bill #${purchase.purchaseNumber}`}
      subtitle="Cancels purchase bill and auto-deducts inventory through immutable event"
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Warning Banner */}
        <div className="p-4 bg-amber-50 border border-amber-200/80 rounded-2xl space-y-2 text-xs text-amber-900">
          <div className="flex items-center gap-2 font-bold text-amber-950">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Immutable Correction Process</span>
          </div>
          <p className="text-amber-800 leading-relaxed">
            Voiding this bill will not delete historical records. Instead, it will create compensating records:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-amber-800 font-medium">
            <li>All unreturned items on this bill will be deducted from inventory.</li>
            <li>The net payable amount of this bill will become zero.</li>
            {paidAmount > 0 && (
              <li>
                Payments of {formatCurrency(paidAmount, business?.currencySymbol)} will be settled via{' '}
                {settlementMode === 'REFUND_RECEIVED_NOW' ? 'immediate refund received' : 'supplier advance credit'}.
              </li>
            )}
          </ul>
        </div>

        {/* Reason Input */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Reason for Voiding *</label>
          <input
            type="text"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Inward order cancelled, duplicate bill, data entry error"
            className="w-full text-xs px-3 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 font-medium text-slate-800"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Additional Notes</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional additional audit details"
            className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 text-slate-800"
          />
        </div>

        {/* Payment Settlement if Paid > 0 */}
        {paidAmount > 0 && (
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Settle Disbursed Payments ({formatCurrency(paidAmount, business?.currencySymbol)})
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label
                className={`p-3 rounded-xl border text-xs cursor-pointer transition-all flex flex-col justify-between ${
                  settlementMode === 'SUPPLIER_CREDIT'
                    ? 'bg-amber-50/90 border-amber-500 text-amber-950 font-bold shadow-2xs'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100/50'
                }`}
              >
                <input
                  type="radio"
                  name="voidSupplierSettlement"
                  value="SUPPLIER_CREDIT"
                  checked={settlementMode === 'SUPPLIER_CREDIT'}
                  onChange={() => setSettlementMode('SUPPLIER_CREDIT')}
                  className="sr-only"
                />
                <span className="font-bold block">Keep as Supplier Advance</span>
                <span className="text-[11px] text-slate-500 font-normal mt-1 block">
                  Available to apply against future purchase bills
                </span>
              </label>

              <label
                className={`p-3 rounded-xl border text-xs cursor-pointer transition-all flex flex-col justify-between ${
                  settlementMode === 'REFUND_RECEIVED_NOW'
                    ? 'bg-rose-50/90 border-rose-500 text-rose-950 font-bold shadow-2xs'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100/50'
                }`}
              >
                <input
                  type="radio"
                  name="voidSupplierSettlement"
                  value="REFUND_RECEIVED_NOW"
                  checked={settlementMode === 'REFUND_RECEIVED_NOW'}
                  onChange={() => setSettlementMode('REFUND_RECEIVED_NOW')}
                  className="sr-only"
                />
                <span className="font-bold block">Refund Received Now</span>
                <span className="text-[11px] text-slate-500 font-normal mt-1 block">
                  Supplier returned money to cash / bank account
                </span>
              </label>
            </div>

            {settlementMode === 'REFUND_RECEIVED_NOW' && (
              <div className="pt-2 border-t border-slate-200 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">Refund Received Method:</span>
                  <div className="flex gap-2">
                    {(['CASH', 'UPI', 'BANK_TRANSFER', 'CARD'] as PaymentMethod[]).map((method) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setRefundMethod(method)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                          refundMethod === method
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {method}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-700">Deposit Into Account:</span>
                  <select
                    value={financialAccountId}
                    onChange={(e) => setFinancialAccountId(e.target.value)}
                    className="h-8 px-2 rounded-lg border border-slate-200 bg-white text-slate-800 text-xs font-medium max-w-[200px] truncate"
                  >
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} {acc.isDefault ? '(Default)' : ''} · {acc.type}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-3">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>

          <Button
            type="submit"
            variant="danger"
            disabled={submitting}
            icon={RotateCcw}
          >
            {submitting ? 'Voiding...' : 'Confirm Void Purchase Bill'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
