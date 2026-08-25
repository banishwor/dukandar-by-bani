import React, { useState, useEffect, useCallback } from 'react';
import { useBusiness } from '../../contexts/BusinessContext';
import { useToast } from '../../components/ui/Toast';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { googleAuthService } from '../../services/google/googleAuthService';
import { googleBackupService } from '../../services/google/googleBackupService';
import { googleBackupUploaderService } from '../../services/google/googleBackupUploaderService';
import { GoogleBackupHistory } from './GoogleBackupHistory';
import type { GoogleBackupMetadata, GoogleAuthStatus } from '../../types/google';
import type {
  GoogleBackupUploadProgress,
  LastSuccessfulBackupInfo,
} from '../../types/googleBackupUpload';
import {
  FileSpreadsheet,
  ExternalLink,
  ShieldCheck,
  CloudOff,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  LogOut,
  UploadCloud,
  Layers,
  Database,
  Hash,
  Clock,
} from 'lucide-react';

export const GoogleBackupCard: React.FC = () => {
  const { business, isOnline } = useBusiness();
  const { showSuccess, showError } = useToast();

  const [authStatus, setAuthStatus] = useState<GoogleAuthStatus>(googleAuthService.getStatus());
  const [metadata, setMetadata] = useState<GoogleBackupMetadata | null>(null);
  const [lastBackup, setLastBackup] = useState<LastSuccessfulBackupInfo | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<GoogleBackupUploadProgress | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);

  const hasClientId = googleAuthService.hasConfiguredClientId();

  const loadMetadata = useCallback(async () => {
    if (!business) return;
    try {
      const [meta, last] = await Promise.all([
        googleBackupService.getLocalMetadata(business.id),
        googleBackupUploaderService.getLastSuccessfulBackup(business.id),
      ]);
      setMetadata(meta);
      setLastBackup(last);
    } catch (err) {
      console.error('Failed to load local backup metadata', err);
    }
  }, [business]);

  useEffect(() => {
    loadMetadata();
    const unsubscribe = googleAuthService.subscribe((status) => {
      setAuthStatus(status);
    });
    return () => unsubscribe();
  }, [loadMetadata]);

  const handleConnectGoogle = async () => {
    if (!isOnline) {
      showError('Internet connection required to connect Google account.');
      return;
    }
    if (!hasClientId) {
      showError('Google Client ID is missing. Set VITE_GOOGLE_CLIENT_ID in your environment configuration.');
      return;
    }

    try {
      setLoading(true);
      await googleBackupService.connectGoogleAccount();
      showSuccess('Google account authorized successfully.');
    } catch (err: any) {
      showError(err?.message || 'Google authorization failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleProvisionBackup = async () => {
    if (!business || !isOnline) return;
    try {
      setLoading(true);
      const res = await googleBackupService.provisionBackupSpreadsheet(
        business.id,
        business.name
      );
      setMetadata(res.metadata);
      if (res.reusedExisting) {
        showSuccess(`Reconnected to existing backup spreadsheet: ${res.metadata.spreadsheetName}`);
      } else {
        showSuccess(`Dedicated backup spreadsheet ready: ${res.metadata.spreadsheetName}`);
      }
    } catch (err: any) {
      showError(err?.message || 'Failed to provision backup spreadsheet.');
    } finally {
      setLoading(false);
    }
  };

  const handleBackupNow = async () => {
    if (!business) return;
    if (!isOnline) {
      showError('Google Backup requires an active internet connection.');
      return;
    }

    try {
      setUploading(true);
      setUploadError(null);

      const result = await googleBackupUploaderService.uploadBackup(
        business.id,
        (progress) => {
          setUploadProgress(progress);
        }
      );

      const last = await googleBackupUploaderService.getLastSuccessfulBackup(business.id);
      setLastBackup(last);
      showSuccess(`✓ Backup verified! ${result.totalRecords} records secured on Google Sheets.`);
    } catch (err: any) {
      const msg = err?.message || 'Backup upload failed.';
      setUploadError(msg);
      showError(msg);
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const handleDisconnect = async () => {
    if (!business) return;
    try {
      setLoading(true);
      await googleBackupService.disconnect(business.id);
      setMetadata(null);
      setLastBackup(null);
      setShowDisconnectModal(false);
      showSuccess('Google backup disconnected. Local business records and your Google Sheet remain untouched.');
    } catch (err: any) {
      showError(err?.message || 'Failed to disconnect.');
    } finally {
      setLoading(false);
    }
  };

  const isConnected = Boolean(metadata?.spreadsheetId);

  const formatBytes = (bytes?: number) => {
    if (!bytes) return '0 B';
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center font-bold shrink-0 shadow-2xs">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">Google Cloud Backup</h2>
              {!isOnline ? (
                <Badge variant="warning" size="sm">
                  <CloudOff className="w-3 h-3 mr-1" /> Offline
                </Badge>
              ) : isConnected ? (
                <Badge variant="success" size="sm">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> Connected
                </Badge>
              ) : (
                <Badge variant="secondary" size="sm">
                  Not Connected
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Secure, private snapshot backups to your dedicated Google Spreadsheet.
            </p>
          </div>
        </div>

        {isConnected && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDisconnectModal(true)}
            disabled={uploading}
            className="text-rose-600 border-rose-200 hover:bg-rose-50 text-xs font-semibold"
          >
            <LogOut className="w-3.5 h-3.5 mr-1.5" />
            Disconnect
          </Button>
        )}
      </div>

      {/* Configuration Missing Alert */}
      {!hasClientId && (
        <div className="p-4 bg-amber-50 border border-amber-200/80 rounded-xl flex items-start gap-3 text-xs text-amber-900">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Google Client ID Required:</span>
            <p className="mt-0.5 text-amber-800">
              Configure <code className="px-1.5 py-0.5 bg-amber-100/80 rounded font-mono text-[11px]">VITE_GOOGLE_CLIENT_ID</code> in your application environment to enable Google backups.
            </p>
          </div>
        </div>
      )}

      {/* Offline Status */}
      {!isOnline ? (
        <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-600 flex items-center gap-2">
          <CloudOff className="w-4 h-4 text-slate-400" />
          <span>Google Backup features are temporarily unavailable while working offline.</span>
        </div>
      ) : isConnected && metadata ? (
        <div className="space-y-4">
          {/* Target Spreadsheet & Google Account Details */}
          <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-slate-500 font-medium">Backup Spreadsheet:</span>
              <span className="font-bold text-slate-900">{metadata.spreadsheetName}</span>
            </div>

            {metadata.userEmail && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-2 border-t border-slate-200/60">
                <span className="text-slate-500 font-medium">Google Account:</span>
                <span className="font-mono text-slate-700">{metadata.userEmail}</span>
              </div>
            )}
          </div>

          {/* Last Verified Backup Summary */}
          {lastBackup ? (
            <div className="p-4 bg-emerald-50/60 border border-emerald-200/80 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-950">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Latest Verified Backup
                </div>
                <Badge variant="success" size="sm">
                  Verified
                </Badge>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
                <div>
                  <span className="text-emerald-700/80 block text-[11px]">Last Backup</span>
                  <span className="font-semibold text-emerald-950">
                    {lastBackup.uploadedAt?.slice(0, 16).replace('T', ' ')}
                  </span>
                </div>
                <div>
                  <span className="text-emerald-700/80 block text-[11px]">Total Records</span>
                  <span className="font-bold text-emerald-950">{lastBackup.totalRecords.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-emerald-700/80 block text-[11px]">Snapshot Size</span>
                  <span className="font-semibold text-emerald-950">{formatBytes(lastBackup.sizeBytes)}</span>
                </div>
                <div>
                  <span className="text-emerald-700/80 block text-[11px]">Checksum</span>
                  <span className="font-mono text-[11px] text-emerald-900 truncate block">
                    {lastBackup.checksum.slice(0, 16)}...
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-xl text-xs text-blue-800 flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-500" />
              <span>No backup uploaded yet. Click <strong>Backup Now</strong> to secure your initial database snapshot.</span>
            </div>
          )}

          {/* Upload Progress Bar */}
          {uploading && uploadProgress && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-blue-950">
                <span className="flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
                  {uploadProgress.message}
                </span>
                <span>{uploadProgress.percentage}%</span>
              </div>
              <div className="w-full bg-blue-100 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-blue-600 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${uploadProgress.percentage}%` }}
                />
              </div>
            </div>
          )}

          {/* Failure Alert Banner */}
          {uploadError && !uploading && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-900 space-y-2">
              <div className="flex items-center gap-2 font-bold text-rose-950">
                <AlertCircle className="w-4 h-4 text-rose-600" />
                Backup failed
              </div>
              <p className="text-rose-800 leading-relaxed">
                {uploadError}. Your local business database is completely safe.
                {lastBackup && ' Previous verified backup remains intact on Google Sheets.'}
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button
              variant="primary"
              size="md"
              icon={UploadCloud}
              onClick={handleBackupNow}
              disabled={uploading}
              isLoading={uploading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs"
            >
              {uploadError ? 'Retry Backup' : 'Backup Now'}
            </Button>

            {metadata.spreadsheetUrl && (
              <a
                href={metadata.spreadsheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold border border-slate-200 shadow-2xs transition-all"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open Google Sheet</span>
              </a>
            )}

            <Button
              variant="outline"
              size="sm"
              icon={RefreshCw}
              onClick={handleProvisionBackup}
              disabled={uploading || loading}
              className="text-xs font-semibold"
            >
              Verify Connection
            </Button>
          </div>

          {/* Remote Backup History & Candidate Selection */}
          <GoogleBackupHistory
            spreadsheetId={metadata.spreadsheetId}
            selectedCandidateId={selectedCandidateId}
            onSelectCandidate={(candidate) => setSelectedCandidateId(candidate.backupId)}
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="p-4 bg-blue-50/60 border border-blue-100 rounded-xl text-xs text-blue-900 space-y-2">
            <div className="flex items-center gap-1.5 font-bold text-blue-950">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              Private & Secure Storage
            </div>
            <p className="text-blue-800/90 leading-relaxed">
              Connecting Google creates a dedicated private spreadsheet (<code className="font-mono bg-blue-100/70 px-1 py-0.5 rounded text-[11px]">Dukandar by Bani — Backup — {business?.name}</code>) in your Google account. Your local device remains the authoritative single source of truth.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {!authStatus.hasToken ? (
              <Button
                variant="primary"
                size="md"
                onClick={handleConnectGoogle}
                disabled={loading || !hasClientId}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs"
              >
                Connect Google Account
              </Button>
            ) : (
              <Button
                variant="primary"
                size="md"
                onClick={handleProvisionBackup}
                disabled={loading}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs"
              >
                Create / Connect Backup Spreadsheet
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Disconnect Confirmation Modal */}
      {showDisconnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Disconnect Google Cloud Backup?</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Disconnecting removes this business's connection to the backup spreadsheet. Your Google Sheet and local business records in IndexedDB will <strong>not</strong> be deleted.
            </p>
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDisconnectModal(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleDisconnect}
                disabled={loading}
              >
                Confirm Disconnect
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
