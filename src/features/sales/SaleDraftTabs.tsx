import React, { useState } from 'react';
import type { SaleDraft } from './useSaleDrafts';
import { formatCurrency } from '../../utils/formatters';
import { Plus, X, Receipt, ChevronDown, Check } from 'lucide-react';

interface SaleDraftTabsProps {
  drafts: SaleDraft[];
  activeDraftId: string;
  currencySymbol?: string;
  onSelectDraft: (id: string) => void;
  onNewDraft: () => void;
  onCloseDraft: (id: string) => void;
}

export const SaleDraftTabs: React.FC<SaleDraftTabsProps> = ({
  drafts,
  activeDraftId,
  currencySymbol = '₹',
  onSelectDraft,
  onNewDraft,
  onCloseDraft,
}) => {
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);

  const activeDraft = drafts.find((d) => d.id === activeDraftId) || drafts[0];
  const activeDraftItemCount = activeDraft?.cart.reduce((sum, l) => sum + l.quantity, 0) || 0;
  const activeDraftTotal = activeDraft?.cart.reduce(
    (sum, l) => sum + Math.max(0, l.quantity * l.rate - (l.discountAmount || 0)),
    0
  ) || 0;

  return (
    <div className="w-full">
      {/* Desktop Horizontal Tabs (Visible on >= sm screens) */}
      <div className="hidden sm:flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
        {drafts.map((draft, idx) => {
          const isActive = draft.id === activeDraftId;
          const itemCount = draft.cart.reduce((sum, l) => sum + l.quantity, 0);
          const totalAmount = draft.cart.reduce(
            (sum, l) => sum + Math.max(0, l.quantity * l.rate - (l.discountAmount || 0)),
            0
          );

          return (
            <div
              key={draft.id}
              onClick={() => onSelectDraft(draft.id)}
              className={`group flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all shrink-0 select-none border ${
                isActive
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
              }`}
            >
              <Receipt className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
              <span>{draft.title || `Sale #${idx + 1}`}</span>

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
                    onCloseDraft(draft.id);
                  }}
                  className={`p-0.5 rounded-md hover:bg-black/10 transition-colors ${
                    isActive ? 'text-white/80 hover:text-white' : 'text-slate-400 hover:text-rose-600'
                  }`}
                  aria-label={`Close ${draft.title}`}
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
          className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold text-blue-600 bg-blue-50/80 hover:bg-blue-100/80 border border-blue-200/80 transition-all shrink-0 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Bill</span>
        </button>
      </div>

      {/* Mobile Compact Draft Switcher Pill (Visible on < sm screens) */}
      <div className="sm:hidden flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setIsMobileSheetOpen(true)}
          className="flex-1 flex items-center justify-between px-3.5 py-2 bg-white border border-slate-200 rounded-xl shadow-2xs text-xs font-bold text-slate-800"
        >
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-blue-600" />
            <span>{activeDraft?.title || 'Sale #1'}</span>
            <span className="text-[11px] font-mono text-slate-500 font-semibold">
              ({activeDraftItemCount} items · {formatCurrency(activeDraftTotal, currencySymbol)})
            </span>
          </div>
          <ChevronDown className="w-4 h-4 text-slate-400" />
        </button>

        <button
          type="button"
          onClick={onNewDraft}
          className="p-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-2xs shrink-0 cursor-pointer"
          aria-label="New Bill Draft"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Mobile Bottom Sheet Modal */}
      {isMobileSheetOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:hidden animate-in fade-in"
          onClick={() => setIsMobileSheetOpen(false)}
        >
          <div
            className="w-full bg-white rounded-t-3xl p-5 space-y-4 max-h-[80vh] overflow-y-auto animate-in slide-in-from-bottom duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1.5 bg-slate-200 rounded-full mx-auto" />
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Active Sale Bills</h3>
              <button
                type="button"
                onClick={() => {
                  onNewDraft();
                  setIsMobileSheetOpen(false);
                }}
                className="text-xs font-bold text-blue-600 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> + New Draft
              </button>
            </div>

            <div className="space-y-2">
              {drafts.map((draft, idx) => {
                const isActive = draft.id === activeDraftId;
                const count = draft.cart.reduce((sum, l) => sum + l.quantity, 0);
                const total = draft.cart.reduce(
                  (sum, l) => sum + Math.max(0, l.quantity * l.rate - (l.discountAmount || 0)),
                  0
                );

                return (
                  <div
                    key={draft.id}
                    onClick={() => {
                      onSelectDraft(draft.id);
                      setIsMobileSheetOpen(false);
                    }}
                    className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all cursor-pointer ${
                      isActive
                        ? 'bg-blue-50 border-blue-400 text-blue-900'
                        : 'bg-slate-50 border-slate-200 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      {isActive ? (
                        <Check className="w-4 h-4 text-blue-600" />
                      ) : (
                        <Receipt className="w-4 h-4 text-slate-400" />
                      )}
                      <div>
                        <span className="text-sm font-bold block">{draft.title || `Sale #${idx + 1}`}</span>
                        <span className="text-xs text-slate-500 font-mono">
                          {count} {count === 1 ? 'item' : 'items'} · {formatCurrency(total, currencySymbol)}
                        </span>
                      </div>
                    </div>

                    {drafts.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCloseDraft(draft.id);
                        }}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-white"
                        aria-label="Close Draft"
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
