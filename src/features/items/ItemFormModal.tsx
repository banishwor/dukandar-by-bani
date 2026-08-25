import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/ui/Modal';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useBusiness } from '../../contexts/BusinessContext';
import { useToast } from '../../components/ui/Toast';
import { itemRepository } from '../../repositories/itemRepository';
import type { Item, ItemType, ItemWithStock } from '../../types';
import { Package, Wrench, AlertTriangle } from 'lucide-react';

interface ItemFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialItem?: ItemWithStock | null;
}

const COMMON_UNITS = ['pcs', 'kg', 'g', 'ltr', 'ml', 'box', 'pack', 'meter', 'hrs', 'unit'];

export const ItemFormModal: React.FC<ItemFormModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialItem,
}) => {
  const { business } = useBusiness();
  const { showSuccess, showError } = useToast();

  const [isMobile, setIsMobile] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [type, setType] = useState<ItemType>('PRODUCT');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [category, setCategory] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [sellingPrice, setSellingPrice] = useState<string>('');
  const [purchasePrice, setPurchasePrice] = useState<string>('');
  const [openingStock, setOpeningStock] = useState<string>('0');
  const [lowStockThreshold, setLowStockThreshold] = useState<string>('5');
  const [trackInventory, setTrackInventory] = useState(true);

  // Errors
  const [nameError, setNameError] = useState('');
  const [priceError, setPriceError] = useState('');

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (initialItem) {
      setName(initialItem.name);
      setType(initialItem.type);
      setSku(initialItem.sku || '');
      setBarcode(initialItem.barcode || '');
      setCategory(initialItem.category || '');
      setUnit(initialItem.unit || 'pcs');
      setSellingPrice(String(initialItem.sellingPrice || ''));
      setPurchasePrice(initialItem.purchasePrice ? String(initialItem.purchasePrice) : '');
      setOpeningStock(String(initialItem.openingStock || '0'));
      setLowStockThreshold(String(initialItem.lowStockThreshold || '5'));
      setTrackInventory(initialItem.trackInventory);
    } else {
      setName('');
      setType('PRODUCT');
      setSku('');
      setBarcode('');
      setCategory('');
      setUnit('pcs');
      setSellingPrice('');
      setPurchasePrice('');
      setOpeningStock('0');
      setLowStockThreshold('5');
      setTrackInventory(true);
    }
    setNameError('');
    setPriceError('');
  }, [initialItem, isOpen]);

  const handleTypeChange = (newType: ItemType) => {
    setType(newType);
    if (newType === 'SERVICE') {
      setTrackInventory(false);
      setUnit('hrs');
    } else {
      setTrackInventory(true);
      setUnit('pcs');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!business) return;

    let hasError = false;
    if (!name.trim()) {
      setNameError('Item name is required');
      hasError = true;
    } else {
      setNameError('');
    }

    const sPrice = parseFloat(sellingPrice);
    if (isNaN(sPrice) || sPrice < 0) {
      setPriceError('Enter a valid selling price');
      hasError = true;
    } else {
      setPriceError('');
    }

    if (hasError) return;

    const pPrice = purchasePrice ? parseFloat(purchasePrice) : undefined;
    const opStock = trackInventory ? Math.max(0, parseFloat(openingStock) || 0) : 0;
    const lowThreshold = trackInventory ? Math.max(0, parseFloat(lowStockThreshold) || 5) : undefined;

    try {
      setIsSubmitting(true);

      if (initialItem) {
        // Update existing item
        await itemRepository.updateItem(initialItem.id, {
          name: name.trim(),
          type,
          sku: sku.trim() || undefined,
          barcode: barcode.trim() || undefined,
          category: category.trim() || undefined,
          unit: unit.trim() || 'pcs',
          sellingPrice: sPrice,
          purchasePrice: pPrice,
          lowStockThreshold: lowThreshold,
          trackInventory,
        });
        showSuccess(`Updated ${name}`);
      } else {
        // Create new item (creates opening stock movement if opStock > 0)
        await itemRepository.createItem(business.id, {
          name: name.trim(),
          type,
          sku: sku.trim() || undefined,
          barcode: barcode.trim() || undefined,
          category: category.trim() || undefined,
          unit: unit.trim() || 'pcs',
          sellingPrice: sPrice,
          purchasePrice: pPrice,
          openingStock: opStock,
          lowStockThreshold: lowThreshold,
          trackInventory,
          isActive: true,
        });
        showSuccess(`Added ${name} to inventory`);
      }

      onSuccess();
      onClose();
    } catch (err) {
      console.error('Failed to save item', err);
      showError('Unable to save item. Please check the fields and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Type Selector (Product vs Service) */}
      <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
        <button
          type="button"
          onClick={() => handleTypeChange('PRODUCT')}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${
            type === 'PRODUCT' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Package className="w-4 h-4 text-blue-600" />
          Product
        </button>
        <button
          type="button"
          onClick={() => handleTypeChange('SERVICE')}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${
            type === 'SERVICE' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Wrench className="w-4 h-4 text-amber-600" />
          Service
        </button>
      </div>

      {/* Item Name */}
      <Input
        label="Item / Service Name"
        required
        autoFocus
        placeholder="e.g. Basmati Rice 1kg, AC Repair Service"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={nameError}
      />

      {/* Pricing Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          label="Selling Price"
          required
          type="number"
          step="any"
          min="0"
          placeholder="0.00"
          prefixElement={<span>{business?.currencySymbol || '₹'}</span>}
          value={sellingPrice}
          onChange={(e) => setSellingPrice(e.target.value)}
          error={priceError}
        />
        <Input
          label="Purchase / Cost Price (Optional)"
          type="number"
          step="any"
          min="0"
          placeholder="0.00"
          prefixElement={<span>{business?.currencySymbol || '₹'}</span>}
          value={purchasePrice}
          onChange={(e) => setPurchasePrice(e.target.value)}
        />
      </div>

      {/* Unit & Category */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="w-full flex flex-col gap-1.5 text-left">
          <label className="text-xs font-semibold text-slate-700">Unit of Measure</label>
          <div className="flex gap-2">
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              {COMMON_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        </div>

        <Input
          label="Category (Optional)"
          placeholder="e.g. Groceries, Electronics"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
      </div>

      {/* Product Specific: Inventory Tracking */}
      {type === 'PRODUCT' && (
        <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-slate-900">Track Inventory</h4>
              <p className="text-[11px] text-slate-500">Record stock additions and deductions with sales</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={trackInventory}
                onChange={(e) => setTrackInventory(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
            </label>
          </div>

          {trackInventory && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-200/60">
              {!initialItem ? (
                <Input
                  label="Opening Stock"
                  type="number"
                  step="any"
                  min="0"
                  placeholder="0"
                  suffixElement={<span className="text-xs text-slate-400 font-medium">{unit}</span>}
                  value={openingStock}
                  onChange={(e) => setOpeningStock(e.target.value)}
                  helperText="Initial quantity available right now"
                />
              ) : (
                <div className="flex flex-col gap-1 text-left">
                  <span className="text-xs font-semibold text-slate-700">Current Stock</span>
                  <div className="h-11 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-100 text-slate-800 text-sm font-bold flex items-center justify-between">
                    <span>{initialItem.currentStock} {unit}</span>
                    <span className="text-[11px] text-slate-500 font-normal">Calculated</span>
                  </div>
                </div>
              )}

              <Input
                label="Low Stock Alert Threshold"
                type="number"
                step="any"
                min="0"
                placeholder="5"
                suffixElement={<span className="text-xs text-slate-400 font-medium">{unit}</span>}
                value={lowStockThreshold}
                onChange={(e) => setLowStockThreshold(e.target.value)}
                helperText="Alert when stock falls below this"
              />
            </div>
          )}
        </div>
      )}

      {/* SKU & Barcode */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          label="Item Code / SKU (Optional)"
          placeholder="e.g. SKU-001"
          value={sku}
          onChange={(e) => setSku(e.target.value)}
        />
        <Input
          label="Barcode (Optional)"
          placeholder="e.g. 890123456789"
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
        />
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
        <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" isLoading={isSubmitting}>
          {initialItem ? 'Update Item' : 'Save Item'}
        </Button>
      </div>
    </form>
  );

  const title = initialItem ? `Edit ${initialItem.name}` : 'Add New Item';
  const subtitle = 'Products with inventory tracking or service items';

  if (isMobile) {
    return (
      <BottomSheet isOpen={isOpen} onClose={onClose} title={title} subtitle={subtitle}>
        {formContent}
      </BottomSheet>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} subtitle={subtitle} maxWidth="lg">
      {formContent}
    </Modal>
  );
};
