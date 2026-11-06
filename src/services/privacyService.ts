// Privacy Service: Manages 4-Digit Privacy PIN and Screen Blur State
//
// PIN storage history:
//  - v1 (legacy): the PIN was stored as reversible base64 of `SALT::pin`.
//    Anyone with device access could decode it back to the PIN.
//  - v2 (current): the PIN is stored as a salted SHA-256 hash
//    (`sha256:<hex>`), computed with the same WebCrypto helper the backup
//    engine uses. The hash cannot be reversed to recover the PIN.
//  Migration: a successful unlock against a legacy v1 value transparently
//  re-saves it in v2 form, so existing users keep their PIN.

import { computeSha256 } from '../utils/canonicalJson';

const PIN_STORAGE_KEY = 'dukandar_privacy_pin_hash';
const ACTIVE_STORAGE_KEY = 'dukandar_privacy_active';

const SALT = 'dukandar_offline_privacy_salt_v1';
const HASH_PREFIX = 'sha256:';

function legacyHashPin(pin: string): string {
  // v1 encoding — kept ONLY to recognise and migrate pre-existing PINs.
  return btoa(`${SALT}::${pin.trim()}`);
}

async function hashPin(pin: string): Promise<string> {
  // computeSha256 returns the digest already prefixed with "sha256:".
  return computeSha256(`${SALT}::${pin.trim()}`);
}

export const privacyService = {
  isPinConfigured(): boolean {
    try {
      const stored = localStorage.getItem(PIN_STORAGE_KEY);
      return Boolean(stored && stored.length > 0);
    } catch {
      return false;
    }
  },

  async savePin(pin: string): Promise<boolean> {
    if (!/^\d{4}$/.test(pin.trim())) {
      return false;
    }
    try {
      localStorage.setItem(PIN_STORAGE_KEY, await hashPin(pin.trim()));
      return true;
    } catch {
      return false;
    }
  },

  async verifyPin(pin: string): Promise<boolean> {
    try {
      const stored = localStorage.getItem(PIN_STORAGE_KEY);
      if (!stored) return false;

      if (stored.startsWith(HASH_PREFIX)) {
        return stored === (await hashPin(pin.trim()));
      }

      // Legacy v1 value: verify against the old encoding, then migrate the
      // stored value to the v2 hash on success so the reversible copy is gone.
      if (stored === legacyHashPin(pin.trim())) {
        try {
          localStorage.setItem(PIN_STORAGE_KEY, await hashPin(pin.trim()));
        } catch {
          // ignore migration failure — the PIN itself verified fine
        }
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  clearPin(): void {
    try {
      localStorage.removeItem(PIN_STORAGE_KEY);
      localStorage.removeItem(ACTIVE_STORAGE_KEY);
    } catch {
      // ignore
    }
  },

  isPrivacyActive(): boolean {
    try {
      return localStorage.getItem(ACTIVE_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  },

  setPrivacyActive(active: boolean): void {
    try {
      if (active) {
        localStorage.setItem(ACTIVE_STORAGE_KEY, 'true');
      } else {
        localStorage.removeItem(ACTIVE_STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  },

  verifyBusinessNameForReset(registeredBusinessName: string | undefined, inputName: string): boolean {
    if (!registeredBusinessName || !inputName) return false;
    const cleanReg = registeredBusinessName.trim().toLowerCase();
    const cleanInput = inputName.trim().toLowerCase();
    return cleanReg === cleanInput && cleanReg.length > 0;
  },
};
