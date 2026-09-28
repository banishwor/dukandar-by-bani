import React, { useEffect, useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { saleRepository, type SaleFullDetails } from '../../repositories/saleRepository';
import { customerRepository } from '../../repositories/customerRepository';
import { ReceivePaymentModal } from '../customers/ReceivePaymentModal';
import { CreateSaleReturnModal } from './CreateSaleReturnModal';
import { VoidSaleModal } from './VoidSaleModal';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { printElement } from '../../utils/printDocument';
import { useBusiness } from '../../contexts/BusinessContext';
import type { Customer } from '../../types';
import {
  Printer,
  CreditCard,
  PlusCircle,
  RotateCcw,
  XCircle,
  Phone,
  MapPin,
  CheckCircle2,
  Calendar,
  Sparkles,
  Tag,
  Store,
  DollarSign,
  ChevronDown,
} from 'lucide-react';

interface SaleDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  saleId: string | null;
  onSaleUpdated?: () => void;
}

export const SaleDetailModal: React.FC<SaleDetailModalProps> = ({
  isOpen,
  onClose,
  saleId,
  onSaleUpdated,
}) => {
  const { business } = useBusiness();
  const [details, setDetails] = useState<SaleFullDetails | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [isReceivePaymentOpen, setIsReceivePaymentOpen] = useState(false);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [isVoidModalOpen, setIsVoidModalOpen] = useState(false);

  const loadDetails = () => {
    if (saleId && isOpen) {
      setLoading(true);
      saleRepository
        .getSaleWithDetails(saleId)
        .then(async (data) => {
          setDetails(data || null);
          if (data?.sale.customerId) {
            const cust = await customerRepository.getCustomerById(data.sale.customerId);
            setCustomer(cust || null);
          } else {
            setCustomer(null);
          }
        })
        .finally(() => setLoading(false));
    }
  };

  useEffect(() => {
    loadDetails();
  }, [saleId, isOpen]);

  const handlePrint = () => {
    printElement('printable-sale-invoice', `Invoice #${details?.sale.invoiceNumber}`);
  };

  if (!details) return null;

  const {
    sale,
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
    totalReturnedAmount >= (Number(sale.totalAmount) || 0) - 0.005 &&
    (Number(sale.totalAmount) || 0) > 0;

  const canReturn = !isVoided && !isFullyReturned;
  const canVoid = !isVoided && !isFullyReturned;

  // Accurate Financial Calculations
  const grossItemsTotal = lines.reduce(
    (acc, l) => acc + Number(l.quantity) * Number(l.rate),
    0
  );
  const totalLineDiscounts = lines.reduce(
    (acc, l) => acc + (Number(l.discountAmount) || 0),
    0
  );
  const billDiscount = Number(sale.discountAmount) || 0;
  const grandTotalDiscounts = totalLineDiscounts + billDiscount;
  const totalUnits = lines.reduce((acc, l) => acc + Number(l.quantity), 0);

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={`Invoice #${sale.invoiceNumber}`}
        subtitle={`Issued on ${formatDateTime(sale.saleDate || sale.createdAt)}`}
        maxWidth="2xl"
      >
        <div className="space-y-6">
          {/* Top Quick Actions Bar (Screen Only) */}
          <div className="print-hidden no-print flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="primary"
                size="sm"
                icon={Printer}
                onClick={handlePrint}
                className="shadow-xs cursor-pointer font-semibold"
              >
                Print Receipt / Invoice
              </Button>

              {/* Pay Invoice Action */}
              {sale.dueAmount > 0 && customer && !isVoided && (
                <Button
                  variant="success"
                  size="sm"
                  icon={PlusCircle}
                  onClick={() => setIsReceivePaymentOpen(true)}
                  className="shadow-xs cursor-pointer font-semibold"
                >
                  Pay Due ({formatCurrency(sale.dueAmount, business?.currencySymbol)})
                </Button>
              )}

              {/* Return Items Action */}
              {canReturn && (
                <Button
                  variant="outline"
                  size="sm"
                  icon={RotateCcw}
                  onClick={() => setIsReturnModalOpen(true)}
                  className="cursor-pointer"
                >
                  Return Items
                </Button>
              )}

              {/* Void Invoice Action */}
              {canVoid && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-rose-600 hover:bg-rose-50 cursor-pointer"
                  icon={XCircle}
                  onClick={() => setIsVoidModalOpen(true)}
                >
                  Void Invoice
                </Button>
              )}
            </div>

            <span className="text-xs text-slate-400">
              Format: Standard A4 / POS Receipt
            </span>
          </div>

          {/* Voided Warning Notice Banner */}
          {isVoided && voidRecord && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 print:border-rose-400">
              <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <span className="font-bold text-rose-950 block text-sm">
                  Invoice Voided on {formatDateTime(voidRecord.voidDate || voidRecord.createdAt)}
                </span>
                <p className="text-rose-800">
                  Reason: <strong>{voidRecord.reason}</strong>
                </p>
                <p className="text-rose-700">
                  This transaction is cancelled. Unreturned line items have been restored to inventory and receivable is reset to zero.
                </p>
              </div>
            </div>
          )}

          {/* Printable Invoice Sheet (Clean, Framed Retail Document) */}
          <div
            id="printable-sale-invoice"
            className="p-6 sm:p-7 bg-white border border-slate-300 rounded-xl shadow-xs space-y-5 text-slate-900"
          >
            {/* 1. Header: Store Branding & Invoice Metadata */}
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pb-5 border-b-2 border-slate-900">
              {/* Left: Store Identity */}
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold text-base shadow-xs print:border print:border-slate-800">
                    <Store className="w-4 h-4 text-emerald-400" />
                  </div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                    {business?.name || 'Retail Store'}
                  </h2>
                </div>
                {business?.type && (
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider pl-10">
                    {business.type}
                  </p>
                )}
                <div className="text-xs text-slate-600 pl-10 space-y-0.5 pt-0.5">
                  {business?.phone && (
                    <div className="flex items-center gap-1.5">
                      <Phone className="w-3 h-3 text-slate-400" />
                      <span>Phone: {business.phone}</span>
                    </div>
                  )}
                  {business?.address && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3 h-3 text-slate-400" />
                      <span>{business.address}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Invoice Type, Number & Status Stamp */}
              <div className="text-left sm:text-right space-y-1.5">
                <span className="inline-block px-2.5 py-0.5 rounded-md bg-slate-900 text-white text-[11px] font-extrabold uppercase tracking-widest print:bg-slate-900 print:text-white">
                  Retail Tax Invoice
                </span>
                <div>
                  <span className="text-xs text-slate-500 block">Invoice Number</span>
                  <span className="text-base font-bold font-mono text-blue-700 tracking-tight">
                    #{sale.invoiceNumber}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Date & Time</span>
                  <span className="text-xs font-medium text-slate-800">
                    {formatDateTime(sale.saleDate || sale.createdAt)}
                  </span>
                </div>
                <div className="pt-1">
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-extrabold uppercase tracking-wide border ${
                      sale.status === 'PAID'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                        : sale.status === 'PARTIAL'
                        ? 'bg-amber-50 text-amber-800 border-amber-300'
                        : sale.status === 'VOIDED'
                        ? 'bg-rose-50 text-rose-800 border-rose-300'
                        : 'bg-slate-100 text-slate-800 border-slate-300'
                    }`}
                  >
                    {sale.status === 'PAID' ? '● PAID IN FULL' : sale.status}
                  </span>
                </div>
              </div>
            </div>

            {/* 2. Customer Details & Payment Terms (Two-Column Card Grid with Crisp Borders) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {/* Billed To Box */}
              <div className="p-3 bg-slate-50/70 border border-slate-300 rounded-lg space-y-1 print:bg-transparent">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block border-b border-slate-200 pb-1 mb-1">
                  Billed To (Customer)
                </span>
                <span className="font-bold text-slate-900 text-sm block">
                  {sale.customerNameSnapshot}
                </span>
                {customer?.phone && (
                  <p className="text-slate-600 flex items-center gap-1.5 pt-0.5">
                    <Phone className="w-3 h-3 text-slate-400" />
                    <span>Phone: {customer.phone}</span>
                  </p>
                )}
                {customer?.address && (
                  <p className="text-slate-500 flex items-center gap-1.5">
                    <MapPin className="w-3 h-3 text-slate-400" />
                    <span>{customer.address}</span>
                  </p>
                )}
                {customer && customer.currentBalance !== 0 && (
                  <p className="text-[11px] font-semibold text-slate-600 pt-1 border-t border-slate-200 mt-1">
                    Customer Account Balance:{' '}
                    <span
                      className={
                        customer.currentBalance > 0
                          ? 'text-amber-800 font-bold'
                          : 'text-emerald-800 font-bold'
                      }
                    >
                      {formatCurrency(Math.abs(customer.currentBalance), business?.currencySymbol)}{' '}
                      {customer.currentBalance > 0 ? '(Due / Khata)' : '(Advance)'}
                    </span>
                  </p>
                )}
              </div>

              {/* Payment Details Box */}
              <div className="p-3 bg-slate-50/70 border border-slate-300 rounded-lg space-y-1 print:bg-transparent">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block border-b border-slate-200 pb-1 mb-1">
                  Billing & Payment Terms
                </span>
                <div className="space-y-1 pt-0.5 text-[11px]">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Payment Terms:</span>
                    <span className="font-semibold text-slate-900">
                      {sale.dueAmount === 0
                        ? 'Immediate Full Settlement'
                        : sale.paidAmount > 0
                        ? 'Partial Payment'
                        : 'Credit / Khata Account'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Primary Channel:</span>
                    <span className="font-medium text-slate-800">
                      {payments.length > 0 ? payments[0].paymentMethod : 'Direct Cash'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Total Items / Qty:</span>
                    <span className="font-bold text-slate-900 font-mono">
                      {totalUnits} Units ({lines.length} {lines.length === 1 ? 'Line' : 'Lines'})
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Line Items Table (Boxed Grid with Crisp Borders) */}
            <div className="border border-slate-300 rounded-lg overflow-hidden bg-white">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-300 text-slate-800 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-2.5 px-3 w-10 text-center border-r border-slate-200">#</th>
                    <th className="py-2.5 px-3 border-r border-slate-200">Item Description</th>
                    <th className="py-2.5 px-3 text-right border-r border-slate-200">Qty</th>
                    <th className="py-2.5 px-3 text-right border-r border-slate-200">Rate</th>
                    {lines.some((l) => (l.discountAmount || 0) > 0) && (
                      <th className="py-2.5 px-3 text-right border-r border-slate-200">Discount</th>
                    )}
                    <th className="py-2.5 px-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {lines.map((line, idx) => {
                    const returnedQtyForLine = returnLines
                      .filter((rl) => rl.originalSaleLineId === line.id)
                      .reduce((sum, rl) => sum + rl.quantityReturned, 0);

                    return (
                      <tr key={line.id} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px] border-r border-slate-200">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-3 border-r border-slate-200">
                          <span className="font-bold text-slate-900 block text-xs">
                            {line.itemNameSnapshot}
                          </span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-slate-500 font-medium px-1.5 py-0.2 bg-slate-100 rounded">
                              Unit: {line.unit}
                            </span>
                            {returnedQtyForLine > 0 && (
                              <span className="text-[10px] px-1.5 py-0.2 bg-amber-50 text-amber-800 border border-amber-200 rounded font-semibold">
                                {returnedQtyForLine} {line.unit} returned
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-medium text-slate-800 border-r border-slate-200">
                          {line.quantity} {line.unit}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-700 font-mono border-r border-slate-200">
                          {formatCurrency(line.rate, business?.currencySymbol)}
                        </td>
                        {lines.some((l) => (l.discountAmount || 0) > 0) && (
                          <td className="py-2.5 px-3 text-right text-emerald-700 font-mono font-medium border-r border-slate-200">
                            {line.discountAmount > 0
                              ? `-${formatCurrency(line.discountAmount, business?.currencySymbol)}`
                              : '—'}
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

            {/* 4. Financial Calculation Summary & Grand Total (Transparent Math & Ink-Friendly Design) */}
            <div className="flex flex-col sm:flex-row justify-between items-start gap-6 pt-1">
              {/* Savings & Remarks (Left) */}
              <div className="w-full sm:max-w-xs space-y-2 text-xs">
                {grandTotalDiscounts > 0 && (
                  <div className="p-3 bg-emerald-50/80 border border-emerald-300 rounded-lg flex items-center gap-2.5 text-emerald-900">
                    <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div>
                      <span className="font-bold block text-emerald-950">
                        Total Savings: {formatCurrency(grandTotalDiscounts, business?.currencySymbol)}
                      </span>
                      <span className="text-[11px] text-emerald-700">
                        Customer received special discounts on this invoice.
                      </span>
                    </div>
                  </div>
                )}

                {sale.notes && (
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                      Invoice Remarks
                    </span>
                    <p className="text-slate-700 italic">{sale.notes}</p>
                  </div>
                )}
              </div>

              {/* Totals Breakdown (Right) */}
              <div className="w-full sm:max-w-xs space-y-1.5 text-xs text-slate-700">
                {/* Gross Subtotal (Qty * Rate) */}
                <div className="flex justify-between py-1 border-b border-slate-200">
                  <span className="text-slate-500">Gross Items Total:</span>
                  <span className="font-semibold text-slate-900 font-mono">
                    {formatCurrency(grossItemsTotal, business?.currencySymbol)}
                  </span>
                </div>

                {/* Discounts Breakdown */}
                {grandTotalDiscounts > 0 && (
                  <div className="flex justify-between py-1 border-b border-slate-200 text-emerald-700 font-medium">
                    <span className="flex items-center gap-1">
                      <Tag className="w-3 h-3" />
                      Total Discounts Saved:
                    </span>
                    <span className="font-mono font-bold">
                      -{formatCurrency(grandTotalDiscounts, business?.currencySymbol)}
                    </span>
                  </div>
                )}

                {/* Tax (if any) */}
                {sale.taxAmount > 0 && (
                  <div className="flex justify-between py-1 border-b border-slate-200 text-slate-700">
                    <span>Tax / GST:</span>
                    <span className="font-mono font-medium">
                      +{formatCurrency(sale.taxAmount, business?.currencySymbol)}
                    </span>
                  </div>
                )}

                {/* Refined Executive Grand Total (Clean double border, Zero ink wasting) */}
                <div className="py-2.5 px-3 border-y-2 border-slate-900 my-2 flex items-center justify-between bg-slate-50 print:bg-transparent">
                  <div>
                    <span className="text-xs font-black uppercase tracking-wider text-slate-900 block">
                      Total Invoice Amount
                    </span>
                    <span className="text-[10px] text-slate-500">Net Payable after all discounts</span>
                  </div>
                  <span className="text-xl font-black font-mono text-slate-900 tracking-tight">
                    {formatCurrency(sale.totalAmount, business?.currencySymbol)}
                  </span>
                </div>

                {/* Returns Adjustment (if any) */}
                {totalReturnedAmount > 0 && (
                  <div className="flex justify-between py-1 text-amber-800 font-bold border-b border-slate-200">
                    <span>Less Returned Goods:</span>
                    <span className="font-mono">
                      -{formatCurrency(totalReturnedAmount, business?.currencySymbol)}
                    </span>
                  </div>
                )}

                {/* Void Adjustment (if voided) */}
                {isVoided && (
                  <div className="flex justify-between py-1 text-rose-700 font-bold border-b border-slate-200">
                    <span>Void Cancellation Adjustment:</span>
                    <span className="font-mono">
                      -{formatCurrency(sale.totalAmount - totalReturnedAmount, business?.currencySymbol)}
                    </span>
                  </div>
                )}

                {totalReturnedAmount > 0 && (
                  <div className="flex justify-between py-1.5 text-xs font-bold text-slate-900 bg-slate-100 px-2 rounded-lg">
                    <span>Effective Net Payable:</span>
                    <span className="font-mono">
                      {formatCurrency(effectiveTotalAmount, business?.currencySymbol)}
                    </span>
                  </div>
                )}

                {/* Payment Breakdown */}
                <div className="flex justify-between py-1 text-emerald-800 font-bold">
                  <span>Direct Payment Received:</span>
                  <span className="font-mono">{formatCurrency(sale.paidAmount, business?.currencySymbol)}</span>
                </div>

                {sale.dueAmount > 0 && !isVoided && (
                  <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-300 flex items-center justify-between text-rose-900 font-bold">
                    <span>Balance Due (to Khata):</span>
                    <span className="font-mono text-sm text-rose-700">
                      {formatCurrency(sale.dueAmount, business?.currencySymbol)}
                    </span>
                  </div>
                )}

                {sale.dueAmount === 0 && !isVoided && (
                  <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-300 flex items-center justify-center gap-1.5 text-emerald-800 font-bold text-xs">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Bill Settled in Full</span>
                  </div>
                )}
              </div>
            </div>

            {/* 5. Processed Returns Breakdown (if any) */}
            {returns.length > 0 && (
              <div className="pt-3 border-t border-slate-200 text-xs">
                <h5 className="font-bold text-amber-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                  Processed Returns & Credit Notes ({returns.length})
                </h5>
                <div className="space-y-2">
                  {returns.map((r) => {
                    const linesInReturn = returnLines.filter((rl) => rl.saleReturnId === r.id);
                    return (
                      <div
                        key={r.id}
                        className="p-3 rounded-lg bg-amber-50/50 border border-amber-300 text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-amber-950">Return #{r.returnNumber}</span>
                            <span className="text-slate-400">· {formatDateTime(r.returnDate || r.createdAt)}</span>
                          </div>
                          <span className="font-bold font-mono text-amber-900">
                            {formatCurrency(r.totalAmount, business?.currencySymbol)}
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {linesInReturn.map((rl) => (
                            <span
                              key={rl.id}
                              className="text-[11px] px-2 py-0.5 bg-white border border-amber-200 rounded-md text-amber-900"
                            >
                              {rl.quantityReturned}x {rl.itemNameSnapshot} ({formatCurrency(rl.lineTotal, business?.currencySymbol)})
                            </span>
                          ))}
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-amber-200/50">
                          <span>Reason: {r.reason.replace(/_/g, ' ')}</span>
                          <span>Settlement: <strong>{r.settlementMode.replace(/_/g, ' ')}</strong></span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 6. Payment Allocations Timeline (if multiple payments) */}
            {allocations.length > 0 && (
              <div className="pt-3 border-t border-slate-200 text-xs">
                <h5 className="font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-slate-500" />
                  Payment Receipt Ledger ({allocations.length})
                </h5>
                <div className="space-y-1.5">
                  {allocations.map((a) => {
                    const matchedPay = payments.find((p) => p.id === a.paymentId);
                    return (
                      <div key={a.id} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-300">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
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

            {/* 7. Retail Terms & Authorized Signatory Footer */}
            <div className="pt-5 border-t border-slate-300 flex flex-col sm:flex-row items-start sm:items-end justify-between gap-6 text-xs text-slate-600">
              <div className="space-y-1 max-w-sm">
                <p className="font-bold text-slate-800">Terms & Conditions:</p>
                <ul className="text-[11px] leading-relaxed text-slate-500 list-disc list-inside space-y-0.5">
                  <li>Goods once sold can be exchanged within 7 days with this invoice.</li>
                  <li>Subject to local store jurisdiction. Thank you for your business!</li>
                </ul>
                <p className="text-[10px] text-slate-400 pt-1 font-mono">
                  Invoice generated on {formatDateTime(sale.saleDate || sale.createdAt)}
                </p>
              </div>

              <div className="text-right space-y-1 min-w-[200px]">
                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                  For {business?.name || 'Retail Store'}
                </span>
                <div className="h-12 border-b border-slate-400 border-dashed" />
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest block pt-0.5">
                  Authorized Signatory / Seal
                </span>
              </div>
            </div>

            {/* Collapsed System Trace Info (Strictly Hidden in Print, Admins Only) */}
            <details className="print-hidden no-print pt-3 border-t border-dashed border-slate-200 text-[11px] text-slate-400 group">
              <summary className="cursor-pointer hover:text-slate-600 select-none flex items-center gap-1">
                <span>System Verification Info</span>
                <ChevronDown className="w-3 h-3 group-open:rotate-180 transition-transform" />
              </summary>
              <div className="mt-2 space-y-1 p-2 bg-slate-50 rounded-lg font-mono text-[10px] text-slate-500">
                <div>Device Origin: {sale.createdByDeviceId || 'LOCAL_DEVICE'}</div>
                <div>Record ID: {sale.id}</div>
              </div>
            </details>
          </div>

          {/* Modal Bottom Footer (Screen Only) */}
          <div className="print-hidden no-print flex items-center justify-end pt-2">
            <Button variant="primary" onClick={onClose} className="px-6 font-semibold cursor-pointer">
              Done
            </Button>
          </div>
        </div>
      </Modal>

      {/* Receive Payment Modal */}
      {customer && (
        <ReceivePaymentModal
          isOpen={isReceivePaymentOpen}
          onClose={() => setIsReceivePaymentOpen(false)}
          customer={customer}
          currencySymbol={business?.currencySymbol}
          onPaymentReceived={() => {
            loadDetails();
            onSaleUpdated?.();
          }}
        />
      )}

      {/* Return Modal */}
      <CreateSaleReturnModal
        isOpen={isReturnModalOpen}
        onClose={() => setIsReturnModalOpen(false)}
        sale={sale}
        onReturnSuccess={() => {
          loadDetails();
          onSaleUpdated?.();
        }}
      />

      {/* Void Modal */}
      <VoidSaleModal
        isOpen={isVoidModalOpen}
        onClose={() => setIsVoidModalOpen(false)}
        sale={sale}
        paidAmount={sale.paidAmount}
        onVoidSuccess={() => {
          loadDetails();
          onSaleUpdated?.();
        }}
      />
    </>
  );
};
