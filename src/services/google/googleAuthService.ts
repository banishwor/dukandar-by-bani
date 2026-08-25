/**
 * Google Authentication Service (Google Identity Services)
 *
 * Security Rules:
 * - Public Google Client ID only via import.meta.env.VITE_GOOGLE_CLIENT_ID.
 * - ZERO client secrets allowed in frontend.
 * - Access tokens held exclusively in-memory (never written as permanent plaintext to IndexedDB).
 * - Scopes: drive.file, spreadsheets, userinfo.email.
 */

import type { GoogleTokenResponse, GoogleUserInfo, GoogleAuthStatus } from '../../types/google';

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: GoogleTokenResponse) => void;
            error_callback?: (error: any) => void;
          }) => {
            requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
          };
          revoke: (accessToken: string, done: () => void) => void;
        };
      };
    };
  }
}

const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

class GoogleAuthService {
  private inMemoryAccessToken: string | null = null;
  private tokenExpiresAt: number | null = null;
  private cachedUserEmail: string | null = null;
  private tokenClient: any = null;
  private isScriptLoaded = false;
  private loadPromise: Promise<boolean> | null = null;
  private listeners = new Set<(status: GoogleAuthStatus) => void>();

  /**
   * Retrieves the configured client ID from Vite or Node environment.
   */
  getClientId(): string {
    const metaEnv = typeof import.meta !== 'undefined' && (import.meta as any).env ? (import.meta as any).env.VITE_GOOGLE_CLIENT_ID : '';
    const procEnv = typeof process !== 'undefined' && process.env ? process.env.VITE_GOOGLE_CLIENT_ID : '';
    return (metaEnv || procEnv || '').trim();
  }

  /**
   * Checks whether the client ID is present in environment variables.
   */
  hasConfiguredClientId(): boolean {
    return Boolean(this.getClientId());
  }

  /**
   * Dynamically loads the Google Identity Services client script without blocking offline startup.
   */
  async loadGoogleScript(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    if (this.isScriptLoaded && window.google?.accounts?.oauth2) return true;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = new Promise<boolean>((resolve) => {
      // If already present on window
      if (window.google?.accounts?.oauth2) {
        this.isScriptLoaded = true;
        this.notifyListeners();
        resolve(true);
        return;
      }

      // Check if navigator is offline
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        resolve(false);
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        this.isScriptLoaded = true;
        this.notifyListeners();
        resolve(true);
      };
      script.onerror = () => {
        this.isScriptLoaded = false;
        resolve(false);
      };
      document.head.appendChild(script);
    });

    return this.loadPromise;
  }

  /**
   * Returns current in-memory access token if valid and unexpired.
   */
  getAccessToken(): string | null {
    if (!this.inMemoryAccessToken) return null;
    if (this.tokenExpiresAt && Date.now() >= this.tokenExpiresAt) {
      this.inMemoryAccessToken = null;
      this.tokenExpiresAt = null;
      this.notifyListeners();
      return null;
    }
    return this.inMemoryAccessToken;
  }

  /**
   * Returns cached connected user email if available.
   */
  getUserEmail(): string | null {
    return this.cachedUserEmail;
  }

  /**
   * Triggers the GIS browser OAuth popup to request user authorization.
   */
  async requestAccessToken(): Promise<string> {
    const clientId = this.getClientId();
    if (!clientId) {
      throw new Error(
        'Google Client ID is missing. Please set VITE_GOOGLE_CLIENT_ID in your .env configuration.'
      );
    }

    const scriptLoaded = await this.loadGoogleScript();
    if (!scriptLoaded || !window.google?.accounts?.oauth2) {
      throw new Error('Google Identity Services could not be loaded. Please check your internet connection.');
    }

    return new Promise<string>((resolve, reject) => {
      try {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: SCOPES,
          callback: async (response: GoogleTokenResponse) => {
            if (response.error) {
              const err = new Error(
                response.error_description || `Google Authorization Failed: ${response.error}`
              );
              this.notifyListeners();
              reject(err);
              return;
            }

            this.inMemoryAccessToken = response.access_token;
            // Set expiration with 60s safety buffer
            const expiresInMs = (Number(response.expires_in) || 3600) * 1000;
            this.tokenExpiresAt = Date.now() + Math.max(0, expiresInMs - 60000);

            // Fetch user email
            try {
              const info = await this.fetchUserInfo(response.access_token);
              if (info?.email) {
                this.cachedUserEmail = info.email;
              }
            } catch {
              // Non-fatal if userinfo fails
            }

            this.notifyListeners();
            resolve(response.access_token);
          },
          error_callback: (err: any) => {
            const errorMsg = err?.message || err?.type || 'Authorization cancelled by user';
            reject(new Error(errorMsg));
          },
        });

        client.requestAccessToken({ prompt: 'consent' });
      } catch (err: any) {
        reject(new Error(`Failed to initialize Google OAuth: ${err?.message || String(err)}`));
      }
    });
  }

  /**
   * Fetches safe userinfo (email only) using access token.
   */
  async fetchUserInfo(accessToken: string): Promise<GoogleUserInfo | null> {
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  /**
   * Clears in-memory tokens and revokes access.
   */
  disconnect(): void {
    if (this.inMemoryAccessToken && window.google?.accounts?.oauth2?.revoke) {
      try {
        window.google.accounts.oauth2.revoke(this.inMemoryAccessToken, () => {});
      } catch {
        // Ignore revocation errors
      }
    }
    this.inMemoryAccessToken = null;
    this.tokenExpiresAt = null;
    this.cachedUserEmail = null;
    this.notifyListeners();
  }

  /**
   * Status subscriber
   */
  subscribe(listener: (status: GoogleAuthStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => this.listeners.delete(listener);
  }

  getStatus(): GoogleAuthStatus {
    return {
      isScriptLoaded: this.isScriptLoaded,
      hasToken: Boolean(this.getAccessToken()),
      userEmail: this.cachedUserEmail || undefined,
    };
  }

  private notifyListeners(): void {
    const status = this.getStatus();
    this.listeners.forEach((l) => l(status));
  }
}

export const googleAuthService = new GoogleAuthService();
