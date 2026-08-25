import { generateUniqueId } from './id';

const DEVICE_ID_KEY = 'biz_pwa_device_id';

/**
 * Retrieves the persistent unique Device ID for this client installation.
 * If not present, generates a new one and persists it in localStorage.
 * Format: DEVICE_01JQ...
 */
export function getPersistentDeviceId(): string {
  try {
    let deviceId = localStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = generateUniqueId('DEVICE');
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
  } catch (err) {
    // Fallback if localStorage is restricted
    return 'DEVICE_SESSION_' + Math.random().toString(36).substring(2, 10);
  }
}
