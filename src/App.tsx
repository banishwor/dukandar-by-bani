import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { BusinessProvider, useBusiness } from './contexts/BusinessContext';
import { storagePersistenceService } from './services/storagePersistenceService';
import { ToastProvider } from './components/ui/Toast';
import { UpdatePrompt } from './components/ui/UpdatePrompt';
import { AppShell, type NavTab } from './components/layout/AppShell';
import { Store, Loader2 } from 'lucide-react';

// Views are code-split per tab: only the first screen (Dashboard for an
// existing business, the setup wizard on first launch) downloads its code
// up front; every other tab loads on demand and is cached by the service
// worker for offline use after the first visit.
const BusinessSetupWizard = lazy(() =>
  import('./features/setup/BusinessSetupWizard').then((m) => ({ default: m.BusinessSetupWizard }))
);
const DashboardView = lazy(() =>
  import('./features/dashboard/DashboardView').then((m) => ({ default: m.DashboardView }))
);
const ItemsView = lazy(() => import('./features/items/ItemsView').then((m) => ({ default: m.ItemsView })));
const CustomersView = lazy(() =>
  import('./features/customers/CustomersView').then((m) => ({ default: m.CustomersView }))
);
const SuppliersView = lazy(() =>
  import('./features/suppliers/SuppliersView').then((m) => ({ default: m.SuppliersView }))
);
const SalesView = lazy(() => import('./features/sales/SalesView').then((m) => ({ default: m.SalesView })));
const NewSaleView = lazy(() =>
  import('./features/sales/NewSaleView').then((m) => ({ default: m.NewSaleView }))
);
const PurchasesView = lazy(() =>
  import('./features/purchases/PurchasesView').then((m) => ({ default: m.PurchasesView }))
);
const NewPurchaseView = lazy(() =>
  import('./features/purchases/NewPurchaseView').then((m) => ({ default: m.NewPurchaseView }))
);
const AccountsView = lazy(() =>
  import('./features/accounts/AccountsView').then((m) => ({ default: m.AccountsView }))
);
const ExpensesView = lazy(() =>
  import('./features/expenses/ExpensesView').then((m) => ({ default: m.ExpensesView }))
);
const ReportsView = lazy(() =>
  import('./features/reports/ReportsView').then((m) => ({ default: m.ReportsView }))
);
const SyncReadinessView = lazy(() =>
  import('./features/sync/SyncReadinessView').then((m) => ({ default: m.SyncReadinessView }))
);
const SettingsView = lazy(() =>
  import('./features/settings/SettingsView').then((m) => ({ default: m.SettingsView }))
);

// Warm-up: after first paint, quietly download the remaining tab chunks in
// the background so the service worker caches them and every tab still
// works offline — exactly as it did with the old single bundle. Without
// this, a tab opened for the first time while offline could not load.
const warmUpLazyChunks = () => {
  const loaders: Array<() => Promise<unknown>> = [
    () => import('./features/setup/BusinessSetupWizard'),
    () => import('./features/dashboard/DashboardView'),
    () => import('./features/items/ItemsView'),
    () => import('./features/customers/CustomersView'),
    () => import('./features/suppliers/SuppliersView'),
    () => import('./features/sales/SalesView'),
    () => import('./features/sales/NewSaleView'),
    () => import('./features/purchases/PurchasesView'),
    () => import('./features/purchases/NewPurchaseView'),
    () => import('./features/accounts/AccountsView'),
    () => import('./features/expenses/ExpensesView'),
    () => import('./features/reports/ReportsView'),
    () => import('./features/sync/SyncReadinessView'),
    () => import('./features/settings/SettingsView'),
    () => import('./features/settings/DataIntegrityRunner'),
  ];
  void (async () => {
    for (const load of loaders) {
      try {
        await load();
      } catch {
        // Offline or transient failure — the chunk is fetched again
        // on demand when its tab is first opened online.
      }
    }
  })();
};

const ViewLoading: React.FC = () => (
  <div className="flex items-center justify-center gap-2 py-24 text-sm font-semibold text-slate-500">
    <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
    <span>Loading…</span>
  </div>
);

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

  // Ask the browser to protect this app's IndexedDB from automatic
  // eviction — all shop data lives on-device, so this is the cheapest
  // data-safety win there is. Best-effort; the real status is shown in
  // Settings → Local Data Protection.
  useEffect(() => {
    void storagePersistenceService.requestPersistentStorage();
  }, []);

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

  // Background-download the lazy tab chunks once the app is interactive.
  useEffect(() => {
    const w = window as typeof window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof w.requestIdleCallback === 'function') {
      const id = w.requestIdleCallback(warmUpLazyChunks, { timeout: 3000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const timer = setTimeout(warmUpLazyChunks, 2000);
    return () => clearTimeout(timer);
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
    return (
      <Suspense fallback={<ViewLoading />}>
        <BusinessSetupWizard />
      </Suspense>
    );
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
      <Suspense fallback={<ViewLoading />}>
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
      </Suspense>
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
