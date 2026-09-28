import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useToast } from '../../components/ui/Toast';
import { inventoryRepository } from '../../repositories/inventoryRepository';
import { itemRepository } from '../../repositories/itemRepository';
import type { ItemWithStock, ItemBatch } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { generateUniqueId } from '../../utils/id';
import {
  PackagePlus,
  AlertCircle,
  Sparkles,
  ArrowRight,
  TrendingUp,
  Tag,
  Calendar,
} from 'lucide-react';

interface QuickRestockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (addedStock: number, updatedItem?: ItemWithStock) => void;
  item: ItemWithStock | null;
  businessId: string;
  currencySymbol?: string;
  enableExpiryTracking?: boolean;
}

export const QuickRestockModal: React.FC<QuickRestockModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  item,
  businessId,
  currencySymbol = '₹',
  enableExpiryTracking = false,
}) => {
  const { showSuccess, showError } = useToast();

  const [quantity, setQuantity] = useState<string>('10');
  const [purchasePrice, setPurchasePrice] = useState<string>('');
  const [sellingPrice, setSellingPrice] = useState<string>('');
  const [batchNumber, setBatchNumber] = useState<string>('');
  const [expiryDate, setExpiryDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('Counter quick restock (delivery received)');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (item && isOpen) {
      const defaultQty = item.currentStock < 0 ? Math.abs(item.currentStock) + 10 : 10;
      setQuantity(String(defaultQty));

      const cost = item.purchasePrice || item.costPrice || 0;
      setPurchasePrice(cost > 0 ? String(cost) : '');
      setSellingPrice(item.sellingPrice > 0 ? String(item.sellingPrice) : '');

      // Check if existing batches exist
      if (item.batches && item.batches.length > 0) {
        const latestBatch = item.batches[item.batches.length - 1];
        setBatchNumber(latestBatch.batchNumber || '');
        setExpiryDate(latestBatch.expiryDate || '');
      } else {
        setBatchNumber('');
        setExpiryDate('');
      }

      setNotes('Counter quick restock (delivery received)');
    }
  }, [item, isOpen]);

  if (!item) return null;

  const parsedQty = parseFloat(quantity) || 0;
  const parsedCost = parseFloat(purchasePrice) || 0;
  const parsedSelling = parseFloat(sellingPrice) || item.sellingPrice;
  const newProjectedStock = item.currentStock + parsedQty;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (parsedQty <= 0) {
      showError('Please enter a valid restock quantity greater than 0.');
      return;
    }

    try {
      setIsSubmitting(true);

      // 1. Record append-only stock movement
      await inventoryRepository.createMovement(
        businessId,
        item.id,
        'PURCHASE',
        parsedQty,
        notes.trim() || 'Quick Counter Restock'
      );

      // 2. If item has batches or user provided batch / price updates, update item
      const itemUpdates: Record<string, any> = {};

      if (parsedCost > 0 && parsedCost !== (item.purchasePrice || item.costPrice)) {
        itemUpdates.purchasePrice = parsedCost;
        itemUpdates.costPrice = parsedCost;
      }
      if (parsedSelling > 0 && parsedSelling !== item.sellingPrice) {
        itemUpdates.sellingPrice = parsedSelling;
      }

      // Handle batches if tracking expiry or if item already has batches
      if (enableExpiryTracking || (item.batches && item.batches.length > 0) || batchNumber.trim()) {
        const currentBatches: ItemBatch[] = item.batches ? [...item.batches] : [];
        const cleanBatchNum = batchNumber.trim() || 'BATCH-1';

        const existingBatchIndex = currentBatches.findIndex(
          (b) => b.batchNumber.toLowerCase() === cleanBatchNum.toLowerCase()
        );

        if (existingBatchIndex >= 0) {
          // Increment existing batch quantity
          const existing = currentBatches[existingBatchIndex];
          currentBatches[existingBatchIndex] = {
            ...existing,
            stockQuantity: (existing.stockQuantity || 0) + parsedQty,
            mrp: parsedSelling || existing.mrp,
            costPrice: parsedCost > 0 ? parsedCost : existing.costPrice,
            expiryDate: expiryDate.trim() || existing.expiryDate,
          };
        } else {
          // Add new batch
          currentBatches.push({
            id: generateUniqueId('BATCH'),
            itemId: item.id,
            batchNumber: cleanBatchNum,
            expiryDate: expiryDate.trim() || undefined,
            mrp: parsedSelling,
            costPrice: parsedCost > 0 ? parsedCost : undefined,
            stockQuantity: parsedQty,
            createdAt: new Date().toISOString(),
          });
        }
        itemUpdates.batches = currentBatches;
      }

      if (Object.keys(itemUpdates).length > 0) {
        await itemRepository.updateItem(item.id, itemUpdates);
      }

      showSuccess(`Restocked +${parsedQty} ${item.unit} for ${item.name}!`);

      const updatedItem: ItemWithStock = {
        ...item,
        ...itemUpdates,
        currentStock: newProjectedStock,
        isLowStock: newProjectedStock <= (item.lowStockThreshold || 5),
      };

      onSuccess(parsedQty, updatedItem);
      onClose();
    } catch (err: any) {
      console.error('Quick restock failed', err);
      showError(err.message || 'Failed to record stock entry');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Quick Inward Restock"
      subtitle="Immediately add inventory received at counter without leaving active sale"
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Item Header Card */}
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-900">{item.name}</span>
              {item.unit && (
                <span className="text-[10px] font-mono text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                  {item.unit}
                </span>
              )}
            </div>
            {item.sku && (
              <span className="text-xs text-slate-400 font-mono block mt-0.5">
                SKU: {item.sku}
              </span>
            )}
          </div>

          <div className="text-right">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">
              Current Stock
            </span>
            <span
              className={`font-mono font-bold text-sm ${
                item.currentStock < 0
                  ? 'text-rose-600'
                  : item.currentStock === 0
                  ? 'text-amber-600'
                  : 'text-slate-800'
              }`}
            >
              {item.currentStock} {item.unit}
            </span>
          </div>
        </div>

        {/* Quantity to Inward */}
        <div>
          <label className="text-xs font-bold text-slate-700 block mb-1">
            Quantity Received / Adding to Shelf *
          </label>
          <div className="relative">
            <input
              type="number"
              inputMode="decimal"
              min="0.01"
              step="any"
              autoFocus
              required
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="e.g. 10"
              className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-900 font-mono font-bold text-base focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 font-mono">
              {item.unit}
            </span>
          </div>
        </div>

        {/* Price Inputs: Cost Price & Selling Price */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Purchase Cost / Unit
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-mono">
                {currencySymbol}
              </span>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                placeholder="0.00"
                className="w-full h-10 pl-7 pr-3 rounded-xl border border-slate-200 bg-white text-slate-900 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">For asset valuation</span>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Selling Price / MRP
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-mono">
                {currencySymbol}
              </span>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
                placeholder="0.00"
                className="w-full h-10 pl-7 pr-3 rounded-xl border border-slate-200 bg-white text-slate-900 font-mono font-bold text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">Customer bill rate</span>
          </div>
        </div>

        {/* Optional Expiry Date & Batch if enabled */}
        {enableExpiryTracking && (
          <div className="grid grid-cols-2 gap-3 p-3 bg-amber-50/40 rounded-xl border border-amber-200/60">
            <div>
              <label className="text-[11px] font-bold text-amber-900 block mb-1">
                Batch No. (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. B-042"
                value={batchNumber}
                onChange={(e) => setBatchNumber(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-amber-200 bg-white text-slate-900 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-amber-900 block mb-1">
                Exp. Date (MM/YY)
              </label>
              <input
                type="text"
                placeholder="MM/YY"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-amber-200 bg-white text-slate-900 text-xs font-mono text-center focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>
        )}

        {/* Note / Source */}
        <div>
          <label className="text-xs font-bold text-slate-700 block mb-1">
            Supplier / Note
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Received from dairy distributor / counter restock"
            className="w-full h-9 px-3 rounded-xl border border-slate-200 bg-white text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        {/* Projected Stock Preview */}
        <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-200 flex items-center justify-between text-xs">
          <span className="text-blue-900 font-medium">New Stock after Restock:</span>
          <div className="flex items-center gap-2 font-mono font-bold">
            <span className="text-slate-500">{item.currentStock}</span>
            <ArrowRight className="w-3.5 h-3.5 text-blue-600" />
            <span className="text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded-md">
              +{parsedQty} = {newProjectedStock} {item.unit}
            </span>
          </div>
        </div>

        {/* Actions Footer */}
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            icon={PackagePlus}
            isLoading={isSubmitting}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold"
          >
            Confirm & Restock +{parsedQty}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
