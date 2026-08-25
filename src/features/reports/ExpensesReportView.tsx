import React, { useState, useEffect, useCallback } from 'react';
import { useBusiness } from '../../contexts/BusinessContext';
import { expenseReportService, type ExpenseReportResult } from '../../services/reports/expenseReportService';
import { reportExportService } from '../../services/reports/reportExportService';
import { resolveDateRange, type DateRangePreset } from '../../utils/reportDateRange';
import { formatCurrency } from '../../utils/formatters';
import { Button } from '../../components/ui/Button';
import {
  Receipt,
  Download,
  Search,
  Tag,
  Landmark,
} from 'lucide-react';

export const ExpensesReportView: React.FC = () => {
  const { business } = useBusiness();

  const [preset, setPreset] = useState<DateRangePreset>('THIS_MONTH');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [reportData, setReportData] = useState<ExpenseReportResult | null>(null);
  const [loading, setLoading] = useState(true);

  const loadReport = useCallback(async () => {
    if (!business) return;
    try {
      setLoading(true);
      const bounds = resolveDateRange(preset, customStart, customEnd);
      const result = await expenseReportService.generateExpenseReport(business.id, {
        dateRange: bounds,
        searchQuery,
      });
      setReportData(result);
    } catch (err) {
      console.error('Failed to load expense report', err);
    } finally {
      setLoading(false);
    }
  }, [business, preset, customStart, customEnd, searchQuery]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const handleExport = () => {
    if (!reportData || !business) return;
    reportExportService.exportExpenseReport(reportData.expenses, business.name);
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
            disabled={!reportData || reportData.expenses.length === 0}
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

        <div className="pt-2 border-t border-slate-100">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search category, payee, or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
            />
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-xs font-semibold text-rose-600 block">Total Active Expenses</span>
            <span className="text-lg md:text-xl font-bold font-mono text-rose-700 mt-1 block">
              {formatCurrency(metrics.totalExpensesAmount, business?.currencySymbol)}
            </span>
            <span className="text-[11px] text-slate-400 mt-1 block">
              {metrics.activeExpensesCount} active entries
            </span>
          </div>

          <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-xs font-semibold text-slate-500 block">Average Expense</span>
            <span className="text-lg md:text-xl font-bold font-mono text-slate-900 mt-1 block">
              {formatCurrency(metrics.averageExpenseAmount, business?.currencySymbol)}
            </span>
            <span className="text-[11px] text-slate-400 mt-1 block">Per transaction</span>
          </div>

          <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-xs font-semibold text-slate-500 block">Top Category</span>
            <span className="text-base md:text-lg font-bold text-slate-900 mt-1 block truncate">
              {metrics.topCategoryName || 'None'}
            </span>
            <span className="text-[11px] font-mono text-slate-500 mt-1 block">
              {formatCurrency(metrics.topCategoryAmount, business?.currencySymbol)}
            </span>
          </div>

          <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-xs font-semibold text-slate-400 block">Reversals</span>
            <span className="text-lg md:text-xl font-bold font-mono text-slate-500 mt-1 block">
              {formatCurrency(metrics.reversedExpensesAmount, business?.currencySymbol)}
            </span>
            <span className="text-[11px] text-slate-400 mt-1 block">
              {metrics.reversedExpensesCount} voided / reversed
            </span>
          </div>
        </div>
      )}

      {/* Category Breakdown Cards */}
      {reportData && reportData.categoryBreakdown.length > 0 && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
            <Tag className="w-4 h-4 text-blue-600" />
            Category Breakdown
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {reportData.categoryBreakdown.map((cat) => (
              <div
                key={cat.categoryId}
                className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 flex items-center justify-between"
              >
                <div>
                  <span className="text-xs font-bold text-slate-900 block">{cat.categoryName}</span>
                  <span className="text-[11px] text-slate-400">{cat.expenseCount} entries ({cat.percentageOfTotal}%)</span>
                </div>
                <span className="text-xs font-bold font-mono text-rose-600">
                  {formatCurrency(cat.totalAmount, business?.currencySymbol)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transaction Details Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Receipt className="w-4 h-4 text-rose-600" />
            Expense Records ({reportData?.expenses.length || 0})
          </h3>
        </div>

        {loading ? (
          <div className="py-16 text-center text-slate-400 text-xs">Computing expense metrics...</div>
        ) : reportData?.expenses.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-xs">No expenses recorded for the selected filter.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Payee / Description</th>
                  <th className="py-3 px-4">Account</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reportData?.expenses.map((exp) => (
                  <tr
                    key={exp.id}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      exp.isReversed ? 'opacity-50 bg-rose-50/30 line-through' : ''
                    }`}
                  >
                    <td className="py-3 px-4 text-slate-500 font-mono">{exp.expenseDate?.slice(0, 10)}</td>
                    <td className="py-3 px-4 font-semibold text-slate-900">{exp.categoryName}</td>
                    <td className="py-3 px-4 text-slate-600">
                      <span className="font-medium text-slate-800 block">{exp.payee || '—'}</span>
                      {exp.description && <span className="text-[11px] text-slate-400 block">{exp.description}</span>}
                    </td>
                    <td className="py-3 px-4 text-slate-500">{exp.accountName}</td>
                    <td className="py-3 px-4">
                      {exp.isReversed ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                          REVERSED
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          ACTIVE
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-rose-600">
                      {formatCurrency(exp.amount, business?.currencySymbol)}
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
