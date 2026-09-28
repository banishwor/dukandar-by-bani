import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { ItemWithStock, ItemBatch, DiscountType } from '../../types';
import type { SaleCartLine } from './useSaleDrafts';
import { formatCurrency } from '../../utils/formatters';
import { discountUtils } from '../../utils/discount';
import { BatchSelectionModal } from './BatchSelectionModal';
import { QuickRestockModal } from './QuickRestockModal';
import {
  Plus,
  Trash2,
  AlertCircle,
  Calendar,
  Sparkles,
  Check,
  TrendingUp,
  Layers,
  PackagePlus,
} from 'lucide-react';

interface SpreadsheetInvoiceGridProps {
  cart: SaleCartLine[];
  items: ItemWithStock[];
  currencySymbol?: string;
  enableExpiryTracking?: boolean;
  businessId?: string;
  onUpdateCart: (newCart: SaleCartLine[]) => void;
  onItemRestocked?: (updatedItem: ItemWithStock) => void;
}

export const SpreadsheetInvoiceGrid: React.FC<SpreadsheetInvoiceGridProps> = ({
  cart,
  items,
  currencySymbol = '₹',
  enableExpiryTracking = false,
  businessId,
  onUpdateCart,
  onItemRestocked,
}) => {
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

  // Multi-MRP & Multi-Expiry Batch Selection Modal State
  const [batchModalState, setBatchModalState] = useState<{
    item: ItemWithStock;
    rowIndex: number;
    initialQuantity?: number;
  } | null>(null);

  // Quick Restock Counter Modal State
  const [quickRestockState, setQuickRestockState] = useState<{
    item: ItemWithStock;
    rowIndex: number;
  } | null>(null);

  // References for keyboard navigation across cells
  const itemInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const expInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const qtyInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const rateInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const discPercentInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const discAmountInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const dropdownContainerRef = useRef<HTMLDivElement | null>(null);
  const cartRef = useRef<SaleCartLine[]>(cart);

  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);

  // Filter items based on active row search query and deduplicate by name/SKU, prioritizing items with batches
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

    // Deduplicate so older duplicate items without batches never shadow batch-enabled products
    const dedupedMap = new Map<string, ItemWithStock>();
    for (const it of rawMatches) {
      const key = (it.sku || it.name).toLowerCase().trim();
      const existing = dedupedMap.get(key);
      if (!existing) {
        dedupedMap.set(key, it);
      } else if (!existing.batches?.length && it.batches?.length) {
        // Upgrade to item with batches
        dedupedMap.set(key, it);
      }
    }

    return Array.from(dedupedMap.values()).slice(0, 8);
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

  // Add a blank empty row if cart is empty
  useEffect(() => {
    if (cart.length === 0) {
      onUpdateCart([
        {
          itemId: '',
          name: '',
          unit: 'pcs',
          rate: 0,
          quantity: 1,
          discountType: 'NONE',
          discountValue: 0,
          discountAmount: 0,
          taxAmount: 0,
          trackInventory: false,
          availableStock: 0,
          expiryDate: '',
          batchNumber: '',
        },
      ]);
    }
  }, [cart.length, onUpdateCart]);

  // Auto-focus on row 1 item input immediately upon mounting
  useEffect(() => {
    const timer = setTimeout(() => {
      itemInputRefs.current[0]?.focus();
      setActiveSearchRowIndex(0);
      setSearchQuery('');
    }, 60);
    return () => clearTimeout(timer);
  }, []);

  // Handle multi-batch quantity selection from the modal
  const handleSelectBatches = useCallback(
    (selections: { batch: ItemBatch; quantity: number }[]) => {
      if (!batchModalState || selections.length === 0) return;
      const { item, rowIndex } = batchModalState;
      const currentCart = cartRef.current.length > 0 ? cartRef.current : cart;
      const updated = [...currentCart];

      // 1. Replace current row with first selected batch
      const first = selections[0];
      const firstLineNet = discountUtils.calculateLineNet(
        first.quantity,
        first.batch.mrp,
        updated[rowIndex]?.discountType || 'NONE',
        updated[rowIndex]?.discountValue || 0,
        0
      );

      updated[rowIndex] = {
        itemId: item.id,
        name: item.name,
        unit: item.unit || 'pcs',
        rate: first.batch.mrp,
        quantity: first.quantity,
        discountType: updated[rowIndex]?.discountType || 'NONE',
        discountValue: updated[rowIndex]?.discountValue || 0,
        discountAmount: firstLineNet.discountAmount,
        taxAmount: 0,
        trackInventory: item.trackInventory,
        availableStock: first.batch.stockQuantity,
        expiryDate: first.batch.expiryDate || '',
        batchNumber: first.batch.batchNumber || '',
      };

      // 2. If multiple batches selected, insert extra lines immediately after current row
      if (selections.length > 1) {
        const extraRows: SaleCartLine[] = selections.slice(1).map((sel) => {
          const lineNet = discountUtils.calculateLineNet(
            sel.quantity,
            sel.batch.mrp,
            'NONE',
            0,
            0
          );
          return {
            itemId: item.id,
            name: item.name,
            unit: item.unit || 'pcs',
            rate: sel.batch.mrp,
            quantity: sel.quantity,
            discountType: 'NONE',
            discountValue: 0,
            discountAmount: lineNet.discountAmount,
            taxAmount: 0,
            trackInventory: item.trackInventory,
            availableStock: sel.batch.stockQuantity,
            expiryDate: sel.batch.expiryDate || '',
            batchNumber: sel.batch.batchNumber || '',
          };
        });

        updated.splice(rowIndex + 1, 0, ...extraRows);
      }

      // 3. Ensure a clean blank row exists at the bottom for next barcode/product scan
      const hasTrailingEmpty = updated.length > 0 && !updated[updated.length - 1].itemId;
      if (!hasTrailingEmpty) {
        updated.push({
          itemId: '',
          name: '',
          unit: 'pcs',
          rate: 0,
          quantity: 1,
          discountType: 'NONE',
          discountValue: 0,
          discountAmount: 0,
          taxAmount: 0,
          trackInventory: false,
          availableStock: 0,
          expiryDate: '',
          batchNumber: '',
        });
      }

      cartRef.current = updated;
      onUpdateCart(updated);
      setBatchModalState(null);
      setActiveSearchRowIndex(null);
      setIsExplicitOpen(false);
      setSearchQuery('');

      // Advance focus to next action:
      setTimeout(() => {
        if (selections.length === 1) {
          qtyInputRefs.current[rowIndex]?.focus();
          qtyInputRefs.current[rowIndex]?.select();
        } else {
          // Focus the next empty line ready for scanning the next product
          const nextRowIdx = updated.length - 1;
          itemInputRefs.current[nextRowIdx]?.focus();
          setActiveSearchRowIndex(nextRowIdx);
          setSearchQuery('');
        }
      }, 50);
    },
    [batchModalState, cart, onUpdateCart]
  );

  // Handle item selection in a row
  const handleSelectItem = useCallback(
    (rowIndex: number, item: ItemWithStock) => {
      // If product has multiple active batches/MRPs, open the Batch Selection Modal
      if (item.batches && item.batches.length > 1) {
        const initialQty = cart[rowIndex]?.quantity || 1;
        setActiveSearchRowIndex(null);
        setIsExplicitOpen(false);
        setSearchQuery('');
        // Defer opening modal so the triggering Enter keystroke finishes propagating and terminating
        setTimeout(() => {
          setBatchModalState({ 
            item, 
            rowIndex,
            initialQuantity: initialQty 
          });
        }, 50);
        return;
      }

      // Single batch or standard product
      const singleBatch = item.batches && item.batches.length === 1 ? item.batches[0] : null;
      const rate = singleBatch ? singleBatch.mrp : item.sellingPrice;
      const expiryDate = singleBatch?.expiryDate || '';
      const batchNumber = singleBatch?.batchNumber || '';
      const availableStock = singleBatch ? singleBatch.stockQuantity : item.currentStock;

      const updated = [...cart];
      const lineNet = discountUtils.calculateLineNet(
        updated[rowIndex]?.quantity || 1,
        rate,
        updated[rowIndex]?.discountType || 'NONE',
        updated[rowIndex]?.discountValue || 0,
        0
      );

      updated[rowIndex] = {
        itemId: item.id,
        name: item.name,
        unit: item.unit || 'pcs',
        rate,
        quantity: updated[rowIndex]?.quantity || 1,
        discountType: updated[rowIndex]?.discountType || 'NONE',
        discountValue: updated[rowIndex]?.discountValue || 0,
        discountAmount: lineNet.discountAmount,
        taxAmount: 0,
        trackInventory: item.trackInventory,
        availableStock,
        expiryDate,
        batchNumber,
      };

      onUpdateCart(updated);
      setActiveSearchRowIndex(null);
      setIsExplicitOpen(false);
      setSearchQuery('');

      // Auto-advance focus to Quantity input in this row
      setTimeout(() => {
        qtyInputRefs.current[rowIndex]?.focus();
        qtyInputRefs.current[rowIndex]?.select();
      }, 50);
    },
    [cart, onUpdateCart]
  );

  // Handle quick inline creation of an unlisted product during sale
  const handleCreateQuickItem = useCallback(
    (rowIndex: number, productName: string) => {
      const trimmedName = productName.trim();
      if (!trimmedName) return;

      const updated = [...cart];
      updated[rowIndex] = {
        itemId: '',
        name: trimmedName,
        unit: 'pcs',
        rate: 0,
        quantity: 1,
        discountType: 'NONE',
        discountValue: 0,
        discountAmount: 0,
        taxAmount: 0,
        trackInventory: true,
        availableStock: 0,
        expiryDate: '',
        batchNumber: '',
        isNewItem: true,
      };

      onUpdateCart(updated);
      setActiveSearchRowIndex(null);
      setIsExplicitOpen(false);
      setSearchQuery('');

      // Auto-focus on Quantity for this row
      setTimeout(() => {
        qtyInputRefs.current[rowIndex]?.focus();
        qtyInputRefs.current[rowIndex]?.select();
      }, 50);
    },
    [cart, onUpdateCart]
  );

  // Handle changing expiry date
  const handleExpiryDateChange = (rowIndex: number, newExp: string) => {
    const updated = [...cart];
    if (!updated[rowIndex]) return;
    updated[rowIndex] = {
      ...updated[rowIndex],
      expiryDate: newExp,
    };
    onUpdateCart(updated);
  };

  // Handle changing quantity
  const handleQuantityChange = (rowIndex: number, newQty: number) => {
    const updated = [...cart];
    const line = updated[rowIndex];
    if (!line) return;

    const lineNet = discountUtils.calculateLineNet(
      newQty,
      line.rate,
      line.discountType || 'NONE',
      line.discountValue || 0,
      line.taxAmount || 0
    );

    updated[rowIndex] = {
      ...line,
      quantity: newQty,
      discountAmount: lineNet.discountAmount,
    };
    onUpdateCart(updated);
  };

  // Handle changing unit price / rate
  const handleRateChange = (rowIndex: number, newRate: number) => {
    const updated = [...cart];
    const line = updated[rowIndex];
    if (!line) return;

    const lineNet = discountUtils.calculateLineNet(
      line.quantity,
      newRate,
      line.discountType || 'NONE',
      line.discountValue || 0,
      line.taxAmount || 0
    );

    updated[rowIndex] = {
      ...line,
      rate: newRate,
      discountAmount: lineNet.discountAmount,
    };
    onUpdateCart(updated);
  };

  // Advance focus to next row, creating a new row if at the end of the cart
  const advanceToNextRow = useCallback(
    (currentRowIndex: number) => {
      const current = cartRef.current.length > 0 ? cartRef.current : cart;
      if (currentRowIndex >= current.length - 1) {
        handleAddNewRow();
      } else {
        const nextIdx = currentRowIndex + 1;
        itemInputRefs.current[nextIdx]?.focus();
        setActiveSearchRowIndex(nextIdx);
        setSearchQuery('');
      }
    },
    [cart]
  );

  // Handle changing discount percentage
  const handleDiscountPercentChange = (rowIndex: number, valStr: string) => {
    const updated = [...cart];
    const line = updated[rowIndex];
    if (!line) return;

    const gross = line.quantity * line.rate;
    const pct = parseFloat(valStr);

    if (!valStr || isNaN(pct) || pct <= 0) {
      updated[rowIndex] = {
        ...line,
        discountType: 'NONE',
        discountValue: 0,
        discountAmount: 0,
      };
    } else {
      const validPct = Math.min(100, Math.max(0, pct));
      const discAmount = Math.round(((gross * validPct) / 100) * 100) / 100;
      updated[rowIndex] = {
        ...line,
        discountType: 'PERCENTAGE',
        discountValue: validPct,
        discountAmount: discAmount,
      };
    }
    onUpdateCart(updated);
  };

  // Handle changing discount amount in currency
  const handleDiscountAmountChange = (rowIndex: number, valStr: string) => {
    const updated = [...cart];
    const line = updated[rowIndex];
    if (!line) return;

    const gross = line.quantity * line.rate;
    const amt = parseFloat(valStr);

    if (!valStr || isNaN(amt) || amt <= 0) {
      updated[rowIndex] = {
        ...line,
        discountType: 'NONE',
        discountValue: 0,
        discountAmount: 0,
      };
    } else {
      const validAmt = Math.min(gross, Math.max(0, amt));
      updated[rowIndex] = {
        ...line,
        discountType: 'FLAT',
        discountValue: validAmt,
        discountAmount: validAmt,
      };
    }
    onUpdateCart(updated);
  };

  // Handle changing line discount
  const handleDiscountChange = (
    rowIndex: number,
    type: DiscountType,
    value: number
  ) => {
    const updated = [...cart];
    const line = updated[rowIndex];
    if (!line) return;

    const lineNet = discountUtils.calculateLineNet(
      line.quantity,
      line.rate,
      type,
      value,
      line.taxAmount || 0
    );

    updated[rowIndex] = {
      ...line,
      discountType: type,
      discountValue: value,
      discountAmount: lineNet.discountAmount,
    };
    onUpdateCart(updated);
  };

  // Add new empty row
  const handleAddNewRow = () => {
    const current = cartRef.current.length > 0 ? cartRef.current : cart;
    const updated = [
      ...current,
      {
        itemId: '',
        name: '',
        unit: 'pcs',
        rate: 0,
        quantity: 1,
        discountType: 'NONE' as DiscountType,
        discountValue: 0,
        discountAmount: 0,
        taxAmount: 0,
        trackInventory: false,
        availableStock: 0,
        expiryDate: '',
        batchNumber: '',
      },
    ];
    cartRef.current = updated;
    onUpdateCart(updated);
    setTimeout(() => {
      const nextIndex = updated.length - 1;
      itemInputRefs.current[nextIndex]?.focus();
      setActiveSearchRowIndex(nextIndex);
      setSearchQuery('');
    }, 50);
  };

  // Delete row
  const handleDeleteRow = (rowIndex: number) => {
    const current = cartRef.current.length > 0 ? cartRef.current : cart;
    if (current.length <= 1) {
      // Reset single row
      const resetCart = [
        {
          itemId: '',
          name: '',
          unit: 'pcs',
          rate: 0,
          quantity: 1,
          discountType: 'NONE' as DiscountType,
          discountValue: 0,
          discountAmount: 0,
          taxAmount: 0,
          trackInventory: false,
          availableStock: 0,
          expiryDate: '',
          batchNumber: '',
        },
      ];
      cartRef.current = resetCart;
      onUpdateCart(resetCart);
      return;
    }
    const filtered = current.filter((_, idx) => idx !== rowIndex);
    cartRef.current = filtered;
    onUpdateCart(filtered);
  };

  // Handle keyboard shortcut row deletion (Ctrl+Delete or Alt+Backspace)
  const handleRowKeyDown = (e: React.KeyboardEvent, rowIndex: number) => {
    if (
      (e.ctrlKey && (e.key === 'Delete' || e.key === 'Backspace')) ||
      (e.altKey && e.key === 'Backspace')
    ) {
      e.preventDefault();
      e.stopPropagation();
      handleDeleteRow(rowIndex);
      const targetIdx = Math.max(0, rowIndex - 1);
      setTimeout(() => {
        itemInputRefs.current[targetIdx]?.focus();
      }, 50);
    }
  };

  // Handle restock completion from sales grid
  const handleRestockSuccess = (addedStock: number, updatedItem?: ItemWithStock) => {
    if (quickRestockState) {
      const updated = [...cart];
      const targetLine = updated[quickRestockState.rowIndex];
      if (targetLine) {
        updated[quickRestockState.rowIndex] = {
          ...targetLine,
          availableStock: (targetLine.availableStock || 0) + addedStock,
        };
        onUpdateCart(updated);
      }
    }
    if (updatedItem && onItemRestocked) {
      onItemRestocked(updatedItem);
    }
  };

  // Total sums
  const totalItemsCount = cart.filter((l) => l.itemId).length;
  const totalQuantitySum = cart.filter((l) => l.itemId).reduce((sum, l) => sum + l.quantity, 0);
  const totalGrossSum = cart.reduce((sum, l) => sum + (l.quantity * l.rate), 0);
  const totalDiscountSum = cart.reduce((sum, l) => sum + (l.discountAmount || 0), 0);
  const totalNetSum = Math.max(0, totalGrossSum - totalDiscountSum);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-visible relative">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[780px]">
          {/* Spreadsheet Header */}
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold text-xs">
              <th className="py-3 px-3 w-12 text-center text-slate-400">#</th>
              <th className="py-3 px-3 min-w-[280px]">ITEM / PRODUCT NAME</th>
              {enableExpiryTracking && (
                <th className="py-3 px-2 w-24 text-center">EXP. DATE</th>
              )}
              <th className="py-3 px-2 w-20 text-center">QTY</th>
              <th className="py-3 px-2 w-14 text-center">UNIT</th>
              <th className="py-3 px-3 w-28 text-right">PRICE / UNIT</th>
              <th colSpan={2} className="py-2 px-2 text-center min-w-[170px] border-b border-slate-200">
                <span className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">DISCOUNT</span>
                <div className="grid grid-cols-2 text-[10px] text-slate-400 font-mono mt-0.5 border-t border-slate-100 pt-0.5">
                  <span>%</span>
                  <span>AMOUNT ({currencySymbol})</span>
                </div>
              </th>
              <th className="py-3 px-3 w-28 text-right">AMOUNT</th>
              <th className="py-3 px-2 w-10 text-center"></th>
            </tr>
          </thead>

          {/* Spreadsheet Rows */}
          <tbody className="divide-y divide-slate-100 text-xs">
            {cart.map((line, rowIndex) => {
              const hasStockWarning = line.trackInventory && line.quantity > line.availableStock;
              const isRowActive = Boolean(line.itemId || line.isNewItem);
              const lineGross = line.quantity * line.rate;
              const lineNet = Math.max(0, lineGross - (line.discountAmount || 0));
              const isSearchingThisRow = activeSearchRowIndex === rowIndex;

              const percentDisplay =
                line.discountType === 'PERCENTAGE'
                  ? line.discountValue > 0 ? String(line.discountValue) : ''
                  : line.discountAmount > 0 && lineGross > 0
                  ? String(Math.round(((line.discountAmount / lineGross) * 100) * 100) / 100)
                  : '';

              const amountDisplay =
                line.discountAmount > 0 ? String(line.discountAmount) : '';

              return (
                <tr
                  key={rowIndex}
                  onKeyDown={(e) => handleRowKeyDown(e, rowIndex)}
                  className={`group transition-colors ${
                    isSearchingThisRow ? 'bg-blue-50/50' : 'hover:bg-slate-50/60'
                  }`}
                >
                  {/* Row Number */}
                  <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-400">
                    {rowIndex + 1}
                  </td>

                  {/* Item Name Cell */}
                  <td className="py-2.5 px-3 relative">
                    <div className="relative">
                      <input
                        ref={(el) => (itemInputRefs.current[rowIndex] = el)}
                        type="text"
                        placeholder="Type product name, barcode or SKU..."
                        value={isSearchingThisRow ? searchQuery : line.name}
                        onFocus={() => {
                          setActiveSearchRowIndex(rowIndex);
                          setIsExplicitOpen(false);
                          setSearchQuery(line.name || '');
                          setHighlightedSuggestionIndex(0);
                        }}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          setHighlightedSuggestionIndex(0);
                        }}
                        onKeyDown={(e) => {
                          const hasQuickOption = searchQuery.trim().length > 0;
                          const maxIndex = hasQuickOption ? suggestions.length : Math.max(0, suggestions.length - 1);

                          if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            if (!isExplicitOpen && searchQuery.trim().length === 0) {
                              setIsExplicitOpen(true);
                            } else {
                              setHighlightedSuggestionIndex((prev) =>
                                Math.min(maxIndex, prev + 1)
                              );
                            }
                          } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            setHighlightedSuggestionIndex((prev) => Math.max(0, prev - 1));
                          } else if (e.key === 'Enter') {
                            e.preventDefault();
                            e.stopPropagation();
                            e.nativeEvent?.stopImmediatePropagation?.();
                            if (hasQuickOption && highlightedSuggestionIndex === suggestions.length) {
                              handleCreateQuickItem(rowIndex, searchQuery.trim());
                            } else if (suggestions.length > 0 && isSearchingThisRow && (searchQuery.trim().length >= 1 || isExplicitOpen)) {
                              handleSelectItem(rowIndex, suggestions[highlightedSuggestionIndex] || suggestions[0]);
                            } else if (hasQuickOption) {
                              handleCreateQuickItem(rowIndex, searchQuery.trim());
                            } else if (line.itemId || line.isNewItem || line.name) {
                              qtyInputRefs.current[rowIndex]?.focus();
                              qtyInputRefs.current[rowIndex]?.select();
                            }
                          } else if (e.key === 'Tab') {
                            if (hasQuickOption && highlightedSuggestionIndex === suggestions.length) {
                              e.preventDefault();
                              e.stopPropagation();
                              handleCreateQuickItem(rowIndex, searchQuery.trim());
                            } else if (suggestions.length > 0 && isSearchingThisRow && searchQuery.trim()) {
                              e.preventDefault();
                              e.stopPropagation();
                              handleSelectItem(rowIndex, suggestions[highlightedSuggestionIndex] || suggestions[0]);
                            } else if (hasQuickOption && !line.itemId) {
                              e.preventDefault();
                              e.stopPropagation();
                              handleCreateQuickItem(rowIndex, searchQuery.trim());
                            }
                          } else if (e.key === 'Escape') {
                            setActiveSearchRowIndex(null);
                            setIsExplicitOpen(false);
                          }
                        }}
                        className={`w-full h-9 px-3 rounded-xl border text-xs font-semibold transition-all ${
                          isSearchingThisRow
                            ? 'border-blue-600 ring-2 ring-blue-500/20 bg-white text-slate-900 shadow-sm'
                            : line.itemId || line.isNewItem
                            ? 'border-transparent bg-transparent text-slate-900 font-bold hover:border-slate-200'
                            : 'border-dashed border-slate-300 bg-white text-slate-400'
                        } focus:outline-hidden`}
                      />
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap mt-1">
                      {hasStockWarning && (
                        <span className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md font-medium inline-flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 text-amber-600 shrink-0" />
                          {line.availableStock <= 0
                            ? `Out of stock (stock will be -${line.quantity})`
                            : `Exceeds stock: ${line.availableStock} (stock will be -${line.quantity - line.availableStock})`}
                        </span>
                      )}
                      {line.itemId && line.trackInventory && businessId && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const matchedItem = items.find((it) => it.id === line.itemId);
                            if (matchedItem) {
                              setQuickRestockState({ item: matchedItem, rowIndex });
                            }
                          }}
                          className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-1.5 py-0.5 rounded cursor-pointer transition-colors"
                          title="Quick restock: add stock received at counter"
                        >
                          <PackagePlus className="w-3 h-3 text-blue-600" />
                          + Restock
                        </button>
                      )}
                    </div>
                  </td>

                  {/* Expiry Date Column */}
                  {enableExpiryTracking && (
                    <td className="py-2.5 px-2 text-center">
                      <input
                        ref={(el) => (expInputRefs.current[rowIndex] = el)}
                        type="text"
                        placeholder="MM/YY"
                        disabled={!isRowActive}
                        value={line.expiryDate || ''}
                        onChange={(e) => handleExpiryDateChange(rowIndex, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            qtyInputRefs.current[rowIndex]?.focus();
                            qtyInputRefs.current[rowIndex]?.select();
                          }
                        }}
                        className="w-20 h-8 px-1 text-center font-mono text-xs border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden disabled:bg-slate-50 disabled:text-slate-300"
                      />
                    </td>
                  )}

                  {/* Quantity Input */}
                  <td className="py-2.5 px-2 text-center">
                    <input
                      ref={(el) => (qtyInputRefs.current[rowIndex] = el)}
                      type="number"
                      inputMode="decimal"
                      min="1"
                      disabled={!isRowActive}
                      value={line.quantity || 1}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) =>
                        handleQuantityChange(rowIndex, Math.max(1, parseInt(e.target.value) || 1))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          rateInputRefs.current[rowIndex]?.focus();
                          rateInputRefs.current[rowIndex]?.select();
                        }
                      }}
                      className="w-16 h-8 text-center font-mono font-bold text-xs border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden disabled:bg-slate-50 disabled:text-slate-300"
                    />
                  </td>

                  {/* Unit Label */}
                  <td className="py-2.5 px-2 text-center font-medium text-slate-500 text-xs">
                    {line.unit || 'pcs'}
                  </td>

                  {/* Price / Rate Input */}
                  <td className="py-2.5 px-3 text-right">
                    <div className="relative inline-block w-24">
                      <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs">
                        {currencySymbol}
                      </span>
                      <input
                        ref={(el) => (rateInputRefs.current[rowIndex] = el)}
                        type="number"
                        inputMode="decimal"
                        step="any"
                        min="0"
                        disabled={!isRowActive}
                        value={line.rate || 0}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) =>
                          handleRateChange(rowIndex, Math.max(0, parseFloat(e.target.value) || 0))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            discPercentInputRefs.current[rowIndex]?.focus();
                            discPercentInputRefs.current[rowIndex]?.select();
                          }
                        }}
                        className="w-full h-8 pl-4 pr-1 text-right font-mono font-bold text-xs border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden disabled:bg-slate-50 disabled:text-slate-300"
                      />
                    </div>
                  </td>

                  {/* Discount % Input */}
                  <td className="py-2 px-1 text-center w-20">
                    <div className="relative inline-block w-full max-w-[76px]">
                      <input
                        ref={(el) => (discPercentInputRefs.current[rowIndex] = el)}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        max="100"
                        step="any"
                        placeholder="0"
                        disabled={!isRowActive}
                        value={percentDisplay}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) =>
                          handleDiscountPercentChange(rowIndex, e.target.value)
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            advanceToNextRow(rowIndex);
                          }
                        }}
                        className="w-full h-8 pr-4 pl-1 text-right font-mono font-bold text-xs border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden disabled:bg-slate-50 disabled:text-slate-300"
                      />
                      <span className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-[10px] pointer-events-none select-none">
                        %
                      </span>
                    </div>
                  </td>

                  {/* Discount Amount Input */}
                  <td className="py-2 px-1 text-center w-24">
                    <div className="relative inline-block w-full max-w-[88px]">
                      <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-[10px] pointer-events-none select-none">
                        {currencySymbol}
                      </span>
                      <input
                        ref={(el) => (discAmountInputRefs.current[rowIndex] = el)}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="any"
                        placeholder="0"
                        disabled={!isRowActive}
                        value={amountDisplay}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) =>
                          handleDiscountAmountChange(rowIndex, e.target.value)
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            advanceToNextRow(rowIndex);
                          } else if (e.key === 'Tab' && !e.shiftKey) {
                            e.preventDefault();
                            advanceToNextRow(rowIndex);
                          }
                        }}
                        className="w-full h-8 pl-4 pr-1 text-right font-mono font-bold text-xs border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden disabled:bg-slate-50 disabled:text-slate-300"
                      />
                    </div>
                  </td>

                  {/* Net Amount */}
                  <td className="py-2.5 px-3 text-right">
                    <span className="font-mono font-bold text-slate-900 text-xs block">
                      {formatCurrency(lineNet, currencySymbol)}
                    </span>
                    {line.discountAmount > 0 && (
                      <span className="text-[10px] text-slate-400 line-through font-mono block">
                        {formatCurrency(lineGross, currencySymbol)}
                      </span>
                    )}
                  </td>

                  {/* Delete Row Button */}
                  <td className="py-2.5 px-2 text-center">
                    <button
                      type="button"
                      onClick={() => handleDeleteRow(rowIndex)}
                      className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      title="Delete Row (Ctrl+Delete / Alt+Backspace)"
                      aria-label="Delete Row"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>

          {/* Table Footer with Add Row Button and Subtotals */}
          <tfoot>
            <tr className="bg-slate-50/80 border-t border-slate-200 text-xs font-bold text-slate-700">
              <td colSpan={2} className="py-3 px-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleAddNewRow}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl font-bold text-xs transition-all cursor-pointer shadow-2xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Row (Enter)</span>
                  </button>
                  <span className="text-[11px] text-slate-400 font-normal hidden sm:inline">
                    {totalItemsCount} item{totalItemsCount === 1 ? '' : 's'} · <kbd className="text-[10px] font-mono bg-white px-1 py-0.5 border rounded">Ctrl+Del</kbd> to delete row
                  </span>
                </div>
              </td>

              {enableExpiryTracking && (
                <td className="py-3 px-2 text-center text-slate-400 text-[11px]"></td>
              )}

              <td className="py-3 px-2 text-center font-mono text-slate-900">
                {totalQuantitySum}
              </td>

              <td colSpan={4} className="py-3 px-3 text-right font-bold text-slate-600 uppercase text-[11px]">
                Subtotal
              </td>

              <td className="py-3 px-3 text-right font-mono text-sm text-slate-900">
                {formatCurrency(totalNetSum, currencySymbol)}
              </td>

              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Floating Free Autocomplete Dropdown via React Portal (Never clipped by overflow or table height) */}
      {activeSearchRowIndex !== null &&
        (searchQuery.trim().length >= 1 || isExplicitOpen) &&
        dropdownPosition &&
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
            className="max-w-[95vw] bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-1.5"
          >
            <div className="p-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs text-slate-600 font-bold">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                Product Catalog ({suggestions.length} matches)
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                Use ↑↓ to navigate · Enter to pick
              </span>
            </div>

            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
              {suggestions.map((item, sugIdx) => {
                const isHighlighted = sugIdx === highlightedSuggestionIndex;
                const isOutOfStock = item.trackInventory && item.currentStock <= 0;
                const cost = item.costPrice || item.purchasePrice || 0;
                const margin = item.sellingPrice - cost;
                const marginPercent = cost > 0 ? ((margin / cost) * 100).toFixed(0) : '0';
                const hasBatches = Boolean(item.batches && item.batches.length > 1);

                return (
                  <div
                    key={item.id}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelectItem(activeSearchRowIndex, item);
                    }}
                    onMouseEnter={() => setHighlightedSuggestionIndex(sugIdx)}
                    className={`p-3 flex items-center justify-between cursor-pointer transition-all ${
                      isHighlighted ? 'bg-blue-600 text-white' : 'hover:bg-slate-50 text-slate-800'
                    }`}
                  >
                    <div className="flex-1 pr-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-xs sm:text-sm block">
                          {item.name}
                        </span>
                        {item.sku && (
                          <span
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                              isHighlighted ? 'bg-blue-700 text-blue-100' : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {item.sku}
                          </span>
                        )}
                        {hasBatches && (
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 ${
                              isHighlighted
                                ? 'bg-amber-400 text-slate-900'
                                : 'bg-amber-100 text-amber-900 border border-amber-200'
                            }`}
                          >
                            <Layers className="w-3 h-3" />
                            {item.batches?.length} Batches / MRPs
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2.5 mt-1 text-[11px] flex-wrap">
                        <span className={isHighlighted ? 'text-blue-100' : 'text-slate-400'}>
                          {item.category || 'General'} · {item.unit || 'pcs'}
                        </span>

                        {cost > 0 && (
                          <span
                            className={`font-mono ${
                              isHighlighted ? 'text-blue-200' : 'text-slate-500'
                            }`}
                          >
                            Cost: <strong>{formatCurrency(cost, currencySymbol)}</strong>
                          </span>
                        )}

                        {cost > 0 && margin > 0 && (
                          <span
                            className={`font-semibold flex items-center gap-0.5 ${
                              isHighlighted ? 'text-emerald-300' : 'text-emerald-700'
                            }`}
                          >
                            <TrendingUp className="w-3 h-3" />
                            +{marginPercent}%
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-mono font-bold text-sm block">
                        {formatCurrency(item.sellingPrice, currencySymbol)}
                      </span>
                      {item.trackInventory ? (
                        <span
                          className={`text-[11px] font-mono font-semibold inline-block px-1.5 py-0.5 rounded-md ${
                            isHighlighted
                              ? 'bg-blue-700 text-white'
                              : isOutOfStock
                              ? 'bg-rose-100 text-rose-700'
                              : item.currentStock < 5
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {isOutOfStock ? 'Out of stock' : `${item.currentStock} in stock`}
                        </span>
                      ) : (
                        <span
                          className={`text-[11px] ${
                            isHighlighted ? 'text-blue-100' : 'text-slate-400'
                          }`}
                        >
                          Service
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {suggestions.length === 0 && (
                <div className="p-4 text-center text-xs text-slate-400">
                  No existing product matched &ldquo;{searchQuery}&rdquo;
                </div>
              )}
            </div>

            {/* Quick Add Product Action Bar (Instant sell & auto inventory sync) */}
            {searchQuery.trim().length > 0 && (
              <div
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (activeSearchRowIndex !== null) {
                    handleCreateQuickItem(activeSearchRowIndex, searchQuery.trim());
                  }
                }}
                onMouseEnter={() => setHighlightedSuggestionIndex(suggestions.length)}
                className={`p-3 border-t border-slate-200 flex items-center justify-between cursor-pointer transition-all ${
                  highlightedSuggestionIndex === suggestions.length
                    ? 'bg-blue-600 text-white'
                    : 'bg-blue-50/80 hover:bg-blue-100 text-blue-900'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold ${
                      highlightedSuggestionIndex === suggestions.length
                        ? 'bg-white/20 text-white'
                        : 'bg-blue-600 text-white shadow-2xs'
                    }`}
                  >
                    <Plus className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-bold text-xs block">
                      + Add New Product: &ldquo;{searchQuery.trim()}&rdquo;
                    </span>
                    <span
                      className={`text-[10px] block ${
                        highlightedSuggestionIndex === suggestions.length
                          ? 'text-blue-100'
                          : 'text-blue-600'
                      }`}
                    >
                      Instant billing now · Auto-syncs to inventory upon sale
                    </span>
                  </div>
                </div>
                <span
                  className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border ${
                    highlightedSuggestionIndex === suggestions.length
                      ? 'border-white/30 text-white bg-white/10'
                      : 'border-blue-200 text-blue-700 bg-white'
                  }`}
                >
                  Press Enter ↵
                </span>
              </div>
            )}

            <div className="p-2 bg-slate-50/80 border-t border-slate-100 text-[11px] text-slate-500 text-center font-semibold">
              Press <kbd className="bg-white border px-1.5 py-0.5 rounded text-[10px]">Enter</kbd> to add to invoice · <kbd className="bg-white border px-1.5 py-0.5 rounded text-[10px]">Esc</kbd> to cancel
            </div>
          </div>,
          document.body
        )}

      {/* Multi-MRP & Multi-Expiry Batch Selection Pop-up Modal */}
      <BatchSelectionModal
        isOpen={batchModalState !== null}
        item={batchModalState?.item || null}
        currencySymbol={currencySymbol}
        initialQuantity={batchModalState?.initialQuantity || 1}
        onSelectBatches={handleSelectBatches}
        onClose={() => {
          const rowIndex = batchModalState?.rowIndex;
          setBatchModalState(null);
          if (rowIndex !== undefined && rowIndex !== null) {
            itemInputRefs.current[rowIndex]?.focus();
          }
        }}
      />

      {/* Quick Counter Restock Modal */}
      {quickRestockState && businessId && (
        <QuickRestockModal
          isOpen={quickRestockState !== null}
          onClose={() => setQuickRestockState(null)}
          onSuccess={handleRestockSuccess}
          item={quickRestockState.item}
          businessId={businessId}
          currencySymbol={currencySymbol}
          enableExpiryTracking={enableExpiryTracking}
        />
      )}
    </div>
  );
};
