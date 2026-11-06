import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// Self-hosted variable fonts (bundled + service-worker cached) — the app
// makes no Google Fonts request, so first launch works fully offline.
import '@fontsource-variable/plus-jakarta-sans';
import '@fontsource-variable/plus-jakarta-sans/wght-italic.css';
import '@fontsource-variable/jetbrains-mono';
import './index.css';

// Register Service Worker for offline capability & PWA installability.
// When an updated worker finishes installing it waits (see sw.js); we
// announce it with a window event and UpdatePrompt lets the user apply it.
if ('serviceWorker' in navigator && (import.meta.env.PROD || process.env.NODE_ENV === 'production')) {
  window.addEventListener('load', () => {
    const swUrl = `${import.meta.env.BASE_URL || './'}sw.js`;
    navigator.serviceWorker
      .register(swUrl)
      .then((registration) => {
        const notifyUpdateAvailable = () => {
          window.dispatchEvent(
            new CustomEvent('dukandar:sw-update-available', { detail: registration })
          );
        };

        if (registration.waiting && navigator.serviceWorker.controller) {
          notifyUpdateAvailable();
        }

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              notifyUpdateAvailable();
            }
          });
        });
      })
      .catch((err) => {
        console.warn('SW registration failed: ', err);
      });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
