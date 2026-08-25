import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { useBusiness } from '../../contexts/BusinessContext';
import { purchaseCorrectionService } from '../../services/purchaseCorrectionService';
import { financialAccountService } from '../../services/financialAccountService';
import type {
  Purchase,
  PurchaseReturnReason,
  SupplierSettlementMode,
  PaymentMethod,
  FinancialAccount,
} from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { roundCurrency } from '../../utils/money';
import {
  RotateCcw,
  AlertCircle,
  PackageMinus,
  Sparkles,
  DollarSign,
  ArrowRight,
} from 'lucide-react';

interface CreatePurchaseReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  purchase: Purchase | null;
  onReturnSuccess?: () => void;
}

interface ReturnLineState {
  originalPurchaseLineId: string;
  itemId: string;
  itemNameSnapshot: string;
  unit: string;
  originalQuantity: number;
  alreadyReturnedQuantity: number;
  returnableQuantity: number;
  unitCost: number;
  effectiveUnitCost: number;
  quantityToReturn: number;
}

export const CreatePurchaseReturnModal: React.FC<CreatePurchaseReturnModalProps> = ({
  isOpen,
  onClose,
  purchase,
  onReturnSuccess,
}) => {
  const { business } = useBusiness();
  const [lines, setLines] = useState<ReturnLineState[]>([]);
  const [reason, setReason] = useState<PurchaseReturnReason>('DEFECTIVE_GOODS');
  const [notes, setNotes] = useState('');
  const [settlementMode, setSettlementMode] = useState<SupplierSettlementMode>('SUPPLIER_CREDIT');
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>('CASH');
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [financialAccountId, setFinancialAccountId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (purchase && isOpen && business) {
      setLoading(true);
      setError(null);
      Promise.all([
        purchaseCorrectionService.getPurchaseReturnableLines(purchase.id),
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

          if (purchase.dueAmount > 0) {
            setSettlementMode('REDUCE_DUE');
          } else {
            setSettlementMode('SUPPLIER_CREDIT');
          }
        })
        .catch((err) => {
          console.error(err);
          setError(err.message || 'Failed to load purchase lines.');
        })
        .finally(() => setLoading(false));
    }
  }, [purchase, isOpen, business]);

  if (!purchase) return null;

  const handleQuantityChange = (lineId: string, value: string) => {
    const num = parseFloat(value) || 0;
    setLines((prev) =>
      prev.map((l) => {
        if (l.originalPurchaseLineId === lineId) {
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

  const totalReturnAmount = roundCurrency(
    lines.reduce((sum, l) => sum + l.quantityToReturn * l.effectiveUnitCost, 0)
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
          originalPurchaseLineId: l.originalPurchaseLineId,
          quantityToReturn: l.quantityToReturn,
        }));

      await purchaseCorrectionService.processPurchaseReturn({
        businessId: purchase.businessId,
        originalPurchaseId: purchase.id,
        returnDate: new Date().toISOString(),
        reason,
        notes: notes.trim() || undefined,
        settlementMode,
        refundPaymentMethod: settlementMode === 'REFUND_RECEIVED_NOW' ? refundMethod : undefined,
        financialAccountId: settlementMode === 'REFUND_RECEIVED_NOW' ? financialAccountId : undefined,
        lines: payloadLines,
      });

      onReturnSuccess?.();
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to process purchase return.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Return to Supplier · Bill #${purchase.purchaseNumber}`}
      subtitle={`Supplier: ${purchase.supplierNameSnapshot} · Billed: ${formatCurrency(purchase.totalAmount, business?.currencySymbol)}`}
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
            Select Line Items to Return to Vendor
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleReturnAll}
              className="text-[11px] font-semibold text-amber-700 hover:text-amber-900 transition-colors"
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
          <div className="py-8 text-center text-xs text-slate-400">Loading purchase line items...</div>
        ) : lines.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border border-slate-200">
            No returnable items available on this purchase bill.
          </div>
        ) : (
          <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white divide-y divide-slate-100 max-h-72 overflow-y-auto shadow-2xs">
            {lines.map((line) => {
              const lineTotal = roundCurrency(line.quantityToReturn * line.effectiveUnitCost);
              const isMaxed = line.returnableQuantity === 0;

              return (
                <div
                  key={line.originalPurchaseLineId}
                  className={`p-3 flex items-center justify-between gap-4 transition-colors ${
                    line.quantityToReturn > 0 ? 'bg-amber-50/40' : isMaxed ? 'bg-slate-50/60 opacity-60' : 'hover:bg-slate-50/50'
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
                      <span>Unit Cost: {formatCurrency(line.effectiveUnitCost, business?.currencySymbol)}</span>
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
                        onChange={(e) => handleQuantityChange(line.originalPurchaseLineId, e.target.value)}
                        placeholder="0"
                        className="w-full text-right px-2.5 py-1 text-xs font-mono font-bold bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
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
              onChange={(e) => setReason(e.target.value as PurchaseReturnReason)}
              className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium text-slate-800"
            >
              <option value="DEFECTIVE_GOODS">Defective / Damaged Goods</option>
              <option value="EXCESS_STOCK">Excess Stock / Order Error</option>
              <option value="INCORRECT_ITEM">Incorrect Item Supplied</option>
              <option value="EXPIRED">Expired / Near Expiry</option>
              <option value="OTHER">Other Reason</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Additional Notes</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Vendor RMA # or dispatch note"
              className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-800"
            />
          </div>
        </div>

        {/* Settlement Mode Selection */}
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
          <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
            Settlement Action
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <label
              className={`p-3 rounded-xl border text-xs cursor-pointer transition-all flex flex-col justify-between ${
                settlementMode === 'SUPPLIER_CREDIT'
                  ? 'bg-amber-50/90 border-amber-500 text-amber-950 font-bold shadow-2xs'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100/50'
              }`}
            >
              <input
                type="radio"
                name="supplierSettlementMode"
                value="SUPPLIER_CREDIT"
                checked={settlementMode === 'SUPPLIER_CREDIT'}
                onChange={() => setSettlementMode('SUPPLIER_CREDIT')}
                className="sr-only"
              />
              <span className="font-bold block">Supplier Credit</span>
              <span className="text-[11px] text-slate-500 font-normal mt-1 block">
                Store as advance credit with vendor for future purchase bills
              </span>
            </label>

            <label
              className={`p-3 rounded-xl border text-xs cursor-pointer transition-all flex flex-col justify-between ${
                settlementMode === 'REFUND_RECEIVED_NOW'
                  ? 'bg-amber-50/90 border-amber-500 text-amber-950 font-bold shadow-2xs'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100/50'
              }`}
            >
              <input
                type="radio"
                name="supplierSettlementMode"
                value="REFUND_RECEIVED_NOW"
                checked={settlementMode === 'REFUND_RECEIVED_NOW'}
                onChange={() => setSettlementMode('REFUND_RECEIVED_NOW')}
                className="sr-only"
              />
              <span className="font-bold block">Refund Received Now</span>
              <span className="text-[11px] text-slate-500 font-normal mt-1 block">
                Vendor immediately refunded money back to cash / bank
              </span>
            </label>

            <label
              className={`p-3 rounded-xl border text-xs cursor-pointer transition-all flex flex-col justify-between ${
                settlementMode === 'REDUCE_DUE'
                  ? 'bg-amber-50/90 border-amber-500 text-amber-950 font-bold shadow-2xs'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100/50'
              }`}
            >
              <input
                type="radio"
                name="supplierSettlementMode"
                value="REDUCE_DUE"
                checked={settlementMode === 'REDUCE_DUE'}
                onChange={() => setSettlementMode('REDUCE_DUE')}
                className="sr-only"
              />
              <span className="font-bold block">Reduce Bill Due</span>
              <span className="text-[11px] text-slate-500 font-normal mt-1 block">
                Adjust unpaid payable balance on this bill
              </span>
            </label>
          </div>

          {/* If Refund Received Now, choose payment method and account */}
          {settlementMode === 'REFUND_RECEIVED_NOW' && (
            <div className="pt-2 border-t border-slate-200 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700">Refund Received Method:</span>
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
                <span className="font-semibold text-slate-700">Deposit Into Account:</span>
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
            <span className="text-xs font-semibold text-amber-400 mt-0.5 inline-flex items-center gap-1">
              <PackageMinus className="w-3.5 h-3.5" /> Stock auto-deducted
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
