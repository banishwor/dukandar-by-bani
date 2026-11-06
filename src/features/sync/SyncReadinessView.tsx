import React, { useEffect, useRef, useState } from 'react';
import { db } from '../../db/database';
import { useBusiness } from '../../contexts/BusinessContext';
import { useToast } from '../../components/ui/Toast';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { GoogleBackupCard } from './GoogleBackupCard';
import { backupSnapshotService } from '../../services/backup/backupSnapshotService';
import { googleBackupRestoreService } from '../../services/restore/googleBackupRestoreService';
import {
  parseBackupFileText,
  LEGACY_EXPORT_MESSAGE,
} from '../../services/restore/localBackupFileService';
import { formatDateTime } from '../../utils/formatters';
import type { BusinessBackupSnapshot, BackupSummary } from '../../types/backup';
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
  AlertTriangle,
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

  // Export now produces the FULL snapshot format (all 31 collections for
  // this business only, with an integrity checksum) — the same format the
  // Google Drive backup uses, and the only format Restore accepts. The old
  // ad-hoc export silently omitted returns, voids, refunds, reversals and
  // allocations and mixed every business on the device into one file.
  const handleExportBackup = async () => {
    if (!business) {
      showError('No active business to export');
      return;
    }
    try {
      const snapshot = await backupSnapshotService.createBackupSnapshot(business.id);
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', url);
      const safeName = business.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      downloadAnchor.setAttribute(
        'download',
        `dukandar-backup-${safeName}-${new Date().toISOString().slice(0, 10)}.json`
      );
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      URL.revokeObjectURL(url);
      showSuccess('Full backup exported — every record type, with integrity checksum');
    } catch (err: any) {
      showError(err?.message || 'Failed to export database');
    }
  };

  // ---- Restore from a local backup file --------------------------------
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [pendingSnapshot, setPendingSnapshot] = useState<BusinessBackupSnapshot | null>(null);
  const [pendingSummary, setPendingSummary] = useState<BackupSummary | null>(null);
  const [pendingWarnings, setPendingWarnings] = useState<string[]>([]);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState('');

  const handleBackupFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-choosing the same file
    if (!file || !business) return;
    setImportNotice(null);
    try {
      const parsed = parseBackupFileText(await file.text());
      if (parsed.kind === 'legacy') {
        setImportNotice(LEGACY_EXPORT_MESSAGE);
        return;
      }
      const snapshot = parsed.snapshot;
      if (snapshot.metadata.businessId !== business.id) {
        setImportNotice(
          `This backup belongs to "${snapshot.metadata.businessName}", not "${business.name}". ` +
            'A backup can only be restored into the same business it was exported from.'
        );
        return;
      }
      const validation = await backupSnapshotService.validateBackupSnapshot(snapshot);
      if (!validation.isValid) {
        setImportNotice(
          'That backup file failed integrity checks and was not restored: ' +
            validation.errors.map((err) => err.message).join('; ')
        );
        return;
      }
      setPendingWarnings(validation.warnings);
      setPendingSummary(backupSnapshotService.getBackupSummary(snapshot));
      setPendingSnapshot(snapshot);
    } catch (err: any) {
      setImportNotice(err?.message || 'Could not read that backup file.');
    }
  };

  const handleConfirmRestore = async () => {
    if (!business || !pendingSnapshot) return;
    setIsRestoring(true);
    setRestoreProgress('Starting restore…');
    try {
      const result = await googleBackupRestoreService.executeRestore(
        business.id,
        pendingSnapshot,
        (p) => setRestoreProgress(p.message)
      );
      setPendingSnapshot(null);
      setPendingSummary(null);
      await loadStats();
      showSuccess(
        `Backup restored: ${result.restoredRecordCount} records, financial reconciliation passed`
      );
    } catch (err: any) {
      showError(err?.message || 'Restore failed');
    } finally {
      setIsRestoring(false);
      setRestoreProgress('');
    }
  };

  return (
    <div className="space-y-6 pb-16 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Data & Sync Readiness</h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
          Local device storage architecture, offline security status, and multi-device sync metadata.
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
              <p className="text-xs text-slate-400">Storage Engine: High-Performance Device Database</p>
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
            <p className="text-xs text-slate-500">Live count of business records saved securely on this device</p>
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
          <Button variant="outline" icon={Upload} onClick={() => fileInputRef.current?.click()}>
            Restore from Backup File (.JSON)
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            aria-label="Choose a Dukandar backup JSON file to restore"
            onChange={handleBackupFileChosen}
          />
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          The export is a complete backup of this business only — every record type, including
          returns, voids, refunds and payment allocations — protected by an integrity checksum.
          Restoring replaces this business's current data with the backup; a safety copy of the
          current data is taken automatically first, and the restore rolls back by itself if any
          check fails.
        </p>
        {importNotice && (
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 text-amber-800 text-xs">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed">{importNotice}</p>
          </div>
        )}
      </div>

      {/* Restore confirmation */}
      <Modal
        isOpen={pendingSnapshot !== null}
        onClose={() => {
          if (!isRestoring) {
            setPendingSnapshot(null);
            setPendingSummary(null);
          }
        }}
        title="Restore this backup?"
        maxWidth="md"
      >
        {pendingSummary && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-slate-500 block">Business</span>
                <strong className="text-slate-800">{pendingSummary.businessName}</strong>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-slate-500 block">Backup taken</span>
                <strong className="text-slate-800">{formatDateTime(pendingSummary.createdAt)}</strong>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-slate-500 block">Total records</span>
                <strong className="text-slate-800">{pendingSummary.totalRecords}</strong>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-slate-500 block">File size</span>
                <strong className="text-slate-800">{pendingSummary.sizeFormatted}</strong>
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Includes {pendingSummary.recordCounts.items} items, {pendingSummary.recordCounts.customers}{' '}
              customers, {pendingSummary.recordCounts.sales} sales and{' '}
              {pendingSummary.recordCounts.purchases} purchases.
            </p>
            {pendingWarnings.length > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-1">
                {pendingWarnings.slice(0, 3).map((w, i) => (
                  <p key={i}>{w}</p>
                ))}
              </div>
            )}
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 leading-relaxed">
              This <strong>replaces all current data</strong> for this business with the backup.
              A safety copy of the current data is created automatically before anything changes,
              and if the post-restore financial check fails, the app rolls back to that safety copy
              on its own.
            </div>
            {isRestoring && restoreProgress && (
              <p className="text-xs font-semibold text-blue-700">{restoreProgress}</p>
            )}
            <div className="flex items-center justify-end gap-3 pt-1">
              <Button
                variant="outline"
                type="button"
                disabled={isRestoring}
                onClick={() => {
                  setPendingSnapshot(null);
                  setPendingSummary(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                type="button"
                icon={Upload}
                isLoading={isRestoring}
                onClick={handleConfirmRestore}
              >
                Restore Backup
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
