import React, { useState, useEffect, useRef } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { cashDrawerService } from '../../services/cashDrawerService';
import type { CashDrawerSession, EODSummaryReport } from '../../types';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import {
  Printer,
  Share2,
  CheckCircle2,
  Copy,
  Receipt,
  Building,
  Calendar,
  AlertCircle,
} from 'lucide-react';

interface EODReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: CashDrawerSession | null;
  businessId?: string;
  businessName?: string;
}

export const EODReceiptModal: React.FC<EODReceiptModalProps> = ({
  isOpen,
  onClose,
  session,
  businessId,
  businessName,
}) => {
  const { showSuccess, showError } = useToast();
  const [report, setReport] = useState<EODSummaryReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [paperWidth, setPaperWidth] = useState<'80mm' | '58mm' | 'A4'>('80mm');
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (session && isOpen) {
      setLoading(true);
      const targetBusinessId = businessId || session.businessId;
      cashDrawerService
        .getEODSummary(targetBusinessId, session.id)
        .then((data) => {
          setReport(data);
        })
        .catch((err) => {
          console.error('Failed to load EOD summary', err);
          showError('Failed to load summary');
        })
        .finally(() => setLoading(false));
    }
  }, [session, isOpen, businessId, showError]);

  if (!session) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleCopyWhatsApp = () => {
    if (!report) return;
    const sym = report.currencySymbol;
    const diff = report.session.difference;
    const diffStatus =
      diff === 0
        ? 'Balanced (₹0)'
        : diff > 0
        ? `Surplus +${formatCurrency(diff, sym)}`
        : `Shortage -${formatCurrency(Math.abs(diff), sym)}`;

    const text = `📊 *${report.businessName} — Day Close Summary (EOD)*
📅 Date: ${report.session.sessionDate} (${report.session.sessionNumber})
⏰ Time: ${formatDateTime(report.session.closedAt)}

💰 *Turnover:*
• Net Sales: ${formatCurrency(report.netSales, sym)} (${report.salesCount} bills)
• Cash Sales: ${formatCurrency(report.cashSalesTotal, sym)}
• Digital / UPI: ${formatCurrency(report.digitalSalesTotal, sym)}
• Credit (Udhar) Given: ${formatCurrency(report.creditKhataTotal, sym)}
• Khata Collected: ${formatCurrency(report.customerCollectionsTotal, sym)}

💼 *Cash Drawer (Galla):*
• Opening Float: ${formatCurrency(report.session.openingFloat, sym)}
• Expected Cash: ${formatCurrency(report.session.expectedCash, sym)}
• Physical Count: ${formatCurrency(report.session.countedCash, sym)}
• Status: *${diffStatus}*
• Tomorrow's Float: ${formatCurrency(report.session.nextDayFloat || 0, sym)}
• Take-Home Cash: ${formatCurrency(report.session.takeHomeCash || 0, sym)}
${report.session.notes ? `\n📝 Notes: ${report.session.notes}` : ''}

_Generated via Dukandar Business Manager_`;

    navigator.clipboard.writeText(text);
    showSuccess('EOD Summary copied to clipboard for WhatsApp!');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="End-of-Day (EOD) Z-Report"
      subtitle="Comprehensive daily sales turnover and cash drawer tally"
      maxWidth="lg"
    >
      {loading || !report ? (
        <div className="py-16 text-center text-sm text-slate-500">Preparing report slip...</div>
      ) : (
        <div className="space-y-4">
          {/* Paper Size Selector & Quick Actions Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-500 uppercase mr-1">Print Size:</span>
              {(['80mm', '58mm', 'A4'] as const).map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setPaperWidth(size)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                    paperWidth === size
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                icon={Copy}
                onClick={handleCopyWhatsApp}
                title="Copy summary for WhatsApp"
              >
                Copy Text
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={Printer}
                onClick={handlePrint}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Print Slip
              </Button>
            </div>
          </div>

          {/* Printable Receipt Canvas */}
          <div className="overflow-y-auto max-h-[60vh] bg-slate-100/80 p-4 rounded-2xl flex justify-center border border-slate-200">
            <div
              ref={printRef}
              style={{
                width: paperWidth === '80mm' ? '320px' : paperWidth === '58mm' ? '240px' : '100%',
                maxWidth: paperWidth === 'A4' ? '680px' : undefined,
              }}
              className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm text-slate-900 font-mono text-xs space-y-3 print:border-none print:shadow-none print:p-0 print:m-0"
            >
              {/* Header */}
              <div className="text-center pb-2 border-b border-dashed border-slate-300 space-y-1">
                <h2 className="text-sm font-black uppercase tracking-wider">{report.businessName}</h2>
                {report.businessPhone && (
                  <p className="text-[11px] text-slate-500">Phone: {report.businessPhone}</p>
                )}
                <div className="pt-1">
                  <span className="inline-block bg-slate-900 text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase">
                    DAILY GALLA · Z-REPORT
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 font-mono pt-0.5">
                  Session: {report.session.sessionNumber}
                </p>
                <p className="text-[10px] text-slate-500">
                  {report.session.sessionDate} · {formatDateTime(report.session.closedAt)}
                </p>
              </div>

              {/* Day Sales Turnover */}
              <div className="space-y-1 pb-2 border-b border-dashed border-slate-300 text-[11px]">
                <div className="font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1">
                  DAY SALES SUMMARY
                </div>
                <div className="flex justify-between">
                  <span>Gross Sales:</span>
                  <span>{formatCurrency(report.grossSales, report.currencySymbol)}</span>
                </div>
                {report.discountTotal > 0 && (
                  <div className="flex justify-between text-slate-500">
                    <span>Discounts:</span>
                    <span>-{formatCurrency(report.discountTotal, report.currencySymbol)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-xs pt-0.5 border-t border-slate-200">
                  <span>Net Turnover:</span>
                  <span>{formatCurrency(report.netSales, report.currencySymbol)}</span>
                </div>
                <div className="flex justify-between text-slate-500 text-[10px]">
                  <span>Total Invoices:</span>
                  <span>{report.salesCount}</span>
                </div>
              </div>

              {/* Payment Mode Collections */}
              <div className="space-y-1 pb-2 border-b border-dashed border-slate-300 text-[11px]">
                <div className="font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1">
                  PAYMENT TENDER
                </div>
                <div className="flex justify-between">
                  <span>Cash Sales:</span>
                  <span className="font-bold">{formatCurrency(report.cashSalesTotal, report.currencySymbol)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Digital (UPI/Card/Bank):</span>
                  <span className="font-bold">{formatCurrency(report.digitalSalesTotal, report.currencySymbol)}</span>
                </div>
                {report.creditKhataTotal > 0 && (
                  <div className="flex justify-between text-amber-700">
                    <span>Customer Credit (Udhar):</span>
                    <span>{formatCurrency(report.creditKhataTotal, report.currencySymbol)}</span>
                  </div>
                )}
                {report.customerCollectionsTotal > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Khata Recovered (Cash):</span>
                    <span>+{formatCurrency(report.customerCollectionsTotal, report.currencySymbol)}</span>
                  </div>
                )}
              </div>

              {/* Cash Register Reconciliation */}
              <div className="space-y-1 pb-2 border-b border-dashed border-slate-300 text-[11px]">
                <div className="font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1">
                  DRAWER RECONCILIATION
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Starting Float:</span>
                  <span>{formatCurrency(report.session.openingFloat, report.currencySymbol)}</span>
                </div>
                <div className="flex justify-between text-emerald-700">
                  <span>Cash Inflow (+):</span>
                  <span>+{formatCurrency(report.session.totalCashIn, report.currencySymbol)}</span>
                </div>
                <div className="flex justify-between text-rose-700">
                  <span>Cash Outflow (-):</span>
                  <span>-{formatCurrency(report.session.totalCashOut, report.currencySymbol)}</span>
                </div>
                <div className="flex justify-between font-bold border-t border-slate-200 pt-1">
                  <span>Expected Cash:</span>
                  <span>{formatCurrency(report.session.expectedCash, report.currencySymbol)}</span>
                </div>
                <div className="flex justify-between font-bold text-xs bg-slate-100 p-1 rounded">
                  <span>Physical Count:</span>
                  <span>{formatCurrency(report.session.countedCash, report.currencySymbol)}</span>
                </div>

                {/* Discrepancy */}
                <div className="flex justify-between font-bold pt-1">
                  <span>Difference:</span>
                  <span
                    className={
                      report.session.difference === 0
                        ? 'text-emerald-700'
                        : report.session.difference > 0
                        ? 'text-amber-700'
                        : 'text-rose-700'
                    }
                  >
                    {report.session.difference === 0
                      ? 'BALANCED (₹0)'
                      : report.session.difference > 0
                      ? `SURPLUS +${formatCurrency(report.session.difference, report.currencySymbol)}`
                      : `SHORTAGE -${formatCurrency(Math.abs(report.session.difference), report.currencySymbol)}`}
                  </span>
                </div>
              </div>

              {/* Denominations breakdown */}
              {report.session.denominations && (
                <div className="space-y-0.5 pb-2 border-b border-dashed border-slate-300 text-[10px] text-slate-600">
                  <div className="font-bold text-slate-700 uppercase text-[9px] mb-0.5">
                    COUNTED NOTES
                  </div>
                  <div className="grid grid-cols-2 gap-x-2">
                    {report.session.denominations.n500 && (
                      <div>500 × {report.session.denominations.n500} = {500 * report.session.denominations.n500}</div>
                    )}
                    {report.session.denominations.n200 && (
                      <div>200 × {report.session.denominations.n200} = {200 * report.session.denominations.n200}</div>
                    )}
                    {report.session.denominations.n100 && (
                      <div>100 × {report.session.denominations.n100} = {100 * report.session.denominations.n100}</div>
                    )}
                    {report.session.denominations.n50 && (
                      <div>50 × {report.session.denominations.n50} = {50 * report.session.denominations.n50}</div>
                    )}
                    {report.session.denominations.n20 && (
                      <div>20 × {report.session.denominations.n20} = {20 * report.session.denominations.n20}</div>
                    )}
                    {report.session.denominations.n10 && (
                      <div>10 × {report.session.denominations.n10} = {10 * report.session.denominations.n10}</div>
                    )}
                    {report.session.denominations.coins && (
                      <div>Coins = {report.session.denominations.coins}</div>
                    )}
                  </div>
                </div>
              )}

              {/* Closing Allocation */}
              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span>Tomorrow Float:</span>
                  <span className="font-bold">
                    {formatCurrency(report.session.nextDayFloat || 0, report.currencySymbol)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Take-Home / Deposit:</span>
                  <span className="font-bold">
                    {formatCurrency(report.session.takeHomeCash || 0, report.currencySymbol)}
                  </span>
                </div>
                {report.session.notes && (
                  <p className="text-[10px] text-slate-500 italic pt-1 border-t border-slate-100">
                    Note: {report.session.notes}
                  </p>
                )}
              </div>

              {/* Footer */}
              <div className="text-center pt-2 border-t border-dashed border-slate-300 text-[10px] text-slate-400">
                <p>*** END OF DAY REPORT ***</p>
                <p className="pt-0.5 text-[9px]">Dukandar Offline Business Manager</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};
