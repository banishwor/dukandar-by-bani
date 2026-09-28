import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useBusiness } from '../../contexts/BusinessContext';
import { useToast } from '../../components/ui/Toast';
import { inventoryRepository } from '../../repositories/inventoryRepository';
import type { ItemWithStock, StockMovementType } from '../../types';
import {
  Package,
  Wrench,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  ClipboardCheck,
  TrendingDown,
  TrendingUp,
  AlertCircle,
} from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

interface AdjustStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  item: ItemWithStock | null;
  defaultReason?: string;
}

type AdjustmentMode = 'NEW_COUNT' | 'ADD_REMOVE';

interface ReasonOption {
  key: string;
  label: string;
  type: StockMovementType;
  description: string;
}

const REASONS: ReasonOption[] = [
  {
    key: 'AUDIT',
    label: 'Physical Count Audit / Discrepancy',
    type: 'ADJUSTMENT',
    description: 'Periodic stocktake count did not match system numbers.',
  },
  {
    key: 'DAMAGE',
    label: 'Damaged / Spoiled / Expired Goods',
    type: 'DAMAGE',
    description: 'Items broken, spoiled, leaked, or past expiration.',
  },
  {
    key: 'THEFT',
    label: 'Theft / Shrinkage / Unaccounted Loss',
    type: 'ADJUSTMENT',
    description: 'Inventory missing due to shoplifting or transit loss.',
  },
  {
    key: 'NEGATIVE_RECONCILE',
    label: 'Reconcile Negative Stock (Retail Sales)',
    type: 'ADJUSTMENT',
    description: 'Items sold before purchase entry; adjusting to physical count.',
  },
  {
    key: 'CORRECTION',
    label: 'General Inventory Correction',
    type: 'ADJUSTMENT',
    description: 'Manual administrative count or opening balance adjustment.',
  },
];

