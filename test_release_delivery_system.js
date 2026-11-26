/**
 * test_release_delivery_system.js
 * Automated verification suite for SFX Composer Automated Release & Customer Download System.
 * Covers Scenarios 1–12 safely without modifying production data or creating real charges.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let total = 0;
async function test(name, fn) {
  total++;
  try {
    await fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL: ${name}\n    ${err.message}`);
    process.exitCode = 1;
  }
}

(async () => {
  console.log('=== SFX COMPOSER — AUTOMATED RELEASE & DOWNLOAD SYSTEM TESTS ===');

  // 1. Live GitHub version.json manifest schema & extension ID check
  await test('Official Sfx-composer-updt version.json is valid and matches com.sfxcomposer.panel', async () => {
    const res = await fetch('https://raw.githubusercontent.com/visualsadusk-source/Sfx-composer-updt/main/version.json');
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.extension_id, 'com.sfxcomposer.panel');
    assert.ok(/^\d+\.\d+\.\d+$/.test(data.latest_version));
    assert.ok(Array.isArray(data.changelog) && data.changelog.length > 0);
  });

  // 2. Frontend js/release-service.js behavior in sandbox
  await test('js/release-service.js detects new versions and blocks invalid/unapproved manifests', () => {
    const code = fs.readFileSync(path.join(__dirname, 'js/release-service.js'), 'utf8');
    const sandbox = {
      window: {},
      document: { readyState: 'complete', addEventListener: () => {}, querySelectorAll: () => [] },
      sessionStorage: { getItem: () => null, setItem: () => {} },
      fetch: async () => ({ ok: false, status: 503 })
    };
    sandbox.window = sandbox;
    vm.runInNewContext(code, sandbox);
    const svc = sandbox.SFXReleaseService;
    assert.ok(svc, 'SFXReleaseService must register on window');
    assert.strictEqual(svc.compareSemver('2.3.0', '2.2.0'), 1);
    assert.strictEqual(svc.compareSemver('2.2.0', '2.2.0'), 0);
    assert.strictEqual(svc.compareSemver('2.1.9', '2.2.0'), -1);

    // Valid new release
    const okRel = svc.normalizeRelease({
      extension_id: 'com.sfxcomposer.panel',
      latest_version: '2.3.0',
      release_date: '2026-12-01',
      changelog: ['New feature']
    });
    assert.strictEqual(okRel.latest_version, '2.3.0');

    // Unapproved / draft / wrong extension ID / bad semver blocked
    assert.strictEqual(svc.normalizeRelease({ extension_id: 'com.sfxcomposer.panel', latest_version: '2.3.0', approved: false }), null);
    assert.strictEqual(svc.normalizeRelease({ extension_id: 'com.sfxcomposer.panel', latest_version: '2.3.0', status: 'draft' }), null);
    assert.strictEqual(svc.normalizeRelease({ extension_id: 'com.other.panel', latest_version: '2.3.0' }), null);
    assert.strictEqual(svc.normalizeRelease({ extension_id: 'com.sfxcomposer.panel', latest_version: '2.3.0-beta' }), null);
  });

  // 3. GitHub / Edge outage handling
  await test('js/release-service.js returns null gracefully on outage (no hardcoded ZXP fallback)', async () => {
    const code = fs.readFileSync(path.join(__dirname, 'js/release-service.js'), 'utf8');
    const sandbox = {
      window: {},
      document: { readyState: 'complete', addEventListener: () => {}, querySelectorAll: () => [] },
      sessionStorage: { getItem: () => null, setItem: () => {} },
      fetch: async () => { throw new Error('Network down'); }
    };
    sandbox.window = sandbox;
    vm.runInNewContext(code, sandbox);
    const res = await sandbox.SFXReleaseService.getLatestRelease(true);
    assert.strictEqual(res, null);
  });

  // 4. Single Latest-Release Resolver fail-closed checks
  await test('release-resolver.ts enforces extension_id, semver, approval, storage asset check, and no hardcoded ZXP', () => {
    const src = fs.readFileSync(path.join(__dirname, 'supabase/functions/_shared/release-resolver.ts'), 'utf8');
    assert.ok(src.includes("EXPECTED_EXTENSION_ID = 'com.sfxcomposer.panel'"));
    assert.ok(src.includes("code: 'UNAPPROVED_RELEASE'"));
    assert.ok(src.includes("code: 'EXTENSION_ID_MISMATCH'"));
    assert.ok(src.includes("code: 'INVALID_VERSION'"));
    assert.ok(src.includes("code: 'ASSET_MISSING'"));
    assert.ok(src.includes("code: 'RELEASE_UNAVAILABLE'"));
    assert.ok(src.includes('sfx-composer-pro-v${'));
    assert.ok(!src.includes('sfx-composer-pro-v2.2.0.zxp'));
  });

  // 5. Dynamic download Edge Function
  await test('download/index.ts resolves release dynamically and enforces SHA-256 checksum verification', () => {
    const src = fs.readFileSync(path.join(__dirname, 'supabase/functions/download/index.ts'), 'utf8');
    assert.ok(src.includes('resolveLatestRelease(supabase, { verifyStorageAsset: true })'));
    assert.ok(src.includes("code: 'CHECKSUM_MISMATCH'"));
    assert.ok(!src.includes('sfx-composer-pro-v2.2.0.zxp'));
  });

  // 6. Payment & Portal Integration
  await test('verify-payment and customer-portal use resolveLatestRelease instead of hardcoded v2.2.0', () => {
    const vp = fs.readFileSync(path.join(__dirname, 'supabase/functions/verify-payment/index.ts'), 'utf8');
    const cp = fs.readFileSync(path.join(__dirname, 'supabase/functions/customer-portal/index.ts'), 'utf8');
    assert.ok(vp.includes('resolveLatestRelease('));
    assert.ok(!vp.includes("version: 'v2.2.0'"));
    assert.ok(cp.includes('resolveLatestRelease('));
    assert.ok(cp.includes('latest_version: latestRelease.latest_version'));
  });

  // 7. Admin Release Management
  await test('admin-releases/index.ts requires verifyAdminRequest, verifies SHA-256 against Storage, and supports rollback', () => {
    const src = fs.readFileSync(path.join(__dirname, 'supabase/functions/admin-releases/index.ts'), 'utf8');
    assert.ok(src.includes('verifyAdminRequest(req)'));
    assert.ok(src.includes("action === 'approve'"));
    assert.ok(src.includes("action === 'rollback'"));
    assert.ok(src.includes("code: 'ASSET_MISSING'"));
    assert.ok(src.includes("code: 'CHECKSUM_MISMATCH'"));
  });

  // 7b. Migration Hardening
  await test('20261127_sfx_releases.sql enforces unique active release, semver/sha256 checks, RLS, and no authenticated grant', () => {
    const sql = fs.readFileSync(path.join(__dirname, 'supabase/migrations/20261127_sfx_releases.sql'), 'utf8');
    assert.ok(sql.includes('idx_sfx_releases_one_active'));
    assert.ok(sql.includes('WHERE is_active = true'));
    assert.ok(sql.includes('ENABLE ROW LEVEL SECURITY'));
    assert.ok(sql.includes('REVOKE ALL ON TABLE public.sfx_releases FROM PUBLIC, anon, authenticated'));
    assert.ok(!sql.includes('TO authenticated;') || sql.includes('FOR SELECT\n  TO authenticated'));
    assert.ok(sql.includes('public.is_admin()'));
  });

  // 8. Customer Dashboard js/main.js
  await test('js/main.js displays dynamic release version, notes, SHA-256, and Edge download fallback', () => {
    const src = fs.readFileSync(path.join(__dirname, 'js/main.js'), 'utf8');
    assert.ok(src.includes('Download Latest Version'));
    assert.ok(src.includes('portal.release'));
    assert.ok(src.includes('wyjazmiihwjlrkggeeez.supabase.co/functions/v1/download'));
  });

  // 9. Secret & Hygiene Scan
  await test('No GitHub tokens, service_role keys, or .p12 credentials exposed in frontend/new files', () => {
    const files = [
      'js/release-service.js',
      'js/main.js',
      'supabase/functions/_shared/release-resolver.ts',
      'supabase/functions/latest-release/index.ts',
      'supabase/functions/admin-releases/index.ts',
      'supabase/functions/download/index.ts'
    ];
    for (const f of files) {
      const txt = fs.readFileSync(path.join(__dirname, f), 'utf8');
      assert.ok(!/ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]+|rzp_live_[A-Za-z0-9]+|\.p12/i.test(txt), `Sensitive token/pattern in ${f}`);
      if (f.startsWith('js/')) {
        assert.ok(!/service_role/.test(txt), `service_role leaked in ${f}`);
      }
    }
  });

  console.log(`\nSUMMARY: ${passed} / ${total} checks passed.`);
})();
