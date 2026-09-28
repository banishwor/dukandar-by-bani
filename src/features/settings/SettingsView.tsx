import React, { useState, useEffect } from 'react';
import { useBusiness } from '../../contexts/BusinessContext';
import { useToast } from '../../components/ui/Toast';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Store, ShieldCheck, Save, Trash2, Smartphone, Database, Sparkles, CheckCircle2, AlertTriangle } from 'lucide-react';
import { db } from '../../db/database';
import { DataIntegrityRunner } from './DataIntegrityRunner';
import { sampleDataService, type SampleDataSummary } from '../../services/sampleDataService';

export const SettingsView: React.FC = () => {
  const { business, updateBusiness, deviceId } = useBusiness();
  const { showSuccess, showError } = useToast();

  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [currencySymbol, setCurrencySymbol] = useState('₹');
  const [currencyCode, setCurrencyCode] = useState('INR');
  const [allowNegativeStock, setAllowNegativeStock] = useState(true);
  const [enableExpiryTracking, setEnableExpiryTracking] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingSampleData, setIsLoadingSampleData] = useState(false);
  const [sampleLoadedSummary, setSampleLoadedSummary] = useState<SampleDataSummary | null>(null);

  useEffect(() => {
    if (business) {
      setName(business.name || '');
      setType(business.type || '');
      setPhone(business.phone || '');
      setEmail(business.email || '');
      setAddress(business.address || '');
      setCurrencySymbol(business.currencySymbol || '₹');
      setCurrencyCode(business.currencyCode || 'INR');
      setAllowNegativeStock(business.allowNegativeStock !== false);
      setEnableExpiryTracking(business.enableExpiryTracking === true);
    }
  }, [business]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showError('Business name cannot be empty');
      return;
    }

    try {
      setIsSaving(true);
      await updateBusiness({
        name: name.trim(),
        type: type.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        currencySymbol: currencySymbol.trim() || '₹',
        currencyCode: currencyCode.trim() || 'INR',
        allowNegativeStock,
        enableExpiryTracking,
      });
      showSuccess('Business profile updated');
    } catch (err) {
      showError('Failed to update business profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadSampleData = async () => {
    if (!business) return;
    try {
      setIsLoadingSampleData(true);
      const summary = await sampleDataService.loadSampleData(business.id);
      setSampleLoadedSummary(summary);
      showSuccess(
        `Loaded ${summary.itemsCount} products, ${summary.customersCount} customers, ${summary.salesCount} sales, and ${summary.purchasesCount} purchases!`
      );
    } catch (err: any) {
      console.error('Failed to load sample data', err);
      showError(err.message || 'Failed to load sample data');
    } finally {
      setIsLoadingSampleData(false);
    }
  };

  const [isClearingData, setIsClearingData] = useState(false);
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [isResetDbModalOpen, setIsResetDbModalOpen] = useState(false);

  const handleExecuteClearData = async () => {
    if (!business) return;
    try {
      setIsClearingData(true);
      await sampleDataService.clearBusinessData(business.id);
      setSampleLoadedSummary(null);
      setIsClearModalOpen(false);
      showSuccess('All sample and transaction data cleared. You have a completely fresh slate!');
    } catch (err: any) {
      console.error('Failed to clear data', err);
      showError(err.message || 'Failed to clear data');
    } finally {
      setIsClearingData(false);
    }
  };

  const handleExecuteResetDatabase = async () => {
    try {
      await db.delete();
      window.location.reload();
    } catch (err) {
      showError('Failed to reset database');
    }
  };

  return (
    <div className="space-y-6 pb-16 max-w-3xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Business Settings</h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
          Manage your store identity, currency, and local device configurations.
        </p>
      </div>

      <form onSubmit={handleSave} className="bg-white rounded-3xl border border-slate-200 shadow-xs p-6 space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
          <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Store className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Profile Information</h3>
            <p className="text-xs text-slate-500">Details printed on receipts and invoices</p>
          </div>
        </div>

        <div className="space-y-4">
          <Input
            label="Business Name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Business Category / Type"
              value={type}
              onChange={(e) => setType(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                label="Currency Symbol"
                value={currencySymbol}
                onChange={(e) => setCurrencySymbol(e.target.value)}
              />
              <Input
                label="Currency Code"
                value={currencyCode}
                onChange={(e) => setCurrencyCode(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Contact Phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <Input
              label="Contact Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5 text-left">
            <label className="text-xs font-semibold text-slate-700">Business Address</label>
            <textarea
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          {/* Real-World Retail POS Policy: Negative Stock Billing */}
          <div className="pt-2">
            <label className="flex items-start gap-3 p-3.5 rounded-2xl border border-slate-200 bg-slate-50/60 hover:bg-slate-50 cursor-pointer transition-all">
              <input
                type="checkbox"
                checked={allowNegativeStock}
                onChange={(e) => setAllowNegativeStock(e.target.checked)}
                className="mt-0.5 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
              />
              <div>
                <span className="text-xs font-bold text-slate-800 block">
                  Allow Negative Stock Sales (Real-World Retail Mode)
                </span>
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  Allows cashiers to bill items even if current stock is 0 or unrecorded. Stock balances will automatically reconcile when purchases are recorded later.
                </span>
              </div>
            </label>
          </div>

          {/* Expiry Tracking Feature Toggle */}
          <div className="pt-1">
            <label className="flex items-start gap-3 p-3.5 rounded-2xl border border-slate-200 bg-slate-50/60 hover:bg-slate-50 cursor-pointer transition-all">
              <input
                type="checkbox"
                checked={enableExpiryTracking}
                onChange={(e) => setEnableExpiryTracking(e.target.checked)}
                className="mt-0.5 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
              />
              <div>
                <span className="text-xs font-bold text-slate-800 block">
                  Enable Expiry Date Tracking (FMCG, Grocery, Dairy & Pharma)
                </span>
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  Shows an "EXP. DATE" column in the billing register and enables per-batch expiration monitoring. Disable this if your store sells apparel, hardware, or non-perishables.
                </span>
              </div>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-slate-100">
          <span className="text-xs text-slate-400 font-mono">
            Device: {deviceId.substring(0, 18)}...
          </span>
          <Button type="submit" variant="primary" isLoading={isSaving} icon={Save}>
            Save Changes
          </Button>
        </div>
      </form>

      {/* Demo & Sample Data Loading Card */}
      <div className="bg-gradient-to-br from-blue-50/80 to-indigo-50/50 rounded-3xl border border-blue-200/80 shadow-xs p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-sm">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Sample & Demo Data</h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Quickly populate test products, customers, suppliers, purchases, and sales for immediate testing.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white/90 backdrop-blur-xs rounded-2xl p-4 border border-blue-100 text-xs space-y-2 text-slate-600">
          <div className="font-semibold text-slate-800">What will be loaded:</div>
          <ul className="list-disc list-inside space-y-1 pl-1">
            <li><strong>10 Products:</strong> Milk, Atta, Oil, Salt, Chocolates, Maggi, Biscuits, Detergent, Tea, Soap with SKU, Barcodes & Stock.</li>
            <li><strong>4 Customers:</strong> Including Khata and UPI customers with credit tracking.</li>
            <li><strong>2 Suppliers:</strong> FMCG & Dairy distributors.</li>
            <li><strong>Transactions:</strong> 2 Inbound Purchases, 4 Sales (Cash, Khata, UPI discount, Partial), and 1 Khata Payment.</li>
          </ul>
        </div>

        {sampleLoadedSummary && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              Successfully loaded {sampleLoadedSummary.itemsCount} products, {sampleLoadedSummary.customersCount} customers, {sampleLoadedSummary.salesCount} sales, and {sampleLoadedSummary.purchasesCount} purchases.
            </span>
          </div>
        )}

        <div className="pt-1 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="primary"
            icon={Sparkles}
            isLoading={isLoadingSampleData}
            onClick={handleLoadSampleData}
          >
            Load Sample Data
          </Button>
          <Button
            type="button"
            variant="outline"
            icon={Trash2}
            isLoading={isClearingData}
            onClick={() => setIsClearModalOpen(true)}
            className="border-rose-200 text-rose-600 hover:bg-rose-50"
          >
            Clear Sample Data (Fresh Start)
          </Button>
        </div>
      </div>

      {/* Automated Data Integrity Verification Suite */}
      <DataIntegrityRunner />

      {/* Danger Zone */}
      <div className="bg-white rounded-3xl border border-rose-200 shadow-xs p-6 space-y-4">
        <div>
          <h3 className="text-base font-bold text-rose-900">Database Reset (Testing)</h3>
          <p className="text-xs text-rose-700 mt-0.5">
            Completely clears all local store data from this device to restart initial onboarding from scratch.
          </p>
        </div>

        <Button
          type="button"
          variant="danger"
          size="sm"
          icon={Trash2}
          onClick={() => setIsResetDbModalOpen(true)}
        >
          Reset Local Database
        </Button>
      </div>

      {/* Clear Sample Data Confirmation Modal */}
      <Modal
        isOpen={isClearModalOpen}
        onClose={() => setIsClearModalOpen(false)}
        title="Clear Store Data & Start Fresh?"
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 text-rose-800 text-xs">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-sm">Permanent Action</p>
              <p className="mt-0.5 leading-relaxed text-rose-700">
                This will delete all products, stock movements, customers, suppliers, purchases, and sales in this store.
                Your business profile and settings will remain completely intact.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              variant="outline"
              type="button"
              onClick={() => setIsClearModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              type="button"
              icon={Trash2}
              isLoading={isClearingData}
              onClick={handleExecuteClearData}
            >
              Yes, Clear Everything
            </Button>
          </div>
        </div>
      </Modal>

      {/* Reset Entire Database Confirmation Modal */}
      <Modal
        isOpen={isResetDbModalOpen}
        onClose={() => setIsResetDbModalOpen(false)}
        title="Reset Entire Local Database?"
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 text-rose-800 text-xs">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-sm">Destructive Action</p>
              <p className="mt-0.5 leading-relaxed text-rose-700">
                This will completely erase all local store data from this device, including store profile and credentials, returning to the initial onboarding screen.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              variant="outline"
              type="button"
              onClick={() => setIsResetDbModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              type="button"
              icon={Trash2}
              onClick={handleExecuteResetDatabase}
            >
              Yes, Reset Database
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
