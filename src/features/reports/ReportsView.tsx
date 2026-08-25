import React, { useState } from 'react';
import { SalesReportView } from './SalesReportView';
import { PurchasesReportView } from './PurchasesReportView';
import { ExpensesReportView } from './ExpensesReportView';
import { CashFlowReportView } from './CashFlowReportView';
import { ReceivablesReportView } from './ReceivablesReportView';
import { PayablesReportView } from './PayablesReportView';
import { InventoryReportView } from './InventoryReportView';
import {
  TrendingUp,
  Receipt,
  Truck,
  Wallet,
  Users,
  Building2,
  Package,
  BarChart3,
} from 'lucide-react';

export type ReportTab =
  | 'SALES'
  | 'PURCHASES'
  | 'EXPENSES'
  | 'CASH_FLOW'
  | 'RECEIVABLES'
  | 'PAYABLES'
  | 'INVENTORY';

export const ReportsView: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<ReportTab>('SALES');

  const reportTabs: Array<{ id: ReportTab; label: string; icon: React.FC<{ className?: string }> }> = [
    { id: 'SALES', label: 'Sales & Invoices', icon: Receipt },
    { id: 'PURCHASES', label: 'Purchases & Bills', icon: Truck },
    { id: 'EXPENSES', label: 'Expenses', icon: TrendingUp },
    { id: 'CASH_FLOW', label: 'Cash Flow & Funds', icon: Wallet },
    { id: 'RECEIVABLES', label: 'Receivables', icon: Users },
    { id: 'PAYABLES', label: 'Payables', icon: Building2 },
    { id: 'INVENTORY', label: 'Inventory & Valuation', icon: Package },
  ];

  return (
    <div className="space-y-6 pb-20 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-blue-600" />
            Reports & Business Intelligence
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Read-only financial projections, audit ledgers, and operational metrics.
          </p>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="bg-white p-1.5 rounded-2xl border border-slate-200 shadow-2xs overflow-x-auto">
        <div className="flex items-center gap-1.5 min-w-max">
          {reportTabs.map((tab) => {
            const Icon = tab.icon;
            const active = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setCurrentTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                  active
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${active ? 'text-white' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Tab View */}
      {currentTab === 'SALES' && <SalesReportView />}
      {currentTab === 'PURCHASES' && <PurchasesReportView />}
      {currentTab === 'EXPENSES' && <ExpensesReportView />}
      {currentTab === 'CASH_FLOW' && <CashFlowReportView />}
      {currentTab === 'RECEIVABLES' && <ReceivablesReportView />}
      {currentTab === 'PAYABLES' && <PayablesReportView />}
      {currentTab === 'INVENTORY' && <InventoryReportView />}
    </div>
  );
};
