import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { expenseService } from '../../services/expenseService';
import type {
  ExpenseCategory,
  FinancialAccountWithBalance,
  PaymentMethod,
  CreateExpensePayload,
} from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { Receipt, Wallet, Plus, Tag } from 'lucide-react';

interface NewExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  businessId: string;
  categories: ExpenseCategory[];
  accounts: FinancialAccountWithBalance[];
  onExpenseCreated: () => void;
  onManageCategories: () => void;
}

export const NewExpenseModal: React.FC<NewExpenseModalProps> = ({
  isOpen,
  onClose,
  businessId,
  categories,
  accounts,
  onExpenseCreated,
  onManageCategories,
}) => {
  const { showSuccess, showError } = useToast();

  const activeCategories = categories.filter((c) => !c.isArchived);
  const activeAccounts = accounts.filter((a) => !a.isArchived);

  const [categoryId, setCategoryId] = useState('');
  const [financialAccountId, setFinancialAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [payee, setPayee] = useState('');
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (activeCategories.length > 0 && !categoryId) {
        setCategoryId(activeCategories[0].id);
      }
      const defaultAccount = activeAccounts.find((a) => a.isDefault) || activeAccounts[0];
      if (defaultAccount && !financialAccountId) {
        setFinancialAccountId(defaultAccount.id);
      }
      setAmount('');
      setPayee('');
      setNotes('');
      setPaymentMethod('CASH');
      setExpenseDate(new Date().toISOString().slice(0, 10));
    }
  }, [isOpen, activeCategories, activeAccounts]);

  const selectedAccount = accounts.find((a) => a.id === financialAccountId);
  const numAmount = parseFloat(amount) || 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!categoryId) {
      showError('Please select an expense category.');
      return;
    }

    if (!financialAccountId) {
      showError('Please select a paid-from account.');
      return;
    }

    if (numAmount <= 0) {
      showError('Please enter a valid expense amount.');
      return;
    }

    setSaving(true);
    try {
      const payload: CreateExpensePayload = {
        businessId,
        categoryId,
        financialAccountId,
        amount: numAmount,
        paymentMethod,
        payee: payee.trim() || undefined,
        expenseDate: new Date(expenseDate).toISOString(),
        notes: notes.trim() || undefined,
      };

      await expenseService.createExpense(payload);
      showSuccess(`Expense of ${formatCurrency(numAmount)} recorded successfully.`);
      onExpenseCreated();
      onClose();
    } catch (err: any) {
      showError(err.message || 'Failed to record expense');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Record Business Expense" maxWidth="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Category Selector + Add Category Button */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Expense Category *
            </label>
            <button
              type="button"
              onClick={onManageCategories}
              className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 font-medium transition-colors"
            >
              <Tag className="w-3 h-3" />
              <span>Manage Categories</span>
            </button>
          </div>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors shadow-2xs"
            required
          >
            <option value="">Select category...</option>
            {activeCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Paid From Account */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
            Paid From Account *
          </label>
          <select
            value={financialAccountId}
            onChange={(e) => setFinancialAccountId(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors shadow-2xs"
            required
          >
            <option value="">Select financial account...</option>
            {activeAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({formatCurrency(a.derivedBalance)})
              </option>
            ))}
          </select>
          {selectedAccount && (
            <p className="text-xs text-slate-500 mt-1">
              Account balance:{' '}
              <span className="font-semibold text-emerald-600">
                {formatCurrency(selectedAccount.derivedBalance)}
              </span>
            </p>
          )}
        </div>

        {/* Amount & Date */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Expense Amount (₹) *"
            type="number"
            min="0.01"
            step="0.01"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Expense Date *</label>
            <input
              type="date"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors shadow-2xs"
              required
            />
          </div>
        </div>

        {/* Payment Method & Payee */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Payment Method</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors shadow-2xs"
            >
              <option value="CASH">Cash</option>
              <option value="UPI">UPI</option>
              <option value="CARD">Card</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="OTHER">Other</option>
            </select>
          </div>

          <Input
            label="Payee / Recipient"
            placeholder="e.g., Landlord, Electricity Board, Vendor"
            value={payee}
            onChange={(e) => setPayee(e.target.value)}
          />
        </div>

        {/* Description / Notes */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Notes / Description</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional details or invoice reference..."
            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors shadow-2xs"
          />
        </div>

        {/* Form Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" isLoading={saving} disabled={numAmount <= 0 || !categoryId || !financialAccountId}>
            <Receipt className="w-4 h-4 mr-1.5" />
            Record Expense
          </Button>
        </div>
      </form>
    </Modal>
  );
};
