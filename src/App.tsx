import React, { useState } from 'react';
import { BusinessProvider, useBusiness } from './contexts/BusinessContext';
import { ToastProvider } from './components/ui/Toast';
import { BusinessSetupWizard } from './features/setup/BusinessSetupWizard';
import { AppShell, type NavTab } from './components/layout/AppShell';
import { DashboardView } from './features/dashboard/DashboardView';
import { ItemsView } from './features/items/ItemsView';
import { CustomersView } from './features/customers/CustomersView';
import { SuppliersView } from './features/suppliers/SuppliersView';
import { SalesView } from './features/sales/SalesView';
import { NewSaleView } from './features/sales/NewSaleView';
import { PurchasesView } from './features/purchases/PurchasesView';
import { NewPurchaseView } from './features/purchases/NewPurchaseView';
import { AccountsView } from './features/accounts/AccountsView';
import { ExpensesView } from './features/expenses/ExpensesView';
import { ReportsView } from './features/reports/ReportsView';
import { SyncReadinessView } from './features/sync/SyncReadinessView';
import { SettingsView } from './features/settings/SettingsView';
import { Store, Loader2 } from 'lucide-react';

const MainAppContent: React.FC = () => {
  const { business, isLoading } = useBusiness();
  const [currentTab, setCurrentTab] = useState<NavTab>('DASHBOARD');
  const [targetSaleId, setTargetSaleId] = useState<string | null>(null);
  const [targetPurchaseId, setTargetPurchaseId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white p-4">
        <div className="w-12 h-12 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 mb-4 animate-pulse">
          <Store className="w-6 h-6" />
        </div>
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
          <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
          <span>Opening local database...</span>
        </div>
      </div>
    );
  }

  // If no business exists on first launch -> Onboarding Setup Wizard
  if (!business) {
    return <BusinessSetupWizard />;
  }

  const handleSaleCompleted = (saleId: string) => {
    setTargetSaleId(saleId);
    setCurrentTab('SALES');
  };

  const handleSelectSaleFromCustomer = (saleId: string) => {
    setTargetSaleId(saleId);
    setCurrentTab('SALES');
  };

  const handlePurchaseCompleted = (purchaseId: string) => {
    setTargetPurchaseId(purchaseId);
    setCurrentTab('PURCHASES');
  };

  const handleSelectPurchaseFromSupplier = (purchaseId: string) => {
    setTargetPurchaseId(purchaseId);
    setCurrentTab('PURCHASES');
  };

  return (
    <AppShell currentTab={currentTab} onSelectTab={setCurrentTab}>
      {currentTab === 'DASHBOARD' && (
        <DashboardView onNavigate={(tab) => setCurrentTab(tab)} />
      )}

      {currentTab === 'ITEMS' && <ItemsView />}

      {currentTab === 'CUSTOMERS' && (
        <CustomersView onSelectSale={handleSelectSaleFromCustomer} />
      )}

      {currentTab === 'SUPPLIERS' && (
        <SuppliersView onSelectPurchase={handleSelectPurchaseFromSupplier} />
      )}

      {currentTab === 'SALES' && (
        <SalesView
          onNewSaleClick={() => setCurrentTab('NEW_SALE')}
          initialSelectedSaleId={targetSaleId}
        />
      )}

      {currentTab === 'NEW_SALE' && (
        <NewSaleView
          onSaleCompleted={handleSaleCompleted}
          onCancel={() => setCurrentTab('SALES')}
        />
      )}

      {currentTab === 'PURCHASES' && (
        <PurchasesView
          onNewPurchaseClick={() => setCurrentTab('NEW_PURCHASE')}
          initialSelectedPurchaseId={targetPurchaseId}
        />
      )}

      {currentTab === 'NEW_PURCHASE' && (
        <NewPurchaseView
          onPurchaseCompleted={handlePurchaseCompleted}
          onCancel={() => setCurrentTab('PURCHASES')}
        />
      )}

      {currentTab === 'ACCOUNTS' && <AccountsView />}

      {currentTab === 'EXPENSES' && <ExpensesView />}

      {currentTab === 'REPORTS' && <ReportsView />}

      {currentTab === 'SYNC' && <SyncReadinessView />}

      {currentTab === 'SETTINGS' && <SettingsView />}
    </AppShell>
  );
};

export default function App() {
  return (
    <BusinessProvider>
      <ToastProvider>
        <MainAppContent />
      </ToastProvider>
    </BusinessProvider>
  );
}
