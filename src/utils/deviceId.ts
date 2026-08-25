import { generateUniqueId } from './id';

const DEVICE_ID_KEY = 'biz_pwa_device_id';
let memoryFallbackDeviceId: string | null = null;

/**
 * Retrieves the persistent unique Device ID for this client installation.
 * If not present, generates a new one and persists it in localStorage.
 * In headless/SSR environments, caches in module memory.
 * Format: DEVICE_01JQ...
 */
export function getPersistentDeviceId(): string {
  try {
    let deviceId = typeof localStorage !== 'undefined' && localStorage ? localStorage.getItem(DEVICE_ID_KEY) : null;
    if (!deviceId) {
      if (typeof localStorage === 'undefined' || !localStorage) {
        if (!memoryFallbackDeviceId) {
          memoryFallbackDeviceId = generateUniqueId('DEVICE');
        }
        return memoryFallbackDeviceId;
      }
      deviceId = generateUniqueId('DEVICE');
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
  } catch (err) {
    if (!memoryFallbackDeviceId) {
      memoryFallbackDeviceId = generateUniqueId('DEVICE');
    }
    return memoryFallbackDeviceId;
  }
}
