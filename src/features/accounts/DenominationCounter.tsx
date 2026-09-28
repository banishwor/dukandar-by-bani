import React, { useRef } from 'react';
import type { CurrencyDenominations } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { Banknote, Coins, RotateCcw } from 'lucide-react';

interface DenominationCounterProps {
  value: CurrencyDenominations;
  onChange: (denominations: CurrencyDenominations, totalAmount: number) => void;
  currencySymbol?: string;
  expectedAmount?: number;
}

const DENOMINATION_LIST = [
  { key: 'n500', value: 500, label: '₹500', color: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  { key: 'n200', value: 200, label: '₹200', color: 'bg-amber-50 text-amber-800 border-amber-200' },
  { key: 'n100', value: 100, label: '₹100', color: 'bg-purple-50 text-purple-800 border-purple-200' },
  { key: 'n50', value: 50, label: '₹50', color: 'bg-cyan-50 text-cyan-800 border-cyan-200' },
  { key: 'n20', value: 20, label: '₹20', color: 'bg-orange-50 text-orange-800 border-orange-200' },
  { key: 'n10', value: 10, label: '₹10', color: 'bg-rose-50 text-rose-800 border-rose-200' },
] as const;

export const DenominationCounter: React.FC<DenominationCounterProps> = ({
  value,
  onChange,
  currencySymbol = '₹',
  expectedAmount,
}) => {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Compute total amount and total notes count
  const calculateTotal = (denoms: CurrencyDenominations): number => {
    let total = 0;
    for (const item of DENOMINATION_LIST) {
      const count = denoms[item.key] || 0;
      total += count * item.value;
    }
    total += Number(denoms.coins) || 0;
    return total;
  };

  const totalAmount = calculateTotal(value);

  const totalNotesCount = DENOMINATION_LIST.reduce((sum, item) => {
    return sum + (value[item.key] || 0);
  }, 0);

  const handleCountChange = (key: keyof CurrencyDenominations, strVal: string) => {
    const parsed = parseInt(strVal) || 0;
    const cleanVal = Math.max(0, parsed);
    const updated = {
      ...value,
      [key]: cleanVal > 0 ? cleanVal : undefined,
    };
    onChange(updated, calculateTotal(updated));
  };

  const handleCoinsChange = (strVal: string) => {
    const parsed = parseFloat(strVal) || 0;
    const cleanVal = Math.max(0, parsed);
    const updated = {
      ...value,
      coins: cleanVal > 0 ? cleanVal : undefined,
    };
    onChange(updated, calculateTotal(updated));
  };

  const handleReset = () => {
    onChange({}, 0);
    inputRefs.current[0]?.focus();
  };

  const difference = expectedAmount !== undefined ? totalAmount - expectedAmount : undefined;

  return (
    <div className="space-y-4">
      {/* Header bar with total and reset */}
      <div className="flex items-center justify-between p-3.5 bg-slate-900 text-white rounded-2xl shadow-sm">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
            Total Physical Cash Counted
          </span>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-2xl font-black font-mono text-emerald-400">
              {formatCurrency(totalAmount, currencySymbol)}
            </span>
            <span className="text-xs text-slate-400 font-mono">
              ({totalNotesCount} note{totalNotesCount === 1 ? '' : 's'})
            </span>
          </div>
        </div>

        {totalAmount > 0 && (
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
            title="Reset all counts to 0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        )}
      </div>

      {/* Denominations Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {DENOMINATION_LIST.map((item, index) => {
          const count = value[item.key] || '';
          const lineTotal = (value[item.key] || 0) * item.value;

          return (
            <div
              key={item.key}
              className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition-all ${
                lineTotal > 0
                  ? 'bg-blue-50/40 border-blue-200 ring-1 ring-blue-500/20'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`w-14 py-1 text-center font-mono font-bold text-xs rounded-lg border ${item.color}`}
                >
                  {item.label}
                </span>
                <span className="text-xs font-bold text-slate-400">×</span>
                <input
                  ref={(el) => (inputRefs.current[index] = el)}
                  type="number"
                  inputMode="numeric"
                  min="0"
                  placeholder="0"
                  value={count}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => handleCountChange(item.key, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const nextInput = inputRefs.current[index + 1];
                      if (nextInput) {
                        nextInput.focus();
                        nextInput.select();
                      }
                    }
                  }}
                  className="w-16 h-8 px-2 text-center font-mono font-bold text-xs rounded-lg border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 shadow-2xs"
                />
              </div>

              <div className="text-right pr-1">
                <span className="font-mono font-bold text-xs text-slate-700">
                  {lineTotal > 0 ? formatCurrency(lineTotal, currencySymbol) : '—'}
                </span>
              </div>
            </div>
          );
        })}

        {/* Loose Coins Input (spans full width on small screens) */}
        <div
          className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition-all sm:col-span-2 ${
            (value.coins || 0) > 0
              ? 'bg-amber-50/50 border-amber-200 ring-1 ring-amber-500/20'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center gap-1 w-20 py-1 text-center font-mono font-bold text-xs rounded-lg border bg-amber-50 text-amber-800 border-amber-200">
              <Coins className="w-3.5 h-3.5 text-amber-600" />
              Coins
            </span>
            <span className="text-xs text-slate-500 font-medium">Total Value:</span>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-400">
                {currencySymbol}
              </span>
              <input
                ref={(el) => (inputRefs.current[DENOMINATION_LIST.length] = el)}
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                placeholder="0"
                value={value.coins || ''}
                onFocus={(e) => e.target.select()}
                onChange={(e) => handleCoinsChange(e.target.value)}
                className="w-24 h-8 pl-6 pr-2 text-right font-mono font-bold text-xs rounded-lg border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs"
              />
            </div>
          </div>

          <div className="text-right pr-1">
            <span className="font-mono font-bold text-xs text-slate-700">
              {(value.coins || 0) > 0 ? formatCurrency(value.coins || 0, currencySymbol) : '—'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
