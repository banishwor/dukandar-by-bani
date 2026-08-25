import React, { useState, useEffect, useCallback } from 'react';
import { useBusiness } from '../../contexts/BusinessContext';
import { inventoryReportService, type InventoryReportResult } from '../../services/reports/inventoryReportService';
import { reportExportService } from '../../services/reports/reportExportService';
import { formatCurrency } from '../../utils/formatters';
import { Button } from '../../components/ui/Button';
import {
  Package,
  Download,
  Search,
  AlertTriangle,
  History,
  Info,
} from 'lucide-react';

export const InventoryReportView: React.FC = () => {
  const { business } = useBusiness();

  const [activeTab, setActiveTab] = useState<'ITEMS' | 'MOVEMENTS'>('ITEMS');
  const [stockStatus, setStockStatus] = useState<'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [reportData, setReportData] = useState<InventoryReportResult | null>(null);
  const [loading, setLoading] = useState(true);

  const loadReport = useCallback(async () => {
    if (!business) return;
    try {
      setLoading(true);
      const result = await inventoryReportService.generateInventoryReport(business.id, {
        stockStatus,
        searchQuery,
      });
      setReportData(result);
    } catch (err) {
      console.error('Failed to load inventory report', err);
    } finally {
      setLoading(false);
    }
  }, [business, stockStatus, searchQuery]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const handleExport = () => {
    if (!reportData || !business) return;
    reportExportService.exportInventoryReport(reportData.items, business.name);
  };

  const metrics = reportData?.metrics;

  return (
    <div className="space-y-6 pb-12">
      {/* Costing Transparency Banner */}
      <div className="p-3.5 bg-blue-50 border border-blue-100 rounded-2xl flex items-start gap-2.5 text-xs text-blue-900">
        <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold">Inventory Valuation Note:</span>{' '}
          {reportData?.costingMethodologyNote}
        </div>
      </div>

      {/* Controls & Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => setActiveTab('ITEMS')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'ITEMS'
                    ? 'bg-white text-blue-600 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Catalog Valuation ({metrics?.totalSkusCount || 0})
              </button>
              <button
                onClick={() => setActiveTab('MOVEMENTS')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'MOVEMENTS'
                    ? 'bg-white text-blue-600 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Movement Ledger ({reportData?.movementLedger.length || 0})
              </button>
            </div>

            {activeTab === 'ITEMS' && (
              <select
                value={stockStatus}
                onChange={(e) => setStockStatus(e.target.value as any)}
                className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium"
              >
                <option value="ALL">All Statuses</option>
                <option value="IN_STOCK">In Stock</option>
                <option value="LOW_STOCK">Low Stock Alert</option>
                <option value="OUT_OF_STOCK">Out of Stock</option>
              </select>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            icon={Download}
            onClick={handleExport}
            disabled={!reportData || reportData.items.length === 0}
          >
            Export CSV
          </Button>
        </div>

        <div className="pt-2 border-t border-slate-100">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search product name, SKU, or category..."
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
            <span className="text-xs font-semibold text-slate-500 block">Total Units in Stock</span>
            <span className="text-lg md:text-xl font-bold font-mono text-slate-900 mt-1 block">
              {metrics.totalUnitsInStock}
            </span>
            <span className="text-[11px] text-slate-400 mt-1 block">
              Across {metrics.totalSkusCount} active SKUs
            </span>
          </div>

          <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-xs font-semibold text-slate-500 block">Valuation @ Catalog Cost</span>
            <span className="text-lg md:text-xl font-bold font-mono text-slate-900 mt-1 block">
              {formatCurrency(metrics.totalValuationAtCost, business?.currencySymbol)}
            </span>
            <span className="text-[11px] text-slate-400 mt-1 block">Stock cost basis</span>
          </div>

          <div className="p-4 bg-blue-50/70 rounded-2xl border border-blue-100 shadow-2xs">
            <span className="text-xs font-semibold text-blue-800 block">Valuation @ Retail Price</span>
            <span className="text-lg md:text-xl font-bold font-mono text-blue-900 mt-1 block">
              {formatCurrency(metrics.totalValuationAtRetail, business?.currencySymbol)}
            </span>
            <span className="text-[11px] text-blue-700/80 mt-1 block font-medium">
              Gross Margin: {formatCurrency(metrics.estimatedPotentialGrossMargin, business?.currencySymbol)} ({metrics.estimatedMarginPercentage}%)
            </span>
          </div>

          <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-xs font-semibold text-amber-600 block">Low / Out of Stock</span>
            <span className="text-lg md:text-xl font-bold font-mono text-amber-700 mt-1 block">
              {metrics.lowStockCount + metrics.outOfStockCount}
            </span>
            <span className="text-[11px] text-slate-400 mt-1 block">
              {metrics.lowStockCount} low, {metrics.outOfStockCount} zero
            </span>
          </div>
        </div>
      )}

      {/* Main View Container */}
      {activeTab === 'ITEMS' ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Package className="w-4 h-4 text-blue-600" />
              Item Catalog Valuation ({reportData?.items.length || 0})
            </h3>
          </div>

          {loading ? (
            <div className="py-16 text-center text-slate-400 text-xs">Computing inventory status...</div>
          ) : reportData?.items.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-xs">No products match the filter.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">Product</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4 text-center">Stock Status</th>
                    <th className="py-3 px-4 text-right">Current Stock</th>
                    <th className="py-3 px-4 text-right">Unit Cost</th>
                    <th className="py-3 px-4 text-right">Selling Price</th>
                    <th className="py-3 px-4 text-right">Valuation @ Cost</th>
                    <th className="py-3 px-4 text-right">Valuation @ Retail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reportData?.items.map((item) => (
                    <tr key={item.itemId} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4">
                        <span className="font-bold text-slate-900 block">{item.name}</span>
                        {item.sku && <span className="text-[11px] text-slate-400 font-mono block">SKU: {item.sku}</span>}
                      </td>
                      <td className="py-3 px-4 text-slate-600">{item.category || '—'}</td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            item.status === 'IN_STOCK'
                              ? 'bg-emerald-100 text-emerald-800'
                              : item.status === 'LOW_STOCK'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {item.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {item.currentStock} {item.unit}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-600">
                        {formatCurrency(item.costPrice, business?.currencySymbol)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-900">
                        {formatCurrency(item.sellingPrice, business?.currencySymbol)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-600">
                        {formatCurrency(item.valuationAtCost, business?.currencySymbol)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-blue-900">
                        {formatCurrency(item.valuationAtRetail, business?.currencySymbol)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <History className="w-4 h-4 text-blue-600" />
              Stock Movement Audit Ledger ({reportData?.movementLedger.length || 0})
            </h3>
          </div>

          {reportData?.movementLedger.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-xs">No stock movements recorded.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Product</th>
                    <th className="py-3 px-4">Movement Type</th>
                    <th className="py-3 px-4">Reason / Reference</th>
                    <th className="py-3 px-4 text-right">Quantity Change</th>
                    <th className="py-3 px-4 text-right">Running Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reportData?.movementLedger.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 text-slate-500 font-mono">{m.createdAt.slice(0, 16).replace('T', ' ')}</td>
                      <td className="py-3 px-4 font-semibold text-slate-900">{m.itemName}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            m.type === 'PURCHASE' || m.type === 'OPENING_STOCK'
                              ? 'bg-blue-100 text-blue-800'
                              : m.type === 'SALE'
                              ? 'bg-emerald-100 text-emerald-800'
                              : m.type === 'SALE_RETURN'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-800'
                          }`}
                        >
                          {m.type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600">{m.reason || '—'}</td>
                      <td
                        className={`py-3 px-4 text-right font-mono font-bold ${
                          m.quantityChange > 0 ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {m.quantityChange > 0 ? `+${m.quantityChange}` : m.quantityChange} {m.unit}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {m.runningStock} {m.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