export const AdjustStockModal: React.FC<AdjustStockModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  item,
  defaultReason,
}) => {
  const { business } = useBusiness();
  const { showSuccess, showError } = useToast();

  const [mode, setMode] = useState<AdjustmentMode>('NEW_COUNT');
  const [newCount, setNewCount] = useState<string>('');
  const [deltaQty, setDeltaQty] = useState<string>('');
  const [deltaSign, setDeltaSign] = useState<'+' | '-'>('+');
  const [selectedReasonKey, setSelectedReasonKey] = useState<string>('AUDIT');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (item && isOpen) {
      if (item.currentStock < 0) {
        setSelectedReasonKey('NEGATIVE_RECONCILE');
      } else if (defaultReason) {
        setSelectedReasonKey(defaultReason);
      } else {
        setSelectedReasonKey('AUDIT');
      }
      setMode('NEW_COUNT');
      setNewCount(String(Math.max(0, item.currentStock)));
      setDeltaQty('');
      setDeltaSign('+');
      setNotes('');
    }
  }, [item, isOpen, defaultReason]);

  if (!item || !business) return null;

  const currentStock = item.currentStock;
  let quantityChange = 0;
  let resultingStock = currentStock;

  if (mode === 'NEW_COUNT') {
    const parsedTarget = parseFloat(newCount);
    if (!isNaN(parsedTarget)) {
      quantityChange = parsedTarget - currentStock;
      resultingStock = parsedTarget;
    }
  } else {
    const parsedDelta = parseFloat(deltaQty);
    if (!isNaN(parsedDelta) && parsedDelta > 0) {
      quantityChange = deltaSign === '+' ? parsedDelta : -parsedDelta;
      resultingStock = currentStock + quantityChange;
    }
  }

  // Prevent invalid no-op
  const isValid = !isNaN(quantityChange) && quantityChange !== 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) {
      showError('Please specify a valid quantity adjustment.');
      return;
    }

    const reasonObj = REASONS.find((r) => r.key === selectedReasonKey) || REASONS[0];
    const fullReason = notes.trim()
      ? `${reasonObj.label}: ${notes.trim()}`
      : reasonObj.label;

    try {
      setIsSubmitting(true);
      await inventoryRepository.createMovement(
        business.id,
        item.id,
        reasonObj.type,
        quantityChange,
        fullReason
      );

      const signStr = quantityChange > 0 ? `+${quantityChange}` : `${quantityChange}`;
      showSuccess(
        `Adjusted ${item.name} by ${signStr} ${item.unit}. New Stock: ${resultingStock} ${item.unit}`
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Stock adjustment error', err);
      showError(err.message || 'Failed to adjust stock. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Adjust Inventory Stock"
      subtitle={`Product: ${item.name}`}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Product Snapshot Info Card */}
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between text-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 text-slate-700 flex items-center justify-center font-bold">
              <Package className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <span className="font-bold text-slate-900 block text-sm">{item.name}</span>
              <span className="text-slate-400">Unit: {item.unit} {item.sku ? `· SKU: ${item.sku}` : ''}</span>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[11px] text-slate-400 block font-semibold uppercase tracking-wider">
              Current System Stock
            </span>
            <span
              className={`text-base font-black font-mono ${
                currentStock < 0
                  ? 'text-rose-600'
                  : item.isLowStock
                  ? 'text-amber-600'
                  : 'text-slate-900'
              }`}
            >
              {currentStock} {item.unit}
            </span>
          </div>
        </div>

        {/* Negative Stock Reconcile Notice */}
        {currentStock < 0 && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <strong className="block">Negative Stock Detected ({currentStock} {item.unit})</strong>
              <span>
                Sales were completed when stock was 0. Enter your actual on-hand count below to reconcile your physical inventory.
              </span>
            </div>
          </div>
        )}

        {/* Adjustment Mode Selector */}
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
            Adjustment Method
          </label>
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl text-xs font-bold">
            <button
              type="button"
              onClick={() => setMode('NEW_COUNT')}
              className={`py-2 rounded-lg transition-all cursor-pointer ${
                mode === 'NEW_COUNT'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Set New Physical Count
            </button>
            <button
              type="button"
              onClick={() => setMode('ADD_REMOVE')}
              className={`py-2 rounded-lg transition-all cursor-pointer ${
                mode === 'ADD_REMOVE'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Add or Deduct (±)
            </button>
          </div>
        </div>

        {/* Quantity Input Area */}
        {mode === 'NEW_COUNT' ? (
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              Actual Physical Count On Hand ({item.unit})
            </label>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              placeholder="0"
              autoFocus
              value={newCount}
              onChange={(e) => setNewCount(e.target.value)}
              className="w-full h-11 px-3.5 rounded-xl border border-slate-300 bg-white text-slate-900 font-mono text-base font-bold focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
            />
          </div>
        ) : (
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              Quantity to Add or Deduct ({item.unit})
            </label>
            <div className="flex gap-2">
              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-0.5">
                <button
                  type="button"
                  onClick={() => setDeltaSign('+')}
                  className={`px-3 py-2 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                    deltaSign === '+'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  + Add Stock
                </button>
                <button
                  type="button"
                  onClick={() => setDeltaSign('-')}
                  className={`px-3 py-2 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                    deltaSign === '-'
                      ? 'bg-rose-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  - Deduct
                </button>
              </div>

              <input
                type="number"
                inputMode="decimal"
                step="any"
                min="0.01"
                placeholder="Quantity"
                autoFocus
                value={deltaQty}
                onChange={(e) => setDeltaQty(e.target.value)}
                className="flex-1 h-11 px-3.5 rounded-xl border border-slate-300 bg-white text-slate-900 font-mono text-base font-bold focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
              />
            </div>
          </div>
        )}

        {/* Live Calculation Preview Banner */}
        <div className="p-3 bg-slate-100/80 rounded-xl border border-slate-200/80 flex items-center justify-between text-xs">
          <div>
            <span className="text-slate-400 block text-[10px] font-bold uppercase">Current</span>
            <span className="font-mono font-bold text-slate-700 text-sm">
              {currentStock} {item.unit}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-slate-400">
            <ArrowRight className="w-4 h-4" />
            <span
              className={`font-mono font-bold text-xs px-2 py-0.5 rounded ${
                quantityChange > 0
                  ? 'text-emerald-700 bg-emerald-100'
                  : quantityChange < 0
                  ? 'text-rose-700 bg-rose-100'
                  : 'text-slate-500 bg-slate-200'
              }`}
            >
              {quantityChange > 0 ? `+${quantityChange}` : quantityChange} {item.unit}
            </span>
            <ArrowRight className="w-4 h-4" />
          </div>

          <div className="text-right">
            <span className="text-slate-400 block text-[10px] font-bold uppercase">Resulting Stock</span>
            <span className="font-mono font-extrabold text-slate-900 text-sm">
              {resultingStock} {item.unit}
            </span>
          </div>
        </div>

        {/* Reason Selector */}
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
            Adjustment Reason
          </label>
          <select
            value={selectedReasonKey}
            onChange={(e) => setSelectedReasonKey(e.target.value)}
            className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-800 text-xs font-semibold cursor-pointer focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
          >
            {REASONS.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-400 mt-1 pl-0.5">
            {REASONS.find((r) => r.key === selectedReasonKey)?.description}
          </p>
        </div>

        {/* Optional Notes */}
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
            Remarks / Audit Notes (Optional)
          </label>
          <input
            type="text"
            placeholder="e.g. Audit counted on shelf B, verified by manager"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full h-9 px-3 rounded-xl border border-slate-200 bg-white text-slate-800 text-xs focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
          <Button variant="ghost" size="sm" type="button" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            type="submit"
            isLoading={isSubmitting}
            disabled={!isValid || isSubmitting}
            className="font-bold cursor-pointer shadow-xs"
          >
            Confirm & Save Adjustment
          </Button>
        </div>
      </form>
    </Modal>
  );
};
