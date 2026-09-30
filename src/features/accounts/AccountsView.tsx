import React, { useState, useEffect, useCallback } from 'react';
import { useBusiness } from '../../contexts/BusinessContext';
import { useToast } from '../../components/ui/Toast';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { AccountFormModal } from './AccountFormModal';
import { AccountTransferModal } from './AccountTransferModal';
import { AccountDetailModal } from './AccountDetailModal';
import { ReverseTransferModal } from './ReverseTransferModal';
import { DailyGallaModal } from './DailyGallaModal';
import { EODReceiptModal } from './EODReceiptModal';
import { financialAccountService } from '../../services/financialAccountService';
import { accountTransferService } from '../../services/accountTransferService';
import { cashDrawerService, type DrawerLiveStatus } from '../../services/cashDrawerService';
import type {
  FinancialAccount,
  FinancialAccountWithBalance,
  AccountTransferWithDetails,
  CashDrawerSession,
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
  TrendingDown,
  Layers,
  Building,
  Coins,
  Receipt,
  Calendar,
  Printer,
  CheckCircle2,
} from 'lucide-react';

export const AccountsView: React.FC = () => {
  const { business } = useBusiness();
  const { showError } = useToast();

  const [accounts, setAccounts] = useState<FinancialAccountWithBalance[]>([]);
  const [transfers, setTransfers] = useState<AccountTransferWithDetails[]>([]);
  const [gallaSessions, setGallaSessions] = useState<CashDrawerSession[]>([]);
  const [gallaLiveStatus, setGallaLiveStatus] = useState<DrawerLiveStatus | null>(null);
  const [activeTab, setActiveTab] = useState<'ACCOUNTS' | 'TRANSFERS' | 'GALLA'>('ACCOUNTS');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [accountToEdit, setAccountToEdit] = useState<FinancialAccount | null>(null);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [initialFromAccountId, setInitialFromAccountId] = useState<string | undefined>(undefined);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [transferToReverse, setTransferToReverse] = useState<AccountTransferWithDetails | null>(null);
  const [isGallaModalOpen, setIsGallaModalOpen] = useState(false);
  const [selectedEODSession, setSelectedEODSession] = useState<CashDrawerSession | null>(null);

  const loadData = useCallback(async () => {
    if (!business) return;
    setLoading(true);
    try {
      const [accs, trfs, sessions, live] = await Promise.all([
        financialAccountService.getAccountsWithBalance(business.id),
        accountTransferService.getTransfers(business.id),
        cashDrawerService.getPastSessions(business.id),
        cashDrawerService.getDrawerLiveStatus(business.id).catch(() => null),
      ]);
      setAccounts(accs);
      setTransfers(trfs);
      setGallaSessions(sessions);
      setGallaLiveStatus(live);
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

  // Deduplicate sessions by calendar date (one-per-day rule, showing latest updated session)
  const uniqueSessionsMap = new Map<string, CashDrawerSession>();
  for (const s of gallaSessions) {
    if (!uniqueSessionsMap.has(s.sessionDate)) {
      uniqueSessionsMap.set(s.sessionDate, s);
    }
  }
  const uniqueGallaSessions = Array.from(uniqueSessionsMap.values());

  const filteredGallaSessions = uniqueGallaSessions.filter((s) =>
    s.sessionNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.sessionDate.includes(searchQuery) ||
    (s.notes && s.notes.toLowerCase().includes(searchQuery.toLowerCase()))
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
    <div className="space-y-6 pb-12">
      {/* Header Banner & Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Landmark className="w-7 h-7 text-blue-600" />
            <span>Financial Accounts & Funds</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Multi-account cash, bank, and UPI liquidity tracking with pure ledger-derived balances.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
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

          {gallaLiveStatus?.isClosedToday ? (
            <div className="flex items-center gap-1.5">
              <Button
                variant="secondary"
                onClick={() => setSelectedEODSession(gallaLiveStatus.todaySession || null)}
                className="text-emerald-700 border-emerald-200 hover:bg-emerald-50 text-xs"
                title="View Today's Z-Report"
              >
                <Receipt className="w-4 h-4 mr-1.5 text-emerald-600" />
                Today&apos;s Z-Report
              </Button>
              <Button
                variant="primary"
                onClick={() => setIsGallaModalOpen(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs text-xs"
                title="Re-close & Update Today's Galla"
              >
                <RotateCcw className="w-4 h-4 mr-1.5" />
                Update Galla
              </Button>
            </div>
          ) : (
            <Button
              variant="primary"
              onClick={() => setIsGallaModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
            >
              <Wallet className="w-4 h-4 mr-1.5" />
              Close Galla
            </Button>
          )}

          <Button
            variant="secondary"
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
              Total Liquid Balance
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono text-emerald-600">
            {formatCurrency(totalLiquid)}
          </div>
          <span className="text-[11px] text-slate-400 block">
            Across {accounts.filter((a) => !a.isArchived).length} active accounts
          </span>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
              Cash in Hand
            </span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono text-slate-900">
            {formatCurrency(cashTotal)}
          </div>
          <span className="text-[11px] text-slate-400 block">
            Physical currency & registers
          </span>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
              Bank & UPI Balances
            </span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Landmark className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono text-blue-600">
            {formatCurrency(bankTotal)}
          </div>
          <span className="text-[11px] text-slate-400 block">
            Current accounts & digital wallets
          </span>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder={
              activeTab === 'GALLA'
                ? 'Search galla sessions...'
                : 'Search accounts or transfers...'
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 shadow-xs"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          <button
            onClick={() => setActiveTab('ACCOUNTS')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              activeTab === 'ACCOUNTS'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Accounts ({accounts.length})
          </button>
          <button
            onClick={() => setActiveTab('TRANSFERS')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              activeTab === 'TRANSFERS'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Transfers ({transfers.length})
          </button>
          <button
            onClick={() => setActiveTab('GALLA')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              activeTab === 'GALLA'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Daily Galla ({uniqueGallaSessions.length})
          </button>
        </div>
      </div>

      {/* Accounts Tab */}
      {activeTab === 'ACCOUNTS' && (
        filteredAccounts.length === 0 ? (
          <EmptyState
            icon={Landmark}
            title={searchQuery ? 'No financial accounts found' : 'No financial accounts setup'}
            description={
              searchQuery
                ? 'Try searching with a different account or bank name.'
                : 'Create accounts to track cash registers, bank current accounts, and digital UPI wallets.'
            }
            actionLabel={searchQuery ? undefined : 'Add Account'}
            onAction={
              searchQuery
                ? undefined
                : () => {
                    setAccountToEdit(null);
                    setIsAccountModalOpen(true);
                  }
            }
            actionIcon={Plus}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAccounts.map((acc) => {
              const Icon = getAccountIcon(acc.type);
              return (
                <div
                  key={acc.id}
                  onClick={() => setSelectedAccountId(acc.id)}
                  className={`p-5 rounded-2xl border transition-all cursor-pointer group hover:border-blue-400 hover:shadow-xs ${
                    acc.isArchived
                      ? 'bg-slate-50 border-slate-200 opacity-60'
                      : 'bg-white border-slate-200 shadow-2xs'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h3 className="font-bold text-slate-900 text-sm group-hover:text-blue-600 transition-colors">
                            {acc.name}
                          </h3>
                          {acc.isDefault && (
                            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 shrink-0" />
                          )}
                        </div>
                        <span className="text-[11px] text-slate-500 block">
                          {acc.type} {acc.bankName ? `• ${acc.bankName}` : ''}
                        </span>
                      </div>
                    </div>

                    {acc.isArchived && (
                      <Badge variant="neutral" size="sm">
                        Archived
                      </Badge>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                        Derived Balance
                      </span>
                      <span
                        className={`text-lg font-black font-mono ${
                          acc.derivedBalance >= 0 ? 'text-slate-900' : 'text-rose-600'
                        }`}
                      >
                        {formatCurrency(acc.derivedBalance)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {acc.type === 'CASH' && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsGallaModalOpen(true);
                          }}
                          className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1 transition-all ${
                            gallaLiveStatus?.isClosedToday
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                              : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                          }`}
                          title={
                            gallaLiveStatus?.isClosedToday
                              ? "Galla closed today. Click to re-close / update"
                              : "Count & Close Cash Drawer"
                          }
                        >
                          {gallaLiveStatus?.isClosedToday ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Closed</span>
                            </>
                          ) : (
                            <>
                              <Coins className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Galla</span>
                            </>
                          )}
                        </button>
                      )}
                      <div className="flex items-center gap-1 text-xs text-blue-600 font-semibold group-hover:translate-x-0.5 transition-transform">
                        <span>View Ledger</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Transfers Tab */}
      {activeTab === 'TRANSFERS' && (
        filteredTransfers.length === 0 ? (
          <EmptyState
            icon={ArrowRightLeft}
            title={searchQuery ? 'No account transfers found' : 'No transfers recorded yet'}
            description={
              searchQuery
                ? 'Try changing the search query.'
                : 'Transfer funds between cash drawer, bank accounts, and digital wallets with pure ledger reconciliation.'
            }
            actionLabel={searchQuery ? undefined : 'Transfer Funds'}
            onAction={
              searchQuery
                ? undefined
                : () => {
                    setInitialFromAccountId(undefined);
                    setIsTransferModalOpen(true);
                  }
            }
            actionIcon={ArrowRightLeft}
          />
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
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
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredTransfers.map((item) => {
                    const t = item.transfer;
                    return (
                      <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-bold text-slate-900 font-mono whitespace-nowrap">
                          {t.transferNumber}
                        </td>
                        <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                          {formatDate(t.transferDate)}
                        </td>
                        <td className="py-3 px-4 font-medium text-rose-700">
                          {t.fromAccountNameSnapshot}
                        </td>
                        <td className="py-3 px-4 font-medium text-emerald-700">
                          {t.toAccountNameSnapshot}
                        </td>
                        <td className="py-3 px-4 text-right font-black font-mono text-slate-900 whitespace-nowrap">
                          {formatCurrency(t.amount)}
                        </td>
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          {item.isReversed ? (
                            <Badge variant="danger" size="sm">
                              Reversed
                            </Badge>
                          ) : (
                            <Badge variant="success" size="sm">
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
                              className="text-rose-600 hover:text-rose-700"
                            >
                              <RotateCcw className="w-3.5 h-3.5 mr-1" />
                              Reverse
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* Daily Galla Tab */}
      {activeTab === 'GALLA' && (
        <div className="space-y-6">
          {/* Live Drawer Status Banner */}
          <div className="p-5 rounded-2xl bg-linear-to-br from-emerald-50/70 via-slate-50/40 to-blue-50/30 border border-emerald-200/80 shadow-xs">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      gallaLiveStatus?.isClosedToday ? 'bg-emerald-600' : 'bg-emerald-500 animate-pulse'
                    }`}
                  />
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                    {gallaLiveStatus?.isClosedToday
                      ? "Today's Galla Closed (1-per-day)"
                      : 'Live Cash Drawer Status (Active Session)'}
                  </span>
                  {gallaLiveStatus?.isClosedToday && gallaLiveStatus.todaySession && (
                    <Badge variant="success" size="sm">
                      {gallaLiveStatus.todaySession.sessionNumber} • {formatDateTime(gallaLiveStatus.todaySession.closedAt)}
                    </Badge>
                  )}
                </div>
                <h3 className="text-xl font-black text-slate-900 font-mono">
                  Expected Drawer Cash: {formatCurrency(gallaLiveStatus?.expectedDrawerCash || cashTotal)}
                </h3>
                <p className="text-xs text-slate-500 max-w-xl">
                  {gallaLiveStatus?.isClosedToday
                    ? "Galla was closed earlier today. If you made more sales or received cash, click 'Update Galla' to refresh today's single Z-Report."
                    : 'Computed in real-time from opening float + cash sales, khata collections, expenses, and withdrawals. Register operates continuously without blocking sales.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 shadow-2xs">
                  <span className="text-[10px] text-slate-500 font-semibold uppercase block">
                    Starting Float
                  </span>
                  <span className="text-sm font-black font-mono text-slate-800">
                    {formatCurrency(gallaLiveStatus?.openingFloat || 0)}
                  </span>
                </div>
                <div className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 shadow-2xs">
                  <span className="text-[10px] text-emerald-700 font-semibold uppercase block">
                    + Inflows
                  </span>
                  <span className="text-sm font-black font-mono text-emerald-600">
                    +{formatCurrency(gallaLiveStatus?.totalCashIn || 0)}
                  </span>
                </div>
                <div className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 shadow-2xs">
                  <span className="text-[10px] text-rose-700 font-semibold uppercase block">
                    - Outflows
                  </span>
                  <span className="text-sm font-black font-mono text-rose-600">
                    -{formatCurrency(gallaLiveStatus?.totalCashOut || 0)}
                  </span>
                </div>

                {gallaLiveStatus?.isClosedToday ? (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => setSelectedEODSession(gallaLiveStatus.todaySession || null)}
                      className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 font-bold px-3 py-2 text-xs"
                    >
                      <Receipt className="w-4 h-4 mr-1.5" />
                      View Z-Report
                    </Button>
                    <Button
                      variant="primary"
                      onClick={() => setIsGallaModalOpen(true)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3.5 py-2 text-xs shadow-xs"
                    >
                      <RotateCcw className="w-4 h-4 mr-1.5" />
                      Re-close & Update
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="primary"
                    onClick={() => setIsGallaModalOpen(true)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 shadow-xs"
                  >
                    <Coins className="w-4 h-4 mr-1.5" />
                    Count & Close Galla
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Past Galla Closures Table */}
          {filteredGallaSessions.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title={searchQuery ? 'No galla sessions found' : 'No galla closures recorded yet'}
              description={
                searchQuery
                  ? 'Try searching with another keyword or date.'
                  : 'Close your physical cash drawer at end-of-day to generate audited Z-Reports, tally denominations, and carry forward tomorrow\'s float.'
              }
              actionLabel={searchQuery ? undefined : 'Count & Close Galla'}
              onAction={searchQuery ? undefined : () => setIsGallaModalOpen(true)}
              actionIcon={Coins}
            />
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
              <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-emerald-600" />
                    Past Cash Drawer Closures & Z-Reports
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Historical record of all physical register counts, discrepancy audits, and float rollovers.
                  </p>
                </div>
                <span className="text-xs font-semibold text-slate-600 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                  {filteredGallaSessions.length} Closed Sessions
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Session #</th>
                      <th className="py-3 px-4">Date & Time</th>
                      <th className="py-3 px-4 text-right">Start Float</th>
                      <th className="py-3 px-4 text-right">Expected</th>
                      <th className="py-3 px-4 text-right">Counted</th>
                      <th className="py-3 px-4 text-center">Discrepancy</th>
                      <th className="py-3 px-4 text-right">Next Float</th>
                      <th className="py-3 px-4 text-right">Take-Home</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {filteredGallaSessions.map((session) => {
                      const diff = session.difference || 0;
                      return (
                        <tr key={session.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-bold text-slate-900 font-mono whitespace-nowrap">
                            {session.sessionNumber}
                          </td>
                          <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                            {formatDateTime(session.closedAt)}
                          </td>
                          <td className="py-3 px-4 text-right font-medium font-mono text-slate-700 whitespace-nowrap">
                            {formatCurrency(session.openingFloat)}
                          </td>
                          <td className="py-3 px-4 text-right font-medium font-mono text-slate-700 whitespace-nowrap">
                            {formatCurrency(session.expectedCash)}
                          </td>
                          <td className="py-3 px-4 text-right font-black font-mono text-slate-900 whitespace-nowrap">
                            {formatCurrency(session.countedCash)}
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            {diff === 0 ? (
                              <Badge variant="success" size="sm">
                                Exact ₹0
                              </Badge>
                            ) : diff > 0 ? (
                              <Badge variant="info" size="sm">
                                Surplus +{formatCurrency(diff)}
                              </Badge>
                            ) : (
                              <Badge variant="danger" size="sm">
                                Shortage {formatCurrency(diff)}
                              </Badge>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-bold font-mono text-slate-700 whitespace-nowrap">
                            {formatCurrency(session.nextDayFloat || 0)}
                          </td>
                          <td className="py-3 px-4 text-right font-bold font-mono text-emerald-600 whitespace-nowrap">
                            {formatCurrency(session.takeHomeCash || 0)}
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setSelectedEODSession(session)}
                              className="text-emerald-700 hover:text-emerald-800 border-emerald-200 hover:bg-emerald-50"
                            >
                              <Printer className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                              Z-Report
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
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

      {/* Daily Galla Modals */}
      <DailyGallaModal
        isOpen={isGallaModalOpen}
        onClose={() => setIsGallaModalOpen(false)}
        businessId={business.id}
        onClosed={(session) => {
          loadData();
          setSelectedEODSession(session);
        }}
        onViewEODReport={(session) => {
          setSelectedEODSession(session);
        }}
      />

      <EODReceiptModal
        isOpen={Boolean(selectedEODSession)}
        onClose={() => setSelectedEODSession(null)}
        session={selectedEODSession}
        businessId={business.id}
        businessName={business.name}
      />
    </div>
  );
};
