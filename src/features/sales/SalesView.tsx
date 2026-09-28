import React, { useState, useEffect, useCallback } from 'react';
import { useBusiness } from '../../contexts/BusinessContext';
import { saleRepository } from '../../repositories/saleRepository';
import type { Sale } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { SaleDetailModal } from './SaleDetailModal';
import {
  Receipt,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  ExternalLink,
  Filter,
  TrendingUp,
  Wallet,
  Calendar,
  CreditCard,
} from 'lucide-react';

interface SalesViewProps {
  onNewSaleClick: () => void;
  initialSelectedSaleId?: string | null;
}

export const SalesView: React.FC<SalesViewProps> = ({
  onNewSaleClick,
  initialSelectedSaleId,
}) => {
  const { business } = useBusiness();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PAID' | 'UNPAID' | 'PARTIAL' | 'RETURNED' | 'VOIDED'>('ALL');

  // Detail Modal
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(initialSelectedSaleId || null);

  const loadSales = useCallback(async () => {
    if (!business) return;
    try {
      setLoading(true);
      const data = await saleRepository.getSales(business.id);
      setSales(data);
    } catch (err) {
      console.error('Failed to load sales', err);
    } finally {
      setLoading(false);
    }
  }, [business]);

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  useEffect(() => {
    if (initialSelectedSaleId) {
      setSelectedSaleId(initialSelectedSaleId);
    }
  }, [initialSelectedSaleId]);

  const filteredSales = sales.filter((sale) => {
    const matchesSearch =
      sale.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sale.customerNameSnapshot.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (statusFilter !== 'ALL' && sale.status !== statusFilter) return false;
    return true;
  });

  // Group sales for mobile (Today, Yesterday, Earlier)
  const todayStr = new Date().toISOString().slice(0, 10);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  const todayGroup = filteredSales.filter((s) => (s.saleDate || s.createdAt).slice(0, 10) === todayStr);
  const yesterdayGroup = filteredSales.filter((s) => (s.saleDate || s.createdAt).slice(0, 10) === yesterdayStr);
  const earlierGroup = filteredSales.filter(
    (s) => (s.saleDate || s.createdAt).slice(0, 10) !== todayStr && (s.saleDate || s.createdAt).slice(0, 10) !== yesterdayStr
  );

  // Executive KPI Calculations
  const validSales = sales.filter((s) => s.status !== 'VOIDED');
  const todaySales = validSales.filter(
    (s) => (s.saleDate || s.createdAt).slice(0, 10) === todayStr
  );
  const todayRevenue = todaySales.reduce((sum, s) => sum + s.totalAmount, 0);
  const todayCollected = todaySales.reduce((sum, s) => sum + s.paidAmount, 0);
  const totalKhataDue = validSales.reduce((sum, s) => sum + Math.max(0, s.dueAmount || 0), 0);
  const unpaidCount = validSales.filter((s) => s.status === 'UNPAID' || s.status === 'PARTIAL').length;

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Sales & Invoices</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Track daily revenue, issue receipts, and manage outstanding khata balances.
          </p>
        </div>
        <Button variant="primary" icon={Plus} onClick={onNewSaleClick} className="shadow-sm">
          + New Sale
        </Button>
      </div>

      {/* 2. Executive KPI Metrics Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Today's Sales */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
              Today's Sales
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono text-slate-900">
            {formatCurrency(todayRevenue, business?.currencySymbol)}
          </div>
          <p className="text-[11px] text-slate-400">
            {todaySales.length} invoice{todaySales.length === 1 ? '' : 's'} created today
          </p>
        </div>

        {/* Collected Today */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
              Collected Today
            </span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono text-slate-900">
            {formatCurrency(todayCollected, business?.currencySymbol)}
          </div>
          <p className="text-[11px] text-slate-400">Cash and digital receipts collected</p>
        </div>

        {/* Khata Receivables / Due */}
        <div
          onClick={() => setStatusFilter(statusFilter === 'UNPAID' ? 'ALL' : 'UNPAID')}
          className={`p-4 rounded-2xl border shadow-2xs space-y-1 transition-all cursor-pointer ${
            statusFilter === 'UNPAID' || statusFilter === 'PARTIAL'
              ? 'ring-2 ring-amber-500 bg-amber-50/80 border-amber-300'
              : totalKhataDue > 0
              ? 'bg-amber-50/30 border-amber-200 hover:bg-amber-50'
              : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
              Outstanding Khata Due
            </span>
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${totalKhataDue > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400'}`}>
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className={`text-xl sm:text-2xl font-black font-mono ${totalKhataDue > 0 ? 'text-amber-900' : 'text-slate-900'}`}>
            {formatCurrency(totalKhataDue, business?.currencySymbol)}
          </div>
          <p className="text-[11px] text-slate-400">
            {unpaidCount} unpaid/partial invoice{unpaidCount === 1 ? '' : 's'}
          </p>
        </div>

        {/* Total Invoices Count */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
              Total Invoices
            </span>
            <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono text-slate-900">
            {validSales.length}
          </div>
          <p className="text-[11px] text-slate-400">All-time recorded invoices</p>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by invoice number or customer name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 shadow-xs"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          {(['ALL', 'PAID', 'PARTIAL', 'UNPAID', 'RETURNED', 'VOIDED'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                statusFilter === st
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {st === 'ALL' ? 'All' : st} (
              {st === 'ALL' ? sales.length : sales.filter((s) => s.status === st).length})
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      {loading ? (
        <div className="py-16 text-center text-sm text-slate-500">Loading sales history...</div>
      ) : filteredSales.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={searchQuery ? 'No invoices found' : 'No sales recorded yet'}
          description={
            searchQuery
              ? 'Try changing the search keywords or status filter.'
              : 'Create your first sale to record transactions, issue invoices, and track revenue.'
          }
          actionLabel={searchQuery ? undefined : 'Create First Sale'}
          onAction={searchQuery ? undefined : onNewSaleClick}
          actionIcon={Plus}
        />
      ) : (
        <>
          {/* Mobile Grouped View */}
          <div className="space-y-4 md:hidden">
            {todayGroup.length > 0 && (
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2 px-1">
                  Today
                </span>
                <div className="space-y-2.5">
                  {todayGroup.map((sale) => (
                    <SaleMobileCard
                      key={sale.id}
                      sale={sale}
                      currencySymbol={business?.currencySymbol}
                      onClick={() => setSelectedSaleId(sale.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {yesterdayGroup.length > 0 && (
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2 px-1">
                  Yesterday
                </span>
                <div className="space-y-2.5">
                  {yesterdayGroup.map((sale) => (
                    <SaleMobileCard
                      key={sale.id}
                      sale={sale}
                      currencySymbol={business?.currencySymbol}
                      onClick={() => setSelectedSaleId(sale.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {earlierGroup.length > 0 && (
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2 px-1">
                  Earlier
                </span>
                <div className="space-y-2.5">
                  {earlierGroup.map((sale) => (
                    <SaleMobileCard
                      key={sale.id}
                      sale={sale}
                      currencySymbol={business?.currencySymbol}
                      onClick={() => setSelectedSaleId(sale.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/75 text-slate-500 text-xs font-bold uppercase tracking-wider">
                    <th className="py-3.5 px-5">Invoice #</th>
                    <th className="py-3.5 px-4">Customer</th>
                    <th className="py-3.5 px-4">Date</th>
                    <th className="py-3.5 px-4 text-right">Total Amount</th>
                    <th className="py-3.5 px-4 text-right">Paid</th>
                    <th className="py-3.5 px-4 text-right">Due</th>
                    <th className="py-3.5 px-4 text-center">Status</th>
                    <th className="py-3.5 px-5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredSales.map((sale) => (
                    <tr
                      key={sale.id}
                      onClick={() => setSelectedSaleId(sale.id)}
                      className={`hover:bg-slate-50/80 transition-colors cursor-pointer group ${
                        sale.status === 'VOIDED' ? 'opacity-60 bg-slate-50/40' : ''
                      }`}
                    >
                      <td className="py-3.5 px-5 font-bold font-mono text-slate-900 group-hover:text-blue-600">
                        {sale.invoiceNumber}
                      </td>

                      <td className="py-3.5 px-4 font-semibold text-slate-800">
                        {sale.customerNameSnapshot}
                      </td>

                      <td className="py-3.5 px-4 text-xs text-slate-500">
                        {formatDate(sale.saleDate || sale.createdAt)}
                      </td>

                      <td className="py-3.5 px-4 text-right font-bold text-slate-900 font-mono">
                        {formatCurrency(sale.totalAmount, business?.currencySymbol)}
                      </td>

                      <td className="py-3.5 px-4 text-right font-medium text-emerald-700 font-mono">
                        {formatCurrency(sale.paidAmount, business?.currencySymbol)}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono">
                        {sale.status === 'VOIDED' ? (
                          <span className="text-slate-400 text-xs">Voided</span>
                        ) : sale.status === 'RETURNED' ? (
                          <span className="text-amber-700 text-xs font-semibold">Returned</span>
                        ) : sale.dueAmount > 0 ? (
                          <span className="font-bold text-rose-600">
                            {formatCurrency(sale.dueAmount, business?.currencySymbol)}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">0</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <Badge
                          variant={
                            sale.status === 'VOIDED'
                              ? 'danger'
                              : sale.status === 'RETURNED'
                              ? 'neutral'
                              : sale.status === 'PAID'
                              ? 'success'
                              : sale.status === 'PARTIAL'
                              ? 'warning'
                              : 'danger'
                          }
                          size="sm"
                        >
                          {sale.status}
                        </Badge>
                      </td>

                      <td className="py-3.5 px-5 text-right">
                        <span className="text-xs font-semibold text-blue-600 group-hover:underline inline-flex items-center gap-1">
                          View <ExternalLink className="w-3 h-3" />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Sale Detail Invoice Modal */}
      <SaleDetailModal
        isOpen={!!selectedSaleId}
        onClose={() => setSelectedSaleId(null)}
        saleId={selectedSaleId}
        onSaleUpdated={loadSales}
      />
    </div>
  );
};

const SaleMobileCard: React.FC<{
  sale: Sale;
  currencySymbol?: string;
  onClick: () => void;
}> = ({ sale, currencySymbol, onClick }) => {
  return (
    <div
      onClick={onClick}
      className={`p-4 bg-white rounded-2xl border border-slate-200 shadow-xs active:bg-slate-50 transition-all cursor-pointer space-y-2.5 ${
        sale.status === 'VOIDED' ? 'opacity-60 bg-slate-50/50' : ''
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <span className="text-xs font-mono font-bold text-blue-600 block">
            {sale.invoiceNumber}
          </span>
          <h4 className="text-sm font-bold text-slate-900 mt-0.5">{sale.customerNameSnapshot}</h4>
        </div>
        <div className="text-right">
          <span className="text-base font-bold text-slate-900 font-mono block">
            {formatCurrency(sale.totalAmount, currencySymbol)}
          </span>
          <Badge
            variant={
              sale.status === 'VOIDED'
                ? 'danger'
                : sale.status === 'RETURNED'
                ? 'neutral'
                : sale.status === 'PAID'
                ? 'success'
                : sale.status === 'PARTIAL'
                ? 'warning'
                : 'danger'
            }
            size="sm"
            className="mt-1"
          >
            {sale.status}
          </Badge>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-100">
        <span>{formatDate(sale.saleDate || sale.createdAt)}</span>
        {sale.status === 'VOIDED' ? (
          <span className="text-rose-600 font-semibold">Cancelled</span>
        ) : sale.status === 'RETURNED' ? (
          <span className="text-amber-700 font-semibold">Returned</span>
        ) : sale.dueAmount > 0 ? (
          <span className="text-rose-600 font-semibold">
            Due: {formatCurrency(sale.dueAmount, currencySymbol)}
          </span>
        ) : (
          <span className="text-emerald-600 font-medium">Fully Paid</span>
        )}
      </div>
    </div>
  );
};
