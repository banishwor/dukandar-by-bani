// Storage Persistence Service
//
// All shop data lives in IndexedDB on this device. Browsers may evict
// non-persistent storage under disk pressure (Chrome/Android does this for
// sites that are not installed or not marked persistent). Requesting
// persistent storage via navigator.storage.persist() asks the browser to
// treat the data as protected — it can then only be cleared by the user.
//
// The request is best-effort: browsers grant it based on their own rules
// (installed PWA, engagement, permissions). The Settings screen surfaces
// the real status so the owner knows whether their data is protected.

export interface StorageStatus {
  /** Whether the Storage API is available at all in this browser. */
  supported: boolean;
  /** Whether storage is currently marked persistent (protected from eviction). */
  persisted: boolean;
  /** Bytes currently used by this origin, if the browser reports it. */
  usageBytes?: number;
  /** Bytes available to this origin, if the browser reports it. */
  quotaBytes?: number;
}

function storageManager(): StorageManager | undefined {
  try {
    return typeof navigator !== 'undefined' ? navigator.storage : undefined;
  } catch {
    return undefined;
  }
}

export const storagePersistenceService = {
  /** Ask the browser to protect this app's storage. Returns the granted state. */
  async requestPersistentStorage(): Promise<boolean> {
    const storage = storageManager();
    if (!storage?.persist) return false;
    try {
      if (await storage.persisted()) return true;
      return await storage.persist();
    } catch {
      return false;
    }
  },

  async getStorageStatus(): Promise<StorageStatus> {
    const storage = storageManager();
    if (!storage) return { supported: false, persisted: false };
    try {
      const persisted = storage.persisted ? await storage.persisted() : false;
      let usageBytes: number | undefined;
      let quotaBytes: number | undefined;
      if (storage.estimate) {
        const estimate = await storage.estimate();
        usageBytes = estimate.usage;
        quotaBytes = estimate.quota;
      }
      return { supported: true, persisted, usageBytes, quotaBytes };
    } catch {
      return { supported: true, persisted: false };
    }
  },
};

export function formatBytes(bytes?: number): string {
  if (bytes === undefined || !Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
