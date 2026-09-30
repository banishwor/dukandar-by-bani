import React, { useState, useRef, useEffect } from 'react';
import type { Supplier } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { Truck, Phone, Coins, UserPlus, X, Search, Check, AlertCircle } from 'lucide-react';

interface InlineSupplierSearchProps {
  suppliers: Supplier[];
  selectedSupplierId: string;
  supplierCreditAvailable: number;
  applySupplierCredit: boolean;
  supplierOutstandingBalance?: number;
  currencySymbol?: string;
  supplierInputRef?: React.RefObject<HTMLInputElement | null>;
  onSelectSupplier: (supplierId: string) => void;
  onToggleApplyCredit: (apply: boolean) => void;
  onOpenAddSupplierModal: () => void;
  onDoneSelecting?: () => void;
}

export const InlineSupplierSearch: React.FC<InlineSupplierSearchProps> = ({
  suppliers,
  selectedSupplierId,
  supplierCreditAvailable,
  applySupplierCredit,
  supplierOutstandingBalance = 0,
  currencySymbol = '₹',
  supplierInputRef,
  onSelectSupplier,
  onToggleApplyCredit,
  onOpenAddSupplierModal,
  onDoneSelecting,
}) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedSupplier = suppliers.find((s) => s.id === selectedSupplierId);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredSuppliers = query.trim()
    ? suppliers.filter(
        (s) =>
          s.name.toLowerCase().includes(query.toLowerCase()) ||
          (s.phone && s.phone.includes(query.trim()))
      )
    : suppliers.slice(0, 8);

  // Index 0: Direct Cash Vendor
  // Indices 1..N: filteredSuppliers
  const totalOptions = 1 + filteredSuppliers.length;

  return (
    <div className="relative w-full" ref={dropdownRef}>
      {selectedSupplierId ? (
        // Selected Supplier Card State
        <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-700 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-3xs">
              {selectedSupplier ? selectedSupplier.name.charAt(0).toUpperCase() : <Truck className="w-4 h-4" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm font-bold text-slate-900">
                  {selectedSupplier ? selectedSupplier.name : 'Direct Cash Vendor'}
                </span>
                <button
                  type="button"
                  onClick={() => onSelectSupplier('')}
                  className="text-[11px] text-slate-400 hover:text-rose-600 p-0.5 rounded cursor-pointer transition-colors"
                  title="Clear / Change Supplier"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              {selectedSupplier?.phone ? (
                <span className="text-[11px] text-slate-500 font-mono flex items-center gap-1">
                  <Phone className="w-3 h-3" /> {selectedSupplier.phone}
                </span>
              ) : (
                <span className="text-[11px] text-amber-700 font-medium">Spot Purchase Vendor</span>
              )}
            </div>
          </div>

          {/* Supplier Balances & Advance Credit Badge */}
          <div className="flex items-center gap-2 flex-wrap">
            {supplierOutstandingBalance > 0 && (
              <span className="px-2.5 py-1 bg-amber-100/80 border border-amber-200 text-amber-900 rounded-xl text-xs font-semibold flex items-center gap-1">
                <AlertCircle className="w-3 h-3 text-amber-700" />
                <span>Payable Due: {formatCurrency(supplierOutstandingBalance, currencySymbol)}</span>
              </span>
            )}

            {supplierCreditAvailable > 0 && (
              <label className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-blue-200 rounded-xl cursor-pointer text-xs text-blue-900 shadow-2xs font-semibold">
                <Coins className="w-3.5 h-3.5 text-blue-600" />
                <span>Apply Advance ({formatCurrency(supplierCreditAvailable, currencySymbol)})</span>
                <input
                  type="checkbox"
                  checked={applySupplierCredit}
                  onChange={(e) => onToggleApplyCredit(e.target.checked)}
                  className="w-3.5 h-3.5 text-blue-600 rounded cursor-pointer"
                />
              </label>
            )}

            <button
              type="button"
              onClick={() => onSelectSupplier('')}
              className="text-xs text-slate-500 hover:text-slate-900 font-medium px-2 py-1 rounded-lg hover:bg-white/80 transition-colors cursor-pointer"
            >
              Change
            </button>
          </div>
        </div>
      ) : (
        // Search Input State
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              ref={supplierInputRef}
              type="text"
              placeholder="Search supplier by name or phone (or leave for Direct Cash Vendor)..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setIsOpen(true);
                setHighlightedIndex(0);
              }}
              onFocus={() => {
                setIsOpen(true);
                setHighlightedIndex(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setIsOpen(true);
                  setHighlightedIndex((prev) => Math.min(totalOptions - 1, prev + 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setHighlightedIndex((prev) => Math.max(0, prev - 1));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  if (highlightedIndex === 0) {
                    onSelectSupplier('');
                  } else if (filteredSuppliers[highlightedIndex - 1]) {
                    onSelectSupplier(filteredSuppliers[highlightedIndex - 1].id);
                  }
                  setIsOpen(false);
                  setQuery('');
                  onDoneSelecting?.();
                } else if (e.key === 'Escape') {
                  setIsOpen(false);
                  onDoneSelecting?.();
                }
              }}
              className="w-full h-11 pl-10 pr-28 rounded-xl border border-slate-200 bg-white text-slate-900 text-xs sm:text-sm font-medium focus:ring-2 focus:ring-amber-600 focus:outline-hidden transition-all shadow-2xs"
            />
            <button
              type="button"
              onClick={onOpenAddSupplierModal}
              className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>+ Add</span>
            </button>
          </div>

          {/* Autocomplete Dropdown List */}
          {isOpen && (
            <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto bg-white rounded-2xl border border-slate-200 shadow-xl divide-y divide-slate-100">
              {/* Option 0: Direct Cash Vendor */}
              <button
                type="button"
                onClick={() => {
                  onSelectSupplier('');
                  setIsOpen(false);
                  setQuery('');
                  onDoneSelecting?.();
                }}
                className={`w-full px-3.5 py-2.5 text-left flex items-center justify-between text-xs transition-colors cursor-pointer ${
                  highlightedIndex === 0 ? 'bg-amber-50 text-amber-900 font-bold' : 'hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-[10px]">
                    <Truck className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="font-bold block">Direct Cash Vendor</span>
                    <span className="text-[10px] text-slate-400 font-normal">Immediate spot purchase without registered khata</span>
                  </div>
                </div>
                {highlightedIndex === 0 && <Check className="w-4 h-4 text-amber-700" />}
              </button>

              {/* Option 1..N: Filtered Registered Suppliers */}
              {filteredSuppliers.map((supp, idx) => {
                const isSelected = highlightedIndex === idx + 1;
                return (
                  <button
                    key={supp.id}
                    type="button"
                    onClick={() => {
                      onSelectSupplier(supp.id);
                      setIsOpen(false);
                      setQuery('');
                      onDoneSelecting?.();
                    }}
                    className={`w-full px-3.5 py-2.5 text-left flex items-center justify-between text-xs transition-colors cursor-pointer ${
                      isSelected ? 'bg-amber-50 text-amber-900 font-bold' : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-[10px]">
                        {supp.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <span className="font-bold block text-slate-900">{supp.name}</span>
                        {supp.phone && (
                          <span className="text-[10px] text-slate-400 font-mono block">
                            {supp.phone}
                          </span>
                        )}
                      </div>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-amber-700" />}
                  </button>
                );
              })}

              {filteredSuppliers.length === 0 && query.trim() && (
                <div className="p-3 text-center text-xs text-slate-400">
                  <span>No registered supplier found matching "{query}".</span>
                  <button
                    type="button"
                    onClick={onOpenAddSupplierModal}
                    className="block mx-auto mt-1 font-bold text-amber-800 hover:underline cursor-pointer"
                  >
                    + Register "{query}" as New Supplier
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
