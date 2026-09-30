import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useBusiness } from '../../contexts/BusinessContext';
import { useToast } from '../../components/ui/Toast';
import { itemRepository } from '../../repositories/itemRepository';
import type { ItemWithStock } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { Package, TrendingUp, Sparkles, Check, Tag } from 'lucide-react';

interface QuickItemCreateModalProps {
  isOpen: boolean;
  initialName?: string;
  initialUnitCost?: number;
  currencySymbol?: string;
  onClose: () => void;
  onItemCreated: (item: ItemWithStock) => void;
}

const COMMON_UNITS = ['pcs', 'kg', 'g', 'ltr', 'ml', 'box', 'pack', 'meter', 'unit'];
const SUGGESTED_CATEGORIES = ['Groceries', 'Snacks', 'Beverages', 'Dairy', 'Personal Care', 'Hardware', 'General'];

export const QuickItemCreateModal: React.FC<QuickItemCreateModalProps> = ({
  isOpen,
  initialName = '',
  initialUnitCost = 0,
  currencySymbol = '₹',
  onClose,
  onItemCreated,
}) => {
  const { business } = useBusiness();
  const { showSuccess, showError } = useToast();

  const [name, setName] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [category, setCategory] = useState('');
  const [costPrice, setCostPrice] = useState<string>('');
  const [sellingPrice, setSellingPrice] = useState<string>('');
  const [barcode, setBarcode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(initialName || '');
      setUnit('pcs');
      setCategory('');
      setCostPrice(initialUnitCost > 0 ? String(initialUnitCost) : '');
      // Auto-suggest selling price with ~20% markup if cost is provided
      if (initialUnitCost > 0) {
        setSellingPrice(String(Math.round(initialUnitCost * 1.25)));
      } else {
        setSellingPrice('');
      }
      setBarcode('');
    }
  }, [isOpen, initialName, initialUnitCost]);

  const numCost = parseFloat(costPrice) || 0;
  const numSelling = parseFloat(sellingPrice) || 0;
  const marginPercent =
    numCost > 0 && numSelling > numCost
      ? Math.round(((numSelling - numCost) / numSelling) * 100)
      : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!business) return;

    if (!name.trim()) {
      showError('Please enter a valid product name.');
      return;
    }

    try {
      setIsSubmitting(true);

      const created = await itemRepository.createItem(business.id, {
        name: name.trim(),
        type: 'PRODUCT',
        unit: unit.trim() || 'pcs',
        category: category.trim() || undefined,
        purchasePrice: numCost > 0 ? numCost : undefined,
        costPrice: numCost > 0 ? numCost : undefined,
        sellingPrice: numSelling,
        openingStock: 0,
        lowStockThreshold: 5,
        trackInventory: true,
        isActive: true,
        barcode: barcode.trim() || undefined,
      });

      const fullItem = (await itemRepository.getItemWithStock(created.id)) || {
        ...created,
        currentStock: 0,
        isLowStock: true,
      };

      showSuccess(`Product "${created.name}" created and added to bill!`);
      onItemCreated(fullItem);
      onClose();
    } catch (err: any) {
      console.error('Failed to quick-create item', err);
      showError(err.message || 'Unable to create product.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Quick Create Product"
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Product Name */}
        <Input
          label="Product Name *"
          placeholder="e.g. Parle-G 250g, Basmati Rice 1kg"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          required
        />

        {/* Unit & Category */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              Unit of Measurement
            </label>
            <div className="flex gap-1.5">
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
              >
                {COMMON_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              Category (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Snacks, Groceries"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
            />
          </div>
        </div>

        {/* Quick Category Chips */}
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-[11px] text-slate-400 font-medium">Quick Category:</span>
          {SUGGESTED_CATEGORIES.slice(0, 4).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`text-[10px] px-2 py-0.5 rounded-lg border transition-colors cursor-pointer ${
                category.toLowerCase() === cat.toLowerCase()
                  ? 'bg-amber-100 border-amber-300 text-amber-900 font-bold'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Pricing: Purchase Cost vs Retail Selling Price */}
        <div className="p-3.5 bg-slate-50/80 rounded-2xl border border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              Pricing & Retail Margin
            </span>
            {marginPercent !== null && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                +{marginPercent}% Profit Margin
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                Purchase Cost ({currencySymbol})
              </label>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                placeholder="0"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white font-mono font-bold text-xs text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                Selling Price / MRP ({currencySymbol})
              </label>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                placeholder="0"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white font-mono font-bold text-xs text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
              />
            </div>
          </div>
        </div>

        {/* Barcode / SKU (Optional) */}
        <Input
          label="Barcode / SKU (Optional)"
          placeholder="Scan barcode or leave blank"
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
        />

        {/* Modal Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            icon={Check}
            type="submit"
            isLoading={isSubmitting}
            className="bg-amber-700 hover:bg-amber-800 focus:ring-amber-500"
          >
            Create & Add to Bill
          </Button>
        </div>
      </form>
    </Modal>
  );
};
