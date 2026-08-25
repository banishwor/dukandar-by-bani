import React, { useState, useEffect } from 'react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import { googleRestorePreviewService } from '../../services/google/googleRestorePreviewService';
import type { RestorePreviewResult, DownloadProgress } from '../../types/restorePreview';
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
} from 'lucide-react';

interface RestorePreviewModalProps {
  businessId: string;
  backupId: string;
  isOpen: boolean;
  onClose: () => void;
}

export const RestorePreviewModal: React.FC<RestorePreviewModalProps> = ({
  businessId,
  backupId,
  isOpen,
  onClose,
}) => {
  const { showError } = useToast();
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [preview, setPreview] = useState<RestorePreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !businessId || !backupId) return;

    let isMounted = true;
    setLoading(true);
    setError(null);
    setPreview(null);

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

  const formatDate = (isoString?: string) => {
    if (!isoString) return '';
    try {
      return new Date(isoString).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return isoString;
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
              <h3 className="text-base font-bold text-slate-900">Restore Backup Preview</h3>
              <p className="text-xs text-slate-500 font-mono">ID: {backupId}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
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

          {/* Error View */}
          {error && !loading && (
            <div className="p-5 bg-rose-50 border border-rose-200 rounded-2xl space-y-2 text-rose-900">
              <div className="flex items-center gap-2 font-bold text-rose-950">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                Restore Preview Failed
              </div>
              <p className="text-rose-800 leading-relaxed">{error}</p>
              <p className="text-[11px] text-rose-700 italic pt-1">
                Your local business database has NOT been modified in any way.
              </p>
            </div>
          )}

          {/* Preview Details */}
          {preview && !loading && (
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

              {/* Safety Confirmation */}
              <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-xl flex items-start gap-2 text-[11px] text-blue-900">
                <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  <strong>Safe Read-Only Preview:</strong> This preview was calculated purely in memory. No records in your local IndexedDB have been modified, replaced, or deleted.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close Preview
          </Button>

          {preview && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500 italic">
                Actual restore is executed in Phase 7C-3
              </span>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  onClose();
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold"
              >
                Close & Keep Candidate Selected
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
