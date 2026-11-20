/**
 * Cryptographic helpers for SFX Composer licensing backend.
 * Provides:
 *  - High-entropy license key generation (avoiding ambiguous glyphs 0, O, 1, I)
 *  - Cryptographic SHA-256 hashing for fast database lookup & verification
 *  - Authenticated AES-256-GCM server-side encryption/decryption for secure key recovery
 */

export function generateLicenseKey(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);

  const chunks: string[] = ['SFX'];
  for (let c = 0; c < 4; c++) {
    let chunk = '';
    for (let i = 0; i < 4; i++) {
      const idx = randomBytes[c * 4 + i] % chars.length;
      chunk += chars[idx];
    }
    chunks.push(chunk);
  }
  return chunks.join('-');
}

export async function sha256(text: string): Promise<string> {
  const buffer = new TextEncoder().encode(text.trim().toUpperCase());
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function getEncryptionCryptoKey(customSecret?: string): Promise<CryptoKey> {
  let secretHex = (customSecret || Deno.env.get('LICENSE_ENCRYPTION_KEY') || '').trim();
  if (!secretHex) {
    // Fallback to a deterministic hash of service role key if encryption key secret isn't configured
    const sKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || 'sfx-default-secure-fallback-key-32';
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sKey));
    secretHex = bytesToHex(new Uint8Array(buf));
  }

  // Ensure key bytes is exactly 32 bytes (256-bit)
  let keyBytes: Uint8Array;
  if (/^[0-9a-fA-F]{64}$/.test(secretHex)) {
    keyBytes = hexToBytes(secretHex);
  } else {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secretHex));
    keyBytes = new Uint8Array(hash);
  }

  return await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts a plaintext license key using AES-256-GCM.
 * Output format: "ivHex:ciphertextAndTagHex"
 */
export async function encryptLicenseKey(plaintext: string, secret?: string): Promise<string> {
  try {
    const key = await getEncryptionCryptoKey(secret);
    const iv = new Uint8Array(12);
    crypto.getRandomValues(iv);

    const encoded = new TextEncoder().encode(plaintext.trim());
    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      encoded
    );

    const ivHex = bytesToHex(iv);
    const cipherHex = bytesToHex(new Uint8Array(encryptedBuffer));
    return `${ivHex}:${cipherHex}`;
  } catch (err) {
    console.error('Failed to encrypt license key:', err);
    throw new Error('Encryption failed');
  }
}

/**
 * Decrypts an encrypted license key payload formatted as "ivHex:ciphertextAndTagHex".
 * Returns the original plaintext key or null if decryption fails.
 */
export async function decryptLicenseKey(payload: string, secret?: string): Promise<string | null> {
  if (!payload || !payload.includes(':')) {
    return null;
  }
  try {
    const [ivHex, cipherHex] = payload.split(':');
    if (!ivHex || !cipherHex) return null;

    const iv = hexToBytes(ivHex);
    const cipherBytes = hexToBytes(cipherHex);
    const key = await getEncryptionCryptoKey(secret);

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      cipherBytes
    );

    return new TextDecoder().decode(decryptedBuffer);
  } catch (err) {
    console.warn('Failed to decrypt license key:', err);
    return null;
  }
}
