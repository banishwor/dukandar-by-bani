import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { useBusiness } from '../../contexts/BusinessContext';
import { saleCorrectionService } from '../../services/saleCorrectionService';
import { financialAccountService } from '../../services/financialAccountService';
import type {
  Sale,
  ReturnReason,
  SettlementMode,
  PaymentMethod,
  FinancialAccount,
} from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { roundCurrency } from '../../utils/money';
import {
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  DollarSign,
  Package,
  Sparkles,
  ArrowRight,
} from 'lucide-react';

interface CreateSaleReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  sale: Sale | null;
  onReturnSuccess?: () => void;
}

interface ReturnLineState {
  originalSaleLineId: string;
  itemId: string;
  itemNameSnapshot: string;
  unit: string;
  originalQuantity: number;
  alreadyReturnedQuantity: number;
  returnableQuantity: number;
  rate: number;
  effectiveUnitRate: number;
  quantityToReturn: number;
}

export const CreateSaleReturnModal: React.FC<CreateSaleReturnModalProps> = ({
  isOpen,
  onClose,
  sale,
  onReturnSuccess,
}) => {
  const { business } = useBusiness();
  const [lines, setLines] = useState<ReturnLineState[]>([]);
  const [reason, setReason] = useState<ReturnReason>('CUSTOMER_CHANGED_MIND');
  const [notes, setNotes] = useState('');
  const [settlementMode, setSettlementMode] = useState<SettlementMode>('CUSTOMER_CREDIT');
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>('CASH');
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [financialAccountId, setFinancialAccountId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sale && isOpen && business) {
      setLoading(true);
      setError(null);
      Promise.all([
        saleCorrectionService.getSaleReturnableLines(sale.id),
        financialAccountService.getActiveAccounts(business.id),
        financialAccountService.getDefaultAccount(business.id),
      ])
        .then(([fetchedLines, activeAccounts, defaultAcc]) => {
          setLines(
            fetchedLines.map((l) => ({
              ...l,
              quantityToReturn: 0,
            }))
          );
          setAccounts(activeAccounts);
          if (defaultAcc) {
            setFinancialAccountId(defaultAcc.id);
          } else if (activeAccounts.length > 0) {
            setFinancialAccountId(activeAccounts[0].id);
          }

          // Default settlement mode: if walk-in customer -> REFUND_NOW; if registered customer -> CUSTOMER_CREDIT or REDUCE_DUE
          if (!sale.customerId) {
            setSettlementMode('REFUND_NOW');
          } else if (sale.dueAmount > 0) {
            setSettlementMode('REDUCE_DUE');
          } else {
            setSettlementMode('CUSTOMER_CREDIT');
          }
        })
        .catch((err) => {
          console.error(err);
          setError(err.message || 'Failed to load sale line items.');
        })
        .finally(() => setLoading(false));
    }
  }, [sale, isOpen, business]);

  if (!sale) return null;

  const handleQuantityChange = (lineId: string, value: string) => {
    const num = parseFloat(value) || 0;
    setLines((prev) =>
      prev.map((l) => {
        if (l.originalSaleLineId === lineId) {
          const clamped = Math.max(0, Math.min(l.returnableQuantity, num));
          return { ...l, quantityToReturn: clamped };
        }
        return l;
      })
    );
  };

  const handleReturnAll = () => {
    setLines((prev) =>
      prev.map((l) => ({
        ...l,
        quantityToReturn: l.returnableQuantity,
      }))
    );
  };

  const handleClearAll = () => {
    setLines((prev) =>
      prev.map((l) => ({
        ...l,
        quantityToReturn: 0,
      }))
    );
  };

  // Calculate totals
  const totalReturnAmount = roundCurrency(
    lines.reduce((sum, l) => sum + l.quantityToReturn * l.effectiveUnitRate, 0)
  );
  const totalItemsCount = lines.reduce((sum, l) => sum + (l.quantityToReturn > 0 ? 1 : 0), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totalReturnAmount <= 0) {
      setError('Please select at least one item and quantity to return.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const payloadLines = lines
        .filter((l) => l.quantityToReturn > 0)
        .map((l) => ({
          originalSaleLineId: l.originalSaleLineId,
          quantityToReturn: l.quantityToReturn,
        }));

      await saleCorrectionService.processSaleReturn({
        businessId: sale.businessId,
        originalSaleId: sale.id,
        returnDate: new Date().toISOString(),
        reason,
        notes: notes.trim() || undefined,
        settlementMode,
        refundPaymentMethod: settlementMode === 'REFUND_NOW' ? refundMethod : undefined,
        financialAccountId: settlementMode === 'REFUND_NOW' ? financialAccountId : undefined,
        lines: payloadLines,
      });

      onReturnSuccess?.();
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to process return.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Create Return · Invoice #${sale.invoiceNumber}`}
      subtitle={`Customer: ${sale.customerNameSnapshot} · Billed: ${formatCurrency(sale.totalAmount, business?.currencySymbol)}`}
      maxWidth="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Action helper bar */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Select Line Items to Return
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleReturnAll}
              className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 transition-colors"
            >
              Return Max Quantities
            </button>
            <span className="text-slate-300">·</span>
            <button
              type="button"
              onClick={handleClearAll}
              className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Line Items List */}
        {loading ? (
          <div className="py-8 text-center text-xs text-slate-400">Loading invoice line items...</div>
        ) : lines.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border border-slate-200">
            No returnable items available on this invoice.
          </div>
        ) : (
          <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white divide-y divide-slate-100 max-h-72 overflow-y-auto shadow-2xs">
            {lines.map((line) => {
              const lineTotal = roundCurrency(line.quantityToReturn * line.effectiveUnitRate);
              const isMaxed = line.returnableQuantity === 0;

              return (
                <div
                  key={line.originalSaleLineId}
                  className={`p-3 flex items-center justify-between gap-4 transition-colors ${
                    line.quantityToReturn > 0 ? 'bg-blue-50/40' : isMaxed ? 'bg-slate-50/60 opacity-60' : 'hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-slate-900 truncate">
                        {line.itemNameSnapshot}
                      </span>
                      {line.alreadyReturnedQuantity > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-semibold">
                          Prev Returned: {line.alreadyReturnedQuantity} {line.unit}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5">
                      <span>Rate: {formatCurrency(line.effectiveUnitRate, business?.currencySymbol)}</span>
                      <span>·</span>
                      <span>
                        Returnable:{' '}
                        <strong className="text-slate-700">
                          {line.returnableQuantity} {line.unit}
                        </strong>
                      </span>
                    </div>
                  </div>

                  {/* Quantity Input and Total */}
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="w-24">
                      <input
                        type="number"
                        min="0"
                        max={line.returnableQuantity}
                        step="any"
                        disabled={line.returnableQuantity <= 0}
                        value={line.quantityToReturn || ''}
                        onChange={(e) => handleQuantityChange(line.originalSaleLineId, e.target.value)}
                        placeholder="0"
                        className="w-full text-right px-2.5 py-1 text-xs font-mono font-bold bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
                      />
                    </div>

                    <div className="w-20 text-right font-mono text-xs font-bold text-slate-900">
                      {lineTotal > 0 ? formatCurrency(lineTotal, business?.currencySymbol) : '—'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Reason and Notes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Return Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as ReturnReason)}
              className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800"
            >
              <option value="CUSTOMER_CHANGED_MIND">Customer Changed Mind</option>
              <option value="DEFECTIVE">Defective / Faulty</option>
              <option value="DAMAGED">Damaged Goods</option>
              <option value="WRONG_ITEM">Wrong Item Supplied</option>
              <option value="OTHER">Other Reason</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Additional Notes</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes or remarks"
              className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
            />
          </div>
        </div>

        {/* Settlement Mode Selection */}
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
          <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
            Settlement & Refund Action
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {sale.customerId && (
              <label
                className={`p-3 rounded-xl border text-xs cursor-pointer transition-all flex flex-col justify-between ${
                  settlementMode === 'CUSTOMER_CREDIT'
                    ? 'bg-blue-50/90 border-blue-500 text-blue-950 font-bold shadow-2xs'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100/50'
                }`}
              >
                <input
                  type="radio"
                  name="settlementMode"
                  value="CUSTOMER_CREDIT"
                  checked={settlementMode === 'CUSTOMER_CREDIT'}
                  onChange={() => setSettlementMode('CUSTOMER_CREDIT')}
                  className="sr-only"
                />
                <span className="font-bold block">Customer Credit</span>
                <span className="text-[11px] text-slate-500 font-normal mt-1 block">
                  Add funds to customer credit for future sales
                </span>
              </label>
            )}

            <label
              className={`p-3 rounded-xl border text-xs cursor-pointer transition-all flex flex-col justify-between ${
                settlementMode === 'REFUND_NOW'
                  ? 'bg-blue-50/90 border-blue-500 text-blue-950 font-bold shadow-2xs'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100/50'
              }`}
            >
              <input
                type="radio"
                name="settlementMode"
                value="REFUND_NOW"
                checked={settlementMode === 'REFUND_NOW'}
                onChange={() => setSettlementMode('REFUND_NOW')}
                className="sr-only"
              />
              <span className="font-bold block">Refund Now</span>
              <span className="text-[11px] text-slate-500 font-normal mt-1 block">
                Pay customer money back immediately
              </span>
            </label>

            {sale.customerId && (
              <label
                className={`p-3 rounded-xl border text-xs cursor-pointer transition-all flex flex-col justify-between ${
                  settlementMode === 'REDUCE_DUE'
                    ? 'bg-blue-50/90 border-blue-500 text-blue-950 font-bold shadow-2xs'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100/50'
                }`}
              >
                <input
                  type="radio"
                  name="settlementMode"
                  value="REDUCE_DUE"
                  checked={settlementMode === 'REDUCE_DUE'}
                  onChange={() => setSettlementMode('REDUCE_DUE')}
                  className="sr-only"
                />
                <span className="font-bold block">Reduce Invoice Due</span>
                <span className="text-[11px] text-slate-500 font-normal mt-1 block">
                  Adjust outstanding balance on this invoice
                </span>
              </label>
            )}
          </div>

          {/* If Refund Now, choose payment method and account */}
          {settlementMode === 'REFUND_NOW' && (
            <div className="pt-2 border-t border-slate-200 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700">Refund Payment Method:</span>
                <div className="flex gap-2">
                  {(['CASH', 'UPI', 'BANK_TRANSFER', 'CARD'] as PaymentMethod[]).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setRefundMethod(method)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                        refundMethod === method
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-700">Refund From Account:</span>
                <select
                  value={financialAccountId}
                  onChange={(e) => setFinancialAccountId(e.target.value)}
                  className="h-8 px-2 rounded-lg border border-slate-200 bg-white text-slate-800 text-xs font-medium max-w-[200px] truncate"
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} {acc.isDefault ? '(Default)' : ''} · {acc.type}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Return Summary Header */}
        <div className="p-4 bg-slate-900 text-white rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-300 block">Total Return Value</span>
            <span className="text-xl font-bold font-mono mt-0.5 block">
              {formatCurrency(totalReturnAmount, business?.currencySymbol)}
            </span>
          </div>

          <div className="text-right">
            <span className="text-[11px] text-slate-300 block">
              {totalItemsCount} item line{totalItemsCount !== 1 ? 's' : ''} returning
            </span>
            <span className="text-xs font-semibold text-emerald-400 mt-0.5 inline-flex items-center gap-1">
              <Package className="w-3.5 h-3.5" /> Stock auto-restored
            </span>
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>

          <Button
            type="submit"
            variant="primary"
            disabled={totalReturnAmount <= 0 || submitting}
            icon={RotateCcw}
          >
            {submitting ? 'Processing Return...' : `Confirm Return (${formatCurrency(totalReturnAmount, business?.currencySymbol)})`}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
