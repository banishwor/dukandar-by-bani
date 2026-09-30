import React, { useState, useEffect } from 'react';
import { useBusiness } from '../../contexts/BusinessContext';
import {
  LayoutDashboard,
  Receipt,
  Package,
  Users,
  Database,
  Settings,
  ShieldCheck,
  ChevronRight,
  Truck,
  Building2,
  Menu,
  X,
  Plus,
  Landmark,
  Wallet,
  BarChart3,
  Eye,
  EyeOff,
  Lock,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { privacyService } from '../../services/privacyService';
import { CreatePrivacyPinModal } from '../../features/privacy/CreatePrivacyPinModal';
import { PrivacyLockOverlay } from '../../features/privacy/PrivacyLockOverlay';

export type NavTab =
  | 'DASHBOARD'
  | 'SALES'
  | 'NEW_SALE'
  | 'PURCHASES'
  | 'NEW_PURCHASE'
  | 'EXPENSES'
  | 'ACCOUNTS'
  | 'REPORTS'
  | 'ITEMS'
  | 'CUSTOMERS'
  | 'SUPPLIERS'
  | 'SYNC'
  | 'SETTINGS';

interface AppShellProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  currentTab,
  onSelectTab,
  children,
}) => {
  const { business, isOnline, deviceId } = useBusiness();
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [isPrivacyActive, setIsPrivacyActive] = useState<boolean>(() => privacyService.isPrivacyActive());
  const [isCreatePinModalOpen, setIsCreatePinModalOpen] = useState(false);

  const handleTogglePrivacy = () => {
    if (isPrivacyActive) {
      return; // Already locked, unlock happens via PIN in overlay
    }
    if (!privacyService.isPinConfigured()) {
      setIsCreatePinModalOpen(true);
    } else {
      privacyService.setPrivacyActive(true);
      setIsPrivacyActive(true);
    }
  };

  // Keyboard shortcuts: F9 and Alt+H for Privacy Mode, Alt+S for New Sale, Alt+P for New Purchase
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // F9 or Alt+H to trigger Privacy Mode
      if (e.key === 'F9' || (e.altKey && e.key.toLowerCase() === 'h')) {
        e.preventDefault();
        if (!privacyService.isPinConfigured()) {
          setIsCreatePinModalOpen(true);
        } else {
          if (!isPrivacyActive) {
            privacyService.setPrivacyActive(true);
            setIsPrivacyActive(true);
          }
        }
      }

      // Alt+S for New Sale (reserved shortcut)
      if (e.altKey && e.key.toLowerCase() === 's') {
        if (!isPrivacyActive) {
          e.preventDefault();
          onSelectTab('NEW_SALE');
        }
      }

      // Alt+P for New Purchase (reserved shortcut)
      if (e.altKey && e.key.toLowerCase() === 'p') {
        if (!isPrivacyActive) {
          e.preventDefault();
          onSelectTab('NEW_PURCHASE');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPrivacyActive, onSelectTab]);

  const salesNavItems: Array<{ id: NavTab; label: string; icon: React.FC<{ className?: string }> }> = [
    { id: 'DASHBOARD', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'SALES', label: 'Sales & Invoices', icon: Receipt },
    { id: 'CUSTOMERS', label: 'Customers', icon: Users },
  ];

  const purchaseNavItems: Array<{ id: NavTab; label: string; icon: React.FC<{ className?: string }> }> = [
    { id: 'PURCHASES', label: 'Purchases & Bills', icon: Truck },
    { id: 'SUPPLIERS', label: 'Suppliers', icon: Building2 },
    { id: 'ITEMS', label: 'Items & Stock', icon: Package },
  ];

  const financeNavItems: Array<{ id: NavTab; label: string; icon: React.FC<{ className?: string }> }> = [
    { id: 'ACCOUNTS', label: 'Accounts & Funds', icon: Landmark },
    { id: 'EXPENSES', label: 'Expenses', icon: Receipt },
    { id: 'REPORTS', label: 'Reports & BI', icon: BarChart3 },
  ];

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col md:flex-row text-slate-900 font-sans">
      {/* Desktop Sidebar (Visible on md and up) */}
      <aside
        className={`hidden md:flex flex-col w-64 lg:w-72 bg-white border-r border-slate-200/90 shrink-0 sticky top-0 h-screen z-30 transition-opacity ${
          isPrivacyActive ? 'pointer-events-none select-none opacity-70' : ''
        }`}
      >
        {/* Business Brand Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-xs">
              {business?.name ? business.name.substring(0, 2).toUpperCase() : 'BM'}
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-900 truncate leading-tight">
                {business?.name || 'My Business'}
              </h2>
              <span className="text-[11px] text-slate-400 block truncate">
                {business?.currencySymbol} ({business?.currencyCode || 'INR'})
              </span>
            </div>
          </div>
        </div>

        {/* Privacy Mode Quick Toggle in Sidebar */}
        <div className="px-4 pt-2.5 pb-1">
          <button
            onClick={handleTogglePrivacy}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-2xl text-xs font-semibold border transition-all ${
              isPrivacyActive
                ? 'bg-amber-500 text-white border-amber-600 shadow-xs ring-2 ring-amber-300'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200/90 hover:border-slate-300'
            }`}
            title="Privacy Mode: Hide screen from customers (F9 or Alt+H)"
          >
            <span className="flex items-center gap-2">
              {isPrivacyActive ? (
                <EyeOff className="w-3.5 h-3.5 text-white animate-pulse" />
              ) : (
                <Eye className="w-3.5 h-3.5 text-slate-500" />
              )}
              <span>{isPrivacyActive ? 'Screen Hidden' : 'Privacy Mode'}</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd
                className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold ${
                  isPrivacyActive
                    ? 'bg-amber-600 text-white'
                    : 'bg-white border border-slate-200 text-slate-400'
                }`}
              >
                F9
              </kbd>
            </span>
          </button>
        </div>

        {/* Quick Action Buttons */}
        <div className="px-4 py-3 grid grid-cols-2 gap-2">
          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={() => onSelectTab('NEW_SALE')}
            fullWidth
            title="New Sale (Alt+S)"
            className="shadow-sm text-xs font-semibold justify-center bg-blue-600 hover:bg-blue-700 text-white"
          >
            + Sale
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={Plus}
            onClick={() => onSelectTab('NEW_PURCHASE')}
            fullWidth
            title="New Purchase (Alt+P)"
            className="shadow-sm text-xs font-semibold justify-center text-amber-800 border-amber-300 hover:bg-amber-50"
          >
            + Purchase
          </Button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          <div className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Sales & Revenue
          </div>
          {salesNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}

          <div className="pt-4 px-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Purchases & Inventory
          </div>
          {purchaseNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}

          <div className="pt-4 px-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Finance & Ledger
          </div>
          {financeNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}

          <div className="pt-4 px-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            System & Storage
          </div>

          <button
            onClick={() => onSelectTab('SYNC')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              currentTab === 'SYNC'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Database className={`w-4 h-4 ${currentTab === 'SYNC' ? 'text-white' : 'text-slate-400'}`} />
            <span>Data & Sync Readiness</span>
          </button>

          <button
            onClick={() => onSelectTab('SETTINGS')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              currentTab === 'SETTINGS'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Settings className={`w-4 h-4 ${currentTab === 'SETTINGS' ? 'text-white' : 'text-slate-400'}`} />
            <span>Business Settings</span>
          </button>
        </nav>

        {/* Offline Status & Device Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/60 text-xs text-slate-500 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  isOnline ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
              <span className="text-[11px] font-semibold text-slate-700">
                {isOnline ? 'Offline Ready' : 'Working Offline'}
              </span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">Local DB</span>
          </div>

          <div className="flex items-center gap-1 text-[10px] text-slate-400 truncate">
            <ShieldCheck className="w-3 h-3 text-emerald-600 shrink-0" />
            <span className="truncate font-mono">ID: {deviceId.substring(0, 14)}...</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Top Header Bar */}
        <header className="h-16 bg-white border-b border-slate-200/90 sticky top-0 z-20 px-4 sm:px-8 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile Header Title */}
            <div className="md:hidden flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-xs shrink-0">
                {business?.name ? business.name.substring(0, 2).toUpperCase() : 'BM'}
              </div>
              <h1 className="text-sm font-bold text-slate-900 truncate">
                {business?.name || 'Business Manager'}
              </h1>
            </div>

            {/* Desktop Current Location Title */}
            <div className="hidden md:flex items-center gap-2 text-xs font-semibold text-slate-400">
              <span>{business?.name}</span>
              <ChevronRight className="w-3.5 h-3.5" />
              <span className="text-slate-800 capitalize">
                {currentTab.toLowerCase().replace('_', ' ')}
              </span>
            </div>
          </div>

          {/* Right Header Status Badges */}
          <div className="flex items-center gap-2.5">
            {/* Privacy Mode Quick Toggle in Top Bar */}
            <button
              onClick={handleTogglePrivacy}
              className={`h-8 px-2.5 rounded-xl border flex items-center gap-1.5 text-xs font-semibold transition-all ${
                isPrivacyActive
                  ? 'bg-amber-500 text-white border-amber-600 shadow-xs ring-2 ring-amber-300'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
              }`}
              title="Lock screen with Privacy Mode (F9 / Alt+H)"
            >
              {isPrivacyActive ? (
                <EyeOff className="w-3.5 h-3.5 text-white animate-pulse" />
              ) : (
                <Eye className="w-3.5 h-3.5 text-slate-500" />
              )}
              <span className="hidden sm:inline">{isPrivacyActive ? 'Locked' : 'Privacy'}</span>
            </button>

            {/* Offline pill indicator */}
            <div
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                isOnline
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200/70'
                  : 'bg-amber-50 text-amber-800 border-amber-200/70'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isOnline ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
                }`}
              />
              <span className="text-[11px]">
                {isOnline ? 'Offline-First' : 'Working Offline'}
              </span>
            </div>

            {/* Mobile Quick Action Buttons */}
            {currentTab !== 'NEW_SALE' && (
              <button
                onClick={() => onSelectTab('NEW_SALE')}
                className="md:hidden h-8 px-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold flex items-center gap-1 active:scale-95 shadow-xs"
              >
                <Plus className="w-3 h-3" />
                <span>Sale</span>
              </button>
            )}
            {currentTab !== 'NEW_PURCHASE' && (
              <button
                onClick={() => onSelectTab('NEW_PURCHASE')}
                className="md:hidden h-8 px-2.5 rounded-xl bg-amber-800 text-white text-xs font-bold flex items-center gap-1 active:scale-95 shadow-xs"
              >
                <Plus className="w-3 h-3" />
                <span>Purchase</span>
              </button>
            )}
          </div>
        </header>

        {/* Dynamic Page Container */}
        <main className="flex-1 p-4 sm:p-8 overflow-y-auto max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation (Visible on <md) */}
      <div
        className={`md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-2 py-1.5 flex items-center justify-around shadow-lg ${
          isPrivacyActive ? 'pointer-events-none select-none opacity-40' : ''
        }`}
      >
        <button
          onClick={() => onSelectTab('DASHBOARD')}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all ${
            currentTab === 'DASHBOARD' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-700'
          }`}
        >
          <LayoutDashboard className="w-5 h-5" />
          <span className="text-[10px] font-semibold mt-0.5">Home</span>
        </button>

        <button
          onClick={() => onSelectTab('SALES')}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all ${
            currentTab === 'SALES' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-700'
          }`}
        >
          <Receipt className="w-5 h-5" />
          <span className="text-[10px] font-semibold mt-0.5">Sales</span>
        </button>

        <button
          onClick={() => onSelectTab('PURCHASES')}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all ${
            currentTab === 'PURCHASES' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-700'
          }`}
        >
          <Truck className="w-5 h-5" />
          <span className="text-[10px] font-semibold mt-0.5">Purchases</span>
        </button>

        <button
          onClick={() => onSelectTab('SUPPLIERS')}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all ${
            currentTab === 'SUPPLIERS' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-700'
          }`}
        >
          <Building2 className="w-5 h-5" />
          <span className="text-[10px] font-semibold mt-0.5">Vendors</span>
        </button>

        <button
          onClick={() => setMobileMoreOpen(true)}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all ${
            ['CUSTOMERS', 'ITEMS', 'SYNC', 'SETTINGS'].includes(currentTab)
              ? 'text-blue-600'
              : 'text-slate-400 hover:text-slate-700'
          }`}
        >
          <Menu className="w-5 h-5" />
          <span className="text-[10px] font-semibold mt-0.5">More</span>
        </button>
      </div>

      {/* Mobile "More" Drawer */}
      {mobileMoreOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-t-3xl p-5 space-y-4 shadow-2xl border-t border-slate-200">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">More Options</h3>
              <button
                onClick={() => setMobileMoreOpen(false)}
                className="p-1 rounded-full bg-slate-100 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1">
              <button
                onClick={() => {
                  onSelectTab('REPORTS');
                  setMobileMoreOpen(false);
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl text-left text-xs font-bold text-slate-800 hover:bg-slate-100"
              >
                <BarChart3 className="w-4 h-4 text-blue-600" />
                <span>Reports & BI</span>
              </button>

              <button
                onClick={() => {
                  onSelectTab('ACCOUNTS');
                  setMobileMoreOpen(false);
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl text-left text-xs font-bold text-slate-800 hover:bg-slate-100"
              >
                <Landmark className="w-4 h-4 text-blue-600" />
                <span>Accounts & Funds</span>
              </button>

              <button
                onClick={() => {
                  onSelectTab('EXPENSES');
                  setMobileMoreOpen(false);
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl text-left text-xs font-bold text-slate-800 hover:bg-slate-100"
              >
                <Receipt className="w-4 h-4 text-rose-600" />
                <span>Expenses</span>
              </button>

              <button
                onClick={() => {
                  onSelectTab('CUSTOMERS');
                  setMobileMoreOpen(false);
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl text-left text-xs font-bold text-slate-800 hover:bg-slate-100"
              >
                <Users className="w-4 h-4 text-blue-600" />
                <span>Customers</span>
              </button>

              <button
                onClick={() => {
                  onSelectTab('ITEMS');
                  setMobileMoreOpen(false);
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl text-left text-xs font-bold text-slate-800 hover:bg-slate-100"
              >
                <Package className="w-4 h-4 text-emerald-600" />
                <span>Items & Inventory</span>
              </button>

              <button
                onClick={() => {
                  onSelectTab('SYNC');
                  setMobileMoreOpen(false);
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl text-left text-xs font-bold text-slate-800 hover:bg-slate-100"
              >
                <Database className="w-4 h-4 text-purple-600" />
                <span>Data & Sync Readiness</span>
              </button>

              <button
                onClick={() => {
                  onSelectTab('SETTINGS');
                  setMobileMoreOpen(false);
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl text-left text-xs font-bold text-slate-800 hover:bg-slate-100"
              >
                <Settings className="w-4 h-4 text-slate-600" />
                <span>Business Profile & Settings</span>
              </button>
            </div>

            <div className="pt-2 text-[11px] text-slate-400 text-center font-mono">
              Device: {deviceId.substring(0, 18)}...
            </div>
          </div>
        </div>
      )}

      {/* Privacy Lock Screen Overlay (blurs entire screen except left sidebar) */}
      <PrivacyLockOverlay
        isOpen={isPrivacyActive}
        onUnlock={() => setIsPrivacyActive(false)}
        onResetPin={() => setIsCreatePinModalOpen(true)}
      />

      {/* First-Time PIN Setup Modal */}
      <CreatePrivacyPinModal
        isOpen={isCreatePinModalOpen}
        onClose={() => setIsCreatePinModalOpen(false)}
        onPinCreated={() => {
          setIsCreatePinModalOpen(false);
          privacyService.setPrivacyActive(true);
          setIsPrivacyActive(true);
        }}
      />
    </div>
  );
};
