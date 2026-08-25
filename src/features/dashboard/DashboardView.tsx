import React, { useEffect, useState, useCallback } from 'react';
import { useBusiness } from '../../contexts/BusinessContext';
import { dashboardService } from '../../services/dashboardService';
import type { DashboardMetrics, ItemWithStock, Sale, Purchase } from '../../types';
import type { NavTab } from '../../components/layout/AppShell';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { SaleDetailModal } from '../sales/SaleDetailModal';
import { PurchaseDetailModal } from '../purchases/PurchaseDetailModal';
import {
  TrendingUp,
  CreditCard,
  AlertTriangle,
  Receipt,
  Plus,
  Package,
  Users,
  ArrowUpRight,
  ShieldCheck,
  Store,
  Sparkles,
  Truck,
  Building2,
} from 'lucide-react';

interface DashboardViewProps {
  onNavigate: (tab: NavTab) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const { business, deviceId, isOnline } = useBusiness();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [recentSales, setRecentSales] = useState<Sale[]>([]);
  const [recentPurchases, setRecentPurchases] = useState<Purchase[]>([]);
  const [lowStockItems, setLowStockItems] = useState<ItemWithStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    if (!business) return;
    try {
      setLoading(true);
      const data = await dashboardService.getDashboardData(business.id);
      setMetrics(data.metrics);
      setRecentSales(data.recentSales);
      setRecentPurchases(data.recentPurchases);
      setLowStockItems(data.lowStockItems);
    } catch (err) {
      console.error('Failed to load dashboard data', err);
    } finally {
      setLoading(false);
    }
  }, [business]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  if (loading || !metrics) {
    return <div className="py-16 text-center text-sm text-slate-500">Loading business overview...</div>;
  }

  const isBrandNewBusiness = metrics.totalSalesAmount === 0 && metrics.totalPurchasesAmount === 0 && metrics.totalItemsCount === 0;

  return (
    <div className="space-y-6 pb-16">
      {/* Top Banner / Welcome */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/90 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-bold text-lg shadow-sm">
            {business?.name ? business.name.substring(0, 2).toUpperCase() : 'BM'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                {business?.name || 'My Business'}
              </h1>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {business?.type || 'Business Workspace'} · IndexedDB Local Single Source of Truth
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            icon={Plus}
            onClick={() => onNavigate('NEW_PURCHASE')}
            className="shadow-xs text-amber-800 border-amber-300 hover:bg-amber-50"
          >
            + Purchase
          </Button>
          <Button
            variant="primary"
            icon={Plus}
            onClick={() => onNavigate('NEW_SALE')}
            className="shadow-sm"
          >
            + New Sale
          </Button>
        </div>
      </div>

      {/* Brand New Business Guidance */}
      {isBrandNewBusiness && (
        <div className="p-6 bg-blue-50/70 border border-blue-200 rounded-3xl space-y-4">
          <div className="flex items-start gap-3">
            <Sparkles className="w-6 h-6 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-base font-bold text-blue-950">Welcome to your Offline Business Manager!</h2>
              <p className="text-xs sm:text-sm text-blue-800/80 mt-0.5 leading-relaxed">
                Follow these 4 simple steps to setup and start recording transactions:
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-1">
            <button
              onClick={() => onNavigate('ITEMS')}
              className="p-4 bg-white rounded-2xl border border-blue-100 hover:border-blue-300 text-left transition-all group shadow-2xs"
            >
              <span className="text-xs font-bold text-blue-600 block mb-1">Step 1</span>
              <h4 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                Add Items / Products
              </h4>
              <p className="text-xs text-slate-500 mt-1">Add items with selling price & cost price</p>
            </button>

            <button
              onClick={() => onNavigate('SUPPLIERS')}
              className="p-4 bg-white rounded-2xl border border-blue-100 hover:border-blue-300 text-left transition-all group shadow-2xs"
            >
              <span className="text-xs font-bold text-amber-800 block mb-1">Step 2</span>
              <h4 className="text-sm font-bold text-slate-900 group-hover:text-amber-800 transition-colors">
                Add Suppliers
              </h4>
              <p className="text-xs text-slate-500 mt-1">Register suppliers to record stock-in bills</p>
            </button>

            <button
              onClick={() => onNavigate('CUSTOMERS')}
              className="p-4 bg-white rounded-2xl border border-blue-100 hover:border-blue-300 text-left transition-all group shadow-2xs"
            >
              <span className="text-xs font-bold text-blue-600 block mb-1">Step 3</span>
              <h4 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                Add Customers
              </h4>
              <p className="text-xs text-slate-500 mt-1">Track customer balances & credit</p>
            </button>

            <button
              onClick={() => onNavigate('NEW_SALE')}
              className="p-4 bg-white rounded-2xl border border-blue-100 hover:border-blue-300 text-left transition-all group shadow-2xs"
            >
              <span className="text-xs font-bold text-emerald-600 block mb-1">Step 4</span>
              <h4 className="text-sm font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">
                Create First Sale
              </h4>
              <p className="text-xs text-slate-500 mt-1">Generate invoices and adjust stock automatically</p>
            </button>
          </div>
        </div>
      )}

      {/* 4 Core Financial Metric Cards (Sales) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Today's Sales */}
        <div className="p-4 sm:p-5 bg-white rounded-3xl border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Today's Sales</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <span className="text-xl sm:text-2xl font-bold text-slate-900 block font-mono">
            {formatCurrency(metrics.todaySalesAmount, business?.currencySymbol)}
          </span>
          <span className="text-xs text-slate-400 block font-medium">
            {metrics.todaySalesCount} {metrics.todaySalesCount === 1 ? 'sale' : 'sales'} today
          </span>
        </div>

        {/* Total Revenue */}
        <div className="p-4 sm:p-5 bg-white rounded-3xl border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Sales</span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <span className="text-xl sm:text-2xl font-bold text-slate-900 block font-mono">
            {formatCurrency(metrics.totalSalesAmount, business?.currencySymbol)}
          </span>
          <span className="text-xs text-slate-400 block font-medium">All time business revenue</span>
        </div>

        {/* Outstanding Receivables */}
        <div className="p-4 sm:p-5 bg-white rounded-3xl border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Customer Due</span>
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                metrics.totalDueAmount > 0 ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-600'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <span
            className={`text-xl sm:text-2xl font-bold block font-mono ${
              metrics.totalDueAmount > 0 ? 'text-rose-600' : 'text-slate-900'
            }`}
          >
            {formatCurrency(metrics.totalDueAmount, business?.currencySymbol)}
          </span>
          <span className="text-xs text-slate-400 block font-medium">Receivables from customers</span>
        </div>

        {/* Outstanding Payables */}
        <div className="p-4 sm:p-5 bg-white rounded-3xl border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Supplier Due</span>
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                (metrics.totalSupplierDueAmount || 0) > 0 ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600'
              }`}
            >
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <span
            className={`text-xl sm:text-2xl font-bold block font-mono ${
              (metrics.totalSupplierDueAmount || 0) > 0 ? 'text-amber-800' : 'text-slate-900'
            }`}
          >
            {formatCurrency(metrics.totalSupplierDueAmount || 0, business?.currencySymbol)}
          </span>
          <span className="text-xs text-slate-400 block font-medium">Payables to suppliers</span>
        </div>
      </div>

      {/* Phase 5 Financial Liquidity & Today's Cash Flow Strip */}
      <div className="bg-slate-900 text-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Cash & Account Liquidity</h3>
              <p className="text-xs text-slate-400">Real-time balances across cash & bank accounts</p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('ACCOUNTS')}
            className="text-xs font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1 self-start sm:self-auto"
          >
            Manage Accounts <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-3 bg-slate-800/70 rounded-2xl border border-slate-700/60">
            <span className="text-[11px] font-semibold text-slate-400 block">Total Liquid Funds</span>
            <span className="text-base font-bold font-mono text-white mt-1 block">
              {formatCurrency(metrics.totalLiquidFunds || 0, business?.currencySymbol)}
            </span>
          </div>

          <div className="p-3 bg-slate-800/70 rounded-2xl border border-slate-700/60">
            <span className="text-[11px] font-semibold text-slate-400 block">Cash in Hand</span>
            <span className="text-base font-bold font-mono text-emerald-400 mt-1 block">
              {formatCurrency(metrics.totalCashInHand || 0, business?.currencySymbol)}
            </span>
          </div>

          <div className="p-3 bg-slate-800/70 rounded-2xl border border-slate-700/60">
            <span className="text-[11px] font-semibold text-slate-400 block">Bank / Digital</span>
            <span className="text-base font-bold font-mono text-blue-400 mt-1 block">
              {formatCurrency(metrics.totalBankBalances || 0, business?.currencySymbol)}
            </span>
          </div>

          <div className="p-3 bg-slate-800/70 rounded-2xl border border-slate-700/60">
            <span className="text-[11px] font-semibold text-slate-400 block">Today's Inflow</span>
            <span className="text-base font-bold font-mono text-emerald-400 mt-1 block">
              +{formatCurrency(metrics.todayMoneyIn || 0, business?.currencySymbol)}
            </span>
          </div>

          <div className="p-3 bg-slate-800/70 rounded-2xl border border-slate-700/60">
            <span className="text-[11px] font-semibold text-slate-400 block">Today's Outflow</span>
            <span className="text-base font-bold font-mono text-rose-400 mt-1 block">
              -{formatCurrency(metrics.todayMoneyOut || 0, business?.currencySymbol)}
            </span>
          </div>

          <div className="p-3 bg-slate-800/70 rounded-2xl border border-slate-700/60">
            <span className="text-[11px] font-semibold text-slate-400 block">Net Cash Flow Today</span>
            <span
              className={`text-base font-bold font-mono mt-1 block ${
                (metrics.todayNetCashFlow || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {(metrics.todayNetCashFlow || 0) >= 0 ? '+' : ''}
              {formatCurrency(metrics.todayNetCashFlow || 0, business?.currencySymbol)}
            </span>
          </div>
        </div>
      </div>

      {/* Main Grid: Recent Transactions (7 cols) + Low Stock & DB (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Recent Sales (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Recent Sales</h3>
                <p className="text-xs text-slate-500">Latest customer invoices</p>
              </div>
              <button
                onClick={() => onNavigate('SALES')}
                className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                View All <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {recentSales.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 bg-slate-50/60 rounded-2xl">
                No sales created yet. Click "+ New Sale" to make your first transaction.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 -mx-2 px-2">
                {recentSales.slice(0, 4).map((sale) => (
                  <div
                    key={sale.id}
                    onClick={() => setSelectedSaleId(sale.id)}
                    className="py-2.5 flex items-center justify-between hover:bg-slate-50/80 rounded-xl px-2 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold font-mono text-xs">
                        {sale.invoiceNumber.split('-')[1] || 'INV'}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900">{sale.customerNameSnapshot}</h4>
                        <p className="text-[11px] text-slate-400 font-mono">
                          {sale.invoiceNumber} · {formatDate(sale.saleDate || sale.createdAt)}
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-bold font-mono text-slate-900 block">
                        {formatCurrency(sale.totalAmount, business?.currencySymbol)}
                      </span>
                      <Badge
                        variant={
                          sale.status === 'PAID'
                            ? 'success'
                            : sale.status === 'PARTIAL'
                            ? 'warning'
                            : 'danger'
                        }
                        size="sm"
                      >
                        {sale.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Purchases */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Recent Purchases</h3>
                <p className="text-xs text-slate-500">Latest vendor stock-in bills</p>
              </div>
              <button
                onClick={() => onNavigate('PURCHASES')}
                className="text-xs font-bold text-amber-800 hover:text-amber-900 flex items-center gap-1"
              >
                View All <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {recentPurchases.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 bg-slate-50/60 rounded-2xl">
                No purchase bills recorded yet. Click "+ Purchase" to stock up inventory.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 -mx-2 px-2">
                {recentPurchases.slice(0, 4).map((purchase) => (
                  <div
                    key={purchase.id}
                    onClick={() => setSelectedPurchaseId(purchase.id)}
                    className="py-2.5 flex items-center justify-between hover:bg-slate-50/80 rounded-xl px-2 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-800 flex items-center justify-center font-bold font-mono text-xs">
                        {purchase.purchaseNumber.split('-')[1] || 'PUR'}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900">{purchase.supplierNameSnapshot}</h4>
                        <p className="text-[11px] text-slate-400 font-mono">
                          {purchase.purchaseNumber} · {formatDate(purchase.purchaseDate || purchase.createdAt)}
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-bold font-mono text-slate-900 block">
                        {formatCurrency(purchase.totalAmount, business?.currencySymbol)}
                      </span>
                      <Badge
                        variant={
                          purchase.status === 'PAID'
                            ? 'success'
                            : purchase.status === 'PARTIAL'
                            ? 'warning'
                            : 'danger'
                        }
                        size="sm"
                      >
                        {purchase.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Low Stock Alerts & Quick Stats (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Low Stock Card */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">Low Stock Warnings</h3>
              </div>
              <button
                onClick={() => onNavigate('ITEMS')}
                className="text-xs font-bold text-blue-600 hover:text-blue-700"
              >
                All Items
              </button>
            </div>

            {lowStockItems.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400 bg-emerald-50/50 rounded-2xl text-emerald-800 font-medium">
                ✓ All inventory items are well-stocked!
              </div>
            ) : (
              <div className="space-y-2">
                {lowStockItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 bg-amber-50/60 border border-amber-200/80 rounded-2xl flex items-center justify-between"
                  >
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">{item.name}</span>
                      <span className="text-[11px] text-amber-800 font-medium">
                        Alert threshold: {item.lowStockThreshold} {item.unit}
                      </span>
                    </div>
                    <Badge variant="warning" size="sm">
                      {item.currentStock} {item.unit} left
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Business Snapshot */}
          <div className="bg-slate-900 text-white rounded-3xl p-5 sm:p-6 space-y-3 shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Offline Database Status
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Active Local IndexedDB
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-2 text-xs">
              <div className="p-2.5 bg-slate-800/80 rounded-xl border border-slate-700/60 text-center">
                <span className="text-slate-400 block text-[10px] mb-0.5">Catalog Items</span>
                <span className="text-base font-bold text-white">{metrics.totalItemsCount}</span>
              </div>
              <div className="p-2.5 bg-slate-800/80 rounded-xl border border-slate-700/60 text-center">
                <span className="text-slate-400 block text-[10px] mb-0.5">Customers</span>
                <span className="text-base font-bold text-white">{metrics.totalCustomersCount}</span>
              </div>
              <div className="p-2.5 bg-slate-800/80 rounded-xl border border-slate-700/60 text-center">
                <span className="text-slate-400 block text-[10px] mb-0.5">Suppliers</span>
                <span className="text-base font-bold text-white">{metrics.totalSuppliersCount || 0}</span>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between text-[11px] text-slate-400">
              <span>Device ID: {deviceId.substring(0, 16)}...</span>
              <button
                onClick={() => onNavigate('SYNC')}
                className="text-blue-400 hover:text-blue-300 font-semibold"
              >
                Sync Readiness &gt;
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Sale Detail Modal */}
      <SaleDetailModal
        isOpen={!!selectedSaleId}
        onClose={() => setSelectedSaleId(null)}
        saleId={selectedSaleId}
      />

      {/* Purchase Detail Modal */}
      <PurchaseDetailModal
        isOpen={!!selectedPurchaseId}
        onClose={() => setSelectedPurchaseId(null)}
        purchaseId={selectedPurchaseId}
      />
    </div>
  );
};
