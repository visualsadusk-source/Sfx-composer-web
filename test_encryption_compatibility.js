/**
 * test_encryption_compatibility.js
 * Verifies AES-256-GCM license encryption/decryption compatibility between
 * Node.js (api/customer-portal.js) and Supabase Edge Functions (_shared/crypto.ts).
 */

const assert = require('assert');
const crypto = require('crypto');
const { webcrypto } = crypto;

const portal = require('./api/customer-portal');

// Mirror of supabase/functions/_shared/crypto.ts WebCrypto AES-256-GCM logic
async function edgeDeriveKey(secretHex) {
  let keyBytes;
  if (/^[0-9a-fA-F]{64}$/.test(secretHex)) {
    keyBytes = Buffer.from(secretHex, 'hex');
  } else {
    const hash = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(secretHex));
    keyBytes = new Uint8Array(hash);
  }
  return webcrypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function edgeEncrypt(plaintext, secret) {
  const key = await edgeDeriveKey(secret.trim());
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext.trim());
  const buf = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return Buffer.from(iv).toString('hex') + ':' + Buffer.from(buf).toString('hex');
}

async function edgeDecrypt(payload, secret) {
  const [ivHex, cipherHex] = payload.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const cipherBytes = Buffer.from(cipherHex, 'hex');
  const key = await edgeDeriveKey(secret.trim());
  const dec = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherBytes);
  return new TextDecoder().decode(dec);
}

(async () => {
  const origEncKey = process.env.LICENSE_ENCRYPTION_KEY;
  const origSvcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    const hex64Key = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const nonHexSecret = 'my-non-hex-passphrase-secret-value';
    const sampleLicense = 'SFX-ABCD-2345-EFGH-6789';

    // 1. 64-character hexadecimal key derivation & cross-compat (Edge <-> Node)
    process.env.LICENSE_ENCRYPTION_KEY = hex64Key;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const derivedHex = portal.deriveAesKeyFromSecret(hex64Key);
    assert.strictEqual(derivedHex.length, 32, '64-hex key must decode to 32 raw bytes');
    assert.strictEqual(derivedHex.toString('hex'), hex64Key, '64-hex key must not be double-hashed');

    const edgeCipherHex = await edgeEncrypt(sampleLicense, hex64Key);
    assert.strictEqual(portal.decryptLicenseKey(edgeCipherHex), sampleLicense, 'Node must decrypt Edge 64-hex ciphertext');

    const nodeCipherHex = portal.encryptLicenseKey(sampleLicense);
    assert.strictEqual(await edgeDecrypt(nodeCipherHex, hex64Key), sampleLicense, 'Edge must decrypt Node 64-hex ciphertext');

    // 2. Non-hexadecimal secret derivation & cross-compat (Edge <-> Node)
    process.env.LICENSE_ENCRYPTION_KEY = nonHexSecret;
    const derivedNonHex = portal.deriveAesKeyFromSecret(nonHexSecret);
    assert.strictEqual(derivedNonHex.length, 32, 'Non-hex key must derive 32 bytes via SHA-256');
    assert.strictEqual(
      derivedNonHex.toString('hex'),
      crypto.createHash('sha256').update(nonHexSecret, 'utf8').digest('hex')
    );

    const edgeCipherNonHex = await edgeEncrypt(sampleLicense, nonHexSecret);
    assert.strictEqual(portal.decryptLicenseKey(edgeCipherNonHex), sampleLicense, 'Node must decrypt Edge non-hex ciphertext');

    const nodeCipherNonHex = portal.encryptLicenseKey(sampleLicense);
    assert.strictEqual(await edgeDecrypt(nodeCipherNonHex, nonHexSecret), sampleLicense, 'Edge must decrypt Node non-hex ciphertext');

    // 3. Authentication tag verification (tampered ciphertext / tampered tag must fail)
    const [ivPart, cipherPart] = nodeCipherHex.split(':');
    const flippedLastChar = cipherPart.endsWith('0') ? '1' : '0';
    const tamperedPayload = `${ivPart}:${cipherPart.slice(0, -1)}${flippedLastChar}`;
    process.env.LICENSE_ENCRYPTION_KEY = hex64Key;
    assert.strictEqual(portal.decryptLicenseKey(tamperedPayload), null, 'Tampered auth tag/ciphertext must fail verification');
    assert.strictEqual(portal.decryptLicenseKey('invalid-payload'), null, 'Malformed payload must return null');

    // 4. Hardcoded fallback removed from new encryption path
    delete process.env.LICENSE_ENCRYPTION_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.throws(() => portal.getAesKey(), /LICENSE_ENCRYPTION_KEY is not configured/, 'getAesKey must throw when no key is configured');
    assert.throws(() => portal.encryptLicenseKey(sampleLicense), /LICENSE_ENCRYPTION_KEY is not configured/, 'encryptLicenseKey must refuse insecure hardcoded fallback');

    // 5. Legacy backward-compatible decryption (old Node SHA-256(64-hex), service key fallback, default fallback)
    // 5a. Old Node hashed 64-hex key with SHA-256
    const legacyShaOfHexKey = crypto.createHash('sha256').update(hex64Key, 'utf8').digest();
    const ivA = crypto.randomBytes(12);
    const cA = crypto.createCipheriv('aes-256-gcm', legacyShaOfHexKey, ivA);
    const encA = Buffer.concat([cA.update(sampleLicense, 'utf8'), cA.final(), cA.getAuthTag()]);
    const legacyHexHashedPayload = ivA.toString('hex') + ':' + encA.toString('hex');
    process.env.LICENSE_ENCRYPTION_KEY = hex64Key;
    assert.strictEqual(portal.decryptLicenseKey(legacyHexHashedPayload), sampleLicense, 'Must decrypt legacy Node SHA-256(64-hex) payload');

    // 5b. Legacy default fallback payload
    const legacyDefaultKey = crypto.createHash('sha256').update('sfx-default-secure-fallback-key-32', 'utf8').digest();
    const ivB = crypto.randomBytes(12);
    const cB = crypto.createCipheriv('aes-256-gcm', legacyDefaultKey, ivB);
    const encB = Buffer.concat([cB.update(sampleLicense, 'utf8'), cB.final(), cB.getAuthTag()]);
    const legacyDefaultPayload = ivB.toString('hex') + ':' + encB.toString('hex');
    assert.strictEqual(portal.decryptLicenseKey(legacyDefaultPayload), sampleLicense, 'Must decrypt legacy default-fallback payload');

    console.log('ALL_ENCRYPTION_COMPATIBILITY_TESTS_PASSED');
  } finally {
    if (origEncKey !== undefined) process.env.LICENSE_ENCRYPTION_KEY = origEncKey;
    else delete process.env.LICENSE_ENCRYPTION_KEY;
    if (origSvcKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = origSvcKey;
    else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
})();
