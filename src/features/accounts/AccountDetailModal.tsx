import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import { financialAccountService } from '../../services/financialAccountService';
import type { FinancialAccount, FinancialMovement } from '../../types';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import {
  Wallet,
  Landmark,
  Smartphone,
  CreditCard,
  HelpCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Star,
  Archive,
  RotateCcw,
  Edit2,
  Calendar,
  Layers,
} from 'lucide-react';

interface AccountDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  businessId: string;
  accountId: string | null;
  onEditAccount: (account: FinancialAccount) => void;
  onAccountChanged: () => void;
}

export const AccountDetailModal: React.FC<AccountDetailModalProps> = ({
  isOpen,
  onClose,
  businessId,
  accountId,
  onEditAccount,
  onAccountChanged,
}) => {
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<FinancialAccount | null>(null);
  const [derivedBalance, setDerivedBalance] = useState(0);
  const [movements, setMovements] = useState<FinancialMovement[]>([]);

  const loadData = async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const data = await financialAccountService.getAccountDetailsWithMovements(accountId);
      if (data) {
        setAccount(data.account);
        setDerivedBalance(data.derivedBalance);
        setMovements(data.movements);
      }
    } catch (err: any) {
      showError(err.message || 'Failed to load account details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && accountId) {
      loadData();
    }
  }, [isOpen, accountId]);

  if (!account) return null;

  const handleSetDefault = async () => {
    try {
      await financialAccountService.setDefaultAccount(businessId, account.id);
      showSuccess(`"${account.name}" set as default account.`);
      await loadData();
      onAccountChanged();
    } catch (err: any) {
      showError(err.message || 'Failed to set default account');
    }
  };

  const handleArchive = async () => {
    try {
      if (account.isArchived) {
        await financialAccountService.restoreAccount(account.id);
        showSuccess(`"${account.name}" restored successfully.`);
      } else {
        await financialAccountService.archiveAccount(account.id);
        showSuccess(`"${account.name}" archived.`);
      }
      await loadData();
      onAccountChanged();
    } catch (err: any) {
      showError(err.message || 'Failed to update archive state');
    }
  };

  const getAccountIcon = (type: string) => {
    switch (type) {
      case 'CASH':
        return Wallet;
      case 'BANK':
        return Landmark;
      case 'UPI':
        return Smartphone;
      case 'DIGITAL_WALLET':
        return CreditCard;
      default:
        return HelpCircle;
    }
  };

  const IconComponent = getAccountIcon(account.type);

  // Totals for this account
  const totalIn = movements
    .filter((m) => m.direction === 'IN')
    .reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
  const totalOut = movements
    .filter((m) => m.direction === 'OUT')
    .reduce((sum, m) => sum + (Number(m.amount) || 0), 0);

  const formatMovementType = (type: string) => {
    switch (type) {
      case 'CUSTOMER_PAYMENT':
        return 'Customer Payment';
      case 'CUSTOMER_PAYMENT_REVERSAL':
        return 'Payment Reversal';
      case 'SUPPLIER_PAYMENT':
        return 'Supplier Payment';
      case 'SUPPLIER_PAYMENT_REVERSAL':
        return 'Supplier Reversal';
      case 'REFUND_TO_CUSTOMER':
        return 'Customer Refund';
      case 'REFUND_FROM_SUPPLIER':
        return 'Supplier Refund';
      case 'EXPENSE':
        return 'Expense';
      case 'EXPENSE_REVERSAL':
        return 'Expense Reversal';
      case 'TRANSFER_IN':
        return 'Transfer In';
      case 'TRANSFER_OUT':
        return 'Transfer Out';
      case 'TRANSFER_REVERSAL_IN':
        return 'Transfer Reversal In';
      case 'TRANSFER_REVERSAL_OUT':
        return 'Transfer Reversal Out';
      case 'OPENING_BALANCE':
        return 'Opening Balance';
      case 'ADJUSTMENT':
        return 'Adjustment';
      case 'LEGACY_MAPPING':
        return 'Legacy Mapped';
      default:
        return type;
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Account Ledger & Details" maxWidth="lg">
      <div className="space-y-5">
        {/* Account Header Banner */}
        <div className="p-4 sm:p-5 rounded-2xl bg-linear-to-br from-slate-50 to-blue-50/40 border border-slate-200/90 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 font-bold">
              <IconComponent className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-slate-900">{account.name}</h3>
                {account.isDefault && (
                  <Badge variant="success" size="sm">
                    Default
                  </Badge>
                )}
                {account.isArchived && (
                  <Badge variant="danger" size="sm">
                    Archived
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {account.type}
                {account.bankName ? ` · ${account.bankName}` : ''}
                {account.accountNumberLast4 ? ` (•••• ${account.accountNumberLast4})` : ''}
              </p>
            </div>
          </div>

          <div className="text-left sm:text-right sm:border-l sm:border-slate-200 sm:pl-4">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">
              Derived Ledger Balance
            </span>
            <span
              className={`text-xl sm:text-2xl font-black font-mono ${
                derivedBalance >= 0 ? 'text-slate-900' : 'text-rose-600'
              }`}
            >
              {formatCurrency(derivedBalance)}
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-b border-slate-100 pb-3">
          {!account.isDefault && !account.isArchived && (
            <Button size="sm" variant="secondary" onClick={handleSetDefault}>
              <Star className="w-3.5 h-3.5 mr-1.5 text-amber-500" />
              Set as Default
            </Button>
          )}

          <Button size="sm" variant="secondary" onClick={() => onEditAccount(account)}>
            <Edit2 className="w-3.5 h-3.5 mr-1.5" />
            Edit Account
          </Button>

          {!account.isDefault && (
            <Button
              size="sm"
              variant={account.isArchived ? 'secondary' : 'danger'}
              onClick={handleArchive}
            >
              {account.isArchived ? (
                <>
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                  Restore Account
                </>
              ) : (
                <>
                  <Archive className="w-3.5 h-3.5 mr-1.5" />
                  Archive Account
                </>
              )}
            </Button>
          )}
        </div>

        {/* In / Out Statistics */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">
              Total Inflow (Credits)
            </span>
            <div className="flex items-center gap-1.5 text-base font-black font-mono text-emerald-600">
              <ArrowDownLeft className="w-4 h-4" />
              <span>+{formatCurrency(totalIn)}</span>
            </div>
          </div>

          <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">
              Total Outflow (Debits)
            </span>
            <div className="flex items-center gap-1.5 text-base font-black font-mono text-rose-600">
              <ArrowUpRight className="w-4 h-4" />
              <span>-{formatCurrency(totalOut)}</span>
            </div>
          </div>
        </div>

        {/* Append-Only Ledger Activity */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-600" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Financial Movement Ledger ({movements.length})
              </h4>
            </div>
            <span className="text-[11px] text-slate-400">Strictly append-only & immutable</span>
          </div>

          {movements.length === 0 ? (
            <div className="p-6 text-center rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500">
              No financial movements recorded for this account yet.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white max-h-72 overflow-y-auto shadow-2xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 sticky top-0 backdrop-blur-xs">
                  <tr>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Description</th>
                    <th className="py-2.5 px-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {movements.map((mov) => {
                    const isIn = mov.direction === 'IN';
                    return (
                      <tr key={mov.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                          {formatDateTime(mov.movementDate)}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold tracking-tight inline-block ${
                              isIn
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {formatMovementType(mov.type)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 max-w-xs truncate text-slate-800">
                          {mov.description || '—'}
                        </td>
                        <td
                          className={`py-2.5 px-3 text-right font-black font-mono whitespace-nowrap ${
                            isIn ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          {isIn ? '+' : '-'}
                          {formatCurrency(mov.amount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
