import React, { useState, useEffect, useCallback } from 'react';
import { useBusiness } from '../../contexts/BusinessContext';
import { cashFlowReportService, type CashFlowReportResult } from '../../services/reports/cashFlowReportService';
import { reportExportService } from '../../services/reports/reportExportService';
import { resolveDateRange, type DateRangePreset } from '../../utils/reportDateRange';
import { formatCurrency } from '../../utils/formatters';
import { Button } from '../../components/ui/Button';
import {
  Wallet,
  Download,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  Landmark,
} from 'lucide-react';

export const CashFlowReportView: React.FC = () => {
  const { business } = useBusiness();

  const [preset, setPreset] = useState<DateRangePreset>('THIS_MONTH');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [reportData, setReportData] = useState<CashFlowReportResult | null>(null);
  const [loading, setLoading] = useState(true);

  const loadReport = useCallback(async () => {
    if (!business) return;
    try {
      setLoading(true);
      const bounds = resolveDateRange(preset, customStart, customEnd);
      const result = await cashFlowReportService.generateCashFlowReport(business.id, {
        dateRange: bounds,
      });
      setReportData(result);
    } catch (err) {
      console.error('Failed to load cash flow report', err);
    } finally {
      setLoading(false);
    }
  }, [business, preset, customStart, customEnd]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const handleExport = () => {
    if (!reportData || !business) return;
    reportExportService.exportCashFlowReport(reportData.movements, business.name);
  };

  const metrics = reportData?.metrics;

  return (
    <div className="space-y-6 pb-12">
      {/* Controls & Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
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

          <Button
            variant="outline"
            size="sm"
            icon={Download}
            onClick={handleExport}
            disabled={!reportData || reportData.movements.length === 0}
          >
            Export CSV
          </Button>
        </div>

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
      </div>

      {/* KPI Cards Grid */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
              <ArrowDownLeft className="w-3.5 h-3.5" />
              Total Money In
            </div>
            <span className="text-lg md:text-xl font-bold font-mono text-emerald-700 mt-1 block">
              +{formatCurrency(metrics.totalMoneyIn, business?.currencySymbol)}
            </span>
            <span className="text-[11px] text-slate-400 mt-1 block">Payments & Inflows</span>
          </div>

          <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-600">
              <ArrowUpRight className="w-3.5 h-3.5" />
              Total Money Out
            </div>
            <span className="text-lg md:text-xl font-bold font-mono text-rose-700 mt-1 block">
              -{formatCurrency(metrics.totalMoneyOut, business?.currencySymbol)}
            </span>
            <span className="text-[11px] text-slate-400 mt-1 block">Supplier bills & expenses</span>
          </div>

          <div
            className={`p-4 rounded-2xl border shadow-2xs ${
              metrics.netCashFlow >= 0
                ? 'bg-emerald-50/70 border-emerald-100'
                : 'bg-rose-50/70 border-rose-100'
            }`}
          >
            <span
              className={`text-xs font-semibold block ${
                metrics.netCashFlow >= 0 ? 'text-emerald-800' : 'text-rose-800'
              }`}
            >
              Net Realized Cash Flow
            </span>
            <span
              className={`text-lg md:text-xl font-bold font-mono mt-1 block ${
                metrics.netCashFlow >= 0 ? 'text-emerald-900' : 'text-rose-900'
              }`}
            >
              {formatCurrency(metrics.netCashFlow, business?.currencySymbol)}
            </span>
            <span className="text-[11px] text-slate-500 mt-1 block">
              Transfers neutral (₹{metrics.internalTransfersAmount})
            </span>
          </div>

          <div className="p-4 bg-blue-50/70 rounded-2xl border border-blue-100 shadow-2xs">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-800">
              <Landmark className="w-3.5 h-3.5" />
              Total Liquid Funds
            </div>
            <span className="text-lg md:text-xl font-bold font-mono text-blue-900 mt-1 block">
              {formatCurrency(metrics.totalLiquidFunds, business?.currencySymbol)}
            </span>
            <span className="text-[11px] text-blue-700/80 mt-1 block">
              Across {metrics.activeAccountsCount} accounts
            </span>
          </div>
        </div>
      )}

      {/* Account Balance Summary */}
      {reportData && reportData.accountBreakdown.length > 0 && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
            <Landmark className="w-4 h-4 text-blue-600" />
            Account Liquid Balances
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {reportData.accountBreakdown.map((acc) => (
              <div
                key={acc.accountId}
                className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 flex items-center justify-between"
              >
                <div>
                  <span className="text-xs font-bold text-slate-900 block">{acc.accountName}</span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    In: +{formatCurrency(acc.totalIn, business?.currencySymbol)} | Out: -{formatCurrency(acc.totalOut, business?.currencySymbol)}
                  </span>
                </div>
                <span className="text-sm font-bold font-mono text-slate-900">
                  {formatCurrency(acc.currentBalance, business?.currencySymbol)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Movement Ledger Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Wallet className="w-4 h-4 text-emerald-600" />
            Financial Movements ({reportData?.movements.length || 0})
          </h3>
        </div>

        {loading ? (
          <div className="py-16 text-center text-slate-400 text-xs">Computing cash movements...</div>
        ) : reportData?.movements.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-xs">No movements found for the selected period.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Account</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reportData?.movements.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 text-slate-500 font-mono">{m.movementDate?.slice(0, 10)}</td>
                    <td className="py-3 px-4 font-semibold text-slate-900">{m.accountName}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          m.isInternalTransfer
                            ? 'bg-slate-100 text-slate-700'
                            : m.direction === 'IN'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {m.isInternalTransfer ? 'TRANSFER' : m.type}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600">{m.description || '—'}</td>
                    <td
                      className={`py-3 px-4 text-right font-mono font-bold ${
                        m.direction === 'IN' ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {m.direction === 'IN' ? '+' : '-'}
                      {formatCurrency(m.amount, business?.currencySymbol)}
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
