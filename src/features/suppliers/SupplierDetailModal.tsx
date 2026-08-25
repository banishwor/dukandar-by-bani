import React, { useEffect, useState, useCallback } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { purchaseRepository } from '../../repositories/purchaseRepository';
import { supplierPaymentService } from '../../services/supplierPaymentService';
import { PaySupplierModal } from './PaySupplierModal';
import { SupplierStatementModal } from './SupplierStatementModal';
import { ReverseSupplierPaymentModal } from './ReverseSupplierPaymentModal';
import type {
  SupplierWithBalance,
  Purchase,
  SupplierPayment,
  SupplierFinancialSummary,
  SupplierPaymentAllocation,
  SupplierPaymentReversal,
} from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { useBusiness } from '../../contexts/BusinessContext';
import { db } from '../../db/database';
import {
  Phone,
  Mail,
  MapPin,
  FileSpreadsheet,
  CreditCard,
  PlusCircle,
  FileText,
  Sparkles,
  Undo2,
  Receipt,
  FileCheck,
} from 'lucide-react';

interface SupplierDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplier: SupplierWithBalance | null;
  onSelectPurchase?: (purchaseId: string) => void;
  onSupplierUpdated?: () => void;
}

export const SupplierDetailModal: React.FC<SupplierDetailModalProps> = ({
  isOpen,
  onClose,
  supplier,
  onSelectPurchase,
  onSupplierUpdated,
}) => {
  const { business } = useBusiness();
  const [activeTab, setActiveTab] = useState<'PURCHASES' | 'PAYMENTS'>('PURCHASES');
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [reversals, setReversals] = useState<SupplierPaymentReversal[]>([]);
  const [allocations, setAllocations] = useState<SupplierPaymentAllocation[]>([]);
  const [summary, setSummary] = useState<SupplierFinancialSummary | null>(null);
  const [loading, setLoading] = useState(true);

  // Sub-modals
  const [isPaySupplierOpen, setIsPaySupplierOpen] = useState(false);
  const [isStatementOpen, setIsStatementOpen] = useState(false);
  const [paymentToReverse, setPaymentToReverse] = useState<SupplierPayment | null>(null);

  const loadSupplierData = useCallback(async () => {
    if (!supplier || !isOpen) return;
    try {
      setLoading(true);
      const [pList, payList, revList, allocList, sum] = await Promise.all([
        purchaseRepository.getPurchasesBySupplier(supplier.id),
        db.supplierPayments
          .where('supplierId')
          .equals(supplier.id)
          .filter((p) => !p.isDeleted)
          .reverse()
          .sortBy('paymentDate'),
        db.supplierPaymentReversals
          .where('supplierId')
          .equals(supplier.id)
          .filter((r) => !r.isDeleted)
          .toArray(),
        db.supplierPaymentAllocations
          .where('supplierId')
          .equals(supplier.id)
          .filter((a) => !a.isDeleted)
          .toArray(),
        supplierPaymentService.getSupplierFinancialSummary(supplier.id),
      ]);
      setPurchases(pList);
      setPayments(payList);
      setReversals(revList);
      setAllocations(allocList);
      setSummary(sum);
    } catch (err) {
      console.error('Failed to load supplier details', err);
    } finally {
      setLoading(false);
    }
  }, [supplier, isOpen]);

  useEffect(() => {
    loadSupplierData();
  }, [loadSupplierData]);

  const handlePaymentSuccess = () => {
    loadSupplierData();
    onSupplierUpdated?.();
  };

  const handleReversalSuccess = () => {
    loadSupplierData();
    onSupplierUpdated?.();
  };

  if (!supplier) return null;

  const purchasesMap = new Map<string, string>();
  purchases.forEach((p) => purchasesMap.set(p.id, p.purchaseNumber));

  const reversedPaymentIds = new Set(reversals.map((r) => r.originalPaymentId));

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={supplier.name}
        subtitle="Supplier Profile, Purchase Bills & Payables Ledger"
        maxWidth="lg"
      >
        <div className="space-y-5">
          {/* Financial Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3 bg-slate-50 border border-slate-200/90 rounded-2xl">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Total Purchases
              </span>
              <span className="text-sm sm:text-base font-bold font-mono text-slate-900 mt-0.5 block">
                {formatCurrency(summary?.totalPurchases ?? supplier.totalPurchases, business?.currencySymbol)}
              </span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200/90 rounded-2xl">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Total Paid
              </span>
              <span className="text-sm sm:text-base font-bold font-mono text-emerald-700 mt-0.5 block">
                {formatCurrency(summary?.totalPaid ?? supplier.totalPaid, business?.currencySymbol)}
              </span>
            </div>

            <div
              className={`p-3 rounded-2xl border ${
                (summary?.outstandingPayable ?? supplier.outstandingPayable) > 0
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-slate-50 border-slate-200 text-slate-900'
              }`}
            >
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Payable Due
              </span>
              <span
                className={`text-sm sm:text-base font-bold font-mono mt-0.5 block ${
                  (summary?.outstandingPayable ?? supplier.outstandingPayable) > 0
                    ? 'text-amber-800'
                    : 'text-slate-700'
                }`}
              >
                {formatCurrency(
                  summary?.outstandingPayable ?? supplier.outstandingPayable,
                  business?.currencySymbol
                )}
              </span>
            </div>

            <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-2xl">
              <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider block">
                Advance Credit
              </span>
              <span className="text-sm sm:text-base font-bold font-mono text-blue-700 mt-0.5 block">
                {formatCurrency(summary?.supplierCredit ?? supplier.supplierCredit, business?.currencySymbol)}
              </span>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2.5">
            <Button
              variant="primary"
              className="flex-1"
              icon={PlusCircle}
              onClick={() => setIsPaySupplierOpen(true)}
            >
              Pay Supplier
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              icon={FileText}
              onClick={() => setIsStatementOpen(true)}
            >
              View Statement
            </Button>
          </div>

          {/* Contact & Terms Details */}
          {(supplier.phone ||
            supplier.email ||
            supplier.address ||
            supplier.taxId ||
            supplier.paymentTerms ||
            supplier.notes) && (
            <div className="p-3.5 bg-slate-50/80 rounded-2xl border border-slate-200/80 space-y-1.5 text-xs text-slate-600">
              {supplier.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <a href={`tel:${supplier.phone}`} className="text-blue-600 hover:underline font-medium">
                    {supplier.phone}
                  </a>
                </div>
              )}
              {supplier.email && (
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  <span>{supplier.email}</span>
                </div>
              )}
              {supplier.taxId && (
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400" />
                  <span>GST/Tax ID: <strong className="font-mono text-slate-800">{supplier.taxId}</strong></span>
                </div>
              )}
              {supplier.paymentTerms && (
                <div className="flex items-center gap-2">
                  <FileCheck className="w-3.5 h-3.5 text-slate-400" />
                  <span>Terms: <strong className="text-slate-800">{supplier.paymentTerms}</strong></span>
                </div>
              )}
              {supplier.address && (
                <div className="flex items-start gap-2">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <span>{supplier.address}</span>
                </div>
              )}
              {supplier.notes && (
                <p className="text-slate-500 italic pt-1 border-t border-slate-200/60">
                  Note: {supplier.notes}
                </p>
              )}
            </div>
          )}

          {/* Tab Switcher */}
          <div className="flex items-center justify-between border-b border-slate-200">
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setActiveTab('PURCHASES')}
                className={`pb-2.5 text-xs font-bold transition-all relative ${
                  activeTab === 'PURCHASES'
                    ? 'text-slate-900 border-b-2 border-slate-900'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Purchase Bills ({purchases.length})
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('PAYMENTS')}
                className={`pb-2.5 text-xs font-bold transition-all relative ${
                  activeTab === 'PAYMENTS'
                    ? 'text-slate-900 border-b-2 border-slate-900'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Payments & Allocations ({payments.length})
              </button>
            </div>
          </div>

          {/* Purchases List Tab */}
          {activeTab === 'PURCHASES' && (
            <div>
              {loading ? (
                <div className="py-8 text-center text-xs text-slate-400">Loading purchase bills...</div>
              ) : purchases.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border border-slate-200">
                  No purchases recorded for this supplier yet.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto border border-slate-200 rounded-2xl">
                  {purchases.map((p) => {
                    const isVoid = p.status === 'VOIDED';
                    const isReturned = p.status === 'RETURNED';

                    return (
                      <div
                        key={p.id}
                        onClick={() => onSelectPurchase?.(p.id)}
                        className={`p-3 flex items-center justify-between hover:bg-slate-50 cursor-pointer transition-colors text-xs ${
                          isVoid ? 'opacity-60 bg-slate-50/50' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center font-bold font-mono">
                            <Receipt className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 block font-mono">#{p.purchaseNumber}</span>
                            <span className="text-[11px] text-slate-400">{formatDate(p.purchaseDate)}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 text-right">
                          <div>
                            <span className="font-bold text-slate-900 font-mono block">
                              {formatCurrency(p.totalAmount, business?.currencySymbol)}
                            </span>
                            {isVoid ? (
                              <span className="text-[11px] text-rose-600 font-semibold">Cancelled</span>
                            ) : isReturned ? (
                              <span className="text-[11px] text-amber-700 font-semibold">Fully Returned</span>
                            ) : p.dueAmount > 0.005 ? (
                              <span className="text-[11px] text-amber-800 font-mono font-semibold">
                                Due: {formatCurrency(p.dueAmount, business?.currencySymbol)}
                              </span>
                            ) : (
                              <span className="text-[11px] text-emerald-600 font-semibold">Paid in Full</span>
                            )}
                          </div>
                          <Badge
                            variant={
                              p.status === 'VOIDED'
                                ? 'danger'
                                : p.status === 'RETURNED'
                                ? 'neutral'
                                : p.status === 'PAID'
                                ? 'success'
                                : p.status === 'PARTIAL'
                                ? 'warning'
                                : 'danger'
                            }
                            size="sm"
                          >
                            {p.status}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Payments List Tab */}
          {activeTab === 'PAYMENTS' && (
            <div>
              {loading ? (
                <div className="py-8 text-center text-xs text-slate-400">Loading payments...</div>
              ) : payments.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border border-slate-200">
                  No payments recorded to this supplier yet.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto border border-slate-200 rounded-2xl">
                  {payments.map((p) => {
                    const isReversed = reversedPaymentIds.has(p.id);
                    const payAllocs = allocations.filter((a) => a.supplierPaymentId === p.id);
                    const totalAllocated = payAllocs.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
                    const unallocated = Math.max(0, (Number(p.amount) || 0) - totalAllocated);

                    return (
                      <div
                        key={p.id}
                        className={`p-3 transition-colors text-xs space-y-1.5 ${
                          isReversed ? 'bg-rose-50/30 opacity-70' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div
                              className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                                isReversed
                                  ? 'bg-rose-100 text-rose-600'
                                  : 'bg-emerald-50 text-emerald-600'
                              }`}
                            >
                              {isReversed ? <Undo2 className="w-3.5 h-3.5" /> : <CreditCard className="w-3.5 h-3.5" />}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900">{p.paymentMethod} Payment</span>
                                {isReversed && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-100 text-rose-800 font-bold">
                                    REVERSED
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-slate-400 block">{formatDate(p.paymentDate)}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <span
                                className={`font-bold font-mono text-sm block ${
                                  isReversed ? 'line-through text-slate-400' : 'text-emerald-700'
                                }`}
                              >
                                -{formatCurrency(p.amount, business?.currencySymbol)}
                              </span>
                              {p.notes && <span className="text-[11px] text-slate-400 italic">{p.notes}</span>}
                            </div>

                            {!isReversed && (
                              <button
                                type="button"
                                title="Reverse Payment"
                                onClick={() => setPaymentToReverse(p)}
                                className="text-[11px] font-semibold text-rose-600 hover:text-rose-800 p-1 rounded hover:bg-rose-50 transition-colors"
                              >
                                <Undo2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Allocations Sub-pills */}
                        {!isReversed && payAllocs.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1 border-t border-slate-100">
                            {payAllocs.map((a) => (
                              <span
                                key={a.id}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-[10px] font-mono text-slate-700"
                              >
                                → Bill #{purchasesMap.get(a.purchaseId) || 'PUR'}:{' '}
                                {formatCurrency(a.amount, business?.currencySymbol)}
                              </span>
                            ))}
                            {unallocated > 0.005 && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-[10px] font-mono text-blue-700 font-semibold">
                                <Sparkles className="w-2.5 h-2.5" />
                                Advance: {formatCurrency(unallocated, business?.currencySymbol)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* Sub Modals */}
      <PaySupplierModal
        isOpen={isPaySupplierOpen}
        onClose={() => setIsPaySupplierOpen(false)}
        supplier={supplier}
        onSuccess={handlePaymentSuccess}
      />

      <SupplierStatementModal
        isOpen={isStatementOpen}
        onClose={() => setIsStatementOpen(false)}
        supplier={supplier}
      />

      <ReverseSupplierPaymentModal
        isOpen={Boolean(paymentToReverse)}
        onClose={() => setPaymentToReverse(null)}
        payment={paymentToReverse}
        supplierName={supplier.name}
        onSuccess={handleReversalSuccess}
      />
    </>
  );
};
