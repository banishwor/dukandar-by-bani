import React, { useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { accountTransferService } from '../../services/accountTransferService';
import type { AccountTransferWithDetails, ReverseAccountTransferPayload } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { RotateCcw, AlertTriangle } from 'lucide-react';

interface ReverseTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  businessId: string;
  transferDetails: AccountTransferWithDetails | null;
  onReversed: () => void;
}

export const ReverseTransferModal: React.FC<ReverseTransferModalProps> = ({
  isOpen,
  onClose,
  businessId,
  transferDetails,
  onReversed,
}) => {
  const { showSuccess, showError } = useToast();
  const [reason, setReason] = useState('Transfer entry mistake');
  const [notes, setNotes] = useState('');
  const [reversalDate, setReversalDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);

  if (!transferDetails) return null;
  const transfer = transferDetails.transfer;

  const handleReverse = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const payload: ReverseAccountTransferPayload = {
        businessId,
        transferId: transfer.id,
        reason: reason.trim() || 'Transfer Reversal',
        notes: notes.trim() || undefined,
        reversalDate: new Date(reversalDate).toISOString(),
      };

      await accountTransferService.reverseTransfer(payload);
      showSuccess(`Transfer ${transfer.transferNumber} reversed successfully.`);
      onReversed();
      onClose();
    } catch (err: any) {
      showError(err.message || 'Failed to reverse transfer');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Reverse Account Transfer" maxWidth="md">
      <form onSubmit={handleReverse} className="space-y-4">
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 leading-relaxed">
            This will record an immutable reversal. Funds of{' '}
            <strong className="text-amber-950 font-bold font-mono">{formatCurrency(transfer.amount)}</strong> will be
            debited from <strong className="text-amber-950">{transfer.toAccountNameSnapshot}</strong> and credited back
            to <strong className="text-amber-950">{transfer.fromAccountNameSnapshot}</strong>.
          </div>
        </div>

        <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs text-slate-700">
          <div className="flex justify-between">
            <span className="text-slate-500">Transfer Number:</span>
            <span className="font-bold text-slate-900 font-mono">{transfer.transferNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Amount:</span>
            <span className="font-black text-emerald-600 font-mono">{formatCurrency(transfer.amount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">From / To:</span>
            <span className="font-medium text-slate-800">
              {transfer.fromAccountNameSnapshot} → {transfer.toAccountNameSnapshot}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Original Date:</span>
            <span className="text-slate-700">{formatDate(transfer.transferDate)}</span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
            Reason for Reversal *
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 shadow-xs"
            placeholder="e.g., Wrong account selected, Duplicate transfer..."
            required
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Reversal Date *</label>
          <input
            type="date"
            value={reversalDate}
            onChange={(e) => setReversalDate(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 shadow-xs cursor-pointer"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Additional Notes</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional internal justification..."
            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 shadow-xs"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" type="submit" isLoading={loading}>
            <RotateCcw className="w-4 h-4 mr-1.5" />
            Confirm Reversal
          </Button>
        </div>
      </form>
    </Modal>
  );
};
