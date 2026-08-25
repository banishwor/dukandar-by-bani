import React, { useEffect, useState } from 'react';
import { db } from '../../db/database';
import { useBusiness } from '../../contexts/BusinessContext';
import { useToast } from '../../components/ui/Toast';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { GoogleBackupCard } from './GoogleBackupCard';
import {
  Database,
  CloudOff,
  ShieldCheck,
  Download,
  Upload,
  RefreshCw,
  Layers,
  Cpu,
  CheckCircle2,
  FileCode,
} from 'lucide-react';

export const SyncReadinessView: React.FC = () => {
  const { business, deviceId, isOnline } = useBusiness();
  const { showSuccess, showError } = useToast();

  const [stats, setStats] = useState<{
    businesses: number;
    items: number;
    customers: number;
    suppliers: number;
    sales: number;
    saleLines: number;
    purchases: number;
    purchaseLines: number;
    stockMovements: number;
    payments: number;
    supplierPayments: number;
    financialAccounts: number;
    financialMovements: number;
    expenses: number;
    expenseCategories: number;
    accountTransfers: number;
    syncRecords: number;
  }>({
    businesses: 0,
    items: 0,
    customers: 0,
    suppliers: 0,
    sales: 0,
    saleLines: 0,
    purchases: 0,
    purchaseLines: 0,
    stockMovements: 0,
    payments: 0,
    supplierPayments: 0,
    financialAccounts: 0,
    financialMovements: 0,
    expenses: 0,
    expenseCategories: 0,
    accountTransfers: 0,
    syncRecords: 0,
  });

  const [loading, setLoading] = useState(true);

  const loadStats = async () => {
    setLoading(true);
    try {
      const [b, i, c, sup, s, sl, pur, purl, sm, p, sp, fa, fm, exp, expCat, trf, sync] =
        await Promise.all([
          db.businesses.count(),
          db.items.count(),
          db.customers.count(),
          db.suppliers.count(),
          db.sales.count(),
          db.saleLines.count(),
          db.purchases.count(),
          db.purchaseLines.count(),
          db.stockMovements.count(),
          db.payments.count(),
          db.supplierPayments.count(),
          db.financialAccounts.count(),
          db.financialMovements.count(),
          db.expenses.count(),
          db.expenseCategories.count(),
          db.accountTransfers.count(),
          db.syncMetadata.count(),
        ]);

      setStats({
        businesses: b,
        items: i,
        customers: c,
        suppliers: sup,
        sales: s,
        saleLines: sl,
        purchases: pur,
        purchaseLines: purl,
        stockMovements: sm,
        payments: p,
        supplierPayments: sp,
        financialAccounts: fa,
        financialMovements: fm,
        expenses: exp,
        expenseCategories: expCat,
        accountTransfers: trf,
        syncRecords: sync,
      });
    } catch (err) {
      console.error('Failed to query DB stats', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  const handleExportBackup = async () => {
    try {
      const [
        businesses,
        items,
        customers,
        suppliers,
        sales,
        saleLines,
        purchases,
        purchaseLines,
        stockMovements,
        payments,
        supplierPayments,
        financialAccounts,
        financialMovements,
        expenses,
        expenseCategories,
        accountTransfers,
        syncMetadata,
      ] = await Promise.all([
        db.businesses.toArray(),
        db.items.toArray(),
        db.customers.toArray(),
        db.suppliers.toArray(),
        db.sales.toArray(),
        db.saleLines.toArray(),
        db.purchases.toArray(),
        db.purchaseLines.toArray(),
        db.stockMovements.toArray(),
        db.payments.toArray(),
        db.supplierPayments.toArray(),
        db.financialAccounts.toArray(),
        db.financialMovements.toArray(),
        db.expenses.toArray(),
        db.expenseCategories.toArray(),
        db.accountTransfers.toArray(),
        db.syncMetadata.toArray(),
      ]);

      const backup = {
        exportedAt: new Date().toISOString(),
        deviceId,
        version: 5,
        data: {
          businesses,
          items,
          customers,
          suppliers,
          sales,
          saleLines,
          purchases,
          purchaseLines,
          stockMovements,
          payments,
          supplierPayments,
          financialAccounts,
          financialMovements,
          expenses,
          expenseCategories,
          accountTransfers,
          syncMetadata,
        },
      };

      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(backup, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute(
        'download',
        `bizmanager-backup-${new Date().toISOString().slice(0, 10)}.json`
      );
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      showSuccess('Local database exported as JSON backup');
    } catch (err) {
      showError('Failed to export database');
    }
  };

  return (
    <div className="space-y-6 pb-16 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Data & Sync Readiness</h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
          Local IndexedDB database architecture, offline status, and future multi-device sync metadata.
        </p>
      </div>

      {/* Primary Architecture Banner */}
      <div className="p-6 bg-slate-900 text-white rounded-3xl border border-slate-800 shadow-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Local Database Single Source of Truth</h2>
              <p className="text-xs text-slate-400">IndexedDB: businessAppDB (Version 1)</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="success" size="md">
              ● Local DB Active
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-300">
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-white block">Persistent Device Identifier</span>
              <span className="font-mono text-[11px] text-slate-400">{deviceId}</span>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <Layers className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-white block">Global Record Identity</span>
              <span className="text-[11px] text-slate-400">
                All records use collision-resistant ULID/UUID identifiers with version vectors.
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Google Cloud Backup (Phase 7A) */}
      <GoogleBackupCard />

      {/* Local Tables Record Counts */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">Local Table Storage Ledger</h3>
            <p className="text-xs text-slate-500">Live count of records saved in user's browser IndexedDB</p>
          </div>
          <Button variant="outline" size="sm" icon={RefreshCw} onClick={loadStats} isLoading={loading}>
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Financial Accounts', count: stats.financialAccounts, color: 'text-blue-500' },
            { label: 'Financial Movements', count: stats.financialMovements, color: 'text-emerald-500' },
            { label: 'Business Expenses', count: stats.expenses, color: 'text-rose-500' },
            { label: 'Account Transfers', count: stats.accountTransfers, color: 'text-purple-500' },
            { label: 'Items & Products', count: stats.items, color: 'text-blue-600' },
            { label: 'Customers', count: stats.customers, color: 'text-purple-600' },
            { label: 'Suppliers', count: stats.suppliers, color: 'text-amber-600' },
            { label: 'Sale Invoices', count: stats.sales, color: 'text-emerald-600' },
            { label: 'Purchases / Bills', count: stats.purchases, color: 'text-indigo-600' },
            { label: 'Stock Movements', count: stats.stockMovements, color: 'text-amber-600' },
            { label: 'Payment Records', count: stats.payments, color: 'text-emerald-600' },
            { label: 'Sync Metadata Ledger', count: stats.syncRecords, color: 'text-blue-500' },
          ].map((col) => (
            <div key={col.label} className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl">
              <span className="text-xs font-semibold text-slate-500 block">{col.label}</span>
              <span className={`text-2xl font-bold font-mono mt-1 block ${col.color}`}>
                {col.count}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Future Google Sheets Sync Architecture Blueprint */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <FileCode className="w-5 h-5 text-blue-600" />
          <h3 className="text-base font-bold text-slate-900">Future Multi-Device Sync Architecture</h3>
        </div>

        <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
          The database schema is pre-architected with <code className="bg-slate-100 px-1.5 py-0.5 rounded text-blue-700 font-mono text-xs">syncMetadata</code>,{' '}
          <code className="bg-slate-100 px-1.5 py-0.5 rounded text-blue-700 font-mono text-xs">version</code> counters,{' '}
          <code className="bg-slate-100 px-1.5 py-0.5 rounded text-blue-700 font-mono text-xs">createdByDeviceId</code>, and{' '}
          <code className="bg-slate-100 px-1.5 py-0.5 rounded text-blue-700 font-mono text-xs">isDeleted</code> soft-deletion flags.
          When Google Sheets sync is connected in the next phase, local records will safely export and resolve multi-device update inboxes without data loss.
        </p>

        <div className="pt-2 flex flex-wrap gap-3">
          <Button variant="outline" icon={Download} onClick={handleExportBackup}>
            Export Database Backup (.JSON)
          </Button>
        </div>
      </div>
    </div>
  );
};
