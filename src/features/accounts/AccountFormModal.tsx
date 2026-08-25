import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { financialAccountService } from '../../services/financialAccountService';
import type { FinancialAccount, FinancialAccountType, CreateFinancialAccountPayload } from '../../types';
import { Landmark, Wallet, CreditCard, Smartphone, HelpCircle } from 'lucide-react';

interface AccountFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  businessId: string;
  accountToEdit?: FinancialAccount | null;
  onSaved: () => void;
}

export const AccountFormModal: React.FC<AccountFormModalProps> = ({
  isOpen,
  onClose,
  businessId,
  accountToEdit,
  onSaved,
}) => {
  const { showSuccess, showError } = useToast();
  const isEditing = Boolean(accountToEdit);

  const [name, setName] = useState('');
  const [type, setType] = useState<FinancialAccountType>('CASH');
  const [bankName, setBankName] = useState('');
  const [accountNumberLast4, setAccountNumberLast4] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');
  const [notes, setNotes] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (accountToEdit) {
      setName(accountToEdit.name);
      setType(accountToEdit.type);
      setBankName(accountToEdit.bankName || '');
      setAccountNumberLast4(accountToEdit.accountNumberLast4 || '');
      setNotes(accountToEdit.notes || '');
      setIsDefault(accountToEdit.isDefault);
      setOpeningBalance('');
    } else {
      setName('');
      setType('CASH');
      setBankName('');
      setAccountNumberLast4('');
      setOpeningBalance('');
      setNotes('');
      setIsDefault(false);
    }
  }, [accountToEdit, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showError('Please enter an account name.');
      return;
    }

    setSaving(true);
    try {
      if (isEditing && accountToEdit) {
        await financialAccountService.updateAccount(accountToEdit.id, {
          name: name.trim(),
          type,
          bankName: type === 'BANK' ? bankName.trim() || undefined : undefined,
          accountNumberLast4: type === 'BANK' ? accountNumberLast4.trim() || undefined : undefined,
          notes: notes.trim() || undefined,
          isDefault,
        });
        showSuccess('Account updated successfully');
      } else {
        const payload: CreateFinancialAccountPayload = {
          name: name.trim(),
          type,
          bankName: type === 'BANK' ? bankName.trim() || undefined : undefined,
          accountNumberLast4: type === 'BANK' ? accountNumberLast4.trim() || undefined : undefined,
          openingBalance: openingBalance ? parseFloat(openingBalance) : 0,
          notes: notes.trim() || undefined,
          isDefault,
        };
        await financialAccountService.createAccount(businessId, payload);
        showSuccess('Financial account created successfully');
      }

      onSaved();
      onClose();
    } catch (err: any) {
      showError(err.message || 'Failed to save account');
    } finally {
      setSaving(false);
    }
  };

  const accountTypes: { type: FinancialAccountType; label: string; icon: any }[] = [
    { type: 'CASH', label: 'Cash in Hand', icon: Wallet },
    { type: 'BANK', label: 'Bank Account', icon: Landmark },
    { type: 'UPI', label: 'UPI / QR Code', icon: Smartphone },
    { type: 'DIGITAL_WALLET', label: 'Digital Wallet', icon: CreditCard },
    { type: 'OTHER', label: 'Other', icon: HelpCircle },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Financial Account' : 'Add Financial Account'}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Account Type Selection */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Account Type
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {accountTypes.map((item) => {
              const Icon = item.icon;
              const isSelected = type === item.type;
              return (
                <button
                  type="button"
                  key={item.type}
                  onClick={() => setType(item.type)}
                  className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs font-medium transition-all ${
                    isSelected
                      ? 'bg-blue-600/20 border-blue-500/50 text-blue-400 font-semibold'
                      : 'bg-slate-800/50 border-slate-700/50 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isSelected ? 'text-blue-400' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Account Name */}
        <Input
          label="Account Name *"
          placeholder={
            type === 'CASH'
              ? 'e.g., Main Cash Drawer, Register 1'
              : type === 'BANK'
              ? 'e.g., HDFC Current Account'
              : 'e.g., Shop PhonePe / Google Pay'
          }
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />

        {/* Bank details if Bank */}
        {type === 'BANK' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Bank Name"
              placeholder="e.g., HDFC, SBI, ICICI"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
            />
            <Input
              label="Account Number (Last 4 Digits)"
              placeholder="e.g., 4589"
              maxLength={4}
              value={accountNumberLast4}
              onChange={(e) => setAccountNumberLast4(e.target.value.replace(/\D/g, ''))}
            />
          </div>
        )}

        {/* Opening Balance (Only for new accounts) */}
        {!isEditing && (
          <div>
            <Input
              label="Opening Balance (₹)"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
            />
            <p className="text-xs text-slate-400 mt-1">
              Starting funds available in this account right now. Creates an immutable OPENING_BALANCE movement.
            </p>
          </div>
        )}

        {/* Default Account Checkbox */}
        <div className="flex items-center gap-2.5 pt-1">
          <input
            type="checkbox"
            id="isDefaultAccount"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900"
          />
          <label htmlFor="isDefaultAccount" className="text-sm font-medium text-slate-200 cursor-pointer">
            Set as default primary account for this business
          </label>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">Notes / Description</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional details or internal notes..."
            className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
        </div>

        {/* Form Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" isLoading={saving}>
            {isEditing ? 'Save Changes' : 'Create Account'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
