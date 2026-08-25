/**
 * Canonical JSON Serialization & Cryptographic Checksum Engine
 *
 * Enforces deterministic representation:
 * - Stable alphabetical key sorting
 * - Stable array order preservation
 * - Standardized floating-point / number representation
 * - Standardized UTF-8 encoding
 * - SHA-256 cryptographic hashing (cross-compatible between browser and Node environments)
 */

export function stringifyCanonical(obj: any): string {
  if (obj === null || obj === undefined) {
    return 'null';
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return JSON.stringify(obj);
  }

  if (typeof obj === 'string') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    const items = obj.map((item) => stringifyCanonical(item));
    return `[${items.join(',')}]`;
  }

  if (typeof obj === 'object') {
    const keys = Object.keys(obj).sort();
    const pairs = keys
      .filter((key) => obj[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stringifyCanonical(obj[key])}`);
    return `{${pairs.join(',')}}`;
  }

  return JSON.stringify(obj);
}

/**
 * Computes a standard SHA-256 hex digest for a canonical string.
 */
export async function computeSha256(input: string): Promise<string> {
  // 1. If Web Crypto API is available (Browser or modern Node)
  if (typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function') {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    return `sha256:${hex}`;
  }

  // 2. If Node.js crypto module is available
  try {
    const nodeCrypto = await import('crypto');
    const hex = nodeCrypto.createHash('sha256').update(input, 'utf8').digest('hex');
    return `sha256:${hex}`;
  } catch {
    throw new Error('No supported cryptographic SHA-256 implementation found in environment.');
  }
}
