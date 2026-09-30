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
        <div className="p-4 rounded-2xl bg-linear-to-br from-rose-50/50 via-slate-50 to-blue-50/30 border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 border border-rose-200/60 flex items-center justify-center text-rose-600 shadow-2xs">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 text-base">{expense.expenseNumber}</h3>
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
              <p className="text-xs text-slate-500 mt-0.5">{category?.name || expense.categoryNameSnapshot}</p>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] font-semibold uppercase text-slate-400 block tracking-wider">Amount</span>
            <span className="text-xl font-black text-rose-600">{formatCurrency(expense.amount)}</span>
          </div>
        </div>

        {/* Reversal Banner if Reversed */}
        {isReversed && reversal && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-rose-700">
              <AlertTriangle className="w-4 h-4" />
              <span>Reversed on {formatDateTime(reversal.reversalDate)}</span>
            </div>
            <p>Reason: {reversal.reason || 'Expense Reversal'}</p>
            {reversal.notes && <p className="text-slate-600">Notes: {reversal.notes}</p>}
          </div>
        )}

        {/* Key Info Details */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/80">
            <span className="text-slate-500 block mb-0.5">Date & Time</span>
            <span className="font-semibold text-slate-800">{formatDateTime(expense.expenseDate)}</span>
          </div>

          <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/80">
            <span className="text-slate-500 block mb-0.5">Paid From Account</span>
            <span className="font-semibold text-emerald-700">
              {account?.name || expense.accountNameSnapshot}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/80">
            <span className="text-slate-500 block mb-0.5">Payment Method</span>
            <span className="font-semibold text-slate-800">{expense.paymentMethod}</span>
          </div>

          <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/80">
            <span className="text-slate-500 block mb-0.5">Payee / Recipient</span>
            <span className="font-semibold text-slate-800">{expense.payee || '—'}</span>
          </div>
        </div>

        {/* Notes */}
        {expense.notes && (
          <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/80 text-xs text-slate-700">
            <span className="text-slate-500 font-semibold block mb-1">Notes:</span>
            <p>{expense.notes}</p>
          </div>
        )}

        {/* Financial Movement Ledger Trace */}
        <div className="pt-2 border-t border-slate-100">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
            <Layers className="w-3.5 h-3.5 text-blue-500" />
            <span>Underlying Financial Movement</span>
          </div>

          {movement ? (
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs flex items-center justify-between text-slate-700">
              <div>
                <span className="text-rose-600 font-bold mr-2">OUT ({movement.type})</span>
                <span className="text-slate-500">{formatDateTime(movement.movementDate)}</span>
              </div>
              <span className="font-bold text-rose-600">-{formatCurrency(movement.amount)}</span>
            </div>
          ) : (
            <p className="text-xs text-slate-500">Movement trace unavailable.</p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
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
