import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';

export const SW_UPDATE_EVENT = 'dukandar:sw-update-available';

/**
 * Banner shown when a new service worker has installed and is waiting.
 * The user chooses when to update, so the app never reloads mid-work.
 * "Update now" tells the waiting worker to take over, then reloads once
 * the new worker controls the page.
 */
export const UpdatePrompt: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const reloadingRef = useRef(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handleUpdateAvailable = (event: Event) => {
      const registration = (event as CustomEvent<ServiceWorkerRegistration>).detail;
      if (registration) {
        registrationRef.current = registration;
        setVisible(true);
      }
    };

    window.addEventListener(SW_UPDATE_EVENT, handleUpdateAvailable);

    // The update may already be waiting by the time this mounts.
    navigator.serviceWorker
      .getRegistration()
      .then((registration) => {
        if (registration?.waiting && navigator.serviceWorker.controller) {
          registrationRef.current = registration;
          setVisible(true);
        }
      })
      .catch(() => {
        // No registration in dev mode — nothing to prompt about.
      });

    return () => window.removeEventListener(SW_UPDATE_EVENT, handleUpdateAvailable);
  }, []);

  const handleUpdateNow = () => {
    const waiting = registrationRef.current?.waiting;
    if (!waiting) {
      window.location.reload();
      return;
    }

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!reloadingRef.current) {
        reloadingRef.current = true;
        window.location.reload();
      }
    });
    waiting.postMessage({ type: 'SKIP_WAITING' });

    // Fallback: if controllerchange never fires, reload shortly anyway.
    setTimeout(() => {
      if (!reloadingRef.current) {
        reloadingRef.current = true;
        window.location.reload();
      }
    }, 3000);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-20 md:bottom-6 left-4 sm:left-6 z-[60] max-w-sm w-[calc(100%-2rem)] sm:w-full">
      <div className="flex items-start gap-3 p-4 rounded-xl shadow-xl border bg-slate-900/95 text-white border-slate-700/60 backdrop-blur-md">
        <RefreshCw className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h5 className="text-xs font-bold uppercase tracking-wider mb-0.5">New version available</h5>
          <p className="text-xs font-medium text-slate-200 leading-snug">
            A newer Dukandar is ready. Updating reloads the app — your local data stays untouched.
          </p>
          <div className="flex items-center gap-2 mt-3">
            <button
              type="button"
              onClick={handleUpdateNow}
              className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white px-3 h-9 rounded-lg transition-colors"
            >
              Update now
            </button>
            <button
              type="button"
              onClick={() => setVisible(false)}
              className="text-xs font-semibold text-slate-300 hover:text-white px-3 h-9 rounded-lg transition-colors"
            >
              Later
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="text-slate-400 hover:text-white p-0.5 rounded transition-colors"
          aria-label="Dismiss update prompt"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
