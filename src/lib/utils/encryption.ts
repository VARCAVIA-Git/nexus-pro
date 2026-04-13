import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';

// Lazy-load key to ensure env vars are available (Next.js loads .env.local after module init)
let _key: Buffer | null = null;
let _keyAvailable: boolean | null = null;

function getKey(): Buffer | null {
  if (_keyAvailable === false) return null;
  if (!_key) {
    const hex = process.env.ENCRYPTION_KEY;
    if (!hex || hex.length !== 64) {
      _keyAvailable = false;
      return null;
    }
    _key = Buffer.from(hex, 'hex');
    _keyAvailable = true;
  }
  return _key;
}

/**
 * Encrypt text. If ENCRYPTION_KEY is not set, returns plaintext.
 * Encrypted format: "iv:tag:ciphertext" (all hex).
 */
export function encrypt(text: string): string {
  const key = getKey();
  if (!key) return text; // Graceful: no encryption without key
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt text. Auto-detects if data is encrypted (contains 2 colons).
 * If not encrypted or ENCRYPTION_KEY missing, returns as-is.
 */
export function decrypt(data: string): string {
  // Detect if encrypted: format is "hex32:hex32:hexN"
  const parts = data.split(':');
  if (parts.length !== 3 || parts[0].length !== 32) {
    return data; // Not encrypted, return as-is
  }
  const key = getKey();
  if (!key) return data; // No key, return as-is
  try {
    const decipher = createDecipheriv(ALGO, key, Buffer.from(parts[0], 'hex'));
    decipher.setAuthTag(Buffer.from(parts[1], 'hex'));
    return decipher.update(Buffer.from(parts[2], 'hex')) + decipher.final('utf8');
  } catch {
    return data; // Decryption failed, return as-is (might be plaintext)
  }
}
