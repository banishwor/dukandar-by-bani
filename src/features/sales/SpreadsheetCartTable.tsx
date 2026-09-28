import React from 'react';
import type { SaleCartLine } from './useSaleDrafts';
import type { DiscountType } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { Minus, Plus, Trash2, AlertCircle } from 'lucide-react';

interface SpreadsheetCartTableProps {
  cart: SaleCartLine[];
  currencySymbol?: string;
  onUpdateQuantity: (itemId: string, newQty: number) => void;
  onUpdateDiscount: (itemId: string, type: DiscountType, value: number) => void;
  onRemoveLine: (itemId: string) => void;
}

export const SpreadsheetCartTable: React.FC<SpreadsheetCartTableProps> = ({
  cart,
  currencySymbol = '₹',
  onUpdateQuantity,
  onUpdateDiscount,
  onRemoveLine,
}) => {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-left border-collapse text-xs">
        <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
          <tr>
            <th className="py-2.5 px-3 w-10 text-center">#</th>
            <th className="py-2.5 px-3">Item / Service</th>
            <th className="py-2.5 px-3 w-28 text-center">Quantity</th>
            <th className="py-2.5 px-3 w-24 text-right">Unit Rate</th>
            <th className="py-2.5 px-3 w-36 text-center">Discount</th>
            <th className="py-2.5 px-3 w-28 text-right">Net Amount</th>
            <th className="py-2.5 px-3 w-10 text-center"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {cart.map((line, index) => {
            const hasStockWarning = line.trackInventory && line.quantity > line.availableStock;
            const lineGross = line.quantity * line.rate;
            const lineNet = Math.max(0, lineGross - (line.discountAmount || 0));

            return (
              <tr key={line.itemId} className="hover:bg-slate-50/70 transition-colors group">
                <td className="py-2.5 px-3 text-center font-mono text-slate-400 font-semibold text-[11px]">
                  {index + 1}
                </td>

                <td className="py-2.5 px-3">
                  <span className="font-bold text-slate-900 block">{line.name}</span>
                  {hasStockWarning && (
                    <span className="text-[10px] text-rose-600 font-semibold flex items-center gap-1 mt-0.5">
                      <AlertCircle className="w-3 h-3" />
                      Only {line.availableStock} {line.unit} in stock!
                    </span>
                  )}
                </td>

                <td className="py-2.5 px-3">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      type="button"
                      onClick={() => onUpdateQuantity(line.itemId, line.quantity - 1)}
                      className="w-6 h-6 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center active:scale-95 cursor-pointer"
                      aria-label="Decrease quantity"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="1"
                      value={line.quantity}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) =>
                        onUpdateQuantity(line.itemId, Math.max(1, parseInt(e.target.value) || 1))
                      }
                      className="w-12 h-6 text-center font-mono font-bold text-xs border border-slate-200 rounded-md bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    />
                    <button
                      type="button"
                      onClick={() => onUpdateQuantity(line.itemId, line.quantity + 1)}
                      className="w-6 h-6 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center active:scale-95 cursor-pointer"
                      aria-label="Increase quantity"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </td>

                <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-700">
                  {formatCurrency(line.rate, currencySymbol)}
                </td>

                <td className="py-2.5 px-3">
                  <div className="flex items-center justify-center gap-1">
                    <div className="inline-flex rounded-md border border-slate-200 bg-slate-100 p-0.5 text-[10px]">
                      <button
                        type="button"
                        onClick={() => onUpdateDiscount(line.itemId, 'NONE', 0)}
                        className={`px-1 rounded cursor-pointer ${
                          line.discountType === 'NONE' || !line.discountType
                            ? 'bg-white font-bold text-slate-900 shadow-2xs'
                            : 'text-slate-500'
                        }`}
                      >
                        0
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateDiscount(
                            line.itemId,
                            'PERCENTAGE',
                            line.discountValue || 10
                          )
                        }
                        className={`px-1 rounded cursor-pointer ${
                          line.discountType === 'PERCENTAGE'
                            ? 'bg-blue-600 font-bold text-white shadow-2xs'
                            : 'text-slate-500'
                        }`}
                      >
                        %
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateDiscount(
                            line.itemId,
                            'FLAT',
                            line.discountValue || 10
                          )
                        }
                        className={`px-1 rounded cursor-pointer ${
                          line.discountType === 'FLAT'
                            ? 'bg-blue-600 font-bold text-white shadow-2xs'
                            : 'text-slate-500'
                        }`}
                      >
                        ₹
                      </button>
                    </div>

                    {line.discountType && line.discountType !== 'NONE' && (
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        max={line.discountType === 'PERCENTAGE' ? 100 : undefined}
                        value={line.discountValue || ''}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) =>
                          onUpdateDiscount(
                            line.itemId,
                            line.discountType || 'NONE',
                            Math.max(0, parseFloat(e.target.value) || 0)
                          )
                        }
                        className="w-12 h-6 px-1 text-right text-xs font-mono font-bold border border-blue-300 rounded bg-white"
                      />
                    )}
                  </div>
                </td>

                <td className="py-2.5 px-3 text-right">
                  <span className="font-mono font-bold text-slate-900">
                    {formatCurrency(lineNet, currencySymbol)}
                  </span>
                  {line.discountAmount > 0 && (
                    <span className="text-[10px] text-slate-400 line-through block font-mono">
                      {formatCurrency(lineGross, currencySymbol)}
                    </span>
                  )}
                </td>

                <td className="py-2.5 px-3 text-center">
                  <button
                    type="button"
                    onClick={() => onRemoveLine(line.itemId)}
                    className="p-1 rounded-md text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                    title="Remove Line"
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
  );
};
