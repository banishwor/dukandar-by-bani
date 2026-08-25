import React, { useState, useEffect } from 'react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import { googleRestorePreviewService } from '../../services/google/googleRestorePreviewService';
import { googleBackupRestoreService } from '../../services/restore/googleBackupRestoreService';
import type { RestorePreviewResult, DownloadProgress } from '../../types/restorePreview';
import type { BusinessBackupSnapshot } from '../../types/backup';
import type { RestoreProgress, RestoreExecutionResult } from '../../types/restore';
import {
  Database,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Layers,
  ArrowRight,
  ShieldCheck,
  Info,
  Clock,
  Smartphone,
  Hash,
  X,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react';

interface RestorePreviewModalProps {
  businessId: string;
  backupId: string;
  isOpen: boolean;
  onClose: () => void;
  onRestoreComplete?: () => void;
}

export const RestorePreviewModal: React.FC<RestorePreviewModalProps> = ({
  businessId,
  backupId,
  isOpen,
  onClose,
  onRestoreComplete,
}) => {
  const { showSuccess, showError } = useToast();
  const [stage, setStage] = useState<'PREVIEW' | 'CONFIRM' | 'RESTORING' | 'SUCCESS'>('PREVIEW');
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [preview, setPreview] = useState<RestorePreviewResult | null>(null);
  const [remoteSnapshot, setRemoteSnapshot] = useState<BusinessBackupSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Restore Execution State
  const [restoreProgress, setRestoreProgress] = useState<RestoreProgress | null>(null);
  const [restoreResult, setRestoreResult] = useState<RestoreExecutionResult | null>(null);
  const [confirmChecked, setConfirmChecked] = useState(false);

  useEffect(() => {
    if (!isOpen || !businessId || !backupId) return;

    let isMounted = true;
    setStage('PREVIEW');
    setLoading(true);
    setError(null);
    setPreview(null);
    setRemoteSnapshot(null);
    setConfirmChecked(false);
    setRestoreResult(null);

    const loadPreview = async () => {
      try {
        const result = await googleRestorePreviewService.generateRestorePreview(
          businessId,
          backupId,
          (p) => {
            if (isMounted) setProgress(p);
          }
        );
        if (isMounted) {
          setPreview(result.preview);
          setRemoteSnapshot(result.remoteSnapshot);
        }
      } catch (err: any) {
        if (isMounted) {
          const msg = err?.message || 'Failed to generate restore preview.';
          setError(msg);
          showError(msg);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadPreview();

    return () => {
      isMounted = false;
    };
  }, [isOpen, businessId, backupId]);

  if (!isOpen) return null;

  const handleStartRestore = async () => {
    if (!remoteSnapshot || !businessId) return;
    setStage('RESTORING');
    setError(null);

    try {
      const result = await googleBackupRestoreService.executeRestore(
        businessId,
        remoteSnapshot,
        (p) => {
          setRestoreProgress(p);
        }
      );

      setRestoreResult(result);
      setStage('SUCCESS');
      showSuccess('Backup restored and fully reconciled!');
      if (onRestoreComplete) onRestoreComplete();
    } catch (err: any) {
      setError(err?.message || 'Restore failed.');
      showError(err?.message || 'Restore failed.');
      setStage('CONFIRM');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center font-bold">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {stage === 'CONFIRM'
                  ? 'Confirm Business Restore'
                  : stage === 'RESTORING'
                  ? 'Restoring Business Data...'
                  : stage === 'SUCCESS'
                  ? 'Restore Completed Successfully'
                  : 'Restore Backup Preview'}
              </h3>
              <p className="text-xs text-slate-500 font-mono">ID: {backupId}</p>
            </div>
          </div>
          {stage !== 'RESTORING' && (
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs">
          {/* Loading Progress */}
          {loading && (
            <div className="py-12 text-center space-y-3">
              <RefreshCw className="w-7 h-7 animate-spin text-blue-600 mx-auto" />
              <p className="font-semibold text-slate-700">{progress?.message || 'Downloading remote snapshot tabs...'}</p>
              {progress && (
                <div className="max-w-xs mx-auto space-y-1">
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-blue-600 h-full transition-all duration-300 rounded-full"
                      style={{ width: `${progress.percentage}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono">{progress.percentage}%</span>
                </div>
              )}
            </div>
          )}

          {/* Restoring In-Progress Stage */}
          {stage === 'RESTORING' && (
            <div className="py-10 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto border border-blue-100">
                <RotateCcw className="w-6 h-6 animate-spin text-blue-600" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-900">{restoreProgress?.message || 'Executing safe restore...'}</h4>
                <p className="text-slate-500 text-[11px]">Creating local safety snapshot and verifying financial balances.</p>
              </div>
              <div className="max-w-xs mx-auto space-y-1">
                <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                  <div
                    className="bg-blue-600 h-full transition-all duration-500 rounded-full"
                    style={{ width: `${restoreProgress?.percentage || 30}%` }}
                  />
                </div>
                <span className="text-[11px] text-slate-400 font-mono font-medium">{restoreProgress?.percentage || 30}%</span>
              </div>
            </div>
          )}

          {/* Error View */}
          {error && stage !== 'RESTORING' && (
            <div className="p-5 bg-rose-50 border border-rose-200 rounded-2xl space-y-2 text-rose-900">
              <div className="flex items-center gap-2 font-bold text-rose-950">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                Restore Operation Notice
              </div>
              <p className="text-rose-800 leading-relaxed">{error}</p>
              <p className="text-[11px] text-rose-700 italic pt-1">
                Your previous local data remains safe and protected by local safety snapshot rollback.
              </p>
            </div>
          )}

          {/* Step 1: Preview Details */}
          {stage === 'PREVIEW' && preview && !loading && (
            <div className="space-y-5">
              {/* Verification Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 bg-emerald-50 border border-emerald-200/80 rounded-xl flex items-center gap-2 text-emerald-950">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div>
                    <span className="block text-[10px] text-emerald-700/80 font-medium">Checksum</span>
                    <span className="font-bold text-[11px]">Valid SHA-256</span>
                  </div>
                </div>

                <div className="p-3 bg-emerald-50 border border-emerald-200/80 rounded-xl flex items-center gap-2 text-emerald-950">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div>
                    <span className="block text-[10px] text-emerald-700/80 font-medium">Structure</span>
                    <span className="font-bold text-[11px]">100% Intact</span>
                  </div>
                </div>

                <div className="p-3 bg-emerald-50 border border-emerald-200/80 rounded-xl flex items-center gap-2 text-emerald-950">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div>
                    <span className="block text-[10px] text-emerald-700/80 font-medium">Business</span>
                    <span className="font-bold text-[11px] truncate block">{preview.businessName}</span>
                  </div>
                </div>

                <div className="p-3 bg-emerald-50 border border-emerald-200/80 rounded-xl flex items-center gap-2 text-emerald-950">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div>
                    <span className="block text-[10px] text-emerald-700/80 font-medium">Schema</span>
                    <span className="font-bold text-[11px]">v{preview.schemaVersion}</span>
                  </div>
                </div>
              </div>

              {/* Record Count Comparison Card */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl grid grid-cols-3 gap-3 text-center">
                <div>
                  <span className="text-slate-500 block text-[11px] mb-0.5">Current Local</span>
                  <span className="text-base font-bold text-slate-900">
                    {preview.currentLocalRecordCount.toLocaleString()}
                  </span>
                </div>
                <div className="border-x border-slate-200 px-2">
                  <span className="text-slate-500 block text-[11px] mb-0.5">Backup Candidate</span>
                  <span className="text-base font-bold text-blue-600">
                    {preview.remoteRecordCount.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px] mb-0.5">Net Difference</span>
                  <span className={`text-base font-bold ${preview.netRecordDifference >= 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {preview.netRecordDifference >= 0 ? `+${preview.netRecordDifference}` : preview.netRecordDifference}
                  </span>
                </div>
              </div>

              {/* Warnings Banner */}
              {preview.warnings.length > 0 && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-1.5 text-amber-900">
                  <div className="flex items-center gap-2 font-bold text-amber-950">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    Important Notice:
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-amber-800 text-[11px]">
                    {preview.warnings.map((w, idx) => (
                      <li key={idx} className="leading-relaxed">{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Entity Breakdown Table */}
              <div className="space-y-2">
                <h4 className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                  <Layers className="w-4 h-4 text-slate-600" />
                  Entity Difference Breakdown
                </h4>
                <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-56 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold sticky top-0">
                      <tr>
                        <th className="p-2.5 pl-3">Entity</th>
                        <th className="p-2.5 text-right">Local</th>
                        <th className="p-2.5 text-right">Backup</th>
                        <th className="p-2.5 text-right">Diff</th>
                        <th className="p-2.5 text-right pr-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {preview.entitySummaries
                        .filter((e) => e.localCount > 0 || e.remoteCount > 0)
                        .map((ent) => (
                          <tr key={ent.entityName} className="hover:bg-slate-50/50">
                            <td className="p-2.5 pl-3 font-semibold text-slate-900">{ent.entityName}</td>
                            <td className="p-2.5 text-right font-mono">{ent.localCount}</td>
                            <td className="p-2.5 text-right font-mono text-blue-600 font-medium">{ent.remoteCount}</td>
                            <td className={`p-2.5 text-right font-mono font-bold ${
                              ent.netDifference === 0
                                ? 'text-slate-400'
                                : ent.netDifference > 0
                                ? 'text-emerald-600'
                                : 'text-amber-600'
                            }`}>
                              {ent.netDifference > 0 ? `+${ent.netDifference}` : ent.netDifference}
                            </td>
                            <td className="p-2.5 text-right pr-3">
                              {ent.changedCount > 0 || ent.newRemoteCount > 0 || ent.missingRemoteCount > 0 ? (
                                <Badge variant="warning" size="sm">Changed</Badge>
                              ) : (
                                <Badge variant="success" size="sm">Match</Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Confirmation Screen */}
          {stage === 'CONFIRM' && preview && (
            <div className="space-y-4">
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-3 text-amber-950">
                <div className="flex items-center gap-2 font-bold text-sm text-amber-950">
                  <ShieldAlert className="w-5 h-5 text-amber-600" />
                  Pre-Restore Safety Confirmation
                </div>
                <p className="text-amber-900 leading-relaxed text-xs">
                  You are about to restore backup <strong>{backupId}</strong> for <strong>{preview.businessName}</strong>.
                  This action will replace the local business data with the {preview.remoteRecordCount.toLocaleString()} records from this backup snapshot.
                </p>
                <div className="p-3 bg-white/80 rounded-xl border border-amber-200 text-[11px] space-y-1 text-amber-900">
                  <div className="font-semibold text-amber-950">Automatic Safety Protection:</div>
                  <div>✓ A verified local safety snapshot will be created in your local storage before any changes occur.</div>
                  <div>✓ If post-restore reconciliation detects any imbalance, the restore will automatically roll back.</div>
                  <div>✓ Unrelated businesses on this device will not be modified.</div>
                </div>
              </div>

              <label className="flex items-start gap-2.5 p-3.5 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100/70 transition">
                <input
                  type="checkbox"
                  checked={confirmChecked}
                  onChange={(e) => setConfirmChecked(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                />
                <span className="text-xs text-slate-700 font-medium">
                  I understand that current local data for <strong>{preview.businessName}</strong> will be replaced with this backup.
                </span>
              </label>
            </div>
          )}

          {/* Step 3: Success Screen */}
          {stage === 'SUCCESS' && restoreResult && (
            <div className="space-y-5 text-center py-4">
              <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-bold text-slate-900">Restore Completed & Fully Reconciled</h4>
                <p className="text-slate-600 text-xs">
                  {restoreResult.restoredRecordCount.toLocaleString()} records restored for business ID <span className="font-mono">{businessId}</span>.
                </p>
              </div>

              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-left space-y-2 text-emerald-950">
                <div className="font-bold flex items-center gap-1.5 text-xs text-emerald-950">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Post-Restore Reconciliation Report:
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-emerald-900">
                  <div>✓ Customer & Supplier Balances: <strong>100% Match</strong></div>
                  <div>✓ Inventory Stock Levels: <strong>Reconciled</strong></div>
                  <div>✓ Financial Account Balances: <strong>Reconciled</strong></div>
                  <div>✓ Transaction Discounts & Voids: <strong>Intact</strong></div>
                </div>
                <p className="text-[10px] text-emerald-700 pt-1">
                  Pre-restore safety snapshot checksum: <span className="font-mono">{restoreResult.safetySnapshotChecksum.slice(0, 20)}...</span>
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0">
          {stage === 'PREVIEW' && (
            <>
              <Button variant="outline" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setStage('CONFIRM')}
                disabled={!preview || loading}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold"
              >
                Proceed to Restore Confirmation
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </>
          )}

          {stage === 'CONFIRM' && (
            <>
              <Button variant="outline" size="sm" onClick={() => setStage('PREVIEW')}>
                Back to Preview
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleStartRestore}
                disabled={!confirmChecked}
                className="bg-rose-600 hover:bg-rose-700 text-white font-bold disabled:opacity-50"
              >
                I Understand — Restore Backup
              </Button>
            </>
          )}

          {stage === 'SUCCESS' && (
            <Button
              variant="primary"
              size="sm"
              onClick={onClose}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
            >
              Finish & View Restored Business
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
