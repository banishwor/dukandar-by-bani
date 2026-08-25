import React, { useState, useEffect, useCallback } from 'react';
import { useBusiness } from '../../contexts/BusinessContext';
import { useToast } from '../../components/ui/Toast';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { googleAuthService } from '../../services/google/googleAuthService';
import { googleBackupDiscoveryService } from '../../services/google/googleBackupDiscoveryService';
import { RestorePreviewModal } from './RestorePreviewModal';
import type { RemoteBackupSnapshot, RemoteBackupDiscoveryResult } from '../../types/remoteBackup';
import {
  History,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Layers,
  Database,
  Hash,
  Clock,
  Smartphone,
  Info,
  ChevronRight,
  ShieldCheck,
  Eye,
} from 'lucide-react';

interface GoogleBackupHistoryProps {
  spreadsheetId?: string;
  onSelectCandidate?: (candidate: RemoteBackupSnapshot) => void;
  selectedCandidateId?: string;
}

export const GoogleBackupHistory: React.FC<GoogleBackupHistoryProps> = ({
  spreadsheetId,
  onSelectCandidate,
  selectedCandidateId,
}) => {
  const { business, isOnline } = useBusiness();
  const { showSuccess, showError } = useToast();

  const [discovery, setDiscovery] = useState<RemoteBackupDiscoveryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedDetails, setSelectedDetails] = useState<RemoteBackupSnapshot | null>(null);
  const [previewBackupId, setPreviewBackupId] = useState<string | null>(null);
  const [showAllAttempts, setShowAllAttempts] = useState(false);

  const fetchBackups = useCallback(async (interactive = true) => {
    if (!business || !spreadsheetId || !isOnline) return;
    try {
      setLoading(true);
      const res = await googleBackupDiscoveryService.listRemoteBackups(business.id, interactive);
      setDiscovery(res);
    } catch (err: any) {
      if (interactive) {
        console.error('Failed to discover remote backups', err);
        showError(err?.message || 'Failed to load remote backups.');
      }
    } finally {
      setLoading(false);
    }
  }, [business, spreadsheetId, isOnline, showError]);

  useEffect(() => {
    // Only fetch automatically on mount if we already have an active in-memory token
    if (googleAuthService.getAccessToken()) {
      fetchBackups(false);
    }
  }, [fetchBackups]);

  const handleSelectCandidate = (backup: RemoteBackupSnapshot) => {
    if (onSelectCandidate) {
      onSelectCandidate(backup);
    }
    showSuccess(`Selected candidate: ${backup.backupId} (${backup.totalRecords.toLocaleString()} records). Local data remains untouched.`);
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes) return '0 B';
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  };

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(undefined, {
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

  const backupsToShow = showAllAttempts
    ? discovery?.allAttempts || []
    : discovery?.verifiedBackups || [];

  return (
    <div className="space-y-4 pt-2 border-t border-slate-200/80">
      {/* Title & Refresh */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-slate-700" />
          <h3 className="text-sm font-bold text-slate-900">Remote Backup History</h3>
          {discovery && (
            <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full font-medium">
              {discovery.verifiedBackups.length} verified
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchBackups}
            disabled={loading || !isOnline}
            className="text-xs text-slate-600 hover:text-slate-900"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Loading state */}
      {loading && !discovery && (
        <div className="p-6 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
          <span>Discovering backups from Google Spreadsheet...</span>
        </div>
      )}

      {/* Session Inactive / Initial state before user requests load */}
      {!loading && !discovery && (
        <div className="p-4 text-center text-xs text-slate-500 bg-slate-50 rounded-2xl border border-slate-200/70 flex flex-col items-center gap-2">
          <Info className="w-5 h-5 text-blue-500" />
          <p className="text-slate-600">
            Remote backup history is stored in your private Google Spreadsheet.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchBackups(true)}
            disabled={!isOnline}
            className="text-xs text-blue-600 border-blue-200 hover:bg-blue-50 font-semibold"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Load Remote Backups
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!loading && discovery && backupsToShow.length === 0 && (
        <div className="p-5 text-center text-xs text-slate-500 bg-slate-50 rounded-2xl border border-slate-200/70 space-y-1">
          <Info className="w-5 h-5 mx-auto text-slate-400 mb-1" />
          <p className="font-semibold text-slate-700">No verified remote backups found.</p>
          <p className="text-slate-500">
            Upload your first backup using the <strong>Backup Now</strong> button above.
          </p>
        </div>
      )}

      {/* Backup Candidate List */}
      {backupsToShow.length > 0 && (
        <div className="space-y-2.5">
          {backupsToShow.map((backup, idx) => {
            const isSelected = selectedCandidateId === backup.backupId;
            const isLatest = idx === 0 && backup.status === 'VERIFIED';

            return (
              <div
                key={`${backup.backupId}_${backup.uploadedAt}_${idx}`}
                className={`p-4 rounded-2xl border transition-all ${
                  isSelected
                    ? 'bg-blue-50/70 border-blue-300 ring-2 ring-blue-500/20'
                    : 'bg-white hover:bg-slate-50/80 border-slate-200/90 shadow-2xs'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {/* Info Left */}
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-slate-900">
                        {formatDate(backup.uploadedAt || backup.createdAt)}
                      </span>

                      {isLatest && (
                        <Badge variant="success" size="sm">
                          Latest
                        </Badge>
                      )}

                      {backup.status === 'VERIFIED' ? (
                        <Badge variant="success" size="sm">
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Verified
                        </Badge>
                      ) : (
                        <Badge variant="warning" size="sm">
                          {backup.status}
                        </Badge>
                      )}

                      {backup.compatibility === 'SUPPORTED_WITH_WARNING' && (
                        <Badge variant="warning" size="sm">
                          Legacy v{backup.schemaVersion}
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span className="font-medium text-slate-700">
                        {backup.totalRecords.toLocaleString()} records
                      </span>
                      <span>•</span>
                      <span>{formatBytes(backup.sizeBytes)}</span>
                      <span>•</span>
                      <span>Schema v{backup.schemaVersion}</span>
                      {backup.deviceId && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1 font-mono text-[11px] text-slate-500">
                            <Smartphone className="w-3 h-3 text-slate-400" />
                            {backup.deviceId.slice(0, 8)}...
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Actions Right */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPreviewBackupId(backup.backupId)}
                      className="text-xs text-blue-600 border-blue-200 hover:bg-blue-50 font-semibold"
                    >
                      <Eye className="w-3.5 h-3.5 mr-1" />
                      Preview
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedDetails(backup)}
                      className="text-xs text-slate-600 font-semibold"
                    >
                      Inspect
                    </Button>

                    {backup.status === 'VERIFIED' && backup.compatibility !== 'INCOMPATIBLE' && (
                      <Button
                        variant={isSelected ? 'secondary' : 'primary'}
                        size="sm"
                        onClick={() => handleSelectCandidate(backup)}
                        className={`text-xs font-bold ${
                          isSelected
                            ? 'bg-blue-100 text-blue-800 border-blue-200'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        }`}
                      >
                        {isSelected ? '✓ Selected' : 'Select for Restore'}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Toggle View Attempts */}
      {discovery && discovery.allAttempts.length > discovery.verifiedBackups.length && (
        <div className="pt-1 text-center">
          <button
            type="button"
            onClick={() => setShowAllAttempts((prev) => !prev)}
            className="text-xs text-slate-500 hover:text-slate-800 underline font-medium"
          >
            {showAllAttempts
              ? 'Show verified backups only'
              : `Show all backup attempts (${discovery.allAttempts.length})`}
          </button>
        </div>
      )}

      {/* Selected Candidate Active Notification */}
      {selectedCandidateId && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between text-xs text-blue-900">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
            <span>
              Restore candidate selected: <strong className="font-mono">{selectedCandidateId}</strong>
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPreviewBackupId(selectedCandidateId)}
            className="text-xs text-blue-700 border-blue-300 hover:bg-blue-100"
          >
            <Eye className="w-3.5 h-3.5 mr-1" />
            Preview Diff
          </Button>
        </div>
      )}

      {/* Restore Preview Modal */}
      {previewBackupId && business && (
        <RestorePreviewModal
          businessId={business.id}
          backupId={previewBackupId}
          isOpen={Boolean(previewBackupId)}
          onClose={() => setPreviewBackupId(null)}
        />
      )}

      {/* Detail Modal */}
      {selectedDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-900">Backup Candidate Details</h3>
              </div>
              <Badge variant={selectedDetails.status === 'VERIFIED' ? 'success' : 'warning'} size="sm">
                {selectedDetails.status}
              </Badge>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200/60">
                <div>
                  <span className="text-slate-500 block text-[11px]">Backup ID</span>
                  <span className="font-mono text-slate-900 font-bold break-all">
                    {selectedDetails.backupId}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Business</span>
                  <span className="text-slate-900 font-semibold">{selectedDetails.businessName}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Uploaded At</span>
                  <span className="text-slate-800">{formatDate(selectedDetails.uploadedAt)}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Total Records</span>
                  <span className="text-slate-900 font-bold">
                    {selectedDetails.totalRecords.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Schema Version</span>
                  <span className="text-slate-800">
                    v{selectedDetails.schemaVersion} (Format v{selectedDetails.backupFormatVersion})
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Snapshot Size</span>
                  <span className="text-slate-800">{formatBytes(selectedDetails.sizeBytes)}</span>
                </div>
              </div>

              <div>
                <span className="text-slate-500 block text-[11px] mb-1 font-medium">SHA-256 Checksum</span>
                <code className="p-2 bg-slate-100 rounded-lg text-[11px] font-mono text-slate-800 block break-all border border-slate-200">
                  {selectedDetails.checksum}
                </code>
              </div>

              {selectedDetails.recordCounts && Object.keys(selectedDetails.recordCounts).length > 0 && (
                <div>
                  <span className="text-slate-500 block text-[11px] mb-1 font-medium">Record Counts Breakdown</span>
                  <div className="max-h-32 overflow-y-auto p-2.5 bg-slate-50 rounded-xl border border-slate-200/60 grid grid-cols-2 gap-1.5 text-[11px]">
                    {Object.entries(selectedDetails.recordCounts).map(([key, count]) => (
                      <div key={key} className="flex justify-between">
                        <span className="text-slate-600 capitalize">{key}:</span>
                        <span className="font-bold text-slate-900">{Number(count)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Disclaimer */}
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-[11px] space-y-1">
                <span className="font-bold block">Safety Notice:</span>
                <p className="leading-relaxed">
                  Selecting this candidate will <strong>not</strong> modify your local database or overwrite records. Restoring is a dedicated preview-and-confirm workflow in subsequent phases.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedDetails(null)}
              >
                Close
              </Button>
              {selectedDetails.status === 'VERIFIED' && selectedDetails.compatibility !== 'INCOMPATIBLE' && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    handleSelectCandidate(selectedDetails);
                    setSelectedDetails(null);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                >
                  Select Backup Candidate
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
