import React, { useState, useEffect, useCallback } from 'react';
import { useBusiness } from '../../contexts/BusinessContext';
import { useToast } from '../../components/ui/Toast';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { AccountFormModal } from './AccountFormModal';
import { AccountTransferModal } from './AccountTransferModal';
import { AccountDetailModal } from './AccountDetailModal';
import { ReverseTransferModal } from './ReverseTransferModal';
import { financialAccountService } from '../../services/financialAccountService';
import { accountTransferService } from '../../services/accountTransferService';
import type {
  FinancialAccount,
  FinancialAccountWithBalance,
  AccountTransferWithDetails,
} from '../../types';
import { formatCurrency, formatDate, formatDateTime } from '../../utils/formatters';
import {
  Wallet,
  Landmark,
  Smartphone,
  CreditCard,
  HelpCircle,
  Plus,
  ArrowRightLeft,
  Search,
  RotateCcw,
  Star,
  ChevronRight,
  TrendingUp,
  Layers,
  Building,
} from 'lucide-react';

export const AccountsView: React.FC = () => {
  const { business } = useBusiness();
  const { showError } = useToast();

  const [accounts, setAccounts] = useState<FinancialAccountWithBalance[]>([]);
  const [transfers, setTransfers] = useState<AccountTransferWithDetails[]>([]);
  const [activeTab, setActiveTab] = useState<'ACCOUNTS' | 'TRANSFERS'>('ACCOUNTS');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [accountToEdit, setAccountToEdit] = useState<FinancialAccount | null>(null);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [initialFromAccountId, setInitialFromAccountId] = useState<string | undefined>(undefined);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [transferToReverse, setTransferToReverse] = useState<AccountTransferWithDetails | null>(null);

  const loadData = useCallback(async () => {
    if (!business) return;
    setLoading(true);
    try {
      const [accs, trfs] = await Promise.all([
        financialAccountService.getAccountsWithBalance(business.id),
        accountTransferService.getTransfers(business.id),
      ]);
      setAccounts(accs);
      setTransfers(trfs);
    } catch (err: any) {
      showError(err.message || 'Failed to load accounts');
    } finally {
      setLoading(false);
    }
  }, [business, showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!business) return null;

  const totalLiquid = accounts
    .filter((a) => !a.isArchived)
    .reduce((sum, a) => sum + (Number(a.derivedBalance) || 0), 0);
  const cashTotal = accounts
    .filter((a) => !a.isArchived && a.type === 'CASH')
    .reduce((sum, a) => sum + (Number(a.derivedBalance) || 0), 0);
  const bankTotal = accounts
    .filter((a) => !a.isArchived && (a.type === 'BANK' || a.type === 'UPI'))
    .reduce((sum, a) => sum + (Number(a.derivedBalance) || 0), 0);

  const filteredAccounts = accounts.filter((a) =>
    a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (a.bankName && a.bankName.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const filteredTransfers = transfers.filter((t) =>
    t.transfer.transferNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.transfer.fromAccountNameSnapshot.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.transfer.toAccountNameSnapshot.toLowerCase().includes(searchQuery.toLowerCase())
  );

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

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header Banner & Stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <Landmark className="w-7 h-7 text-blue-400" />
            <span>Financial Accounts & Funds</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Multi-account cash, bank, and UPI liquidity tracking with pure ledger-derived balances.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="secondary"
            onClick={() => {
              setInitialFromAccountId(undefined);
              setIsTransferModalOpen(true);
            }}
          >
            <ArrowRightLeft className="w-4 h-4 mr-1.5" />
            Transfer Funds
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              setAccountToEdit(null);
              setIsAccountModalOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Add Account
          </Button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700/80 shadow-md">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Total Liquid Balance
          </span>
          <div className="text-2xl font-black text-emerald-400">
            {formatCurrency(totalLiquid)}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            Across {accounts.filter((a) => !a.isArchived).length} active accounts
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700/80 shadow-md">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Cash in Hand
          </span>
          <div className="text-2xl font-black text-white">
            {formatCurrency(cashTotal)}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            Physical currency & registers
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700/80 shadow-md">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Bank & UPI Balances
          </span>
          <div className="text-2xl font-black text-blue-400">
            {formatCurrency(bankTotal)}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            Current accounts & digital wallets
          </span>
        </div>
      </div>

      {/* Tabs & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('ACCOUNTS')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'ACCOUNTS'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            Accounts ({accounts.length})
          </button>
          <button
            onClick={() => setActiveTab('TRANSFERS')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'TRANSFERS'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            Transfers ({transfers.length})
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search accounts or transfers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-800/80 border border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
        </div>
      </div>

      {/* Accounts Tab */}
      {activeTab === 'ACCOUNTS' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAccounts.map((acc) => {
            const Icon = getAccountIcon(acc.type);
            return (
              <div
                key={acc.id}
                onClick={() => setSelectedAccountId(acc.id)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer group hover:border-blue-500/50 hover:bg-slate-800/90 ${
                  acc.isArchived
                    ? 'bg-slate-900/40 border-slate-800/80 opacity-60'
                    : 'bg-slate-800/70 border-slate-700/70'
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400 group-hover:scale-105 transition-transform">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-bold text-white text-sm group-hover:text-blue-300 transition-colors">
                          {acc.name}
                        </h3>
                        {acc.isDefault && (
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 shrink-0" />
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400 block">
                        {acc.type} {acc.bankName ? `• ${acc.bankName}` : ''}
                      </span>
                    </div>
                  </div>

                  {acc.isArchived && (
                    <Badge variant="neutral" className="text-[10px]">
                      Archived
                    </Badge>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-700/50 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                      Derived Balance
                    </span>
                    <span
                      className={`text-lg font-black ${
                        acc.derivedBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {formatCurrency(acc.derivedBalance)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 text-xs text-blue-400 font-semibold group-hover:translate-x-0.5 transition-transform">
                    <span>View Ledger</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
            );
          })}

          {filteredAccounts.length === 0 && (
            <div className="col-span-full p-8 text-center rounded-2xl bg-slate-800/30 border border-slate-800 text-sm text-slate-400">
              No financial accounts match your criteria.
            </div>
          )}
        </div>
      )}

      {/* Transfers Tab */}
      {activeTab === 'TRANSFERS' && (
        <div className="rounded-2xl border border-slate-700/80 bg-slate-900/60 overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/80 text-slate-400 font-semibold border-b border-slate-700">
                <tr>
                  <th className="py-3 px-4">Transfer #</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">From Account</th>
                  <th className="py-3 px-4">To Account</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {filteredTransfers.map((item) => {
                  const t = item.transfer;
                  return (
                    <tr key={t.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4 font-bold text-white whitespace-nowrap">
                        {t.transferNumber}
                      </td>
                      <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                        {formatDate(t.transferDate)}
                      </td>
                      <td className="py-3 px-4 font-medium text-rose-300">
                        {t.fromAccountNameSnapshot}
                      </td>
                      <td className="py-3 px-4 font-medium text-emerald-300">
                        {t.toAccountNameSnapshot}
                      </td>
                      <td className="py-3 px-4 text-right font-black text-white whitespace-nowrap">
                        {formatCurrency(t.amount)}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {item.isReversed ? (
                          <Badge variant="danger" className="text-[10px]">
                            Reversed
                          </Badge>
                        ) : (
                          <Badge variant="success" className="text-[10px]">
                            Completed
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {!item.isReversed && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setTransferToReverse(item)}
                            className="text-rose-400 hover:text-rose-300"
                          >
                            <RotateCcw className="w-3.5 h-3.5 mr-1" />
                            Reverse
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {filteredTransfers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No account transfers recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Account Modals */}
      <AccountFormModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        businessId={business.id}
        accountToEdit={accountToEdit}
        onSaved={loadData}
      />

      <AccountTransferModal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        businessId={business.id}
        accounts={accounts}
        initialFromAccountId={initialFromAccountId}
        onTransferCompleted={loadData}
      />

      <AccountDetailModal
        isOpen={Boolean(selectedAccountId)}
        onClose={() => setSelectedAccountId(null)}
        businessId={business.id}
        accountId={selectedAccountId}
        onEditAccount={(acc) => {
          setAccountToEdit(acc);
          setIsAccountModalOpen(true);
        }}
        onAccountChanged={loadData}
      />

      <ReverseTransferModal
        isOpen={Boolean(transferToReverse)}
        onClose={() => setTransferToReverse(null)}
        businessId={business.id}
        transferDetails={transferToReverse}
        onReversed={loadData}
      />
    </div>
  );
};
