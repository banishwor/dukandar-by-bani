import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/ui/Modal';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useBusiness } from '../../contexts/BusinessContext';
import { useToast } from '../../components/ui/Toast';
import { itemRepository } from '../../repositories/itemRepository';
import type { Item, ItemType, ItemWithStock, ItemBatch } from '../../types';
import { Package, Wrench, AlertTriangle, Layers, Plus, Trash2, Tag, Calendar } from 'lucide-react';
import { generateUniqueId } from '../../utils/id';

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
  const [batches, setBatches] = useState<ItemBatch[]>([]);

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
      setBatches(
        initialItem.batches && initialItem.batches.length > 0
          ? JSON.parse(JSON.stringify(initialItem.batches))
          : []
      );
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
      setBatches([]);
    }
    setNameError('');
    setPriceError('');
  }, [initialItem, isOpen]);

  const handleTypeChange = (newType: ItemType) => {
    setType(newType);
    if (newType === 'SERVICE') {
      setTrackInventory(false);
      setUnit('hrs');
      setBatches([]);
    } else {
      setTrackInventory(true);
      setUnit('pcs');
    }
  };

  // Add a new empty batch to the list
  const handleAddBatch = () => {
    const nextIdx = batches.length + 1;
    const baseMrp = parseFloat(sellingPrice) || 0;
    const baseCost = parseFloat(purchasePrice) || 0;
    const newBatch: ItemBatch = {
      id: generateUniqueId('BATCH'),
      itemId: initialItem?.id,
      batchNumber: `LOT-${String(nextIdx).padStart(2, '0')}`,
      mrp: baseMrp,
      costPrice: baseCost > 0 ? baseCost : undefined,
      expiryDate: '',
      stockQuantity: 0,
    };
    setBatches((prev) => [...prev, newBatch]);
  };

  // Split product into 2 initial batches
  const handleEnableMultiBatch = () => {
    const baseMrp = parseFloat(sellingPrice) || 0;
    const baseCost = parseFloat(purchasePrice) || 0;
    const curStock = initialItem?.currentStock ?? (parseFloat(openingStock) || 0);

    const b1: ItemBatch = {
      id: generateUniqueId('BATCH'),
      itemId: initialItem?.id,
      batchNumber: 'LOT-01',
      mrp: baseMrp,
      costPrice: baseCost > 0 ? baseCost : undefined,
      expiryDate: '',
      stockQuantity: curStock,
    };

    const b2: ItemBatch = {
      id: generateUniqueId('BATCH'),
      itemId: initialItem?.id,
      batchNumber: 'LOT-02',
      mrp: baseMrp,
      costPrice: baseCost > 0 ? baseCost : undefined,
      expiryDate: '',
      stockQuantity: 0,
    };

    setBatches([b1, b2]);
  };

  // Update a single batch property
  const handleBatchFieldChange = <K extends keyof ItemBatch>(
    index: number,
    field: K,
    value: ItemBatch[K]
  ) => {
    setBatches((prev) => {
      const copy = [...prev];
      if (!copy[index]) return prev;
      copy[index] = {
        ...copy[index],
        [field]: value,
      };
      return copy;
    });
  };

  // Remove a batch
  const handleRemoveBatch = (index: number) => {
    setBatches((prev) => prev.filter((_, idx) => idx !== index));
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

    // Process and validate batches if product
    let cleanedBatches: ItemBatch[] | undefined = undefined;
    if (type === 'PRODUCT' && batches.length > 0) {
      cleanedBatches = batches.map((b, idx) => ({
        id: b.id || generateUniqueId('BATCH'),
        itemId: initialItem?.id,
        batchNumber: (b.batchNumber || '').trim() || `LOT-${idx + 1}`,
        mrp: Number(b.mrp) > 0 ? Number(b.mrp) : sPrice,
        costPrice: b.costPrice !== undefined && !isNaN(Number(b.costPrice)) ? Number(b.costPrice) : pPrice,
        expiryDate: b.expiryDate?.trim() || undefined,
        stockQuantity: Math.max(0, Number(b.stockQuantity) || 0),
      }));
    }

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
          batches: cleanedBatches,
        });
        showSuccess(`Updated ${name}`);
      } else {
        const finalOpeningStock = cleanedBatches && cleanedBatches.length > 0
          ? cleanedBatches.reduce((sum, b) => sum + b.stockQuantity, 0)
          : opStock;

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
          openingStock: finalOpeningStock,
          lowStockThreshold: lowThreshold,
          trackInventory,
          isActive: true,
          batches: cleanedBatches,
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

      {/* Multi-MRP & Multi-Expiry Batches Section */}
      {type === 'PRODUCT' && (
        <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-amber-100 text-amber-800 rounded-lg">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  Batches, Multi-MRP & Expiry Lots
                  {batches.length > 0 && (
                    <span className="text-[10px] bg-amber-200/80 text-amber-900 font-bold px-2 py-0.5 rounded-full">
                      {batches.length} {batches.length === 1 ? 'batch' : 'batches'}
                    </span>
                  )}
                </h4>
                <p className="text-[11px] text-slate-500">
                  Manage different printed MRPs, lot numbers, or expiration dates for this product
                </p>
              </div>
            </div>

            {batches.length > 0 ? (
              <button
                type="button"
                onClick={handleAddBatch}
                className="px-2.5 py-1 text-xs font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50 border border-blue-200 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Batch
              </button>
            ) : (
              <button
                type="button"
                onClick={handleEnableMultiBatch}
                className="px-2.5 py-1 text-xs font-bold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors flex items-center gap-1 cursor-pointer shadow-3xs"
              >
                <Plus className="w-3.5 h-3.5 text-blue-600" />
                Enable Multi-MRP
              </button>
            )}
          </div>

          {batches.length === 0 ? (
            <div className="p-3 border border-dashed border-slate-200 rounded-xl bg-white text-center">
              <p className="text-xs text-slate-500">
                Single standard MRP ({business?.currencySymbol || '₹'}{sellingPrice || '0.00'}). No multiple lots configured.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5 pt-1">
              {batches.map((batch, index) => {
                return (
                  <div
                    key={batch.id || index}
                    className="p-3 bg-white rounded-xl border border-slate-200/90 shadow-2xs space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-700">
                          {index + 1}
                        </span>
                        Batch #{index + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveBatch(index)}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Remove this batch"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                          Lot / Batch No. *
                        </label>
                        <input
                          type="text"
                          required
                          value={batch.batchNumber}
                          placeholder={`LOT-0${index + 1}`}
                          onChange={(e) => handleBatchFieldChange(index, 'batchNumber', e.target.value)}
                          className="w-full h-8 px-2 font-mono text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                          MRP ({business?.currencySymbol || '₹'}) *
                        </label>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          required
                          value={batch.mrp || ''}
                          placeholder="0.00"
                          onChange={(e) => handleBatchFieldChange(index, 'mrp', parseFloat(e.target.value) || 0)}
                          className="w-full h-8 px-2 font-mono font-bold text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden text-slate-900"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                          Cost ({business?.currencySymbol || '₹'})
                        </label>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={batch.costPrice ?? ''}
                          placeholder="Optional"
                          onChange={(e) => handleBatchFieldChange(index, 'costPrice', e.target.value ? parseFloat(e.target.value) : undefined)}
                          className="w-full h-8 px-2 font-mono text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                          Stock ({unit})
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={batch.stockQuantity ?? 0}
                          placeholder="0"
                          onChange={(e) => handleBatchFieldChange(index, 'stockQuantity', Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-full h-8 px-2 font-mono font-bold text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                        />
                      </div>

                      <div className="col-span-2 sm:col-span-4">
                        <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                          Expiry Date (Optional)
                        </label>
                        <input
                          type="date"
                          value={batch.expiryDate || ''}
                          onChange={(e) => handleBatchFieldChange(index, 'expiryDate', e.target.value)}
                          className="w-full h-8 px-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-slate-500">
                  Total Allocated Batch Stock:{' '}
                  <strong className="font-mono text-slate-800">
                    {batches.reduce((sum, b) => sum + (Number(b.stockQuantity) || 0), 0)} {unit}
                  </strong>
                </span>

                <button
                  type="button"
                  onClick={() => setBatches([])}
                  className="text-[11px] text-slate-400 hover:text-slate-600 underline cursor-pointer"
                >
                  Reset to Single MRP
                </button>
              </div>
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
