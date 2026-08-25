import React, { useEffect, useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { useBusiness } from '../../contexts/BusinessContext';
import { paymentService } from '../../services/paymentService';
import type { Customer, CustomerStatementEntry, CustomerFinancialSummary } from '../../types';
import { formatCurrency, formatDate, formatDateTime } from '../../utils/formatters';
import {
  FileText,
  Printer,
  Download,
  CreditCard,
  Receipt,
  RotateCcw,
  XCircle,
  Undo2,
  DollarSign,
  Calendar,
  Layers,
} from 'lucide-react';

interface CustomerStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
}

export const CustomerStatementModal: React.FC<CustomerStatementModalProps> = ({
  isOpen,
  onClose,
  customer,
}) => {
  const { business } = useBusiness();
  const [statement, setStatement] = useState<CustomerStatementEntry[]>([]);
  const [summary, setSummary] = useState<CustomerFinancialSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (customer && isOpen) {
      setLoading(true);
      Promise.all([
        paymentService.getCustomerStatement(customer.id),
        paymentService.getCustomerFinancialSummary(customer.id),
      ])
        .then(([entries, sum]) => {
          setStatement(entries);
          setSummary(sum);
        })
        .catch((err) => console.error('Failed to load statement', err))
        .finally(() => setLoading(false));
    }
  }, [customer, isOpen]);

  const handlePrint = () => {
    window.print();
  };

  const handleExportCSV = () => {
    if (!customer || statement.length === 0) return;

    const headers = ['Date', 'Type', 'Reference', 'Description', 'Debit (Billed)', 'Credit (Paid/Returned)', 'Running Balance'];
    const rows = statement.map((entry) => [
      entry.date,
      entry.type,
      entry.referenceNumber,
      `"${entry.description.replace(/"/g, '""')}"`,
      entry.debit || 0,
      entry.credit || 0,
      entry.runningBalance,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `statement_${customer.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const renderTypeBadge = (type: CustomerStatementEntry['type']) => {
    switch (type) {
      case 'SALE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-[10px] bg-blue-50 text-blue-700 border border-blue-200">
            <Receipt className="w-3 h-3" /> Sale
          </span>
        );
      case 'PAYMENT':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CreditCard className="w-3 h-3" /> Payment
          </span>
        );
      case 'SALE_RETURN':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-[10px] bg-amber-50 text-amber-800 border border-amber-200">
            <RotateCcw className="w-3 h-3 text-amber-600" /> Return
          </span>
        );
      case 'SALE_VOID':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-[10px] bg-rose-50 text-rose-800 border border-rose-200">
            <XCircle className="w-3 h-3 text-rose-600" /> Void
          </span>
        );
      case 'PAYMENT_REVERSAL':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-[10px] bg-red-50 text-red-800 border border-red-200">
            <Undo2 className="w-3 h-3 text-red-600" /> Reversal
          </span>
        );
      case 'REFUND':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-[10px] bg-purple-50 text-purple-800 border border-purple-200">
            <DollarSign className="w-3 h-3 text-purple-600" /> Refund
          </span>
        );
      default:
        return null;
    }
  };

  if (!customer) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Statement of Account · ${customer.name}`}
      subtitle={`Chronological transaction ledger as of ${formatDate(new Date().toISOString())}`}
      maxWidth="2xl"
    >
      <div className="space-y-6">
        {/* Statement Printable Sheet */}
        <div className="p-6 bg-slate-50 border border-slate-200/90 rounded-3xl space-y-6">
          {/* Header & Business Info */}
          <div className="flex flex-col sm:flex-row justify-between items-start border-b border-slate-200 pb-5 gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">{business?.name || 'Business'}</h2>
              {business?.phone && <p className="text-xs text-slate-500">Phone: {business.phone}</p>}
              {business?.email && <p className="text-xs text-slate-500">Email: {business.email}</p>}
              {business?.address && <p className="text-xs text-slate-500">{business.address}</p>}
            </div>

            <div className="sm:text-right">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                Account Statement
              </span>
              <h3 className="text-base font-bold text-slate-900 mt-0.5">{customer.name}</h3>
              {customer.phone && <p className="text-xs text-slate-500">Phone: {customer.phone}</p>}
              {customer.address && <p className="text-xs text-slate-500">{customer.address}</p>}
            </div>
          </div>

          {/* Account Summary Cards */}
          {summary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 bg-white border border-slate-200 rounded-2xl">
                <span className="text-[11px] font-semibold text-slate-500 block">Net Purchases</span>
                <span className="text-base font-bold font-mono text-slate-900 mt-0.5 block">
                  {formatCurrency(summary.totalSales, business?.currencySymbol)}
                </span>
              </div>

              <div className="p-3.5 bg-white border border-slate-200 rounded-2xl">
                <span className="text-[11px] font-semibold text-slate-500 block">Net Payments</span>
                <span className="text-base font-bold font-mono text-emerald-600 mt-0.5 block">
                  {formatCurrency(summary.totalPaid, business?.currencySymbol)}
                </span>
              </div>

              <div className="p-3.5 bg-white border border-slate-200 rounded-2xl">
                <span className="text-[11px] font-semibold text-slate-500 block">Outstanding Invoices</span>
                <span
                  className={`text-base font-bold font-mono mt-0.5 block ${
                    summary.outstandingBalance > 0 ? 'text-rose-600' : 'text-slate-800'
                  }`}
                >
                  {formatCurrency(summary.outstandingBalance, business?.currencySymbol)}
                </span>
              </div>

              <div className="p-3.5 bg-white border border-slate-200 rounded-2xl">
                <span className="text-[11px] font-semibold text-slate-500 block">Customer Credit</span>
                <span className="text-base font-bold font-mono text-blue-600 mt-0.5 block">
                  {formatCurrency(summary.customerCredit, business?.currencySymbol)}
                </span>
              </div>
            </div>
          )}

          {/* Ledger Table */}
          {loading ? (
            <div className="py-12 text-center text-xs text-slate-500">Loading ledger statement...</div>
          ) : statement.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400 bg-white rounded-2xl border border-slate-200">
              No transactions recorded for this customer yet.
            </div>
          ) : (
            <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                      <th className="py-3 px-3.5">Date</th>
                      <th className="py-3 px-3">Type</th>
                      <th className="py-3 px-3">Ref #</th>
                      <th className="py-3 px-3">Details</th>
                      <th className="py-3 px-3 text-right">Debit (+)</th>
                      <th className="py-3 px-3 text-right">Credit (-)</th>
                      <th className="py-3 px-3.5 text-right">Running Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {statement.map((entry) => (
                      <tr key={entry.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-3.5 text-slate-600 whitespace-nowrap">
                          {formatDate(entry.date)}
                        </td>

                        <td className="py-3 px-3 whitespace-nowrap">
                          {renderTypeBadge(entry.type)}
                        </td>

                        <td className="py-3 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                          {entry.referenceNumber}
                        </td>

                        <td className="py-3 px-3 max-w-xs">
                          <span className="text-slate-800 block font-medium">{entry.description}</span>
                          {entry.notes && (
                            <span className="text-[11px] text-slate-400 italic block">{entry.notes}</span>
                          )}
                          {entry.allocations && entry.allocations.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {entry.allocations.map((a, idx) => (
                                <span
                                  key={idx}
                                  className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-mono"
                                >
                                  → #{a.invoiceNumber}: {formatCurrency(a.amount, business?.currencySymbol)}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-3 text-right font-mono font-semibold text-slate-900 whitespace-nowrap">
                          {entry.debit > 0 ? formatCurrency(entry.debit, business?.currencySymbol) : '—'}
                        </td>

                        <td className="py-3 px-3 text-right font-mono font-bold text-emerald-600 whitespace-nowrap">
                          {entry.credit > 0 ? formatCurrency(entry.credit, business?.currencySymbol) : '—'}
                        </td>

                        <td className="py-3 px-3.5 text-right font-mono font-bold whitespace-nowrap">
                          <span
                            className={
                              entry.runningBalance > 0
                                ? 'text-rose-600'
                                : entry.runningBalance < 0
                                ? 'text-blue-600'
                                : 'text-slate-600'
                            }
                          >
                            {formatCurrency(Math.abs(entry.runningBalance), business?.currencySymbol)}
                            {entry.runningBalance > 0 ? ' Due' : entry.runningBalance < 0 ? ' Cr' : ''}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" icon={Printer} onClick={handlePrint}>
              Print Statement
            </Button>
            <Button variant="outline" size="sm" icon={Download} onClick={handleExportCSV}>
              Export CSV
            </Button>
          </div>

          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
};
