import React, { useEffect, useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { purchaseRepository, type PurchaseFullDetails } from '../../repositories/purchaseRepository';
import { supplierRepository } from '../../repositories/supplierRepository';
import { PaySupplierModal } from '../suppliers/PaySupplierModal';
import { CreatePurchaseReturnModal } from './CreatePurchaseReturnModal';
import { VoidPurchaseModal } from './VoidPurchaseModal';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { useBusiness } from '../../contexts/BusinessContext';
import type { Supplier } from '../../types';
import {
  Printer,
  ShieldCheck,
  CreditCard,
  PlusCircle,
  RotateCcw,
  XCircle,
  DollarSign,
  Package,
  Truck,
} from 'lucide-react';

interface PurchaseDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  purchaseId: string | null;
  onPurchaseUpdated?: () => void;
}

export const PurchaseDetailModal: React.FC<PurchaseDetailModalProps> = ({
  isOpen,
  onClose,
  purchaseId,
  onPurchaseUpdated,
}) => {
  const { business } = useBusiness();
  const [details, setDetails] = useState<PurchaseFullDetails | null>(null);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPaySupplierOpen, setIsPaySupplierOpen] = useState(false);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [isVoidModalOpen, setIsVoidModalOpen] = useState(false);

  const loadDetails = () => {
    if (purchaseId && isOpen) {
      setLoading(true);
      purchaseRepository
        .getPurchaseWithDetails(purchaseId)
        .then(async (data) => {
          setDetails(data || null);
          if (data?.purchase.supplierId) {
            const supp = await supplierRepository.getSupplierById(data.purchase.supplierId);
            setSupplier(supp || null);
          } else {
            setSupplier(null);
          }
        })
        .finally(() => setLoading(false));
    }
  };

  useEffect(() => {
    loadDetails();
  }, [purchaseId, isOpen]);

  const handlePrint = () => {
    window.print();
  };

  if (!details) return null;

  const {
    purchase,
    lines,
    payments,
    allocations,
    returns,
    returnLines,
    voidRecord,
    refunds,
    effectiveTotalAmount,
    totalReturnedAmount,
    isVoided,
  } = details;

  const isFullyReturned =
    totalReturnedAmount >= (Number(purchase.totalAmount) || 0) - 0.005 &&
    (Number(purchase.totalAmount) || 0) > 0;

  const canReturn = !isVoided && !isFullyReturned;
  const canVoid = !isVoided && !isFullyReturned;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={`Purchase Bill #${purchase.purchaseNumber}`}
        subtitle={`Recorded ${formatDateTime(purchase.purchaseDate || purchase.createdAt)}`}
        maxWidth="lg"
      >
        <div className="space-y-6">
          {/* Voided Warning Notice Banner */}
          {isVoided && voidRecord && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3">
              <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <span className="font-bold text-rose-950 block text-sm">
                  Purchase Bill Voided on {formatDateTime(voidRecord.voidDate || voidRecord.createdAt)}
                </span>
                <p className="text-rose-800">
                  Reason: <strong>{voidRecord.reason}</strong>
                </p>
                <p className="text-rose-700">
                  This transaction is cancelled. All unreturned line items have been deducted from stock
                  inventory and the net payable amount is reset to zero.
                </p>
              </div>
            </div>
          )}

          {/* Printable Bill Card */}
          <div className="p-6 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-6">
            {/* Header */}
            <div className="flex justify-between items-start border-b border-slate-200 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
                    <Truck className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">{purchase.supplierNameSnapshot}</h2>
                    <span className="text-xs text-slate-500">Inward Purchase Bill</span>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <span className="text-xs font-bold font-mono text-amber-800 block">
                  #{purchase.purchaseNumber}
                </span>
                <div className="mt-1">
                  <Badge
                    variant={
                      purchase.status === 'VOIDED'
                        ? 'danger'
                        : purchase.status === 'RETURNED'
                        ? 'neutral'
                        : purchase.status === 'PAID'
                        ? 'success'
                        : purchase.status === 'PARTIAL'
                        ? 'warning'
                        : 'danger'
                    }
                    size="md"
                  >
                    {purchase.status}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Bill Details */}
            <div className="flex justify-between text-xs text-slate-600">
              <div>
                <span className="text-slate-400 font-medium block">Received By:</span>
                <span className="font-bold text-slate-900 text-sm mt-0.5 block">
                  {business?.name || 'My Store'}
                </span>
              </div>
              <div className="text-right">
                <span className="text-slate-400 font-medium block">Bill Date:</span>
                <span className="font-medium text-slate-900 mt-0.5 block">
                  {formatDateTime(purchase.purchaseDate || purchase.createdAt)}
                </span>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100/75 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                    <th className="py-2.5 px-3">Item Received</th>
                    <th className="py-2.5 px-3 text-right">Qty</th>
                    <th className="py-2.5 px-3 text-right">Unit Cost</th>
                    {lines.some((l) => l.discountAmount > 0) && (
                      <th className="py-2.5 px-3 text-right">Disc</th>
                    )}
                    <th className="py-2.5 px-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((line) => {
                    const returnedQtyForLine = returnLines
                      .filter((rl) => rl.originalPurchaseLineId === line.id)
                      .reduce((sum, rl) => sum + rl.quantityReturned, 0);

                    return (
                      <tr key={line.id}>
                        <td className="py-2.5 px-3">
                          <span className="font-semibold text-slate-800 block">{line.itemNameSnapshot}</span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[11px] text-slate-400">Unit: {line.unit}</span>
                            {returnedQtyForLine > 0 && (
                              <span className="text-[10px] px-1.5 py-0.2 bg-amber-50 text-amber-700 border border-amber-200 rounded font-semibold">
                                {returnedQtyForLine} {line.unit} returned to vendor
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-medium text-slate-700">
                          {line.quantity} {line.unit}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-600 font-mono">
                          {formatCurrency(line.unitCost, business?.currencySymbol)}
                        </td>
                        {lines.some((l) => l.discountAmount > 0) && (
                          <td className="py-2.5 px-3 text-right text-rose-600 font-mono">
                            {line.discountAmount > 0 ? `-${formatCurrency(line.discountAmount, business?.currencySymbol)}` : '—'}
                          </td>
                        )}
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900 font-mono">
                          {formatCurrency(line.lineTotal, business?.currencySymbol)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Totals Section */}
            <div className="space-y-1.5 text-xs text-slate-600 max-w-xs ml-auto">
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500">Subtotal:</span>
                <span className="font-medium text-slate-900 font-mono">
                  {formatCurrency(purchase.subtotal, business?.currencySymbol)}
                </span>
              </div>

              {purchase.discountAmount > 0 && (
                <div className="flex justify-between py-1 border-b border-slate-200/60 text-emerald-700 font-medium">
                  <span>Discount:</span>
                  <span className="font-mono">-{formatCurrency(purchase.discountAmount, business?.currencySymbol)}</span>
                </div>
              )}

              <div className="flex justify-between py-2 text-sm font-bold text-slate-900 border-b-2 border-slate-900">
                <span>Original Bill Total:</span>
                <span className="font-mono text-base">
                  {formatCurrency(purchase.totalAmount, business?.currencySymbol)}
                </span>
              </div>

              {totalReturnedAmount > 0 && (
                <div className="flex justify-between py-1 text-purple-700 font-bold border-b border-slate-200/60">
                  <span>Less Returns:</span>
                  <span className="font-mono">-{formatCurrency(totalReturnedAmount, business?.currencySymbol)}</span>
                </div>
              )}

              {isVoided && (
                <div className="flex justify-between py-1 text-rose-600 font-bold border-b border-slate-200/60">
                  <span>Void Adjustment:</span>
                  <span className="font-mono">-{formatCurrency(purchase.totalAmount - totalReturnedAmount, business?.currencySymbol)}</span>
                </div>
              )}

              <div className="flex justify-between py-1.5 text-xs font-bold text-slate-900 bg-slate-100 px-2 rounded-lg">
                <span>Effective Net Payable:</span>
                <span className="font-mono">
                  {formatCurrency(effectiveTotalAmount, business?.currencySymbol)}
                </span>
              </div>

              <div className="flex justify-between py-1 text-emerald-700 font-bold">
                <span>Total Paid / Allocated:</span>
                <span className="font-mono">{formatCurrency(purchase.paidAmount, business?.currencySymbol)}</span>
              </div>

              {purchase.dueAmount > 0 && !isVoided && (
                <div className="flex justify-between py-1 text-amber-800 font-bold">
                  <span>Payable Due:</span>
                  <span className="font-mono">{formatCurrency(purchase.dueAmount, business?.currencySymbol)}</span>
                </div>
              )}
            </div>

            {/* Purchase Returns Breakdown */}
            {returns.length > 0 && (
              <div className="pt-3 border-t border-slate-200 text-xs">
                <h5 className="font-bold text-purple-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <RotateCcw className="w-3.5 h-3.5 text-purple-600" />
                  Processed Returns to Vendor ({returns.length})
                </h5>
                <div className="space-y-2">
                  {returns.map((r) => {
                    const linesInReturn = returnLines.filter((rl) => rl.purchaseReturnId === r.id);
                    return (
                      <div
                        key={r.id}
                        className="p-3 rounded-xl bg-purple-50/50 border border-purple-200/70 text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-purple-950">Return #{r.returnNumber}</span>
                            <span className="text-slate-400">· {formatDateTime(r.returnDate || r.createdAt)}</span>
                          </div>
                          <span className="font-bold font-mono text-purple-900">
                            {formatCurrency(r.totalAmount, business?.currencySymbol)}
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {linesInReturn.map((rl) => (
                            <span
                              key={rl.id}
                              className="text-[11px] px-2 py-0.5 bg-white border border-purple-200 rounded-md text-purple-900"
                            >
                              {rl.quantityReturned}x {rl.itemNameSnapshot} ({formatCurrency(rl.lineTotal, business?.currencySymbol)})
                            </span>
                          ))}
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-purple-200/50">
                          <span>Reason: {r.reason.replace(/_/g, ' ')}</span>
                          <span>Settlement: <strong>{r.settlementMode.replace(/_/g, ' ')}</strong></span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Refunds Received Breakdown */}
            {refunds.length > 0 && (
              <div className="pt-3 border-t border-slate-200 text-xs">
                <h5 className="font-bold text-blue-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-blue-600" />
                  Refunds Received ({refunds.length})
                </h5>
                <div className="space-y-1.5">
                  {refunds.map((ref) => (
                    <div
                      key={ref.id}
                      className="p-2.5 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-blue-950">
                          Refund via {ref.paymentMethod}
                        </span>
                        <span className="text-slate-400">· {formatDateTime(ref.refundDate || ref.createdAt)}</span>
                      </div>
                      <span className="font-bold font-mono text-blue-700">
                        {formatCurrency(ref.amount, business?.currencySymbol)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Payment Allocations breakdown */}
            {allocations.length > 0 && (
              <div className="pt-3 border-t border-slate-200 text-xs">
                <h5 className="font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Payment Allocations ({allocations.length})
                </h5>
                <div className="space-y-1.5">
                  {allocations.map((a) => {
                    const matchedPay = payments.find((p) => p.id === a.supplierPaymentId);
                    return (
                      <div key={a.id} className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200/60">
                        <div className="flex items-center gap-2">
                          <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                          <span className="font-semibold text-slate-800">
                            {matchedPay ? `${matchedPay.paymentMethod} Payment` : 'Payment Allocation'}
                          </span>
                          <span className="text-slate-400">· {formatDateTime(a.createdAt)}</span>
                        </div>
                        <span className="font-bold font-mono text-emerald-700">
                          {formatCurrency(a.amount, business?.currencySymbol)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Purchase Voucher Footer */}
            <div className="pt-4 border-t border-slate-200 text-xs text-slate-500 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <span className="italic text-slate-400">
                Official Purchase Voucher · Inventory balances updated.
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                Recorded on {formatDateTime(purchase.createdAt)}
              </span>
            </div>
          </div>

          {/* Actions Bar */}
          <div className="flex items-center justify-between pt-2 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Button variant="outline" icon={Printer} onClick={handlePrint}>
                Print Bill
              </Button>

              {/* Return Items Action */}
              {canReturn && (
                <Button
                  variant="outline"
                  icon={RotateCcw}
                  onClick={() => setIsReturnModalOpen(true)}
                >
                  Return Items
                </Button>
              )}

              {/* Void Bill Action */}
              {canVoid && (
                <Button
                  variant="ghost"
                  className="text-rose-600 hover:bg-rose-50"
                  icon={XCircle}
                  onClick={() => setIsVoidModalOpen(true)}
                >
                  Void Bill
                </Button>
              )}

              {/* Pay Bill Action */}
              {purchase.dueAmount > 0 && supplier && !isVoided && (
                <Button
                  variant="primary"
                  icon={PlusCircle}
                  onClick={() => setIsPaySupplierOpen(true)}
                >
                  Pay Bill
                </Button>
              )}
            </div>

            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      </Modal>

      {/* Pay Supplier Modal */}
      {supplier && (
        <PaySupplierModal
          isOpen={isPaySupplierOpen}
          onClose={() => setIsPaySupplierOpen(false)}
          supplier={supplier}
          onSuccess={() => {
            loadDetails();
            onPurchaseUpdated?.();
          }}
        />
      )}

      {/* Return Modal */}
      <CreatePurchaseReturnModal
        isOpen={isReturnModalOpen}
        onClose={() => setIsReturnModalOpen(false)}
        purchase={purchase}
        onReturnSuccess={() => {
          loadDetails();
          onPurchaseUpdated?.();
        }}
      />

      {/* Void Modal */}
      <VoidPurchaseModal
        isOpen={isVoidModalOpen}
        onClose={() => setIsVoidModalOpen(false)}
        purchase={purchase}
        paidAmount={purchase.paidAmount}
        onVoidSuccess={() => {
          loadDetails();
          onPurchaseUpdated?.();
        }}
      />
    </>
  );
};
