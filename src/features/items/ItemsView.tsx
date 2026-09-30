import React, { useState, useEffect, useCallback } from 'react';
import { useBusiness } from '../../contexts/BusinessContext';
import { itemRepository } from '../../repositories/itemRepository';
import type { ItemWithStock } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ItemFormModal } from './ItemFormModal';
import { ItemHistoryModal } from './ItemHistoryModal';
import { AdjustStockModal } from './AdjustStockModal';
import {
  Package,
  Plus,
  Search,
  Wrench,
  AlertTriangle,
  History,
  Edit2,
  Trash2,
  Layers,
  TrendingUp,
  AlertCircle,
  Coins,
  SlidersHorizontal,
} from 'lucide-react';
import { useToast } from '../../components/ui/Toast';

export const ItemsView: React.FC = () => {
  const { business } = useBusiness();
  const { showSuccess, showError } = useToast();

  const [items, setItems] = useState<ItemWithStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'PRODUCTS' | 'SERVICES' | 'LOW_STOCK' | 'NEGATIVE'>('ALL');

  // Modals state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ItemWithStock | null>(null);
  const [historyItem, setHistoryItem] = useState<ItemWithStock | null>(null);
  const [adjustStockItem, setAdjustStockItem] = useState<ItemWithStock | null>(null);

  const loadItems = useCallback(async () => {
    if (!business) return;
    try {
      setLoading(true);
      const data = await itemRepository.getItemsWithStock(business.id);
      setItems(data);
    } catch (err) {
      console.error('Failed to load items', err);
    } finally {
      setLoading(false);
    }
  }, [business]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const handleEdit = (item: ItemWithStock) => {
    setEditingItem(item);
    setIsFormOpen(true);
  };

  const handleAddNew = () => {
    setEditingItem(null);
    setIsFormOpen(true);
  };

  const handleDelete = async (item: ItemWithStock) => {
    if (window.confirm(`Are you sure you want to archive "${item.name}"?`)) {
      try {
        await itemRepository.softDeleteItem(item.id);
        showSuccess(`Archived ${item.name}`);
        loadItems();
      } catch (err) {
        showError('Could not archive item');
      }
    }
  };

  // Top Inventory Valuation & KPI Metrics
  const totalValuation = items.reduce((sum, item) => {
    if (item.trackInventory && item.currentStock > 0) {
      const cost = item.purchasePrice || item.costPrice || 0;
      return sum + item.currentStock * cost;
    }
    return sum;
  }, 0);

  const lowStockCount = items.filter(
    (i) => i.trackInventory && i.isLowStock && i.currentStock >= 0
  ).length;
  const negativeStockCount = items.filter(
    (i) => i.trackInventory && i.currentStock < 0
  ).length;
  const productsCount = items.filter((i) => i.type === 'PRODUCT').length;
  const servicesCount = items.filter((i) => i.type === 'SERVICE').length;

  const filteredItems = items.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.sku && item.sku.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.category && item.category.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.barcode && item.barcode.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    if (activeFilter === 'PRODUCTS') return item.type === 'PRODUCT';
    if (activeFilter === 'SERVICES') return item.type === 'SERVICE';
    if (activeFilter === 'LOW_STOCK') return item.isLowStock && item.currentStock >= 0;
    if (activeFilter === 'NEGATIVE') return item.trackInventory && item.currentStock < 0;
    return true;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Items & Inventory</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Manage your product catalog, cost prices, profit margins, and stock valuation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            icon={Plus}
            onClick={handleAddNew}
            className="shadow-sm font-semibold cursor-pointer"
          >
            Add New Item
          </Button>
        </div>
      </div>

      {/* 2. Top Executive KPI Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Stock Asset Value */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
              Total Stock Asset Value
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono text-slate-900">
            {formatCurrency(totalValuation, business?.currencySymbol)}
          </div>
          <p className="text-[11px] text-slate-400">Total cost value of inventory on hand</p>
        </div>

        {/* Total Catalog Items */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
              Catalog Items
            </span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono text-slate-900">
            {items.length}
          </div>
          <p className="text-[11px] text-slate-400">
            {productsCount} Products · {servicesCount} Services
          </p>
        </div>

        {/* Low Stock Alerts */}
        <div
          onClick={() => setActiveFilter(activeFilter === 'LOW_STOCK' ? 'ALL' : 'LOW_STOCK')}
          className={`p-4 rounded-2xl border shadow-2xs space-y-1 transition-all cursor-pointer ${
            activeFilter === 'LOW_STOCK'
              ? 'ring-2 ring-amber-500 bg-amber-50/80 border-amber-300'
              : lowStockCount > 0
              ? 'bg-amber-50/40 border-amber-200 hover:bg-amber-50'
              : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
              Low Stock Alerts
            </span>
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${lowStockCount > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400'}`}>
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className={`text-xl sm:text-2xl font-black font-mono ${lowStockCount > 0 ? 'text-amber-900' : 'text-slate-900'}`}>
            {lowStockCount}
          </div>
          <p className="text-[11px] text-slate-400">Items at or below min threshold</p>
        </div>

        {/* Negative Stock Items (High-Priority Alert) */}
        <div
          onClick={() => setActiveFilter(activeFilter === 'NEGATIVE' ? 'ALL' : 'NEGATIVE')}
          className={`p-4 rounded-2xl border shadow-2xs space-y-1 transition-all cursor-pointer ${
            activeFilter === 'NEGATIVE'
              ? 'ring-2 ring-rose-500 bg-rose-50 border-rose-300'
              : negativeStockCount > 0
              ? 'bg-rose-50/60 border-rose-200 hover:bg-rose-50'
              : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between text-slate-500">
            <span
              className={`text-[11px] font-bold uppercase tracking-wider ${
                negativeStockCount > 0 ? 'text-rose-900 font-extrabold' : 'text-slate-600'
              }`}
            >
              Negative Stock Items
            </span>
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${negativeStockCount > 0 ? 'bg-rose-100 text-rose-700 animate-pulse' : 'bg-slate-100 text-slate-400'}`}>
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div
            className={`text-xl sm:text-2xl font-black font-mono ${
              negativeStockCount > 0 ? 'text-rose-700' : 'text-slate-900'
            }`}
          >
            {negativeStockCount}
          </div>
          <p className="text-[11px] text-slate-400">
            {negativeStockCount > 0 ? 'Pending purchase / adjustment entry' : 'All stock balances positive'}
          </p>
        </div>
      </div>

      {/* 3. Filter Tabs & Search Bar */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search items by name, barcode, SKU, or category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-10 pr-4 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 shadow-2xs"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          <button
            onClick={() => setActiveFilter('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              activeFilter === 'ALL'
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            All ({items.length})
          </button>
          <button
            onClick={() => setActiveFilter('PRODUCTS')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              activeFilter === 'PRODUCTS'
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Products ({productsCount})
          </button>
          <button
            onClick={() => setActiveFilter('SERVICES')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              activeFilter === 'SERVICES'
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Services ({servicesCount})
          </button>
          <button
            onClick={() => setActiveFilter('LOW_STOCK')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
              activeFilter === 'LOW_STOCK'
                ? 'bg-amber-600 text-white'
                : 'bg-white text-amber-800 hover:bg-amber-50 border border-amber-200'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Low Stock ({lowStockCount})
          </button>
          {negativeStockCount > 0 && (
            <button
              onClick={() => setActiveFilter('NEGATIVE')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                activeFilter === 'NEGATIVE'
                  ? 'bg-rose-600 text-white'
                  : 'bg-white text-rose-700 hover:bg-rose-50 border border-rose-300'
              }`}
            >
              <AlertCircle className="w-3.5 h-3.5" />
              Negative ({negativeStockCount})
            </button>
          )}
        </div>
      </div>

      {/* 4. Main Catalog Content */}
      {loading ? (
        <div className="py-16 text-center text-sm text-slate-500">Loading your items...</div>
      ) : filteredItems.length === 0 ? (
        <div className="py-12 px-4 text-center bg-white rounded-3xl border border-slate-200/80 shadow-2xs max-w-lg mx-auto space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
            <Package className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {searchQuery ? 'No matching items found' : 'No items in catalog yet'}
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
              {searchQuery
                ? 'Try refining your search keyword or clearing filters.'
                : 'Create your first inventory product or service to track stock, pricing, and sales.'}
            </p>
          </div>
          <div className="pt-2">
            <Button variant="primary" icon={Plus} onClick={handleAddNew} className="cursor-pointer">
              Add First Item
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Mobile Card List (Visible on <md) */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {filteredItems.map((item) => {
              const cost = item.purchasePrice || item.costPrice || 0;
              const marginPercent =
                cost > 0 && item.sellingPrice > 0
                  ? Math.round(((item.sellingPrice - cost) / item.sellingPrice) * 100)
                  : null;
              const stockValue =
                item.trackInventory && item.currentStock > 0 && cost > 0
                  ? item.currentStock * cost
                  : 0;

              return (
                <div
                  key={item.id}
                  className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          item.type === 'PRODUCT'
                            ? 'bg-blue-50 text-blue-600 border border-blue-100'
                            : 'bg-amber-50 text-amber-600 border border-amber-100'
                        }`}
                      >
                        {item.type === 'PRODUCT' ? (
                          <Package className="w-4 h-4" />
                        ) : (
                          <Wrench className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-bold text-slate-900 leading-snug">
                            {item.name}
                          </h3>
                          {item.batches && item.batches.length > 1 && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                              {item.batches.length} Batches
                            </span>
                          )}
                          {item.batches && item.batches.length === 1 && item.batches[0].expiryDate && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 font-mono">
                              Exp: {item.batches[0].expiryDate}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-slate-400">
                            {item.category || item.type}
                          </span>
                          {item.sku && (
                            <span className="text-[11px] font-mono text-slate-400">
                              · SKU: {item.sku}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-base font-bold text-slate-900">
                        {formatCurrency(item.sellingPrice, business?.currencySymbol)}
                      </div>
                      {marginPercent !== null && (
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                            marginPercent > 0
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-rose-50 text-rose-800 border-rose-200'
                          }`}
                        >
                          {marginPercent > 0 ? `+${marginPercent}%` : `${marginPercent}%`} margin
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Pricing & Stock Details Box */}
                  <div className="grid grid-cols-2 gap-2 p-2.5 bg-slate-50 rounded-xl text-xs">
                    <div>
                      <span className="text-slate-400 block text-[10px]">Purchase Cost</span>
                      <span className="font-semibold text-slate-700 font-mono">
                        {cost > 0 ? formatCurrency(cost, business?.currencySymbol) : '—'}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-400 block text-[10px]">Stock Asset Value</span>
                      <span className="font-semibold text-slate-700 font-mono">
                        {stockValue > 0 ? formatCurrency(stockValue, business?.currencySymbol) : '—'}
                      </span>
                    </div>
                  </div>

                  {/* Stock info and actions footer */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <div>
                      {item.trackInventory ? (
                        <button
                          type="button"
                          onClick={() => setAdjustStockItem(item)}
                          className="flex items-center gap-1.5 cursor-pointer text-left group/mstock"
                          title="Click to adjust stock"
                        >
                          {item.currentStock < 0 ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 border border-rose-200 font-mono hover:bg-rose-200 transition-colors">
                              ⚠️ {item.currentStock} {item.unit} (Reconcile Negative)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <Badge variant={item.isLowStock ? 'warning' : 'success'} size="sm">
                                {item.currentStock} {item.unit} in stock
                              </Badge>
                              <span className="text-[10px] text-blue-600 font-medium underline opacity-80 group-hover/mstock:opacity-100">
                                Adjust
                              </span>
                            </span>
                          )}
                        </button>
                      ) : (
                        <Badge variant="neutral" size="sm">
                          Service / Untracked
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      {item.type === 'PRODUCT' && (
                        <button
                          onClick={() => handleEdit(item)}
                          className={`p-2 rounded-lg cursor-pointer ${
                            item.batches && item.batches.length > 1
                              ? 'text-amber-700 bg-amber-50'
                              : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                          }`}
                          title="Configure Batches & MRPs"
                        >
                          <Layers className="w-4 h-4" />
                        </button>
                      )}
                      {item.trackInventory && (
                        <button
                          onClick={() => setHistoryItem(item)}
                          className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                          title="Stock Ledger"
                        >
                          <History className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleEdit(item)}
                        className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                        title="Edit Item"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table View (Visible on >=md) */}
          <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 text-xs font-bold uppercase tracking-wider">
                    <th className="py-3 px-4">Item Name</th>
                    <th className="py-3 px-3">Type / Category</th>
                    <th className="py-3 px-3 text-right">Cost Price</th>
                    <th className="py-3 px-3 text-right">Selling Price</th>
                    <th className="py-3 px-3 text-right">Current Stock</th>
                    <th className="py-3 px-3 text-right">Stock Value</th>
                    <th className="py-3 px-3 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                  {filteredItems.map((item) => {
                    const cost = item.purchasePrice || item.costPrice || 0;
                    const marginPercent =
                      cost > 0 && item.sellingPrice > 0
                        ? Math.round(((item.sellingPrice - cost) / item.sellingPrice) * 100)
                        : null;
                    const stockValue =
                      item.trackInventory && item.currentStock > 0 && cost > 0
                        ? item.currentStock * cost
                        : 0;

                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-slate-50/80 transition-colors group"
                      >
                        {/* Item Name */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                item.type === 'PRODUCT'
                                  ? 'bg-blue-50 text-blue-600'
                                  : 'bg-amber-50 text-amber-600'
                              }`}
                            >
                              {item.type === 'PRODUCT' ? (
                                <Package className="w-4 h-4" />
                              ) : (
                                <Wrench className="w-4 h-4" />
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900 block">{item.name}</span>
                                {item.batches && item.batches.length > 1 && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                                    {item.batches.length} Batches
                                  </span>
                                )}
                                {item.batches && item.batches.length === 1 && item.batches[0].expiryDate && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 font-mono">
                                    Exp: {item.batches[0].expiryDate}
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-slate-400">
                                Unit: {item.unit} {item.sku ? `· SKU: ${item.sku}` : ''}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Category */}
                        <td className="py-3 px-3 text-slate-600 text-xs">
                          <span className="font-semibold text-slate-800">{item.type}</span>
                          {item.category && (
                            <span className="text-slate-400 block text-[11px]">{item.category}</span>
                          )}
                        </td>

                        {/* Cost Price */}
                        <td className="py-3 px-3 text-right font-mono text-slate-600">
                          {cost > 0 ? formatCurrency(cost, business?.currencySymbol) : '—'}
                        </td>

                        {/* Selling Price & Margin */}
                        <td className="py-3 px-3 text-right">
                          <div className="font-bold text-slate-900 font-mono">
                            {formatCurrency(item.sellingPrice, business?.currencySymbol)}
                          </div>
                          {marginPercent !== null && (
                            <span
                              className={`inline-block text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                                marginPercent > 0
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : 'bg-rose-50 text-rose-800 border-rose-200'
                              }`}
                            >
                              {marginPercent > 0 ? `+${marginPercent}%` : `${marginPercent}%`} margin
                            </span>
                          )}
                        </td>

                        {/* Stock Quantity */}
                        <td className="py-3 px-3 text-right">
                          {item.trackInventory ? (
                            <button
                              type="button"
                              onClick={() => setAdjustStockItem(item)}
                              className="inline-flex flex-col items-end group/stock cursor-pointer p-1.5 -mr-1.5 rounded-lg hover:bg-slate-100 transition-colors text-right"
                              title="Click to adjust physical stock count"
                            >
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`font-mono font-bold ${
                                    item.currentStock < 0
                                      ? 'text-rose-700'
                                      : item.isLowStock
                                      ? 'text-amber-700'
                                      : 'text-slate-800'
                                  }`}
                                >
                                  {item.currentStock} {item.unit}
                                </span>
                                <Edit2 className="w-3 h-3 text-slate-300 opacity-0 group-hover/stock:opacity-100 transition-opacity" />
                              </div>
                              {item.currentStock < 0 ? (
                                <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1 rounded flex items-center gap-0.5 hover:bg-rose-100">
                                  Reconcile Negative ⚡
                                </span>
                              ) : item.isLowStock ? (
                                <span className="text-[10px] text-amber-600 font-medium">
                                  ≤ {item.lowStockThreshold} min
                                </span>
                              ) : (
                                <span className="text-[9px] text-blue-600 opacity-0 group-hover/stock:opacity-100 font-medium">
                                  Adjust count
                                </span>
                              )}
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400 font-mono">Untracked</span>
                          )}
                        </td>

                        {/* Stock Asset Value */}
                        <td className="py-3 px-3 text-right font-mono font-semibold text-slate-700">
                          {stockValue > 0
                            ? formatCurrency(stockValue, business?.currencySymbol)
                            : '—'}
                        </td>

                        {/* Status Badge */}
                        <td className="py-3 px-3 text-center">
                          {item.trackInventory ? (
                            item.currentStock < 0 ? (
                              <button
                                type="button"
                                onClick={() => setAdjustStockItem(item)}
                                className="cursor-pointer"
                                title="Click to reconcile negative stock"
                              >
                                <Badge variant="danger" size="sm">
                                  Negative
                                </Badge>
                              </button>
                            ) : (
                              <Badge variant={item.isLowStock ? 'warning' : 'success'} size="sm">
                                {item.isLowStock ? 'Low Stock' : 'In Stock'}
                              </Badge>
                            )
                          ) : (
                            <Badge variant="neutral" size="sm">
                              Active
                            </Badge>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {item.trackInventory && (
                              <button
                                onClick={() => setAdjustStockItem(item)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                                title="Manual Stock Adjustment"
                              >
                                <SlidersHorizontal className="w-4 h-4" />
                              </button>
                            )}
                            {item.type === 'PRODUCT' && (
                              <button
                                onClick={() => handleEdit(item)}
                                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                  item.batches && item.batches.length > 1
                                    ? 'text-amber-700 bg-amber-50 hover:bg-amber-100'
                                    : 'text-slate-400 hover:text-slate-800 hover:bg-slate-100'
                                }`}
                                title="Configure Batches & MRPs"
                              >
                                <Layers className="w-4 h-4" />
                              </button>
                            )}
                            {item.trackInventory && (
                              <button
                                onClick={() => setHistoryItem(item)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
                                title="Stock Movements Ledger"
                              >
                                <History className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => handleEdit(item)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
                              title="Edit Item Details"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(item)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                              title="Archive Item"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Item Add/Edit Modal */}
      <ItemFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSuccess={loadItems}
        initialItem={editingItem}
      />

      {/* Item Stock Movements Ledger Modal */}
      <ItemHistoryModal
        isOpen={!!historyItem}
        onClose={() => setHistoryItem(null)}
        item={historyItem}
      />

      {/* Manual Stock Adjustment Modal */}
      <AdjustStockModal
        isOpen={!!adjustStockItem}
        onClose={() => setAdjustStockItem(null)}
        onSuccess={() => {
          setAdjustStockItem(null);
          loadItems();
        }}
        item={adjustStockItem}
      />
    </div>
  );
};
