/**
 * test_ultimate_bundle_verification.js
 * Comprehensive automated verification suite for:
 * 1. SFX Composer Ultimate Bundle (Plugin + 7GB SFX Library) for ₹199
 * 2. Dedicated SFX Library page (/library & /library.html) with all 20 folder categories
 * 3. Secure fulfillment (Google Drive delivery link via server/checkout verification & Brevo email)
 * 4. Navigation tabs and modals consistency across index.html, demo.html, screenshots.html, and library.html
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT_DIR = __dirname;
const EXPECTED_FOLDERS = [
  'Button',
  'Countdown & List',
  'Devin SFX',
  'Foley',
  'General Music',
  'Glitch & Flicker',
  'Granular Combo',
  'Granular',
  'Human',
  'Impact & Hit',
  'Music Sounds Effect',
  'Power Down & Up',
  'sfx 1',
  'SFX Monster',
  'sound effect important 2.0',
  'Sound Effects',
  'Transition',
  'Typing',
  'UE SFX PACK',
  'ui sfx'
];

const DRIVE_URL = 'https://drive.google.com/file/d/1rF1f3KEKSpri1KoZqP8SCv-Q0-NYxvGD/view?usp=sharing';

function fetchUrl(pathname) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:3000${pathname}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, data, headers: res.headers }));
    }).on('error', reject);
  });
}

async function runTests() {
  console.log('🧪 Starting Ultimate Bundle Verification Test Suite...\n');
  let passed = 0;
  let total = 0;

  function test(desc, fn) {
    total++;
    try {
      fn();
      console.log(`  ✅ PASS: ${desc}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${desc}`);
      console.error(`     Error: ${err.message}`);
    }
  }

  async function testAsync(desc, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✅ PASS: ${desc}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${desc}`);
      console.error(`     Error: ${err.message}`);
    }
  }

  // 1. Check HTTP Status for /library and /library.html
  await testAsync('Clean URL GET /library returns HTTP 200 with HTML content', async () => {
    const res = await fetchUrl('/library');
    assert.strictEqual(res.statusCode, 200, `Expected 200 but got ${res.statusCode}`);
    assert.ok(res.data.includes('SFX LIBRARY'), 'Missing SFX LIBRARY title');
    assert.ok(res.data.includes('7GB MASTER AUDIO ARCHIVE'), 'Missing 7GB kicker');
    assert.ok(res.data.includes('SFX COMPOSER ULTIMATE BUNDLE') || res.data.includes('SFX COMPOSER + PREMIUM SFX LIBRARY'), 'Missing bundle top banner');
  });

  await testAsync('Static URL GET /library.html returns HTTP 200', async () => {
    const res = await fetchUrl('/library.html');
    assert.strictEqual(res.statusCode, 200, `Expected 200 but got ${res.statusCode}`);
    assert.ok(res.data.includes('SFX LIBRARY'), 'Missing SFX LIBRARY title');
  });

  // 2. Check 20 Folder Categories in library.html
  test('library.html contains all 20 exact folder categories', () => {
    const html = fs.readFileSync(path.join(ROOT_DIR, 'library.html'), 'utf8');
    EXPECTED_FOLDERS.forEach(folder => {
      assert.ok(
        html.includes(`data-name="${folder}"`) || html.includes(folder),
        `Folder category "${folder}" not found in library.html`
      );
    });
  });

  // 3. Check that no fake individual audio filenames are invented in library.html
  test('library.html does NOT invent fake audio filenames/tracks', () => {
    const html = fs.readFileSync(path.join(ROOT_DIR, 'library.html'), 'utf8');
    // Ensure technical specs are shown instead of fake mp3/wav files
    assert.ok(html.includes('24-bit / 48kHz WAV'), 'Expected technical format spec');
    assert.ok(html.includes('Google Drive (7GB)'), 'Expected delivery spec');
    assert.ok(!html.includes('button_click_01.wav'), 'Found fake audio file');
    assert.ok(!html.includes('whoosh_trans_04.wav'), 'Found fake audio file');
  });

  // 4. Check Ultimate Bundle presentation in index.html
  test('index.html showcases the SFX Composer Ultimate Bundle for ₹199', () => {
    const html = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
    assert.ok(html.includes('TWO PRODUCTS') && html.includes('ONE BUNDLE'), 'Missing bundle badge');
    assert.ok(html.includes('SFX Composer Ultimate Bundle'), 'Missing Ultimate Bundle title');
    assert.ok(html.includes('₹199'), 'Missing ₹199 price tag');
    assert.ok(html.includes('sfx-overview-main.png'), 'Missing plugin preview image');
    assert.ok(html.includes('7GB Master SFX Library') || html.includes('7GB Premium SFX Library'), 'Missing 7GB SFX Library card');
    assert.ok(html.includes('Buy Complete Bundle'), 'Missing Buy Complete Bundle CTA button');
  });

  // 5. Check Navigation across all primary pages
  test('All primary pages (index, demo, screenshots, library) include SFX Library navigation', () => {
    const pages = ['index.html', 'demo.html', 'screenshots.html', 'library.html'];
    pages.forEach(p => {
      const html = fs.readFileSync(path.join(ROOT_DIR, p), 'utf8');
      assert.ok(html.includes('library.html'), `Page ${p} missing link to library.html`);
      assert.ok(html.includes('SFX Library'), `Page ${p} missing SFX Library navigation label`);
    });
  });

  // 6. Check Checkout modal consistency and Ultimate Bundle delivery buttons
  test('All pages have consistent Ultimate Bundle checkout modal with SFX Library Drive download', () => {
    const pages = ['index.html', 'demo.html', 'screenshots.html', 'library.html'];
    pages.forEach(p => {
      const html = fs.readFileSync(path.join(ROOT_DIR, p), 'utf8');
      assert.ok(html.includes('id="checkout-modal"'), `Page ${p} missing checkout-modal`);
      assert.ok(html.includes('SFX Composer Ultimate Bundle'), `Page ${p} checkout modal missing Ultimate Bundle title`);
      assert.ok(html.includes('id="success-sfx-library-btn"'), `Page ${p} missing success-sfx-library-btn`);
      assert.ok(html.includes(DRIVE_URL), `Page ${p} missing Drive URL in success modal or binding`);
    });
  });

  // 7. Check Customer Portal consistency across pages
  test('All pages have consistent Customer Dashboard with 7GB SFX Library Drive link', () => {
    const pages = ['index.html', 'demo.html', 'screenshots.html', 'library.html'];
    pages.forEach(p => {
      const html = fs.readFileSync(path.join(ROOT_DIR, p), 'utf8');
      assert.ok(html.includes('id="customer-dashboard-modal"'), `Page ${p} missing customer-dashboard-modal`);
      assert.ok(html.includes('id="cdm-sfx-library-btn"'), `Page ${p} missing cdm-sfx-library-btn`);
    });
  });

  // 8. Check Backend Functions for secure delivery
  test('.env exists and defines SFX_LIBRARY_DRIVE_URL', () => {
    const env = fs.readFileSync(path.join(ROOT_DIR, '.env'), 'utf8');
    assert.ok(env.includes('SFX_LIBRARY_DRIVE_URL='), 'Missing SFX_LIBRARY_DRIVE_URL in .env');
    assert.ok(env.includes(DRIVE_URL), 'Incorrect Drive URL in .env');
  });

  test('server.js loads .env and defines SFX_LIBRARY_DRIVE_URL fallback', () => {
    const srv = fs.readFileSync(path.join(ROOT_DIR, 'server.js'), 'utf8');
    assert.ok(srv.includes('SFX_LIBRARY_DRIVE_URL'), 'server.js missing SFX_LIBRARY_DRIVE_URL');
  });

  test('verify-payment Supabase Edge Function includes sfx_library_url in downloads', () => {
    const fn = fs.readFileSync(path.join(ROOT_DIR, 'supabase', 'functions', 'verify-payment', 'index.ts'), 'utf8');
    assert.ok(fn.includes('sfx_library_url:'), 'verify-payment missing sfx_library_url');
    assert.ok(fn.includes('SFX_LIBRARY_DRIVE_URL'), 'verify-payment missing SFX_LIBRARY_DRIVE_URL lookup');
  });

  test('brevo.ts includes Product 1 and Product 2 in customer confirmation email', () => {
    const brevo = fs.readFileSync(path.join(ROOT_DIR, 'supabase', 'functions', '_shared', 'brevo.ts'), 'utf8');
    assert.ok(brevo.includes('SFX Composer Ultimate Bundle'), 'brevo.ts missing Ultimate Bundle title');
    assert.ok(brevo.includes('7GB Master SFX Library') || brevo.includes('7GB MASTER SOUND EFFECTS LIBRARY'), 'brevo.ts missing 7GB SFX Library header');
    assert.ok(brevo.includes('sfxLibraryDriveUrl'), 'brevo.ts missing sfxLibraryDriveUrl variable');
  });

  test('customer-portal Edge Function returns sfx_library_url', () => {
    const cp = fs.readFileSync(path.join(ROOT_DIR, 'supabase', 'functions', 'customer-portal', 'index.ts'), 'utf8');
    assert.ok(cp.includes('sfx_library_url:'), 'customer-portal missing sfx_library_url');
  });

  console.log(`\n========================================`);
  console.log(`Results: ${passed} / ${total} passed`);
  console.log(`========================================\n`);

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
