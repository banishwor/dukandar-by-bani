import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/ui/Modal';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useBusiness } from '../../contexts/BusinessContext';
import { useToast } from '../../components/ui/Toast';
import { purchaseCorrectionService } from '../../services/purchaseCorrectionService';
import type { SupplierPayment } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ReverseSupplierPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  payment: SupplierPayment | null;
  supplierName?: string;
}

export const ReverseSupplierPaymentModal: React.FC<ReverseSupplierPaymentModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  payment,
  supplierName,
}) => {
  const { business } = useBusiness();
  const { showSuccess, showError } = useToast();

  const [isMobile, setIsMobile] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [reason, setReason] = useState('Payment Cancelled / Returned');
  const [reversalDate, setReversalDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setReason('Payment Cancelled / Returned');
      setReversalDate(new Date().toISOString().slice(0, 10));
      setNotes('');
    }
  }, [isOpen]);

  if (!payment) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!business) return;

    try {
      setIsSubmitting(true);
      await purchaseCorrectionService.processSupplierPaymentReversal({
        businessId: business.id,
        paymentId: payment.id,
        supplierId: payment.supplierId,
        reason: reason.trim(),
        notes: notes.trim() || undefined,
        reversalDate: reversalDate ? new Date(reversalDate).toISOString() : new Date().toISOString(),
      });

      showSuccess(`Reversed payment of ${formatCurrency(payment.amount, business.currencySymbol)}`);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to reverse supplier payment', err);
      showError(err.message || 'Unable to reverse supplier payment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Warning Box */}
      <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-900 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold text-sm text-rose-900">Reverse Supplier Payment</p>
          <p>
            Reversing this payment of{' '}
            <span className="font-bold">{formatCurrency(payment.amount, business?.currencySymbol)}</span> will
            unsettle allocated purchase bills and restore the payable balance on the supplier's ledger.
          </p>
        </div>
      </div>

      {/* Payment details summary */}
      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
        <div className="flex justify-between">
          <span className="text-slate-500">Supplier:</span>
          <span className="font-semibold text-slate-800">{supplierName || 'Supplier'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Payment Amount:</span>
          <span className="font-bold text-slate-900 font-mono">
            {formatCurrency(payment.amount, business?.currencySymbol)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Payment Date:</span>
          <span className="font-medium text-slate-700">
            {new Date(payment.paymentDate).toLocaleDateString()}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Payment Mode:</span>
          <span className="font-medium text-slate-700">{payment.paymentMethod}</span>
        </div>
      </div>

      <Input
        label="Reason for Reversal"
        required
        autoFocus
        placeholder="e.g. Cheque bounce, Wrong vendor, Duplicate payment"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />

      <Input
        label="Reversal Date"
        type="date"
        required
        value={reversalDate}
        onChange={(e) => setReversalDate(e.target.value)}
      />

      <div className="flex flex-col gap-1.5 text-left">
        <label className="text-xs font-semibold text-slate-700">Reversal Notes (Optional)</label>
        <textarea
          rows={2}
          placeholder="Additional context or audit remarks"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
        />
      </div>

      {/* Modal Actions */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
        <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="danger"
          isLoading={isSubmitting}
          icon={RotateCcw}
        >
          Confirm Reversal
        </Button>
      </div>
    </form>
  );

  const title = 'Reverse Supplier Payment';
  const subtitle = 'Immutable accounting correction for outbound payment';

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
