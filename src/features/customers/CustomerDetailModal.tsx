import React, { useEffect, useState, useCallback } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { saleRepository } from '../../repositories/saleRepository';
import { paymentRepository } from '../../repositories/paymentRepository';
import { paymentService } from '../../services/paymentService';
import { ReceivePaymentModal } from './ReceivePaymentModal';
import { CustomerStatementModal } from './CustomerStatementModal';
import { ReversePaymentModal } from './ReversePaymentModal';
import type {
  CustomerWithBalance,
  Sale,
  Payment,
  CustomerFinancialSummary,
  PaymentAllocation,
  PaymentReversal,
} from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { useBusiness } from '../../contexts/BusinessContext';
import { db } from '../../db/database';
import {
  Phone,
  Mail,
  MapPin,
  Receipt,
  CreditCard,
  PlusCircle,
  FileText,
  Sparkles,
  ArrowDownRight,
  Layers,
  Undo2,
} from 'lucide-react';

interface CustomerDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: CustomerWithBalance | null;
  onSelectSale?: (saleId: string) => void;
  onCustomerUpdated?: () => void;
}

export const CustomerDetailModal: React.FC<CustomerDetailModalProps> = ({
  isOpen,
  onClose,
  customer,
  onSelectSale,
  onCustomerUpdated,
}) => {
  const { business } = useBusiness();
  const [activeTab, setActiveTab] = useState<'INVOICES' | 'PAYMENTS'>('INVOICES');
  const [sales, setSales] = useState<Sale[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [reversals, setReversals] = useState<PaymentReversal[]>([]);
  const [allocations, setAllocations] = useState<PaymentAllocation[]>([]);
  const [summary, setSummary] = useState<CustomerFinancialSummary | null>(null);
  const [loading, setLoading] = useState(true);

  // Sub-modals
  const [isReceivePaymentOpen, setIsReceivePaymentOpen] = useState(false);
  const [isStatementOpen, setIsStatementOpen] = useState(false);
  const [paymentToReverse, setPaymentToReverse] = useState<Payment | null>(null);

  const loadCustomerData = useCallback(async () => {
    if (!customer || !isOpen) return;
    try {
      setLoading(true);
      const [sList, pList, revList, allocList, sum] = await Promise.all([
        saleRepository.getSalesByCustomer(customer.id),
        paymentRepository.getPaymentsByCustomer(customer.id),
        db.paymentReversals
          .where('customerId')
          .equals(customer.id)
          .filter((r) => !r.isDeleted)
          .toArray(),
        db.paymentAllocations
          .where('customerId')
          .equals(customer.id)
          .filter((a) => !a.isDeleted)
          .toArray(),
        paymentService.getCustomerFinancialSummary(customer.id),
      ]);
      setSales(sList);
      setPayments(pList);
      setReversals(revList);
      setAllocations(allocList);
      setSummary(sum);
    } catch (err) {
      console.error('Failed to load customer details', err);
    } finally {
      setLoading(false);
    }
  }, [customer, isOpen]);

  useEffect(() => {
    loadCustomerData();
  }, [loadCustomerData]);

  const handlePaymentSuccess = () => {
    loadCustomerData();
    onCustomerUpdated?.();
  };

  const handleReversalSuccess = () => {
    loadCustomerData();
    onCustomerUpdated?.();
  };

  if (!customer) return null;

  const salesMap = new Map<string, string>();
  sales.forEach((s) => salesMap.set(s.id, s.invoiceNumber));

  const reversedPaymentIds = new Set(reversals.map((r) => r.originalPaymentId));

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={customer.name}
        subtitle="Customer Profile, Ledger & Financial Balances"
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
                {formatCurrency(summary?.totalSales ?? customer.totalSales, business?.currencySymbol)}
              </span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200/90 rounded-2xl">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Total Paid
              </span>
              <span className="text-sm sm:text-base font-bold font-mono text-emerald-700 mt-0.5 block">
                {formatCurrency(summary?.totalPaid ?? customer.totalPaid, business?.currencySymbol)}
              </span>
            </div>

            <div
              className={`p-3 rounded-2xl border ${
                (summary?.outstandingBalance ?? customer.outstandingBalance) > 0
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : 'bg-slate-50 border-slate-200 text-slate-900'
              }`}
            >
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Outstanding Due
              </span>
              <span
                className={`text-sm sm:text-base font-bold font-mono mt-0.5 block ${
                  (summary?.outstandingBalance ?? customer.outstandingBalance) > 0
                    ? 'text-rose-700'
                    : 'text-slate-700'
                }`}
              >
                {formatCurrency(
                  summary?.outstandingBalance ?? customer.outstandingBalance,
                  business?.currencySymbol
                )}
              </span>
            </div>

            <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-2xl">
              <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider block">
                Available Credit
              </span>
              <span className="text-sm sm:text-base font-bold font-mono text-blue-700 mt-0.5 block">
                {formatCurrency(summary?.customerCredit ?? 0, business?.currencySymbol)}
              </span>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2.5">
            <Button
              variant="success"
              className="flex-1"
              icon={PlusCircle}
              onClick={() => setIsReceivePaymentOpen(true)}
            >
              Receive Payment
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

          {/* Contact Details */}
          {(customer.phone || customer.email || customer.address || customer.notes) && (
            <div className="p-3.5 bg-slate-50/80 rounded-2xl border border-slate-200/80 space-y-1.5 text-xs text-slate-600">
              {customer.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <a href={`tel:${customer.phone}`} className="text-blue-600 hover:underline font-medium">
                    {customer.phone}
                  </a>
                </div>
              )}
              {customer.email && (
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  <span>{customer.email}</span>
                </div>
              )}
              {customer.address && (
                <div className="flex items-start gap-2">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <span>{customer.address}</span>
                </div>
              )}
              {customer.notes && (
                <p className="text-slate-500 italic pt-1 border-t border-slate-200/60">
                  Note: {customer.notes}
                </p>
              )}
            </div>
          )}

          {/* Tab Switcher */}
          <div className="flex items-center justify-between border-b border-slate-200">
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setActiveTab('INVOICES')}
                className={`pb-2.5 text-xs font-bold transition-all relative ${
                  activeTab === 'INVOICES'
                    ? 'text-slate-900 border-b-2 border-slate-900'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Invoices ({sales.length})
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

          {/* Invoices List Tab */}
          {activeTab === 'INVOICES' && (
            <div>
              {loading ? (
                <div className="py-8 text-center text-xs text-slate-400">Loading invoices...</div>
              ) : sales.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border border-slate-200">
                  No sales recorded for this customer yet.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto border border-slate-200 rounded-2xl">
                  {sales.map((s) => {
                    const isVoid = s.status === 'VOIDED';
                    const isReturned = s.status === 'RETURNED';

                    return (
                      <div
                        key={s.id}
                        onClick={() => onSelectSale?.(s.id)}
                        className={`p-3 flex items-center justify-between hover:bg-slate-50 cursor-pointer transition-colors text-xs ${
                          isVoid ? 'opacity-60 bg-slate-50/50' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold font-mono">
                            <Receipt className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 block font-mono">#{s.invoiceNumber}</span>
                            <span className="text-[11px] text-slate-400">{formatDate(s.saleDate)}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 text-right">
                          <div>
                            <span className="font-bold text-slate-900 font-mono block">
                              {formatCurrency(s.totalAmount, business?.currencySymbol)}
                            </span>
                            {isVoid ? (
                              <span className="text-[11px] text-rose-600 font-semibold">Cancelled</span>
                            ) : isReturned ? (
                              <span className="text-[11px] text-amber-700 font-semibold">Fully Returned</span>
                            ) : s.dueAmount > 0.005 ? (
                              <span className="text-[11px] text-rose-600 font-mono font-semibold">
                                Due: {formatCurrency(s.dueAmount, business?.currencySymbol)}
                              </span>
                            ) : (
                              <span className="text-[11px] text-emerald-600 font-semibold">Paid in Full</span>
                            )}
                          </div>
                          <Badge
                            variant={
                              s.status === 'VOIDED'
                                ? 'danger'
                                : s.status === 'RETURNED'
                                ? 'neutral'
                                : s.status === 'PAID'
                                ? 'success'
                                : s.status === 'PARTIAL'
                                ? 'warning'
                                : 'danger'
                            }
                            size="sm"
                          >
                            {s.status}
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
                  No payments recorded for this customer yet.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto border border-slate-200 rounded-2xl">
                  {payments.map((p) => {
                    const isReversed = reversedPaymentIds.has(p.id);
                    const payAllocs = allocations.filter((a) => a.paymentId === p.id);
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
                                +{formatCurrency(p.amount, business?.currencySymbol)}
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
                                → #{salesMap.get(a.saleId) || 'INV'}:{' '}
                                {formatCurrency(a.amount, business?.currencySymbol)}
                              </span>
                            ))}
                            {unallocated > 0.005 && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-[10px] font-mono text-blue-700 font-semibold">
                                <Sparkles className="w-2.5 h-2.5" />
                                Cr: {formatCurrency(unallocated, business?.currencySymbol)}
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
      <ReceivePaymentModal
        isOpen={isReceivePaymentOpen}
        onClose={() => setIsReceivePaymentOpen(false)}
        customer={customer}
        currencySymbol={business?.currencySymbol}
        onPaymentReceived={handlePaymentSuccess}
      />

      <CustomerStatementModal
        isOpen={isStatementOpen}
        onClose={() => setIsStatementOpen(false)}
        customer={customer}
      />

      <ReversePaymentModal
        isOpen={Boolean(paymentToReverse)}
        onClose={() => setPaymentToReverse(null)}
        payment={paymentToReverse}
        customerName={customer.name}
        onReversalSuccess={handleReversalSuccess}
      />
    </>
  );
};
