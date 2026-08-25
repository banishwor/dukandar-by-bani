import React, { useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { expenseService } from '../../services/expenseService';
import type { ExpenseWithDetails, ReverseExpensePayload } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { RotateCcw, AlertTriangle } from 'lucide-react';

interface ReverseExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  businessId: string;
  expenseDetails: ExpenseWithDetails | null;
  onReversed: () => void;
}

export const ReverseExpenseModal: React.FC<ReverseExpenseModalProps> = ({
  isOpen,
  onClose,
  businessId,
  expenseDetails,
  onReversed,
}) => {
  const { showSuccess, showError } = useToast();
  const [reason, setReason] = useState('Incorrect expense entry');
  const [notes, setNotes] = useState('');
  const [reversalDate, setReversalDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);

  if (!expenseDetails) return null;
  const expense = expenseDetails.expense;

  const handleReverse = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const payload: ReverseExpensePayload = {
        businessId,
        expenseId: expense.id,
        reason: reason.trim() || 'Expense Reversal',
        notes: notes.trim() || undefined,
        reversalDate: new Date(reversalDate).toISOString(),
      };

      await expenseService.reverseExpense(payload);
      showSuccess(`Expense ${expense.expenseNumber} reversed successfully.`);
      onReversed();
      onClose();
    } catch (err: any) {
      showError(err.message || 'Failed to reverse expense');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Reverse Expense" maxWidth="md">
      <form onSubmit={handleReverse} className="space-y-4">
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-200/90 leading-relaxed">
            This will record an immutable reversal. Funds of{' '}
            <strong className="text-amber-100 font-semibold">{formatCurrency(expense.amount)}</strong> will be credited
            back to account <strong className="text-amber-100">{expense.accountNameSnapshot}</strong>.
          </div>
        </div>

        <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/50 space-y-1.5 text-xs text-slate-300">
          <div className="flex justify-between">
            <span className="text-slate-400">Expense Number:</span>
            <span className="font-semibold text-white">{expense.expenseNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Category:</span>
            <span className="font-medium text-white">{expense.categoryNameSnapshot}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Amount:</span>
            <span className="font-bold text-rose-400">{formatCurrency(expense.amount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Paid Account:</span>
            <span>{expense.accountNameSnapshot}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Date:</span>
            <span>{formatDate(expense.expenseDate)}</span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
            Reason for Reversal *
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-rose-500/50"
            placeholder="e.g., Duplicate bill, Wrong amount, Refunded by vendor..."
            required
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">Reversal Date *</label>
          <input
            type="date"
            value={reversalDate}
            onChange={(e) => setReversalDate(e.target.value)}
            className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-rose-500/50"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">Notes</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional additional context..."
            className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/50"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
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
