import React, { useState } from 'react';
import type { PurchaseDraft } from './usePurchaseDrafts';
import type { Supplier } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { Plus, X, Truck, ChevronDown, Check } from 'lucide-react';

interface PurchaseDraftTabsProps {
  drafts: PurchaseDraft[];
  activeDraftId: string;
  suppliers: Supplier[];
  currencySymbol?: string;
  onSelectDraft: (id: string) => void;
  onNewDraft: () => void;
  onCloseDraft: (id: string) => void;
}

export const PurchaseDraftTabs: React.FC<PurchaseDraftTabsProps> = ({
  drafts,
  activeDraftId,
  suppliers,
  currencySymbol = '₹',
  onSelectDraft,
  onNewDraft,
  onCloseDraft,
}) => {
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);

  const getSupplierName = (supplierId: string) => {
    if (!supplierId) return null;
    const sup = suppliers.find((s) => s.id === supplierId);
    return sup ? sup.name : null;
  };

  const activeDraft = drafts.find((d) => d.id === activeDraftId) || drafts[0];
  const activeSupplierName = activeDraft ? getSupplierName(activeDraft.supplierId) : null;
  const activeDraftItemCount = activeDraft?.lines.reduce((sum, l) => sum + (l.quantity || 0), 0) || 0;
  const activeDraftTotal = activeDraft?.lines.reduce(
    (sum, l) => sum + Math.max(0, (l.quantity || 0) * (l.unitCost || 0) - (l.discountAmount || 0)),
    0
  ) || 0;

  return (
    <div className="w-full">
      {/* Desktop Horizontal Tabs */}
      <div className="hidden sm:flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
        {drafts.map((draft, idx) => {
          const isActive = draft.id === activeDraftId;
          const supName = getSupplierName(draft.supplierId);
          const displayTitle = supName || draft.title || `Inward #${idx + 1}`;
          const itemCount = draft.lines.reduce((sum, l) => sum + (l.quantity || 0), 0);
          const totalAmount = draft.lines.reduce(
            (sum, l) => sum + Math.max(0, (l.quantity || 0) * (l.unitCost || 0) - (l.discountAmount || 0)),
            0
          );

          return (
            <div
              key={draft.id}
              onClick={() => onSelectDraft(draft.id)}
              className={`group flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-all shrink-0 select-none border ${
                isActive
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
              }`}
            >
              <Truck className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
              <span className="truncate max-w-[130px]">{displayTitle}</span>

              {itemCount > 0 && (
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold ${
                    isActive
                      ? 'bg-blue-700/70 text-blue-100'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {itemCount} · {formatCurrency(totalAmount, currencySymbol)}
                </span>
              )}

              {drafts.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (draft.lines.length > 0 && !window.confirm(`Discard ${displayTitle}? Any unsaved items in this draft will be lost.`)) {
                      return;
                    }
                    onCloseDraft(draft.id);
                  }}
                  className={`p-0.5 rounded-md hover:bg-black/10 transition-colors ${
                    isActive ? 'text-white/80 hover:text-white' : 'text-slate-400 hover:text-rose-600'
                  }`}
                  aria-label={`Close ${displayTitle}`}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}

        <button
          type="button"
          onClick={onNewDraft}
          title="Open new inward bill draft (F8)"
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold text-blue-600 bg-blue-50/80 hover:bg-blue-100/80 border border-blue-200/80 transition-all shrink-0 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Inward</span>
          <span className="text-[10px] opacity-60 ml-0.5 font-normal">[F8]</span>
        </button>
      </div>

      {/* Mobile Compact Draft Switcher Pill */}
      <div className="sm:hidden flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setIsMobileSheetOpen(!isMobileSheetOpen)}
          className="flex-1 flex items-center justify-between px-3 py-2 bg-white rounded-xl border border-slate-200 shadow-sm text-xs font-semibold text-slate-800"
        >
          <div className="flex items-center gap-2 truncate">
            <Truck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span className="truncate">{activeSupplierName || activeDraft?.title || 'Inward Bill'}</span>
            <span className="text-slate-400 font-normal">({drafts.length} drafts)</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {activeDraftItemCount > 0 && (
              <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-mono font-bold">
                {formatCurrency(activeDraftTotal, currencySymbol)}
              </span>
            )}
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </div>
        </button>

        <button
          type="button"
          onClick={onNewDraft}
          className="p-2 bg-blue-600 text-white rounded-xl shrink-0 hover:bg-blue-700 shadow-sm"
          title="New Inward Bill"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Mobile Sheet Dropdown Menu */}
      {isMobileSheetOpen && (
        <div className="sm:hidden fixed inset-0 z-50 bg-black/40 flex flex-col justify-end" onClick={() => setIsMobileSheetOpen(false)}>
          <div
            className="bg-white rounded-t-2xl p-4 max-h-[70vh] overflow-y-auto space-y-2 animate-in slide-in-from-bottom"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Active Inward Drafts</span>
              <button
                type="button"
                onClick={() => {
                  onNewDraft();
                  setIsMobileSheetOpen(false);
                }}
                className="text-xs font-bold text-blue-600 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> New Inward
              </button>
            </div>

            <div className="space-y-1.5 pt-1">
              {drafts.map((d, i) => {
                const isSelected = d.id === activeDraftId;
                const supName = getSupplierName(d.supplierId);
                const title = supName || d.title || `Inward #${i + 1}`;
                const itemsCount = d.lines.reduce((sum, l) => sum + (l.quantity || 0), 0);
                const total = d.lines.reduce(
                  (sum, l) => sum + Math.max(0, (l.quantity || 0) * (l.unitCost || 0) - (l.discountAmount || 0)),
                  0
                );

                return (
                  <div
                    key={d.id}
                    onClick={() => {
                      onSelectDraft(d.id);
                      setIsMobileSheetOpen(false);
                    }}
                    className={`flex items-center justify-between p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/50 font-bold text-blue-900'
                        : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      {isSelected ? (
                        <Check className="w-4 h-4 text-blue-600 shrink-0" />
                      ) : (
                        <Truck className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                      <div>
                        <div>{title}</div>
                        <div className="text-[10px] text-slate-400 font-normal">
                          {itemsCount} items · {formatCurrency(total, currencySymbol)}
                        </div>
                      </div>
                    </div>

                    {drafts.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (d.lines.length > 0 && !window.confirm(`Discard ${title}?`)) {
                            return;
                          }
                          onCloseDraft(d.id);
                        }}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
