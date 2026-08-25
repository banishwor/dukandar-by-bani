import React, { useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { useBusiness } from '../../contexts/BusinessContext';
import { saleCorrectionService } from '../../services/saleCorrectionService';
import type { Payment } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { AlertTriangle, Undo2, ShieldAlert } from 'lucide-react';

interface ReversePaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  payment: Payment | null;
  customerName?: string;
  onReversalSuccess?: () => void;
}

export const ReversePaymentModal: React.FC<ReversePaymentModalProps> = ({
  isOpen,
  onClose,
  payment,
  customerName,
  onReversalSuccess,
}) => {
  const { business } = useBusiness();
  const [reason, setReason] = useState('Payment entered in error / bounced cheque');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!payment) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Please provide a reason for reversing this payment.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      await saleCorrectionService.processPaymentReversal({
        businessId: payment.businessId,
        originalPaymentId: payment.id,
        customerId: payment.partyId,
        reason: reason.trim(),
        notes: notes.trim() || undefined,
        reversalDate: new Date().toISOString(),
      });

      onReversalSuccess?.();
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to reverse payment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Reverse Payment"
      subtitle={`Receipt #${payment.id.substring(0, 8)} · Amount: ${formatCurrency(payment.amount, business?.currencySymbol)}`}
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
            <span>Immutable Payment Reversal</span>
          </div>
          <p className="text-amber-800 leading-relaxed">
            Reversing this payment will not delete the historical transaction. Instead, an immutable
            compensating <strong>PaymentReversal</strong> record is created:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-amber-800 font-medium">
            <li>Customer's receivable balance will be reinstated by {formatCurrency(payment.amount, business?.currencySymbol)}.</li>
            <li>Invoices originally settled by this payment will become unpaid / partially paid.</li>
            <li>The audit trail in the customer statement will preserve both entries.</li>
          </ul>
        </div>

        {/* Payment Summary */}
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs grid grid-cols-2 gap-2 text-slate-700">
          <div>
            <span className="text-slate-400 block text-[11px]">Customer:</span>
            <span className="font-semibold">{customerName || 'Customer'}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">Payment Mode:</span>
            <span className="font-semibold">{payment.paymentMethod}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">Recorded Date:</span>
            <span className="font-semibold">
              {new Date(payment.paymentDate || payment.createdAt).toLocaleDateString()}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">Amount:</span>
            <span className="font-bold text-slate-900 font-mono">
              {formatCurrency(payment.amount, business?.currencySymbol)}
            </span>
          </div>
        </div>

        {/* Reason Input */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Reversal Reason *</label>
          <input
            type="text"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Cheque bounced, entered duplicate, wrong customer"
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
            placeholder="Optional details"
            className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 text-slate-800"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>

          <Button
            type="submit"
            variant="danger"
            disabled={submitting}
            icon={Undo2}
          >
            {submitting ? 'Reversing...' : 'Confirm Payment Reversal'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
