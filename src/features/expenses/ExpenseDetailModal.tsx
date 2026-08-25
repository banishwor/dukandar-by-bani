import React from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import type { ExpenseWithDetails } from '../../types';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { Receipt, RotateCcw, AlertTriangle, Layers, CreditCard, Tag } from 'lucide-react';

interface ExpenseDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  expenseDetails: ExpenseWithDetails | null;
  onReverseClick: (details: ExpenseWithDetails) => void;
}

export const ExpenseDetailModal: React.FC<ExpenseDetailModalProps> = ({
  isOpen,
  onClose,
  expenseDetails,
  onReverseClick,
}) => {
  if (!expenseDetails) return null;
  const { expense, reversal, isReversed, account, category, movement } = expenseDetails;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Expense Details & Audit Ledger" maxWidth="md">
      <div className="space-y-4">
        {/* Header Summary */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/80 shadow-md flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-base">{expense.expenseNumber}</h3>
                {isReversed ? (
                  <Badge variant="danger" className="text-[10px]">
                    Reversed
                  </Badge>
                ) : (
                  <Badge variant="success" className="text-[10px]">
                    Active
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">{category?.name || expense.categoryNameSnapshot}</p>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] font-semibold uppercase text-slate-400 block">Amount</span>
            <span className="text-xl font-black text-rose-400">{formatCurrency(expense.amount)}</span>
          </div>
        </div>

        {/* Reversal Banner if Reversed */}
        {isReversed && reversal && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-rose-300">
              <AlertTriangle className="w-4 h-4" />
              <span>Reversed on {formatDateTime(reversal.reversalDate)}</span>
            </div>
            <p>Reason: {reversal.reason || 'Expense Reversal'}</p>
            {reversal.notes && <p className="text-slate-400">Notes: {reversal.notes}</p>}
          </div>
        )}

        {/* Key Info Details */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
            <span className="text-slate-400 block mb-0.5">Date & Time</span>
            <span className="font-semibold text-white">{formatDateTime(expense.expenseDate)}</span>
          </div>

          <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
            <span className="text-slate-400 block mb-0.5">Paid From Account</span>
            <span className="font-semibold text-emerald-400">
              {account?.name || expense.accountNameSnapshot}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
            <span className="text-slate-400 block mb-0.5">Payment Method</span>
            <span className="font-semibold text-white">{expense.paymentMethod}</span>
          </div>

          <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
            <span className="text-slate-400 block mb-0.5">Payee / Recipient</span>
            <span className="font-semibold text-white">{expense.payee || '—'}</span>
          </div>
        </div>

        {/* Notes */}
        {expense.notes && (
          <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/40 text-xs text-slate-300">
            <span className="text-slate-400 font-semibold block mb-1">Notes:</span>
            <p>{expense.notes}</p>
          </div>
        )}

        {/* Financial Movement Ledger Trace */}
        <div className="pt-2 border-t border-slate-800">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
            <Layers className="w-3.5 h-3.5 text-blue-400" />
            <span>Underlying Financial Movement</span>
          </div>

          {movement ? (
            <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs flex items-center justify-between text-slate-300">
              <div>
                <span className="text-rose-400 font-bold mr-2">OUT ({movement.type})</span>
                <span className="text-slate-400">{formatDateTime(movement.movementDate)}</span>
              </div>
              <span className="font-bold text-rose-400">-{formatCurrency(movement.amount)}</span>
            </div>
          ) : (
            <p className="text-xs text-slate-500">Movement trace unavailable.</p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-800">
          {!isReversed ? (
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                onReverseClick(expenseDetails);
                onClose();
              }}
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" />
              Reverse Expense
            </Button>
          ) : (
            <div />
          )}

          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
};
