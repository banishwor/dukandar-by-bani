import React, { useState, useEffect, useCallback } from 'react';
import { useBusiness } from '../../contexts/BusinessContext';
import { itemRepository } from '../../repositories/itemRepository';
import type { ItemWithStock } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { ItemFormModal } from './ItemFormModal';
import { ItemHistoryModal } from './ItemHistoryModal';
import {
  Package,
  Plus,
  Search,
  Wrench,
  AlertTriangle,
  History,
  Edit2,
  Trash2,
  Filter,
} from 'lucide-react';
import { useToast } from '../../components/ui/Toast';

export const ItemsView: React.FC = () => {
  const { business } = useBusiness();
  const { showSuccess, showError } = useToast();

  const [items, setItems] = useState<ItemWithStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'PRODUCTS' | 'SERVICES' | 'LOW_STOCK'>('ALL');

  // Modals state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ItemWithStock | null>(null);
  const [historyItem, setHistoryItem] = useState<ItemWithStock | null>(null);

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

  const filteredItems = items.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.sku && item.sku.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.category && item.category.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    if (activeFilter === 'PRODUCTS') return item.type === 'PRODUCT';
    if (activeFilter === 'SERVICES') return item.type === 'SERVICE';
    if (activeFilter === 'LOW_STOCK') return item.isLowStock;
    return true;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Items & Inventory</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Manage your products, services, pricing, and live stock movements.
          </p>
        </div>
        <Button
          variant="primary"
          icon={Plus}
          onClick={handleAddNew}
          className="shadow-sm"
        >
          Add Item
        </Button>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search items by name, SKU, or category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 shadow-xs"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          <button
            onClick={() => setActiveFilter('ALL')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              activeFilter === 'ALL'
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            All ({items.length})
          </button>
          <button
            onClick={() => setActiveFilter('PRODUCTS')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              activeFilter === 'PRODUCTS'
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Products ({items.filter((i) => i.type === 'PRODUCT').length})
          </button>
          <button
            onClick={() => setActiveFilter('SERVICES')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              activeFilter === 'SERVICES'
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Services ({items.filter((i) => i.type === 'SERVICE').length})
          </button>
          <button
            onClick={() => setActiveFilter('LOW_STOCK')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
              activeFilter === 'LOW_STOCK'
                ? 'bg-amber-600 text-white'
                : 'bg-white text-amber-700 hover:bg-amber-50 border border-amber-200'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Low Stock ({items.filter((i) => i.isLowStock).length})
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="py-16 text-center text-sm text-slate-500">Loading your items...</div>
      ) : filteredItems.length === 0 ? (
        <EmptyState
          icon={Package}
          title={searchQuery ? 'No matching items found' : 'No items yet'}
          description={
            searchQuery
              ? 'Try refining your search keyword or clearing filters.'
              : 'Add products and services to start creating sales and tracking inventory.'
          }
          actionLabel={searchQuery ? undefined : 'Add First Item'}
          onAction={searchQuery ? undefined : handleAddNew}
          actionIcon={Plus}
        />
      ) : (
        <>
          {/* Mobile Card List (Visible on <md) */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col gap-3"
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
                      <h3 className="text-sm font-bold text-slate-900 leading-snug">{item.name}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-slate-400">
                          {item.category || item.type}
                        </span>
                        {item.sku && (
                          <span className="text-[11px] font-mono text-slate-400">· SKU: {item.sku}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-base font-bold text-slate-900">
                      {formatCurrency(item.sellingPrice, business?.currencySymbol)}
                    </span>
                    <span className="block text-[11px] text-slate-400">per {item.unit}</span>
                  </div>
                </div>

                {/* Stock info and actions footer */}
                <div className="flex items-center justify-between pt-2.5 border-t border-slate-100">
                  <div>
                    {item.trackInventory ? (
                      <div className="flex items-center gap-2">
                        <Badge variant={item.isLowStock ? 'warning' : 'success'} size="sm">
                          {item.currentStock} {item.unit} in stock
                        </Badge>
                        {item.isLowStock && (
                          <span className="text-[11px] text-amber-600 font-medium">Low stock</span>
                        )}
                      </div>
                    ) : (
                      <Badge variant="neutral" size="sm">
                        Service / Untracked
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    {item.trackInventory && (
                      <button
                        onClick={() => setHistoryItem(item)}
                        className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                        title="Stock Ledger"
                      >
                        <History className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => handleEdit(item)}
                      className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                      title="Edit Item"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table View (Visible on >=md) */}
          <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/75 text-slate-500 text-xs font-bold uppercase tracking-wider">
                    <th className="py-3.5 px-5">Item Name</th>
                    <th className="py-3.5 px-4">Type / Category</th>
                    <th className="py-3.5 px-4">SKU</th>
                    <th className="py-3.5 px-4 text-right">Selling Price</th>
                    <th className="py-3.5 px-4 text-right">Stock</th>
                    <th className="py-3.5 px-4 text-center">Status</th>
                    <th className="py-3.5 px-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredItems.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="py-3.5 px-5">
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
                            <span className="font-bold text-slate-900 block">{item.name}</span>
                            <span className="text-xs text-slate-400">Unit: {item.unit}</span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-slate-600 text-xs">
                        <span className="font-medium text-slate-800">{item.type}</span>
                        {item.category && <span className="text-slate-400 block">{item.category}</span>}
                      </td>

                      <td className="py-3.5 px-4 text-slate-500 text-xs font-mono">
                        {item.sku || '—'}
                      </td>

                      <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                        {formatCurrency(item.sellingPrice, business?.currencySymbol)}
                      </td>

                      <td className="py-3.5 px-4 text-right font-semibold">
                        {item.trackInventory ? (
                          <div className="inline-flex flex-col items-end">
                            <span
                              className={`font-mono text-sm ${
                                item.isLowStock ? 'text-amber-600 font-bold' : 'text-slate-800'
                              }`}
                            >
                              {item.currentStock} {item.unit}
                            </span>
                            {item.isLowStock && (
                              <span className="text-[10px] text-amber-600 font-medium">
                                ≤ {item.lowStockThreshold} threshold
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Untracked</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        {item.trackInventory ? (
                          <Badge variant={item.isLowStock ? 'warning' : 'success'} size="sm">
                            {item.isLowStock ? 'Low Stock' : 'In Stock'}
                          </Badge>
                        ) : (
                          <Badge variant="neutral" size="sm">
                            Active
                          </Badge>
                        )}
                      </td>

                      <td className="py-3.5 px-5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {item.trackInventory && (
                            <button
                              onClick={() => setHistoryItem(item)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                              title="Stock Movements Ledger"
                            >
                              <History className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleEdit(item)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                            title="Edit Item"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(item)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            title="Archive Item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
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
    </div>
  );
};
