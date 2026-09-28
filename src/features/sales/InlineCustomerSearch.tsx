import React, { useState, useRef, useEffect } from 'react';
import type { Customer } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { User, Phone, Coins, UserPlus, X, Check, Search } from 'lucide-react';

interface InlineCustomerSearchProps {
  customers: Customer[];
  selectedCustomerId: string;
  customerCreditAvailable: number;
  applyCustomerCredit: boolean;
  currencySymbol?: string;
  customerInputRef?: React.RefObject<HTMLInputElement | null>;
  onSelectCustomer: (customerId: string) => void;
  onToggleApplyCredit: (apply: boolean) => void;
  onOpenAddCustomerModal: () => void;
  onDoneSelecting?: () => void;
}

export const InlineCustomerSearch: React.FC<InlineCustomerSearchProps> = ({
  customers,
  selectedCustomerId,
  customerCreditAvailable,
  applyCustomerCredit,
  currencySymbol = '₹',
  customerInputRef,
  onSelectCustomer,
  onToggleApplyCredit,
  onOpenAddCustomerModal,
  onDoneSelecting,
}) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

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

  const filteredCustomers = query.trim()
    ? customers.filter(
        (c) =>
          c.name.toLowerCase().includes(query.toLowerCase()) ||
          (c.phone && c.phone.includes(query.trim()))
      )
    : customers.slice(0, 8);

  const isNumericPhone = /^\d{3,}$/.test(query.trim());

  return (
    <div className="relative w-full" ref={dropdownRef}>
      {selectedCustomer ? (
        // Selected Customer Card State
        <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-2xl flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
              {selectedCustomer.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm font-bold text-slate-900">
                  {selectedCustomer.name}
                </span>
                <button
                  type="button"
                  onClick={() => onSelectCustomer('')}
                  className="text-[11px] text-slate-400 hover:text-rose-600 p-0.5 rounded cursor-pointer"
                  title="Switch to Walk-in Customer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              {selectedCustomer.phone && (
                <span className="text-[11px] text-slate-500 font-mono flex items-center gap-1">
                  <Phone className="w-3 h-3" /> {selectedCustomer.phone}
                </span>
              )}
            </div>
          </div>

          {/* Customer Credit or Khata Pill */}
          <div className="flex items-center gap-2">
            {customerCreditAvailable > 0 && (
              <label className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-blue-200 rounded-xl cursor-pointer text-xs text-blue-900 shadow-2xs font-semibold">
                <Coins className="w-3.5 h-3.5 text-blue-600" />
                <span>Apply Credit ({formatCurrency(customerCreditAvailable, currencySymbol)})</span>
                <input
                  type="checkbox"
                  checked={applyCustomerCredit}
                  onChange={(e) => onToggleApplyCredit(e.target.checked)}
                  className="w-3.5 h-3.5 text-blue-600 rounded"
                />
              </label>
            )}

            <button
              type="button"
              onClick={() => onSelectCustomer('')}
              className="text-xs text-slate-500 hover:text-slate-800 font-medium px-2 py-1 rounded-lg hover:bg-white/60 transition-colors"
            >
              Change
            </button>
          </div>
        </div>
      ) : (
        // Walk-in / Search Input State
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              ref={customerInputRef}
              type="text"
              placeholder="Search customer by name or phone (or leave empty for Walk-in)..."
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
                  setHighlightedIndex((prev) =>
                    Math.min(filteredCustomers.length, prev + 1)
                  );
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setHighlightedIndex((prev) => Math.max(0, prev - 1));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  if (highlightedIndex === 0) {
                    onSelectCustomer('');
                  } else if (filteredCustomers[highlightedIndex - 1]) {
                    onSelectCustomer(filteredCustomers[highlightedIndex - 1].id);
                  }
                  setIsOpen(false);
                  setQuery('');
                  onDoneSelecting?.();
                } else if (e.key === 'Escape') {
                  setIsOpen(false);
                  onDoneSelecting?.();
                }
              }}
              className="w-full h-11 pl-10 pr-24 rounded-xl border border-slate-200 bg-white text-slate-900 text-xs sm:text-sm font-medium focus:ring-2 focus:ring-blue-600 focus:outline-hidden transition-all shadow-2xs"
            />
            <button
              type="button"
              onClick={onOpenAddCustomerModal}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" /> + New
            </button>
          </div>

          {/* Autocomplete Dropdown */}
          {isOpen && (
            <div className="absolute top-full left-0 right-0 mt-1.5 z-40 bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-1">
              <div className="p-2 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between text-[11px] text-slate-500 font-semibold">
                <span>Select Customer (or press Enter for Walk-in)</span>
                <span className="font-mono text-[10px]">Use ↑↓ to navigate · Enter to select</span>
              </div>

              <div className="divide-y divide-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    onSelectCustomer('');
                    setIsOpen(false);
                    setQuery('');
                    onDoneSelecting?.();
                  }}
                  onMouseEnter={() => setHighlightedIndex(0)}
                  className={`w-full px-3.5 py-2.5 text-left flex items-center justify-between transition-colors cursor-pointer text-xs font-semibold ${
                    highlightedIndex === 0
                      ? 'bg-blue-600 text-white'
                      : 'hover:bg-slate-50 text-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <User className={`w-4 h-4 ${highlightedIndex === 0 ? 'text-white' : 'text-slate-400'}`} />
                    <span>Walk-in Customer (Cash / Direct)</span>
                  </div>
                  {!selectedCustomerId && (
                    <Check className={`w-4 h-4 ${highlightedIndex === 0 ? 'text-white' : 'text-blue-600'}`} />
                  )}
                </button>

                {filteredCustomers.map((c, idx) => {
                  const isHighlighted = highlightedIndex === idx + 1;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        onSelectCustomer(c.id);
                        setIsOpen(false);
                        setQuery('');
                        onDoneSelecting?.();
                      }}
                      onMouseEnter={() => setHighlightedIndex(idx + 1)}
                      className={`w-full px-3.5 py-2.5 text-left flex items-center justify-between transition-colors text-xs cursor-pointer ${
                        isHighlighted
                          ? 'bg-blue-600 text-white'
                          : 'hover:bg-blue-50/60 text-slate-800'
                      }`}
                    >
                      <div>
                        <span className={`font-bold block ${isHighlighted ? 'text-white' : 'text-slate-900'}`}>
                          {c.name}
                        </span>
                        {c.phone && (
                          <span
                            className={`text-[11px] font-mono ${
                              isHighlighted ? 'text-blue-100' : 'text-slate-500'
                            }`}
                          >
                            {c.phone}
                          </span>
                        )}
                      </div>
                      {c.balance !== undefined && c.balance !== 0 && (
                        <span
                          className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-md ${
                            isHighlighted
                              ? 'bg-blue-700 text-white'
                              : c.balance > 0
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {c.balance > 0
                            ? `Due: ${formatCurrency(c.balance, currencySymbol)}`
                            : `Credit: ${formatCurrency(Math.abs(c.balance), currencySymbol)}`}
                        </span>
                      )}
                    </button>
                  );
                })}

                {isNumericPhone && filteredCustomers.length === 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      onOpenAddCustomerModal();
                    }}
                    className="w-full px-3.5 py-3 text-left flex items-center gap-2 text-xs font-bold text-blue-600 hover:bg-blue-50 cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Quick Add Customer with Phone &ldquo;{query}&rdquo;</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
