import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BusinessProvider, useBusiness } from './contexts/BusinessContext';
import { ToastProvider } from './components/ui/Toast';
import { UpdatePrompt } from './components/ui/UpdatePrompt';
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

const NAV_TABS: NavTab[] = [
  'DASHBOARD',
  'SALES',
  'NEW_SALE',
  'PURCHASES',
  'NEW_PURCHASE',
  'EXPENSES',
  'ACCOUNTS',
  'REPORTS',
  'ITEMS',
  'CUSTOMERS',
  'SUPPLIERS',
  'SYNC',
  'SETTINGS',
];

const MainAppContent: React.FC = () => {
  const { business, isLoading } = useBusiness();
  const [currentTab, setCurrentTab] = useState<NavTab>('DASHBOARD');
  const [targetSaleId, setTargetSaleId] = useState<string | null>(null);
  const [targetPurchaseId, setTargetPurchaseId] = useState<string | null>(null);
  const [itemFilterOverride, setItemFilterOverride] = useState<any>(undefined);

  // Tab navigation is mirrored into browser history so the Android/browser
  // Back button steps back through visited tabs instead of leaving the app.
  useEffect(() => {
    if (!window.history.state?.dukandarTab) {
      window.history.replaceState({ dukandarTab: 'DASHBOARD' }, '');
    }
    const handlePopState = (event: PopStateEvent) => {
      const tab = event.state?.dukandarTab as NavTab | undefined;
      if (tab && NAV_TABS.includes(tab)) {
        setCurrentTab(tab);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const currentTabRef = useRef<NavTab>('DASHBOARD');

  useEffect(() => {
    currentTabRef.current = currentTab;
  }, [currentTab]);

  const navigateToTab = useCallback((tab: NavTab) => {
    if (currentTabRef.current !== tab) {
      window.history.pushState({ dukandarTab: tab }, '');
      currentTabRef.current = tab;
    }
    setCurrentTab(tab);
  }, []);

  const handleDashboardNavigate = (tab: NavTab, filter?: string) => {
    if (tab === 'ITEMS' && filter) {
      setItemFilterOverride(filter);
    }
    navigateToTab(tab);
  };


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
    navigateToTab('SALES');
  };

  const handleSelectSaleFromCustomer = (saleId: string) => {
    setTargetSaleId(saleId);
    navigateToTab('SALES');
  };

  const handlePurchaseCompleted = (purchaseId: string) => {
    setTargetPurchaseId(purchaseId);
    navigateToTab('PURCHASES');
  };

  const handleSelectPurchaseFromSupplier = (purchaseId: string) => {
    setTargetPurchaseId(purchaseId);
    navigateToTab('PURCHASES');
  };

  return (
    <AppShell currentTab={currentTab} onSelectTab={navigateToTab}>
      {currentTab === 'DASHBOARD' && (
        <DashboardView onNavigate={handleDashboardNavigate} />
      )}

      {currentTab === 'ITEMS' && (
        <ItemsView
          initialFilter={itemFilterOverride}
          onFilterChanged={() => setItemFilterOverride(undefined)}
        />
      )}

      {currentTab === 'CUSTOMERS' && (
        <CustomersView onSelectSale={handleSelectSaleFromCustomer} />
      )}

      {currentTab === 'SUPPLIERS' && (
        <SuppliersView onSelectPurchase={handleSelectPurchaseFromSupplier} />
      )}

      {currentTab === 'SALES' && (
        <SalesView
          onNewSaleClick={() => navigateToTab('NEW_SALE')}
          initialSelectedSaleId={targetSaleId}
        />
      )}

      {currentTab === 'NEW_SALE' && (
        <NewSaleView
          onSaleCompleted={handleSaleCompleted}
          onCancel={() => navigateToTab('SALES')}
        />
      )}

      {currentTab === 'PURCHASES' && (
        <PurchasesView
          onNewPurchaseClick={() => navigateToTab('NEW_PURCHASE')}
          initialSelectedPurchaseId={targetPurchaseId}
        />
      )}

      {currentTab === 'NEW_PURCHASE' && (
        <NewPurchaseView
          onPurchaseCompleted={handlePurchaseCompleted}
          onCancel={() => navigateToTab('PURCHASES')}
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
        <UpdatePrompt />
      </ToastProvider>
    </BusinessProvider>
  );
}
