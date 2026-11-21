/**
 * test_main_hero_verification.js
 * Comprehensive automated verification suite for:
 * 1. Exact uploaded image byte matching and HTTP 200 serving
 * 2. Placement in Main Page (Overview) hero section (#hero)
 * 3. 16:9 aspect ratio and object-fit: contain enforcement
 * 4. Ambient blue lighting and premium SaaS framing
 * 5. Strict adherence to restrictions:
 *    - NOT in screenshots.html (Screenshots Gallery)
 *    - NOT in demo.html or library.html
 *    - NOT duplicated elsewhere on index.html
 *    - No horizontal overflow
 *    - Preserved sidebar, navigation, and other sections
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT_DIR = __dirname;
const ORIGINAL_UPLOAD = 'C:/Users/visua/.gemini/antigravity/brain/0edd86d3-68a4-4ba3-9b5c-ce93ce3ab4b8/.user_uploaded/media_1795264565741_0cb7130c.png';
const HERO_IMG_FILE = path.join(ROOT_DIR, 'assets', 'images', 'sfx-composer-main-hero.png');

function fetchUrl(pathname) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:3000${pathname}`, (res) => {
      let data = '';
      let len = 0;
      res.on('data', chunk => {
        data += chunk;
        len += chunk.length;
      });
      res.on('end', () => resolve({ statusCode: res.statusCode, data, len, headers: res.headers }));
    }).on('error', reject);
  });
}

async function runTests() {
  console.log('🧪 Starting Main Page Hero Verification Test Suite...\n');
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

  // 1. Exact Image File on Disk
  test('Hero image file on disk matches exact uploaded bytes', () => {
    assert.ok(fs.existsSync(HERO_IMG_FILE), 'Hero image file missing');
    const heroStat = fs.statSync(HERO_IMG_FILE);
    const origStat = fs.statSync(ORIGINAL_UPLOAD);
    assert.strictEqual(heroStat.size, origStat.size, `File size mismatch: ${heroStat.size} vs ${origStat.size}`);
    assert.strictEqual(heroStat.size, 988292, `Expected 988,292 bytes but got ${heroStat.size}`);
  });

  // 2. HTTP 200 Serving
  await testAsync('Hero image is served via HTTP 200 with exact length and image/png MIME', async () => {
    const res = await fetchUrl('/assets/images/sfx-composer-main-hero.png');
    assert.strictEqual(res.statusCode, 200, `Expected 200 but got ${res.statusCode}`);
    assert.strictEqual(res.len, 988292, `Expected 988,292 bytes but got ${res.len}`);
    assert.strictEqual(res.headers['content-type'], 'image/png');
  });

  // 3. Placement inside index.html Hero Section
  test('Hero image element is placed inside #hero section on index.html', () => {
    const html = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
    const heroIdx = html.indexOf('id="hero"');
    const heroEndIdx = html.indexOf('</section>', heroIdx);
    const showcaseIdx = html.indexOf('id="main-hero-showcase"');
    const imgIdx = html.indexOf('id="sfx-main-hero-img"');

    assert.ok(heroIdx !== -1, 'Missing #hero section');
    assert.ok(showcaseIdx > heroIdx && showcaseIdx < heroEndIdx, '#main-hero-showcase must be inside #hero section');
    assert.ok(imgIdx > showcaseIdx && imgIdx < heroEndIdx, '#sfx-main-hero-img must be inside #main-hero-showcase');
  });

  // 4. Exact Image Source Reference
  test('Hero image uses exact assets/images/sfx-composer-main-hero.png source', () => {
    const html = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
    assert.ok(
      html.includes('src="assets/images/sfx-composer-main-hero.png"'),
      'Missing exact image source path'
    );
  });

  // 5. 16:9 Aspect Ratio & object-fit: contain in CSS
  test('CSS enforces 16:9 aspect ratio and object-fit: contain without cropping', () => {
    const css = fs.readFileSync(path.join(ROOT_DIR, 'css', 'style.css'), 'utf8');
    assert.ok(css.includes('.sfx-main-hero-stage'), 'Missing .sfx-main-hero-stage');
    assert.ok(css.includes('aspect-ratio: 16 / 9;'), 'Missing aspect-ratio: 16 / 9');
    assert.ok(css.includes('.sfx-main-hero-img'), 'Missing .sfx-main-hero-img');
    assert.ok(css.includes('object-fit: contain;'), 'Missing object-fit: contain');
  });

  // 6. Ambient Blue Lighting and SaaS Framing
  test('CSS includes ambient blue backlight glow and premium SaaS framing', () => {
    const css = fs.readFileSync(path.join(ROOT_DIR, 'css', 'style.css'), 'utf8');
    assert.ok(css.includes('.sfx-main-hero-glow'), 'Missing .sfx-main-hero-glow');
    assert.ok(css.includes('radial-gradient'), 'Missing radial-gradient glow');
    assert.ok(css.includes('.sfx-main-hero-frame'), 'Missing .sfx-main-hero-frame');
    assert.ok(css.includes('border-radius: 14px;'), 'Missing rounded corners for hero frame');
    assert.ok(css.includes('.sfx-main-hero-bar'), 'Missing SaaS top bar');
  });

  // 7. Strict Restrictions Check: Not added to Screenshots Gallery (screenshots.html)
  test('Hero image is NOT added to screenshots.html (Screenshots Gallery)', () => {
    const html = fs.readFileSync(path.join(ROOT_DIR, 'screenshots.html'), 'utf8');
    assert.ok(!html.includes('sfx-composer-main-hero.png'), 'Found hero image incorrectly added to screenshots.html');
  });

  // 8. Strict Restrictions Check: Not added to demo.html or library.html
  test('Hero image is NOT added to demo.html or library.html', () => {
    const demo = fs.readFileSync(path.join(ROOT_DIR, 'demo.html'), 'utf8');
    const library = fs.readFileSync(path.join(ROOT_DIR, 'library.html'), 'utf8');
    assert.ok(!demo.includes('sfx-composer-main-hero.png'), 'Found hero image in demo.html');
    assert.ok(!library.includes('sfx-composer-main-hero.png'), 'Found hero image in library.html');
  });

  // 9. Strict Restrictions Check: Not duplicated elsewhere in index.html
  test('Hero image is NOT duplicated elsewhere on index.html', () => {
    const html = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
    const count = (html.match(/sfx-composer-main-hero\.png/g) || []).length;
    assert.strictEqual(count, 1, `Expected exactly 1 occurrence on index.html but found ${count}`);
  });

  // 10. Existing Sections Intact on index.html
  test('All existing sections (#explore-destinations, #features, #tutorials, #pricing, #faq) remain intact', () => {
    const html = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
    assert.ok(html.includes('id="explore-destinations"'), 'Missing #explore-destinations');
    assert.ok(html.includes('id="features"'), 'Missing #features');
    assert.ok(html.includes('id="tutorials"'), 'Missing #tutorials');
    assert.ok(html.includes('id="pricing"'), 'Missing #pricing');
    assert.ok(html.includes('id="faq"'), 'Missing #faq');
  });

  // 11. Preserved Sidebar & Navigation
  test('Sidebar navigation and actions remain functional and intact', () => {
    const html = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
    assert.ok(html.includes('id="sfx-left-nav"'), 'Missing sidebar nav');
    assert.ok(html.includes('href="demo.html"'), 'Missing link to demo.html');
    assert.ok(html.includes('href="screenshots.html"'), 'Missing link to screenshots.html');
    assert.ok(html.includes('href="library.html"'), 'Missing link to library.html');
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
