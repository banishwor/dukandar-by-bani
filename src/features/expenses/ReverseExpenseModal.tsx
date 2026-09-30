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
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 leading-relaxed">
            This will record an immutable reversal. Funds of{' '}
            <strong className="text-amber-950 font-bold">{formatCurrency(expense.amount)}</strong> will be credited
            back to account <strong className="text-amber-950 font-semibold">{expense.accountNameSnapshot}</strong>.
          </div>
        </div>

        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1.5 text-xs text-slate-700 shadow-2xs">
          <div className="flex justify-between">
            <span className="text-slate-500">Expense Number:</span>
            <span className="font-semibold text-slate-900">{expense.expenseNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Category:</span>
            <span className="font-medium text-slate-900">{expense.categoryNameSnapshot}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Amount:</span>
            <span className="font-bold text-rose-600">{formatCurrency(expense.amount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Paid Account:</span>
            <span className="font-medium text-slate-900">{expense.accountNameSnapshot}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Date:</span>
            <span className="text-slate-700">{formatDate(expense.expenseDate)}</span>
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
            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-colors shadow-2xs"
            placeholder="e.g., Duplicate bill, Wrong amount, Refunded by vendor..."
            required
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Reversal Date *</label>
          <input
            type="date"
            value={reversalDate}
            onChange={(e) => setReversalDate(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-colors shadow-2xs"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Notes</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional additional context..."
            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-colors shadow-2xs"
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
