import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { ItemWithStock, DiscountType } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { discountUtils } from '../../utils/discount';
import {
  Plus,
  Trash2,
  AlertCircle,
  Sparkles,
  Check,
  Package,
  Layers,
  Calendar,
  TrendingUp,
} from 'lucide-react';

export interface PurchaseCartLine {
  itemId: string;
  name: string;
  unit: string;
  unitCost: number;
  quantity: number;
  discountType?: DiscountType;
  discountValue?: number;
  discountAmount: number;
  taxAmount: number;
  currentStock: number;
  // Phase 2: Batch, Expiry, and Retail Selling Price
  batchNumber?: string;
  expiryDate?: string;
  sellingPrice?: number;
}

interface SpreadsheetPurchaseGridProps {
  cart: PurchaseCartLine[];
  items: ItemWithStock[];
  currencySymbol?: string;
  enableExpiryTracking?: boolean;
  onUpdateCart: (newCart: PurchaseCartLine[]) => void;
  onOpenCreateItemModal?: (queryName: string, rowIndex?: number, initialCost?: number) => void;
}

export const SpreadsheetPurchaseGrid: React.FC<SpreadsheetPurchaseGridProps> = ({
  cart,
  items,
  currencySymbol = '₹',
  enableExpiryTracking = false,
  onUpdateCart,
  onOpenCreateItemModal,
}) => {
  // Batch & Expiry Columns Toggle State
  const [showBatchColumns, setShowBatchColumns] = useState<boolean>(() => {
    return enableExpiryTracking || cart.some((l) => Boolean(l.batchNumber || l.expiryDate));
  });

  // Keep showBatchColumns open if enableExpiryTracking changes to true
  useEffect(() => {
    if (enableExpiryTracking) {
      setShowBatchColumns(true);
    }
  }, [enableExpiryTracking]);

  // Row search state
  const [activeSearchRowIndex, setActiveSearchRowIndex] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] = useState(0);
  const [isExplicitOpen, setIsExplicitOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  // References for keyboard navigation across cells
  const itemInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const batchInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const expInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const qtyInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const costInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const sellingInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const discPercentInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const discAmountInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const dropdownContainerRef = useRef<HTMLDivElement | null>(null);
  const cartRef = useRef<PurchaseCartLine[]>(cart);

  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);

  // Ensure there's always at least one row in the grid
  useEffect(() => {
    if (cart.length === 0) {
      onUpdateCart([
        {
          itemId: '',
          name: '',
          unit: 'pcs',
          unitCost: 0,
          quantity: 1,
          discountType: 'NONE',
          discountValue: 0,
          discountAmount: 0,
          taxAmount: 0,
          currentStock: 0,
        },
      ]);
    }
  }, [cart.length, onUpdateCart]);

  // Suggestions for currently active row
  const suggestions = useMemo(() => {
    const rawMatches = searchQuery.trim()
      ? items.filter(
          (it) =>
            it.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (it.sku && it.sku.toLowerCase().includes(searchQuery.toLowerCase())) ||
            (it.category && it.category.toLowerCase().includes(searchQuery.toLowerCase())) ||
            (it.barcode && it.barcode.toLowerCase().includes(searchQuery.toLowerCase()))
        )
      : isExplicitOpen
      ? items
      : [];

    return rawMatches.slice(0, 8);
  }, [items, searchQuery, isExplicitOpen]);

  // Recalculate portal dropdown fixed coordinates
  const updateDropdownPosition = useCallback(() => {
    if (activeSearchRowIndex !== null && itemInputRefs.current[activeSearchRowIndex]) {
      const el = itemInputRefs.current[activeSearchRowIndex];
      if (el) {
        const rect = el.getBoundingClientRect();
        const popupWidth = Math.max(520, rect.width);
        const left = Math.min(rect.left, window.innerWidth - popupWidth - 16);
        setDropdownPosition({
          top: rect.bottom + 6,
          left: Math.max(16, left),
          width: popupWidth,
        });
      }
    } else {
      setDropdownPosition(null);
    }
  }, [activeSearchRowIndex]);

  useEffect(() => {
    updateDropdownPosition();
    window.addEventListener('resize', updateDropdownPosition);
    window.addEventListener('scroll', updateDropdownPosition, true);
    return () => {
      window.removeEventListener('resize', updateDropdownPosition);
      window.removeEventListener('scroll', updateDropdownPosition, true);
    };
  }, [updateDropdownPosition, searchQuery, isExplicitOpen, activeSearchRowIndex]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        activeSearchRowIndex !== null &&
        dropdownContainerRef.current &&
        !dropdownContainerRef.current.contains(e.target as Node) &&
        itemInputRefs.current[activeSearchRowIndex] &&
        !itemInputRefs.current[activeSearchRowIndex]?.contains(e.target as Node)
      ) {
        setActiveSearchRowIndex(null);
        setIsExplicitOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [activeSearchRowIndex]);

  // Add a new blank row at the end
  const handleAddNewRow = useCallback(() => {
    const newCart = [
      ...cartRef.current,
      {
        itemId: '',
        name: '',
        unit: 'pcs',
        unitCost: 0,
        quantity: 1,
        discountType: 'NONE' as DiscountType,
        discountValue: 0,
        discountAmount: 0,
        taxAmount: 0,
        currentStock: 0,
      },
    ];
    onUpdateCart(newCart);

    // Focus the item input of the newly added row
    setTimeout(() => {
      const newIndex = newCart.length - 1;
      itemInputRefs.current[newIndex]?.focus();
      itemInputRefs.current[newIndex]?.select();
    }, 50);
  }, [onUpdateCart]);

  // Remove a row
  const handleRemoveRow = (index: number) => {
    if (cart.length <= 1) {
      onUpdateCart([
        {
          itemId: '',
          name: '',
          unit: 'pcs',
          unitCost: 0,
          quantity: 1,
          discountType: 'NONE',
          discountValue: 0,
          discountAmount: 0,
          taxAmount: 0,
          currentStock: 0,
        },
      ]);
      return;
    }
    const updated = cart.filter((_, i) => i !== index);
    onUpdateCart(updated);
    setActiveSearchRowIndex(null);
  };

  // Populate row when item is selected
  const handleSelectItem = (rowIndex: number, item: ItemWithStock) => {
    const newCart = [...cart];
    const initialCost = item.costPrice || (item.sellingPrice ? item.sellingPrice * 0.7 : 0);
    const initialSelling = item.sellingPrice || 0;

    const calc = discountUtils.calculateLineNet(
      newCart[rowIndex].quantity || 1,
      initialCost,
      newCart[rowIndex].discountType || 'NONE',
      newCart[rowIndex].discountValue || 0,
      0
    );

    newCart[rowIndex] = {
      ...newCart[rowIndex],
      itemId: item.id,
      name: item.name,
      unit: item.unit || 'pcs',
      unitCost: initialCost,
      sellingPrice: initialSelling > 0 ? initialSelling : undefined,
      discountAmount: calc.discountAmount,
      currentStock: item.currentStock || 0,
    };

    onUpdateCart(newCart);
    setActiveSearchRowIndex(null);
    setIsExplicitOpen(false);

    // If batch columns are open, focus Batch input; otherwise focus Quantity
    setTimeout(() => {
      if (showBatchColumns) {
        batchInputRefs.current[rowIndex]?.focus();
        batchInputRefs.current[rowIndex]?.select();
      } else {
        qtyInputRefs.current[rowIndex]?.focus();
        qtyInputRefs.current[rowIndex]?.select();
      }
    }, 50);
  };

  // Update line quantity
  const handleUpdateQuantity = (rowIndex: number, qty: number) => {
    const safeQty = Math.max(1, qty || 1);
    const newCart = [...cart];
    const line = newCart[rowIndex];
    const calc = discountUtils.calculateLineNet(
      safeQty,
      line.unitCost,
      line.discountType || 'NONE',
      line.discountValue || 0,
      0
    );

    newCart[rowIndex] = {
      ...line,
      quantity: safeQty,
      discountAmount: calc.discountAmount,
    };
    onUpdateCart(newCart);
  };

  // Update unit cost
  const handleUpdateUnitCost = (rowIndex: number, cost: number) => {
    const safeCost = Math.max(0, cost || 0);
    const newCart = [...cart];
    const line = newCart[rowIndex];
    const calc = discountUtils.calculateLineNet(
      line.quantity,
      safeCost,
      line.discountType || 'NONE',
      line.discountValue || 0,
      0
    );

    newCart[rowIndex] = {
      ...line,
      unitCost: safeCost,
      discountAmount: calc.discountAmount,
    };
    onUpdateCart(newCart);
  };

  // Update selling price / MRP
  const handleUpdateSellingPrice = (rowIndex: number, selling: number) => {
    const safeSelling = Math.max(0, selling || 0);
    const newCart = [...cart];
    newCart[rowIndex] = {
      ...newCart[rowIndex],
      sellingPrice: safeSelling > 0 ? safeSelling : undefined,
    };
    onUpdateCart(newCart);
  };

  // Update batch number
  const handleUpdateBatchNumber = (rowIndex: number, batchNum: string) => {
    const newCart = [...cart];
    newCart[rowIndex] = {
      ...newCart[rowIndex],
      batchNumber: batchNum,
    };
    onUpdateCart(newCart);
  };

  // Update expiry date
  const handleUpdateExpiryDate = (rowIndex: number, exp: string) => {
    const newCart = [...cart];
    newCart[rowIndex] = {
      ...newCart[rowIndex],
      expiryDate: exp,
    };
    onUpdateCart(newCart);
  };

  // Update line discount
  const handleUpdateDiscount = (
    rowIndex: number,
    type: DiscountType,
    value: number
  ) => {
    const safeValue = Math.max(0, value || 0);
    const newCart = [...cart];
    const line = newCart[rowIndex];
    const calc = discountUtils.calculateLineNet(
      line.quantity,
      line.unitCost,
      type,
      safeValue,
      0
    );

    newCart[rowIndex] = {
      ...line,
      discountType: type,
      discountValue: safeValue,
      discountAmount: calc.discountAmount,
    };
    onUpdateCart(newCart);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
      {/* Table Toolbar Header with Batch & Expiry Column Toggle */}
      <div className="px-4 py-2.5 bg-slate-50/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-800 flex items-center gap-1.5">
            <Package className="w-4 h-4 text-amber-700" />
            Inward Stock Items ({cart.filter((l) => Boolean(l.itemId)).length})
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Toggle Batch & Expiry Columns */}
          <button
            type="button"
            onClick={() => setShowBatchColumns(!showBatchColumns)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
              showBatchColumns
                ? 'bg-amber-100 border-amber-300 text-amber-900 shadow-2xs font-bold'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-amber-700" />
            <span>{showBatchColumns ? '✓ Batch & Expiry Tracking On' : '+ Enable Batch & Expiry Columns'}</span>
          </button>
        </div>
      </div>

      <div className="overflow-x-auto min-w-full">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <th className="py-3 px-3 w-10 text-center">#</th>
              <th className="py-3 px-3 min-w-[240px] sm:min-w-[280px]">Item / Barcode</th>
              {showBatchColumns && (
                <>
                  <th className="py-3 px-2 w-28">Batch #</th>
                  <th className="py-3 px-2 w-32">Expiry Date</th>
                </>
              )}
              <th className="py-3 px-3 w-36 text-center">Quantity</th>
              <th className="py-3 px-3 w-28 text-right">Unit Cost</th>
              {showBatchColumns && (
                <th className="py-3 px-2 w-32 text-right">Retail MRP</th>
              )}
              <th className="py-3 px-3 w-36 text-center">Discount</th>
              <th className="py-3 px-3 w-28 text-right">Net Total</th>
              <th className="py-3 px-2 w-10 text-center"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {cart.map((line, rowIndex) => {
              const lineGross = line.quantity * line.unitCost;
              const lineNet = Math.max(0, lineGross - (line.discountAmount || 0));
              const isSearchActive = activeSearchRowIndex === rowIndex;

              // Retail margin calculation
              const lineMargin =
                line.sellingPrice && line.sellingPrice > line.unitCost && line.unitCost > 0
                  ? Math.round(((line.sellingPrice - line.unitCost) / line.sellingPrice) * 100)
                  : null;

              return (
                <tr
                  key={rowIndex}
                  className={`hover:bg-slate-50/60 transition-colors ${
                    isSearchActive ? 'bg-amber-50/30' : ''
                  }`}
                >
                  {/* Row Index */}
                  <td className="py-2.5 px-3 text-center font-mono font-medium text-slate-400">
                    {rowIndex + 1}
                  </td>

                  {/* Item / Barcode Cell */}
                  <td className="py-2 px-3">
                    <div className="relative">
                      <input
                        ref={(el) => {
                          itemInputRefs.current[rowIndex] = el;
                        }}
                        type="text"
                        placeholder="Scan barcode or search product..."
                        value={isSearchActive ? searchQuery : line.name}
                        onFocus={() => {
                          setActiveSearchRowIndex(rowIndex);
                          setSearchQuery(line.name || '');
                          setIsExplicitOpen(true);
                          setHighlightedSuggestionIndex(0);
                        }}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          setActiveSearchRowIndex(rowIndex);
                          setIsExplicitOpen(true);
                          setHighlightedSuggestionIndex(0);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            setIsExplicitOpen(true);
                            setHighlightedSuggestionIndex((prev) =>
                              Math.min(suggestions.length, prev + 1)
                            );
                          } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            setHighlightedSuggestionIndex((prev) => Math.max(0, prev - 1));
                          } else if (e.key === 'Enter') {
                            e.preventDefault();
                            if (suggestions[highlightedSuggestionIndex]) {
                              handleSelectItem(rowIndex, suggestions[highlightedSuggestionIndex]);
                            } else if (searchQuery.trim() && onOpenCreateItemModal) {
                              onOpenCreateItemModal(searchQuery.trim(), rowIndex, line.unitCost);
                            } else {
                              if (showBatchColumns) {
                                batchInputRefs.current[rowIndex]?.focus();
                              } else {
                                qtyInputRefs.current[rowIndex]?.focus();
                              }
                            }
                          } else if (e.key === 'Tab') {
                            if (suggestions[highlightedSuggestionIndex] && isSearchActive) {
                              handleSelectItem(rowIndex, suggestions[highlightedSuggestionIndex]);
                            }
                          } else if (e.key === 'Escape') {
                            setActiveSearchRowIndex(null);
                            setIsExplicitOpen(false);
                          }
                        }}
                        className={`w-full h-9 px-3 rounded-xl border text-xs font-semibold focus:outline-hidden transition-all ${
                          line.itemId
                            ? 'border-slate-200 bg-white text-slate-900 focus:ring-2 focus:ring-amber-500'
                            : 'border-dashed border-amber-300 bg-amber-50/50 text-slate-800 placeholder:text-amber-800/60 focus:ring-2 focus:ring-amber-500'
                        }`}
                      />

                      {/* Stock Badge if item is bound */}
                      {line.itemId && (
                        <div className="flex items-center gap-2 mt-1 px-1 text-[11px] text-slate-400">
                          <span>
                            Current Stock: <strong className="text-slate-700 font-mono">{line.currentStock} {line.unit}</strong>
                          </span>
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Batch # Column (When enabled) */}
                  {showBatchColumns && (
                    <td className="py-2 px-2">
                      <input
                        ref={(el) => {
                          batchInputRefs.current[rowIndex] = el;
                        }}
                        type="text"
                        placeholder="e.g. B-101"
                        value={line.batchNumber || ''}
                        onChange={(e) => handleUpdateBatchNumber(rowIndex, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            expInputRefs.current[rowIndex]?.focus();
                          }
                        }}
                        className="w-full h-8 px-2 rounded-lg border border-slate-200 bg-white text-xs font-mono font-medium text-slate-900 placeholder:text-slate-300 focus:ring-2 focus:ring-amber-500 focus:outline-hidden uppercase"
                      />
                    </td>
                  )}

                  {/* Expiry Date Column (When enabled) */}
                  {showBatchColumns && (
                    <td className="py-2 px-2">
                      <input
                        ref={(el) => {
                          expInputRefs.current[rowIndex] = el;
                        }}
                        type="date"
                        value={line.expiryDate || ''}
                        onChange={(e) => handleUpdateExpiryDate(rowIndex, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            qtyInputRefs.current[rowIndex]?.focus();
                          }
                        }}
                        className="w-full h-8 px-1.5 rounded-lg border border-slate-200 bg-white text-[11px] font-mono font-medium text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                      />
                    </td>
                  )}

                  {/* Quantity Stepper & Direct Input */}
                  <td className="py-2 px-3 text-center">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleUpdateQuantity(rowIndex, line.quantity - 1)}
                        className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center active:scale-95 transition-all cursor-pointer font-bold"
                        title="Decrease"
                      >
                        -
                      </button>
                      <input
                        ref={(el) => {
                          qtyInputRefs.current[rowIndex] = el;
                        }}
                        type="number"
                        inputMode="decimal"
                        min="1"
                        value={line.quantity || ''}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) =>
                          handleUpdateQuantity(rowIndex, Math.max(1, parseFloat(e.target.value) || 1))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            costInputRefs.current[rowIndex]?.focus();
                            costInputRefs.current[rowIndex]?.select();
                          }
                        }}
                        className="w-14 h-8 text-center font-mono font-bold text-xs border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                      />
                      <button
                        type="button"
                        onClick={() => handleUpdateQuantity(rowIndex, line.quantity + 1)}
                        className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center active:scale-95 transition-all cursor-pointer font-bold"
                        title="Increase"
                      >
                        +
                      </button>
                      <span className="text-[11px] text-slate-400 ml-1 font-medium">{line.unit}</span>
                    </div>
                  </td>

                  {/* Unit Cost (Purchase Price) */}
                  <td className="py-2 px-3 text-right">
                    <div className="relative inline-flex items-center">
                      <span className="absolute left-2.5 text-[11px] font-mono text-slate-400">
                        {currencySymbol}
                      </span>
                      <input
                        ref={(el) => {
                          costInputRefs.current[rowIndex] = el;
                        }}
                        type="number"
                        inputMode="decimal"
                        step="any"
                        min="0"
                        value={line.unitCost ?? ''}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) =>
                          handleUpdateUnitCost(rowIndex, parseFloat(e.target.value) || 0)
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (showBatchColumns) {
                              sellingInputRefs.current[rowIndex]?.focus();
                              sellingInputRefs.current[rowIndex]?.select();
                            } else if (rowIndex === cart.length - 1) {
                              handleAddNewRow();
                            } else {
                              itemInputRefs.current[rowIndex + 1]?.focus();
                            }
                          }
                        }}
                        className="w-24 h-8 pl-6 pr-2 text-right font-mono font-bold text-xs border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                      />
                    </div>
                  </td>

                  {/* Retail MRP / Selling Price (When enabled) */}
                  {showBatchColumns && (
                    <td className="py-2 px-2 text-right">
                      <div className="relative inline-flex flex-col items-end">
                        <div className="relative inline-flex items-center">
                          <span className="absolute left-2 text-[10px] font-mono text-slate-400">
                            {currencySymbol}
                          </span>
                          <input
                            ref={(el) => {
                              sellingInputRefs.current[rowIndex] = el;
                            }}
                            type="number"
                            inputMode="decimal"
                            step="any"
                            min="0"
                            placeholder="MRP"
                            value={line.sellingPrice ?? ''}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) =>
                              handleUpdateSellingPrice(rowIndex, parseFloat(e.target.value) || 0)
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                if (rowIndex === cart.length - 1) {
                                  handleAddNewRow();
                                } else {
                                  itemInputRefs.current[rowIndex + 1]?.focus();
                                }
                              }
                            }}
                            className="w-22 h-8 pl-5 pr-2 text-right font-mono font-bold text-xs border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                          />
                        </div>
                        {lineMargin !== null && (
                          <span className="text-[10px] text-emerald-600 font-semibold font-mono mt-0.5">
                            +{lineMargin}%
                          </span>
                        )}
                      </div>
                    </td>
                  )}

                  {/* Line Discount (% or Flat ₹) */}
                  <td className="py-2 px-3 text-center">
                    <div className="inline-flex items-center gap-1.5">
                      <div className="inline-flex rounded-md border border-slate-200 bg-slate-100 p-0.5 text-[10px]">
                        <button
                          type="button"
                          onClick={() => handleUpdateDiscount(rowIndex, 'NONE', 0)}
                          className={`px-1.5 py-0.5 rounded font-medium cursor-pointer ${
                            line.discountType === 'NONE' || !line.discountType
                              ? 'bg-white text-slate-900 shadow-2xs font-bold'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          0
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateDiscount(rowIndex, 'PERCENTAGE', line.discountValue || 5)
                          }
                          className={`px-1.5 py-0.5 rounded font-medium cursor-pointer ${
                            line.discountType === 'PERCENTAGE'
                              ? 'bg-amber-700 text-white shadow-2xs font-bold'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          %
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateDiscount(rowIndex, 'FLAT', line.discountValue || 10)
                          }
                          className={`px-1.5 py-0.5 rounded font-medium cursor-pointer ${
                            line.discountType === 'FLAT'
                              ? 'bg-amber-700 text-white shadow-2xs font-bold'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          {currencySymbol}
                        </button>
                      </div>

                      {line.discountType && line.discountType !== 'NONE' && (
                        <input
                          ref={(el) => {
                            if (line.discountType === 'PERCENTAGE') {
                              discPercentInputRefs.current[rowIndex] = el;
                            } else {
                              discAmountInputRefs.current[rowIndex] = el;
                            }
                          }}
                          type="number"
                          inputMode="decimal"
                          min="0"
                          max={line.discountType === 'PERCENTAGE' ? 100 : undefined}
                          value={line.discountValue || ''}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) =>
                            handleUpdateDiscount(
                              rowIndex,
                              line.discountType || 'PERCENTAGE',
                              parseFloat(e.target.value) || 0
                            )
                          }
                          placeholder={line.discountType === 'PERCENTAGE' ? '%' : currencySymbol}
                          className="w-14 h-7 px-1 text-right text-xs font-mono font-bold border border-amber-300 rounded-md bg-white focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                        />
                      )}
                    </div>
                  </td>

                  {/* Net Total */}
                  <td className="py-2 px-3 text-right font-mono font-bold text-xs text-slate-900">
                    <div>{formatCurrency(lineNet, currencySymbol)}</div>
                    {line.discountAmount > 0 && (
                      <span className="text-[10px] text-emerald-600 block">
                        -{formatCurrency(line.discountAmount, currencySymbol)}
                      </span>
                    )}
                  </td>

                  {/* Remove Button */}
                  <td className="py-2 px-2 text-center">
                    <button
                      type="button"
                      onClick={() => handleRemoveRow(rowIndex)}
                      className="text-slate-300 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                      title="Remove Row"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Grid Bottom Bar: + Add Line Item Button & Quick Hint */}
      <div className="p-3 bg-slate-50/80 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleAddNewRow}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-dashed border-amber-400 bg-amber-50/70 hover:bg-amber-100 text-amber-900 text-xs font-bold transition-all cursor-pointer shadow-3xs"
        >
          <Plus className="w-4 h-4 text-amber-700" />
          <span>+ Add Line Item (Enter)</span>
        </button>

        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <span>💡 Press <kbd className="px-1.5 py-0.5 rounded bg-white border text-slate-600 font-mono font-semibold">Enter</kbd> to add and move to next row</span>
        </div>
      </div>

      {/* Floating Portal Search Dropdown */}
      {dropdownPosition && isExplicitOpen && activeSearchRowIndex !== null && (
        createPortal(
          <div
            ref={dropdownContainerRef}
            style={{
              position: 'fixed',
              top: `${dropdownPosition.top}px`,
              left: `${dropdownPosition.left}px`,
              width: `${dropdownPosition.width}px`,
              zIndex: 9999,
            }}
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-100"
          >
            {suggestions.map((item, idx) => {
              const isHighlight = highlightedSuggestionIndex === idx;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectItem(activeSearchRowIndex, item)}
                  className={`w-full px-3.5 py-2.5 text-left flex items-center justify-between text-xs transition-colors cursor-pointer ${
                    isHighlight ? 'bg-amber-50 text-amber-900 font-bold' : 'hover:bg-slate-50 text-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-[10px] shrink-0">
                      <Package className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-900">{item.name}</span>
                        {item.category && (
                          <span className="px-1.5 py-0.2 rounded bg-slate-100 text-[10px] text-slate-500 font-normal">
                            {item.category}
                          </span>
                        )}
                        {item.batches && item.batches.length > 0 && (
                          <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                            {item.batches.length} {item.batches.length > 1 ? 'batches' : 'batch'}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5 flex items-center gap-2">
                        {item.barcode && <span>Barcode: {item.barcode}</span>}
                        {item.sku && <span>SKU: {item.sku}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="font-mono font-bold text-xs text-slate-900 block">
                      Cost: {formatCurrency(item.costPrice || (item.sellingPrice ? item.sellingPrice * 0.7 : 0), currencySymbol)}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      Stock: {item.currentStock || 0} {item.unit || 'pcs'}
                    </span>
                  </div>
                </button>
              );
            })}

            {/* Quick Item Creation Option in Dropdown */}
            {searchQuery.trim() && (
              <button
                type="button"
                onClick={() => {
                  if (onOpenCreateItemModal) {
                    onOpenCreateItemModal(
                      searchQuery.trim(),
                      activeSearchRowIndex,
                      cart[activeSearchRowIndex]?.unitCost
                    );
                    setActiveSearchRowIndex(null);
                    setIsExplicitOpen(false);
                  }
                }}
                className={`w-full p-3 text-left flex items-center gap-2 text-xs transition-colors cursor-pointer border-t border-slate-100 ${
                  highlightedSuggestionIndex === suggestions.length
                    ? 'bg-amber-100 text-amber-900 font-bold'
                    : 'bg-amber-50/70 hover:bg-amber-100/90 text-amber-900 font-semibold'
                }`}
              >
                <div className="w-6 h-6 rounded-lg bg-amber-600 text-white flex items-center justify-center shrink-0">
                  <Plus className="w-3.5 h-3.5" />
                </div>
                <span>+ Create <strong>"{searchQuery.trim()}"</strong> as New Catalog Item</span>
              </button>
            )}

            {suggestions.length === 0 && !searchQuery.trim() && (
              <div className="p-4 text-center text-xs text-slate-400">
                Type item name, barcode, or SKU to search.
              </div>
            )}
          </div>,
          document.body
        )
      )}
    </div>
  );
};
