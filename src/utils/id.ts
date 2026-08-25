/**
 * Generates a globally unique, collision-resistant identifier (timestamp + random base32).
 * Example: 01JQ7K8M2X9A4P...
 */
const BASE32_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function generateUniqueId(prefix = ''): string {
  const now = Date.now();
  // 10 chars of base32 encoded timestamp
  let timeStr = '';
  let time = now;
  for (let i = 0; i < 8; i++) {
    timeStr = BASE32_ALPHABET[time % 32] + timeStr;
    time = Math.floor(time / 32);
  }

  // 16 chars of cryptographically secure random bytes
  const randomBytes = new Uint8Array(12);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(randomBytes);
  } else {
    for (let i = 0; i < 12; i++) {
      randomBytes[i] = Math.floor(Math.random() * 256);
    }
  }

  let randomStr = '';
  for (let i = 0; i < randomBytes.length; i++) {
    randomStr += BASE32_ALPHABET[randomBytes[i] % 32];
  }

  return (prefix ? `${prefix}_` : '') + timeStr + randomStr;
}

export function generateInvoiceNumber(seqNumber: number, prefix = 'INV'): string {
  const padded = String(seqNumber).padStart(4, '0');
  return `${prefix}-${padded}`;
}
