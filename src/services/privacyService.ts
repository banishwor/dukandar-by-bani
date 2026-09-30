// Privacy Service: Manages 4-Digit Privacy PIN and Screen Blur State

const PIN_STORAGE_KEY = 'dukandar_privacy_pin_hash';
const ACTIVE_STORAGE_KEY = 'dukandar_privacy_active';

// Simple salt for offline local obfuscation
const SALT = 'dukandar_offline_privacy_salt_v1';

function hashPin(pin: string): string {
  // Use simple salted base64 encoding for offline local storage
  return btoa(`${SALT}::${pin.trim()}`);
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

  savePin(pin: string): boolean {
    if (!/^\d{4}$/.test(pin.trim())) {
      return false;
    }
    try {
      localStorage.setItem(PIN_STORAGE_KEY, hashPin(pin.trim()));
      return true;
    } catch {
      return false;
    }
  },

  verifyPin(pin: string): boolean {
    try {
      const stored = localStorage.getItem(PIN_STORAGE_KEY);
      if (!stored) return false;
      return stored === hashPin(pin.trim());
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
