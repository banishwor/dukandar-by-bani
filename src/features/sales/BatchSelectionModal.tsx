import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { ItemWithStock, ItemBatch } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { 
  Package, 
  Calendar, 
  Check, 
  Sparkles, 
  Plus, 
  Minus,
  X, 
  Tag, 
  TrendingUp,
  Clock,
  Layers,
  ArrowRight
} from 'lucide-react';

interface BatchSelectionModalProps {
  isOpen: boolean;
  item: ItemWithStock | null;
  currencySymbol?: string;
  initialQuantity?: number;
  onSelectBatches: (selections: { batch: ItemBatch; quantity: number }[]) => void;
  onClose: () => void;
}

export const BatchSelectionModal: React.FC<BatchSelectionModalProps> = ({
  isOpen,
  item,
  currencySymbol = '₹',
  initialQuantity = 1,
  onSelectBatches,
  onClose,
}) => {
  // Batch quantity allocations: { [batchId]: quantity }
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  
  // Custom batch / MRP form state
  const [showCustomBatchForm, setShowCustomBatchForm] = useState(false);
  const [customMrp, setCustomMrp] = useState('');
  const [customQty, setCustomQty] = useState('1');
  const [customBatchNo, setCustomBatchNo] = useState('');
  const [customExpiry, setCustomExpiry] = useState('');
  const [customCost, setCustomCost] = useState('');

  const modalRef = useRef<HTMLDivElement | null>(null);
  const qtyInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const customMrpInputRef = useRef<HTMLInputElement | null>(null);
  const openedAtRef = useRef<number>(0);

  // Track opening timestamp so triggering Enter keystroke cannot auto-submit modal
  useEffect(() => {
    if (isOpen) {
      openedAtRef.current = Date.now();
    }
  }, [isOpen]);

  // Normalize batches: if item has batches, sort by FEFO (earliest expiry first); else fallback to default batch
  const batches = useMemo<ItemBatch[]>(() => {
    if (!item) return [];
    if (item.batches && item.batches.length > 0) {
      return [...item.batches].sort((a, b) => {
        if (a.expiryDate && b.expiryDate) {
          return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
        }
        if (a.expiryDate) return -1;
        if (b.expiryDate) return 1;
        return 0;
      });
    }

    // Default single batch fallback
    return [
      {
        id: 'default',
        itemId: item.id,
        batchNumber: 'DEFAULT',
        mrp: item.sellingPrice,
        costPrice: item.costPrice || item.purchasePrice || 0,
        stockQuantity: item.currentStock,
        expiryDate: '',
      },
    ];
  }, [item]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen && batches.length > 0) {
      const initialQtyMap: Record<string, number> = {};
      batches.forEach((b, idx) => {
        // Pre-allocate the initial quantity to the earliest (FEFO) batch
        initialQtyMap[b.id || String(idx)] = idx === 0 ? Math.max(1, initialQuantity) : 0;
      });
      setQuantities(initialQtyMap);
      setShowCustomBatchForm(false);
      setCustomMrp(item?.sellingPrice ? String(item.sellingPrice) : '');
      setCustomQty('1');
      setCustomCost(item?.costPrice || item?.purchasePrice ? String(item?.costPrice || item?.purchasePrice) : '');
      setCustomBatchNo(`LOT-${Date.now().toString().slice(-4)}`);
      setCustomExpiry('');

      // Auto-focus and select first batch quantity input
      const timer = setTimeout(() => {
        qtyInputRefs.current[0]?.focus();
        qtyInputRefs.current[0]?.select();
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [isOpen, batches, initialQuantity, item]);

  // Handle individual batch quantity change
  const handleBatchQtyChange = (batchId: string, val: number) => {
    setQuantities((prev) => ({
      ...prev,
      [batchId]: Math.max(0, val),
    }));
  };

  // Submit all batch selections with quantity > 0
  const handleSubmitSelections = useCallback(() => {
    const selections: { batch: ItemBatch; quantity: number }[] = [];

    batches.forEach((batch, idx) => {
      const bKey = batch.id || String(idx);
      const qty = quantities[bKey] || 0;
      if (qty > 0) {
        selections.push({
          batch,
          quantity: qty,
        });
      }
    });

    if (selections.length === 0 && batches.length > 0) {
      // If all zero, default to 1 on the first batch
      selections.push({
        batch: batches[0],
        quantity: 1,
      });
    }

    onSelectBatches(selections);
  }, [batches, quantities, onSelectBatches]);

  // Keyboard navigation & fast submission
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (showCustomBatchForm) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setShowCustomBatchForm(false);
        }
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter') {
        // Prevent accidental auto-submit from the keystroke that opened the modal (guard duration 350ms)
        if (Date.now() - openedAtRef.current < 350) {
          e.preventDefault();
          return;
        }
        e.preventDefault();
        handleSubmitSelections();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, showCustomBatchForm, onClose, handleSubmitSelections]);

  if (!isOpen || !item) return null;

  // Handle adding custom batch
  const handleApplyCustomBatch = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedMrp = parseFloat(customMrp) || item.sellingPrice;
    const parsedCost = parseFloat(customCost) || item.costPrice || item.purchasePrice || 0;
    const parsedQty = parseInt(customQty) || 1;

    const newBatch: ItemBatch = {
      id: `custom-${Date.now()}`,
      itemId: item.id,
      batchNumber: customBatchNo.trim() || `LOT-${Date.now().toString().slice(-4)}`,
      mrp: parsedMrp,
      costPrice: parsedCost,
      expiryDate: customExpiry || undefined,
      stockQuantity: 999,
    };

    onSelectBatches([{ batch: newBatch, quantity: parsedQty }]);
  };

  const getExpiryStatus = (expiryDate?: string) => {
    if (!expiryDate) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const exp = new Date(expiryDate);
    const diffDays = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { label: `Expired (${Math.abs(diffDays)}d ago)`, color: 'bg-rose-100 text-rose-800 border-rose-200' };
    }
    if (diffDays <= 30) {
      return { label: `Expires in ${diffDays}d`, color: 'bg-amber-100 text-amber-800 border-amber-200' };
    }
    return { label: `Fresh (${diffDays}d left)`, color: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
  };

  // Calculate totals across chosen batches
  const totalSelectedQty = batches.reduce((sum, b, idx) => {
    const bKey = b.id || String(idx);
    return sum + (quantities[bKey] || 0);
  }, 0);

  const totalSelectedAmount = batches.reduce((sum, b, idx) => {
    const bKey = b.id || String(idx);
    const qty = quantities[bKey] || 0;
    return sum + qty * b.mrp;
  }, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        ref={modalRef}
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[88vh] animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 backdrop-blur-md rounded-xl border border-white/20">
              <Package className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg leading-tight">{item.name}</h3>
                {item.sku && (
                  <span className="text-[11px] font-mono bg-white/20 px-2 py-0.5 rounded text-blue-100">
                    {item.sku}
                  </span>
                )}
              </div>
              <p className="text-xs text-blue-100 mt-0.5">
                Type quantity for each batch · <span className="font-semibold text-white">Sell from any batch or split across multiple</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 divide-y divide-slate-100 space-y-4">
          {!showCustomBatchForm ? (
            <>
              {/* Batch list */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider px-1">
                  <span>Available Batches & Rates ({batches.length})</span>
                  <span className="text-blue-600 font-medium normal-case flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    FEFO Recommended
                  </span>
                </div>

                <div className="grid gap-2.5">
                  {batches.map((batch, index) => {
                    const bKey = batch.id || String(index);
                    const currentQty = quantities[bKey] || 0;
                    const hasSelected = currentQty > 0;
                    const expiryStatus = getExpiryStatus(batch.expiryDate);
                    const cost = batch.costPrice || item.costPrice || item.purchasePrice || 0;
                    const margin = batch.mrp - cost;
                    const marginPercent = cost > 0 ? ((margin / cost) * 100).toFixed(0) : '0';

                    return (
                      <div
                        key={batch.id || index}
                        className={`p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          hasSelected
                            ? 'bg-blue-50/80 border-blue-500 shadow-md ring-1 ring-blue-500/20'
                            : 'bg-white hover:bg-slate-50 border-slate-200'
                        }`}
                      >
                        {/* Left Batch Meta */}
                        <div className="flex items-start gap-3 flex-1">
                          <div
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                              hasSelected
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}
                          >
                            {index + 1}
                          </div>

                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-sm text-slate-900 font-mono">
                                {batch.batchNumber || `BATCH-${index + 1}`}
                              </span>
                              {index === 0 && (
                                <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200">
                                  Default / FEFO
                                </span>
                              )}
                              {expiryStatus && (
                                <span
                                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded border flex items-center gap-1 ${expiryStatus.color}`}
                                >
                                  <Clock className="w-3 h-3" />
                                  {expiryStatus.label}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap">
                              {batch.expiryDate ? (
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                  Exp: <strong className="text-slate-700">{batch.expiryDate}</strong>
                                </span>
                              ) : (
                                <span className="text-slate-400 italic">No expiry date</span>
                              )}

                              {cost > 0 && (
                                <span className="text-slate-500 font-mono">
                                  Cost: <strong className="text-slate-700">{formatCurrency(cost, currencySymbol)}</strong>
                                </span>
                              )}

                              {cost > 0 && margin > 0 && (
                                <span className="text-emerald-700 font-medium flex items-center gap-0.5">
                                  <TrendingUp className="w-3 h-3" />
                                  +{marginPercent}%
                                </span>
                              )}

                              <span className="text-slate-400">·</span>
                              <span className="font-bold text-slate-700">
                                MRP: {formatCurrency(batch.mrp, currencySymbol)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Right Quantity Control & Stock */}
                        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
                          <div className="text-right">
                            <span
                              className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded block ${
                                batch.stockQuantity <= 0
                                  ? 'bg-rose-100 text-rose-700'
                                  : batch.stockQuantity < 5
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {batch.stockQuantity} {item.unit || 'pcs'} left
                            </span>
                          </div>

                          {/* Stepper & Number Input */}
                          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-2xs">
                            <button
                              type="button"
                              onClick={() => handleBatchQtyChange(bKey, currentQty - 1)}
                              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600 disabled:opacity-30 cursor-pointer"
                              disabled={currentQty <= 0}
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>

                            <input
                              ref={(el) => (qtyInputRefs.current[index] = el)}
                              type="number"
                              min="0"
                              value={currentQty === 0 ? '' : currentQty}
                              placeholder="0"
                              onFocus={(e) => e.target.select()}
                              onChange={(e) =>
                                handleBatchQtyChange(bKey, parseInt(e.target.value) || 0)
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'ArrowDown') {
                                  e.preventDefault();
                                  qtyInputRefs.current[index + 1]?.focus();
                                  qtyInputRefs.current[index + 1]?.select();
                                } else if (e.key === 'ArrowUp') {
                                  e.preventDefault();
                                  qtyInputRefs.current[index - 1]?.focus();
                                  qtyInputRefs.current[index - 1]?.select();
                                } else if (e.key === 'Enter') {
                                  if (Date.now() - openedAtRef.current < 350) {
                                    e.preventDefault();
                                    return;
                                  }
                                  e.preventDefault();
                                  handleSubmitSelections();
                                }
                              }}
                              className="w-14 h-7 text-center font-mono font-bold text-sm bg-transparent border-none focus:outline-hidden text-slate-900"
                            />

                            <button
                              type="button"
                              onClick={() => handleBatchQtyChange(bKey, currentQty + 1)}
                              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600 cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Add Custom MRP / New Batch Option */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCustomBatchForm(true);
                    setTimeout(() => customMrpInputRef.current?.focus(), 50);
                  }}
                  className="w-full py-2.5 px-3 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-dashed border-slate-300 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-blue-600" />
                  <span>+ Sell with Custom MRP / Add New Lot</span>
                </button>
              </div>
            </>
          ) : (
            /* Custom Batch Creation Form */
            <form onSubmit={handleApplyCustomBatch} className="space-y-4 pt-1">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                  <Tag className="w-4 h-4 text-blue-600" />
                  Custom MRP & Batch Entry
                </span>
                <button
                  type="button"
                  onClick={() => setShowCustomBatchForm(false)}
                  className="text-xs text-slate-500 hover:text-slate-800 font-medium cursor-pointer"
                >
                  Cancel
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Selling Price / MRP ({currencySymbol}) *
                  </label>
                  <input
                    ref={customMrpInputRef}
                    type="number"
                    step="any"
                    min="0"
                    required
                    value={customMrp}
                    onChange={(e) => setCustomMrp(e.target.value)}
                    className="w-full h-9 px-3 font-mono font-bold text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Quantity to Sell *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={customQty}
                    onChange={(e) => setCustomQty(e.target.value)}
                    className="w-full h-9 px-3 font-mono font-bold text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Cost / Purchase Price ({currencySymbol})
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={customCost}
                    onChange={(e) => setCustomCost(e.target.value)}
                    className="w-full h-9 px-3 font-mono text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    placeholder="Optional"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Batch / Lot Number
                  </label>
                  <input
                    type="text"
                    value={customBatchNo}
                    onChange={(e) => setCustomBatchNo(e.target.value)}
                    className="w-full h-9 px-3 font-mono text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    placeholder="e.g. LOT-2024"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Expiry Date
                  </label>
                  <input
                    type="date"
                    value={customExpiry}
                    onChange={(e) => setCustomExpiry(e.target.value)}
                    className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCustomBatchForm(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer transition-all"
                >
                  Add Custom Batch to Invoice
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer with Totals and Keyboard Shortcuts */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="text-xs text-slate-600">
              Total: <strong className="font-mono text-slate-900 text-sm">{totalSelectedQty} {item.unit || 'pcs'}</strong>
            </div>
            <div className="text-xs text-slate-400">·</div>
            <div className="text-xs text-slate-600">
              Subtotal: <strong className="font-mono text-blue-700 text-sm">{formatCurrency(totalSelectedAmount, currencySymbol)}</strong>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-bold cursor-pointer transition-colors"
            >
              Cancel (Esc)
            </button>
            <button
              type="button"
              onClick={handleSubmitSelections}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-md flex items-center gap-1.5 cursor-pointer transition-all"
            >
              <span>Add to Invoice (Enter)</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
