import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { accountTransferService } from '../../services/accountTransferService';
import type { FinancialAccountWithBalance, CreateAccountTransferPayload } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { ArrowRightLeft, ArrowRight, AlertCircle } from 'lucide-react';

interface AccountTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  businessId: string;
  accounts: FinancialAccountWithBalance[];
  initialFromAccountId?: string;
  onTransferCompleted: () => void;
}

export const AccountTransferModal: React.FC<AccountTransferModalProps> = ({
  isOpen,
  onClose,
  businessId,
  accounts,
  initialFromAccountId,
  onTransferCompleted,
}) => {
  const { showSuccess, showError } = useToast();

  const activeAccounts = accounts.filter((a) => !a.isArchived);

  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [transferDate, setTransferDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (initialFromAccountId && activeAccounts.some((a) => a.id === initialFromAccountId)) {
        setFromAccountId(initialFromAccountId);
        const destination = activeAccounts.find((a) => a.id !== initialFromAccountId);
        setToAccountId(destination ? destination.id : '');
      } else if (activeAccounts.length >= 2) {
        setFromAccountId(activeAccounts[0].id);
        setToAccountId(activeAccounts[1].id);
      } else if (activeAccounts.length === 1) {
        setFromAccountId(activeAccounts[0].id);
        setToAccountId('');
      }
      setAmount('');
      setTransferDate(new Date().toISOString().slice(0, 10));
      setNotes('');
    }
  }, [isOpen, initialFromAccountId, accounts]);

  const selectedFromAccount = accounts.find((a) => a.id === fromAccountId);
  const selectedToAccount = accounts.find((a) => a.id === toAccountId);
  const fromBalance = selectedFromAccount?.derivedBalance || 0;
  const numAmount = parseFloat(amount) || 0;
  const isInsufficient = numAmount > fromBalance;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fromAccountId || !toAccountId) {
      showError('Please select both source and destination accounts.');
      return;
    }

    if (fromAccountId === toAccountId) {
      showError('Source and destination accounts cannot be identical.');
      return;
    }

    if (numAmount <= 0) {
      showError('Please enter a valid transfer amount greater than 0.');
      return;
    }

    if (isInsufficient) {
      showError(`Insufficient funds in ${selectedFromAccount?.name || 'source account'}.`);
      return;
    }

    setLoading(true);
    try {
      const payload: CreateAccountTransferPayload = {
        businessId,
        fromAccountId,
        toAccountId,
        amount: numAmount,
        transferDate: new Date(transferDate).toISOString(),
        notes: notes.trim() || undefined,
      };

      await accountTransferService.createTransfer(payload);
      showSuccess(`Successfully transferred ${formatCurrency(numAmount)} to ${selectedToAccount?.name}`);
      onTransferCompleted();
      onClose();
    } catch (err: any) {
      showError(err.message || 'Failed to complete account transfer');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Transfer Funds Between Accounts" maxWidth="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Source & Destination Account Pickers */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              From Account (Debit) *
            </label>
            <select
              value={fromAccountId}
              onChange={(e) => setFromAccountId(e.target.value)}
              className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              required
            >
              <option value="">Select source account...</option>
              {activeAccounts.map((acc) => (
                <option key={acc.id} value={acc.id} disabled={acc.id === toAccountId}>
                  {acc.name} ({formatCurrency(acc.derivedBalance)})
                </option>
              ))}
            </select>
            {selectedFromAccount && (
              <p className="text-xs text-slate-400 mt-1">
                Available:{' '}
                <span className="font-semibold text-emerald-400">
                  {formatCurrency(selectedFromAccount.derivedBalance)}
                </span>
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              To Account (Credit) *
            </label>
            <select
              value={toAccountId}
              onChange={(e) => setToAccountId(e.target.value)}
              className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              required
            >
              <option value="">Select destination account...</option>
              {activeAccounts.map((acc) => (
                <option key={acc.id} value={acc.id} disabled={acc.id === fromAccountId}>
                  {acc.name} ({formatCurrency(acc.derivedBalance)})
                </option>
              ))}
            </select>
            {selectedToAccount && (
              <p className="text-xs text-slate-400 mt-1">
                Current:{' '}
                <span className="font-semibold text-slate-300">
                  {formatCurrency(selectedToAccount.derivedBalance)}
                </span>
              </p>
            )}
          </div>
        </div>

        {/* Transfer Amount and Date */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Input
              label="Transfer Amount (₹) *"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
            {isInsufficient && (
              <div className="flex items-center gap-1.5 text-xs text-rose-400 mt-1">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Exceeds available balance</span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Transfer Date *</label>
            <input
              type="date"
              value={transferDate}
              onChange={(e) => setTransferDate(e.target.value)}
              className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              required
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">Transfer Reference / Notes</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g., Cash deposited to Bank, ATM withdrawal, Cheque clearance..."
            className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            isLoading={loading}
            disabled={!fromAccountId || !toAccountId || numAmount <= 0 || isInsufficient}
          >
            <ArrowRightLeft className="w-4 h-4 mr-1.5" />
            Complete Transfer
          </Button>
        </div>
      </form>
    </Modal>
  );
};
