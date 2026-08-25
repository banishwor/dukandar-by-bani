import React, { useState, useEffect, useCallback } from 'react';
import { useBusiness } from '../../contexts/BusinessContext';
import { salesReportService, type SalesReportResult } from '../../services/reports/salesReportService';
import { reportExportService } from '../../services/reports/reportExportService';
import { resolveDateRange, type DateRangePreset, type DateRangeBounds } from '../../utils/reportDateRange';
import { formatCurrency } from '../../utils/formatters';
import { Button } from '../../components/ui/Button';
import {
  TrendingUp,
  Receipt,
  Download,
  Calendar,
  Search,
  Filter,
  DollarSign,
  AlertCircle,
  ArrowDownRight,
  Sparkles,
  Users,
  Package,
} from 'lucide-react';

export const SalesReportView: React.FC = () => {
  const { business } = useBusiness();

  const [preset, setPreset] = useState<DateRangePreset>('THIS_MONTH');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [paymentStatus, setPaymentStatus] = useState<'ALL' | 'PAID' | 'UNPAID' | 'PARTIAL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [reportData, setReportData] = useState<SalesReportResult | null>(null);
  const [loading, setLoading] = useState(true);

  const loadReport = useCallback(async () => {
    if (!business) return;
    try {
      setLoading(true);
      const bounds = resolveDateRange(preset, customStart, customEnd);
      const result = await salesReportService.generateSalesReport(business.id, {
        dateRange: bounds,
        paymentStatus,
        searchQuery,
      });
      setReportData(result);
    } catch (err) {
      console.error('Failed to load sales report', err);
    } finally {
      setLoading(false);
    }
  }, [business, preset, customStart, customEnd, paymentStatus, searchQuery]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const handleExport = () => {
    if (!reportData || !business) return;
    reportExportService.exportSalesReport(reportData.sales, business.name);
  };

  const metrics = reportData?.metrics;

  return (
    <div className="space-y-6 pb-12">
      {/* Controls & Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Preset Buttons */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
            {(['TODAY', 'THIS_WEEK', 'THIS_MONTH', 'LAST_MONTH', 'THIS_YEAR', 'ALL_TIME', 'CUSTOM'] as DateRangePreset[]).map(
              (p) => (
                <button
                  key={p}
                  onClick={() => setPreset(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    preset === p
                      ? 'bg-white text-blue-600 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {p.replace('_', ' ')}
                </button>
              )
            )}
          </div>

          {/* Export Action */}
          <Button
            variant="outline"
            size="sm"
            icon={Download}
            onClick={handleExport}
            disabled={!reportData || reportData.sales.length === 0}
          >
            Export CSV
          </Button>
        </div>

        {/* Custom Date Inputs if CUSTOM */}
        {preset === 'CUSTOM' && (
          <div className="flex items-center gap-3 pt-2 border-t border-slate-100 text-xs">
            <span className="text-slate-500 font-medium">From:</span>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-medium"
            />
            <span className="text-slate-500 font-medium">To:</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-medium"
            />
          </div>
        )}

        {/* Secondary Filter Row */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search invoice or customer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">Status:</span>
            <select
              value={paymentStatus}
              onChange={(e) => setPaymentStatus(e.target.value as any)}
              className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium"
            >
              <option value="ALL">All Invoices</option>
              <option value="PAID">Fully Paid</option>
              <option value="PARTIAL">Partially Paid</option>
              <option value="UNPAID">Unpaid Due</option>
            </select>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-xs font-semibold text-slate-500 block">Gross Sales</span>
            <span className="text-lg md:text-xl font-bold font-mono text-slate-900 mt-1 block">
              {formatCurrency(metrics.grossSales, business?.currencySymbol)}
            </span>
            <span className="text-[11px] text-slate-400 mt-1 block">
              {metrics.totalInvoicesCount} invoices
            </span>
          </div>

          <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-xs font-semibold text-emerald-600 block">Discounts Given</span>
            <span className="text-lg md:text-xl font-bold font-mono text-emerald-700 mt-1 block">
              -{formatCurrency(metrics.totalDiscounts, business?.currencySymbol)}
            </span>
            <span className="text-[11px] text-slate-400 mt-1 block">
              Line: {formatCurrency(metrics.lineDiscounts, business?.currencySymbol)} | Bill: {formatCurrency(metrics.overallDiscounts, business?.currencySymbol)}
            </span>
          </div>

          <div className="p-4 bg-blue-50/70 rounded-2xl border border-blue-100 shadow-2xs">
            <span className="text-xs font-semibold text-blue-800 block">Net Realized Sales</span>
            <span className="text-lg md:text-xl font-bold font-mono text-blue-900 mt-1 block">
              {formatCurrency(metrics.netRealizedSales, business?.currencySymbol)}
            </span>
            <span className="text-[11px] text-blue-700/80 mt-1 block">
              After returns (-{formatCurrency(metrics.saleReturnsAmount, business?.currencySymbol)})
            </span>
          </div>

          <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-xs font-semibold text-amber-600 block">Outstanding Receivables</span>
            <span className="text-lg md:text-xl font-bold font-mono text-amber-700 mt-1 block">
              {formatCurrency(metrics.outstandingReceivables, business?.currencySymbol)}
            </span>
            <span className="text-[11px] text-emerald-600 mt-1 block font-medium">
              Collected: {formatCurrency(metrics.amountCollected, business?.currencySymbol)}
            </span>
          </div>
        </div>
      )}

      {/* Transaction Details Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Receipt className="w-4 h-4 text-blue-600" />
            Invoices in Period ({reportData?.sales.length || 0})
          </h3>
        </div>

        {loading ? (
          <div className="py-16 text-center text-slate-400 text-xs">Computing report metrics...</div>
        ) : reportData?.sales.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-xs">No sales found for the selected filter.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Gross</th>
                  <th className="py-3 px-4 text-right">Discount</th>
                  <th className="py-3 px-4 text-right">Net Total</th>
                  <th className="py-3 px-4 text-right">Paid</th>
                  <th className="py-3 px-4 text-right">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reportData?.sales.map((sale) => (
                  <tr
                    key={sale.id}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      sale.voided ? 'opacity-50 bg-rose-50/30 line-through' : ''
                    }`}
                  >
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">{sale.invoiceNumber}</td>
                    <td className="py-3 px-4 text-slate-500">{sale.saleDate?.slice(0, 10)}</td>
                    <td className="py-3 px-4 font-medium text-slate-800">{sale.customerName}</td>
                    <td className="py-3 px-4">
                      {sale.voided ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                          VOIDED
                        </span>
                      ) : (
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            sale.status === 'PAID'
                              ? 'bg-emerald-100 text-emerald-800'
                              : sale.status === 'PARTIAL'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {sale.status}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-600">
                      {formatCurrency(sale.subtotal || sale.totalAmount, business?.currencySymbol)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-emerald-600">
                      {sale.discountAmount ? `-${formatCurrency(sale.discountAmount, business?.currencySymbol)}` : '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                      {formatCurrency(sale.totalAmount, business?.currencySymbol)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-emerald-600">
                      {formatCurrency(sale.paidAmount, business?.currencySymbol)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-amber-700">
                      {formatCurrency(sale.dueAmount, business?.currencySymbol)}
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
