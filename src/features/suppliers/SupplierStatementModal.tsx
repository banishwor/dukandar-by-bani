import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/ui/Modal';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Button } from '../../components/ui/Button';
import { useBusiness } from '../../contexts/BusinessContext';
import { useToast } from '../../components/ui/Toast';
import { supplierPaymentService } from '../../services/supplierPaymentService';
import type { Supplier, SupplierStatementEntry, SupplierFinancialSummary } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { Printer, Calendar, FileText, ArrowUpRight, ArrowDownLeft, RotateCcw, AlertOctagon, Undo2 } from 'lucide-react';

interface SupplierStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplier: Supplier;
}

export const SupplierStatementModal: React.FC<SupplierStatementModalProps> = ({
  isOpen,
  onClose,
  supplier,
}) => {
  const { business } = useBusiness();
  const { showError } = useToast();

  const [isMobile, setIsMobile] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [statement, setStatement] = useState<SupplierStatementEntry[]>([]);
  const [summary, setSummary] = useState<SupplierFinancialSummary | null>(null);

  // Date filters
  const [dateFilter, setDateFilter] = useState<'ALL' | 'THIS_MONTH' | 'LAST_MONTH'>('ALL');

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const loadStatementData = async () => {
    try {
      setIsLoading(true);
      const [stmtEntries, finSummary] = await Promise.all([
        supplierPaymentService.getSupplierStatement(supplier.id),
        supplierPaymentService.getSupplierFinancialSummary(supplier.id),
      ]);
      setStatement(stmtEntries);
      setSummary(finSummary);
    } catch (err) {
      console.error('Failed to load supplier statement', err);
      showError('Unable to generate supplier statement.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadStatementData();
    }
  }, [isOpen, supplier.id]);

  const handlePrint = () => {
    window.print();
  };

  // Filter entries
  const filteredEntries = statement.filter((entry) => {
    if (dateFilter === 'ALL') return true;

    const entryDate = new Date(entry.date);
    const now = new Date();

    if (dateFilter === 'THIS_MONTH') {
      return (
        entryDate.getFullYear() === now.getFullYear() &&
        entryDate.getMonth() === now.getMonth()
      );
    }

    if (dateFilter === 'LAST_MONTH') {
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return (
        entryDate.getFullYear() === prevMonth.getFullYear() &&
        entryDate.getMonth() === prevMonth.getMonth()
      );
    }

    return true;
  });

  const getEntryBadge = (type: SupplierStatementEntry['type']) => {
    switch (type) {
      case 'PURCHASE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200/60">
            <ArrowDownLeft className="w-3 h-3 text-amber-600" />
            Purchase Bill
          </span>
        );
      case 'SUPPLIER_PAYMENT':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
            <ArrowUpRight className="w-3 h-3 text-emerald-600" />
            Payment Made
          </span>
        );
      case 'PURCHASE_RETURN':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200/60">
            <Undo2 className="w-3 h-3 text-purple-600" />
            Purchase Return
          </span>
        );
      case 'PURCHASE_VOID':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-300">
            <AlertOctagon className="w-3 h-3 text-slate-600" />
            Purchase Void
          </span>
        );
      case 'PAYMENT_REVERSAL':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200/60">
            <RotateCcw className="w-3 h-3 text-rose-600" />
            Payment Reversal
          </span>
        );
      case 'REFUND_RECEIVED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200/60">
            <ArrowDownLeft className="w-3 h-3 text-blue-600" />
            Refund Received
          </span>
        );
    }
  };

  const content = (
    <div className="space-y-4">
      {/* Header controls & print */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 text-xs font-semibold">
          <button
            onClick={() => setDateFilter('ALL')}
            className={`px-3 py-1 rounded-lg transition-all ${
              dateFilter === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
            }`}
          >
            All History
          </button>
          <button
            onClick={() => setDateFilter('THIS_MONTH')}
            className={`px-3 py-1 rounded-lg transition-all ${
              dateFilter === 'THIS_MONTH' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
            }`}
          >
            This Month
          </button>
          <button
            onClick={() => setDateFilter('LAST_MONTH')}
            className={`px-3 py-1 rounded-lg transition-all ${
              dateFilter === 'LAST_MONTH' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
            }`}
          >
            Last Month
          </button>
        </div>

        <Button variant="outline" size="sm" icon={Printer} onClick={handlePrint}>
          Print Statement
        </Button>
      </div>

      {/* Financial Summary Bento */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Purchases</span>
            <span className="text-sm font-extrabold text-slate-900 font-mono">
              {formatCurrency(summary.totalPurchases, business?.currencySymbol)}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-200/60">
            <span className="text-[10px] uppercase font-bold text-emerald-800 block">Total Paid</span>
            <span className="text-sm font-extrabold text-emerald-900 font-mono">
              {formatCurrency(summary.totalPaid, business?.currencySymbol)}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-blue-50/50 border border-blue-200/60">
            <span className="text-[10px] uppercase font-bold text-blue-800 block">Supplier Advance</span>
            <span className="text-sm font-extrabold text-blue-900 font-mono">
              {formatCurrency(summary.supplierCredit, business?.currencySymbol)}
            </span>
          </div>

          <div
            className={`p-3 rounded-xl border ${
              summary.netPayable > 0
                ? 'bg-amber-50/70 border-amber-200 text-amber-900'
                : 'bg-slate-50 border-slate-200 text-slate-900'
            }`}
          >
            <span className="text-[10px] uppercase font-bold block">
              {summary.netPayable >= 0 ? 'Net Payable Due' : 'Advance Credit Balance'}
            </span>
            <span className="text-sm font-extrabold font-mono">
              {formatCurrency(Math.abs(summary.netPayable), business?.currencySymbol)}
            </span>
          </div>
        </div>
      )}

      {/* Statement Ledger Table / List */}
      <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-xs">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading ledger entries...</div>
        ) : filteredEntries.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">No transactions recorded for this period.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <tr>
                  <th className="px-3.5 py-2.5">Date & Type</th>
                  <th className="px-3.5 py-2.5">Description</th>
                  <th className="px-3.5 py-2.5 text-right text-amber-700">Payable (+)</th>
                  <th className="px-3.5 py-2.5 text-right text-emerald-700">Paid (-)</th>
                  <th className="px-3.5 py-2.5 text-right text-slate-900">Net Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEntries.map((entry) => {
                  return (
                    <tr key={entry.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-3.5 py-3 whitespace-nowrap">
                        <div className="font-semibold text-slate-900">
                          {new Date(entry.date).toLocaleDateString()}
                        </div>
                        <div className="mt-1">{getEntryBadge(entry.type)}</div>
                      </td>

                      <td className="px-3.5 py-3">
                        <div className="font-medium text-slate-800">{entry.description}</div>
                        {entry.notes && (
                          <div className="text-[11px] text-slate-400 mt-0.5">{entry.notes}</div>
                        )}
                        {entry.allocations && entry.allocations.length > 0 && (
                          <div className="text-[10px] text-slate-500 mt-1 space-y-0.5">
                            {entry.allocations.map((a, idx) => (
                              <div key={idx}>
                                • Allocated to Bill #{a.purchaseNumber}:{' '}
                                <span className="font-semibold text-slate-700">
                                  {formatCurrency(a.amount, business?.currencySymbol)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>

                      <td className="px-3.5 py-3 text-right font-mono font-semibold text-amber-700">
                        {entry.payable > 0 ? formatCurrency(entry.payable, business?.currencySymbol) : '-'}
                      </td>

                      <td className="px-3.5 py-3 text-right font-mono font-semibold text-emerald-700">
                        {entry.paid > 0 ? formatCurrency(entry.paid, business?.currencySymbol) : '-'}
                      </td>

                      <td className="px-3.5 py-3 text-right font-mono font-bold text-slate-900">
                        {formatCurrency(entry.runningBalance, business?.currencySymbol)}
                        <span className="text-[10px] font-normal text-slate-400 ml-1">
                          {entry.runningBalance >= 0 ? 'Dr' : 'Cr'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex justify-end pt-2">
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );

  const title = `Statement: ${supplier.name}`;
  const subtitle = 'Immutable accounting ledger and transaction timeline';

  if (isMobile) {
    return (
      <BottomSheet isOpen={isOpen} onClose={onClose} title={title} subtitle={subtitle}>
        {content}
      </BottomSheet>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} subtitle={subtitle} maxWidth="4xl">
      {content}
    </Modal>
  );
};
