import React, { useState, useEffect, useCallback } from 'react';
import { useBusiness } from '../../contexts/BusinessContext';
import { receivablesReportService, type ReceivablesReportResult } from '../../services/reports/receivablesReportService';
import { reportExportService } from '../../services/reports/reportExportService';
import { formatCurrency } from '../../utils/formatters';
import { Button } from '../../components/ui/Button';
import {
  Users,
  Download,
  Search,
  CheckCircle2,
  AlertCircle,
  Coins,
} from 'lucide-react';

export const ReceivablesReportView: React.FC = () => {
  const { business } = useBusiness();

  const [filterMode, setFilterMode] = useState<'ALL' | 'DUE_ONLY' | 'CREDIT_ONLY'>('DUE_ONLY');
  const [searchQuery, setSearchQuery] = useState('');
  const [reportData, setReportData] = useState<ReceivablesReportResult | null>(null);
  const [loading, setLoading] = useState(true);

  const loadReport = useCallback(async () => {
    if (!business) return;
    try {
      setLoading(true);
      const result = await receivablesReportService.generateReceivablesReport(business.id, {
        onlyWithBalance: filterMode === 'DUE_ONLY',
        onlyWithCredit: filterMode === 'CREDIT_ONLY',
        searchQuery,
      });
      setReportData(result);
    } catch (err) {
      console.error('Failed to load receivables report', err);
    } finally {
      setLoading(false);
    }
  }, [business, filterMode, searchQuery]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const handleExport = () => {
    if (!reportData || !business) return;
    reportExportService.exportReceivablesReport(reportData.customers, business.name);
  };

  const metrics = reportData?.metrics;

  return (
    <div className="space-y-6 pb-12">
      {/* Controls & Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setFilterMode('DUE_ONLY')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filterMode === 'DUE_ONLY'
                  ? 'bg-white text-rose-600 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pending Receivables ({metrics?.customersWithDueCount || 0})
            </button>
            <button
              onClick={() => setFilterMode('CREDIT_ONLY')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filterMode === 'CREDIT_ONLY'
                  ? 'bg-white text-blue-600 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Advance Credits ({metrics?.customersWithCreditCount || 0})
            </button>
            <button
              onClick={() => setFilterMode('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filterMode === 'ALL'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Customers ({metrics?.totalCustomersCount || 0})
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            icon={Download}
            onClick={handleExport}
            disabled={!reportData || reportData.customers.length === 0}
          >
            Export CSV
          </Button>
        </div>

        <div className="pt-2 border-t border-slate-100">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search customer name, phone, or city..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
            />
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      {metrics && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
          <div className="p-4 bg-rose-50/70 rounded-2xl border border-rose-100 shadow-2xs">
            <span className="text-xs font-semibold text-rose-800 block">Total Outstanding Balance</span>
            <span className="text-xl md:text-2xl font-bold font-mono text-rose-900 mt-1 block">
              {formatCurrency(metrics.totalOutstandingBalance, business?.currencySymbol)}
            </span>
            <span className="text-[11px] text-rose-700/80 mt-1 block font-medium">
              From {metrics.customersWithDueCount} customers
            </span>
          </div>

          <div className="p-4 bg-blue-50/70 rounded-2xl border border-blue-100 shadow-2xs">
            <span className="text-xs font-semibold text-blue-800 block">Total Customer Advance Credit</span>
            <span className="text-xl md:text-2xl font-bold font-mono text-blue-900 mt-1 block">
              {formatCurrency(metrics.totalCustomerCredit, business?.currencySymbol)}
            </span>
            <span className="text-[11px] text-blue-700/80 mt-1 block font-medium">
              Held by {metrics.customersWithCreditCount} customers
            </span>
          </div>

          <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-xs font-semibold text-slate-500 block">Net Receivable Position</span>
            <span className="text-xl md:text-2xl font-bold font-mono text-slate-900 mt-1 block">
              {formatCurrency(metrics.netReceivable, business?.currencySymbol)}
            </span>
            <span className="text-[11px] text-slate-400 mt-1 block">
              Outstanding minus credits
            </span>
          </div>
        </div>
      )}

      {/* Customers Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600" />
            Customer Balances ({reportData?.customers.length || 0})
          </h3>
        </div>

        {loading ? (
          <div className="py-16 text-center text-slate-400 text-xs">Loading customer balances...</div>
        ) : reportData?.customers.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-xs">No customer records matching this filter.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Phone / City</th>
                  <th className="py-3 px-4 text-right">Invoiced Sales</th>
                  <th className="py-3 px-4 text-right">Paid</th>
                  <th className="py-3 px-4 text-right">Outstanding Due</th>
                  <th className="py-3 px-4 text-right">Advance Credit</th>
                  <th className="py-3 px-4 text-right">Net Position</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reportData?.customers.map((c) => (
                  <tr key={c.customerId} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4">
                      <span className="font-bold text-slate-900 block">{c.customerName}</span>
                    </td>
                    <td className="py-3 px-4 text-slate-500">
                      <span>{c.phone || '—'}</span>
                      {c.address && <span className="text-[11px] text-slate-400 block">{c.address}</span>}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-600">
                      {formatCurrency(c.totalInvoicedSales, business?.currencySymbol)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-emerald-600">
                      {formatCurrency(c.totalPaid, business?.currencySymbol)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-rose-700">
                      {c.outstandingBalance > 0 ? formatCurrency(c.outstandingBalance, business?.currencySymbol) : '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-blue-700">
                      {c.customerCredit > 0 ? formatCurrency(c.customerCredit, business?.currencySymbol) : '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                      {formatCurrency(c.netReceivable, business?.currencySymbol)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
