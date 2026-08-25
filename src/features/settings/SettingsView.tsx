import React, { useState, useEffect } from 'react';
import { useBusiness } from '../../contexts/BusinessContext';
import { useToast } from '../../components/ui/Toast';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Store, ShieldCheck, Save, Trash2, Smartphone } from 'lucide-react';
import { db } from '../../db/database';
import { DataIntegrityRunner } from './DataIntegrityRunner';

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
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (business) {
      setName(business.name || '');
      setType(business.type || '');
      setPhone(business.phone || '');
      setEmail(business.email || '');
      setAddress(business.address || '');
      setCurrencySymbol(business.currencySymbol || '₹');
      setCurrencyCode(business.currencyCode || 'INR');
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
      });
      showSuccess('Business profile updated');
    } catch (err) {
      showError('Failed to update business profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetDatabase = async () => {
    if (
      window.confirm(
        'WARNING: This will erase all local database records on this device and return to initial setup. Are you sure?'
      )
    ) {
      try {
        await db.delete();
        window.location.reload();
      } catch (err) {
        showError('Failed to reset database');
      }
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

      {/* Automated Data Integrity Verification Suite */}
      <DataIntegrityRunner />

      {/* Danger Zone */}
      <div className="bg-white rounded-3xl border border-rose-200 shadow-xs p-6 space-y-4">
        <div>
          <h3 className="text-base font-bold text-rose-900">Database Reset (Testing)</h3>
          <p className="text-xs text-rose-700 mt-0.5">
            Completely clears this browser's IndexedDB database to test initial onboarding from scratch.
          </p>
        </div>

        <Button
          type="button"
          variant="danger"
          size="sm"
          icon={Trash2}
          onClick={handleResetDatabase}
        >
          Reset Local Database
        </Button>
      </div>
    </div>
  );
};
