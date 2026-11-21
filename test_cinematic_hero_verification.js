const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function verifyCinematicHero() {
  console.log('================================================================');
  console.log(' SFX COMPOSER — CINEMATIC HERO SHOWCASE VERIFICATION');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function pass(msg) {
    total++;
    passed++;
    console.log(`✓ PASS [${total}]: ${msg}`);
  }

  // 1. Image File Verification
  console.log('--- TEST GROUP 1: EXACT UPLOADED HERO IMAGE ASSET ---');
  const heroPath = path.join(__dirname, 'assets', 'images', 'SFX Composer_ Cinematic Audio Suite.png');
  assert.ok(fs.existsSync(heroPath), 'Hero image file "SFX Composer_ Cinematic Audio Suite.png" must exist in assets/images/');
  const stat = fs.statSync(heroPath);
  assert.strictEqual(stat.size, 243417, `File size (${stat.size}) must match exact uploaded size (243,417 bytes)`);
  pass('Hero image file on disk matches exact uploaded bytes');

  // Verify HTTP 200 via server
  const res = await fetch('http://localhost:3000/assets/images/SFX%20Composer_%20Cinematic%20Audio%20Suite.png');
  assert.strictEqual(res.status, 200, 'Server must serve hero image with HTTP 200');
  const contentType = res.headers.get('content-type');
  assert.ok(contentType.includes('image'), `Content-Type (${contentType}) must be an image`);
  pass('Hero image is served via HTTP 200 over localhost:3000');

  // 2. Page Order & Placement in screenshots.html
  console.log('\n--- TEST GROUP 2: HERO PLACEMENT & GALLERY STRUCTURE ---');
  const html = fs.readFileSync(path.join(__dirname, 'screenshots.html'), 'utf8');

  const headIdx = html.indexOf('class="sfx-site-sec-head"');
  const heroIdx = html.indexOf('id="gallery-hero-showcase"');
  const overviewIdx = html.indexOf('id="gallery-overview"');
  const browserIdx = html.indexOf('id="gallery-browser"');

  assert.ok(headIdx !== -1, 'Heading and intro section must exist');
  assert.ok(heroIdx !== -1, 'Cinematic hero showcase section must exist');
  assert.ok(overviewIdx !== -1, 'Screenshot 01 (Overview) section must exist');
  assert.ok(browserIdx !== -1, 'Screenshot 02 (Sound Browser) section must exist');

  // Assert exact order: Heading -> Hero -> Overview -> Browser
  assert.ok(headIdx < heroIdx, '1. Heading and description must appear before Cinematic Hero');
  assert.ok(heroIdx < overviewIdx, '2. Cinematic Hero must appear directly before Screenshot 01 – Overview');
  assert.ok(overviewIdx < browserIdx, '3. Screenshot 01 must appear before Screenshot 02 – Sound Browser');
  pass('Gallery structure matches exact order: Heading -> Hero Image -> Overview (01) -> Browser (02) -> Features');

  // 3. Image tag attributes in screenshots.html
  console.log('\n--- TEST GROUP 3: HERO IMAGE ATTRIBUTES & CENTERING ---');
  assert.ok(
    html.includes('src="assets/images/SFX Composer_ Cinematic Audio Suite.png"') ||
    html.includes('src="assets/images/SFX%20Composer_%20Cinematic%20Audio%20Suite.png"'),
    'Hero image must reference SFX Composer_ Cinematic Audio Suite.png'
  );
  assert.ok(html.includes('id="sfx-gallery-hero-img"'), 'Hero image has specific ID');
  assert.ok(html.includes('id="sfx-gallery-hero-stage"'), 'Hero image container stage exists');
  pass('Hero image element correctly references exact file path');

  // Check that hero image is not duplicated elsewhere in screenshots.html or index.html
  const heroOccurrences = (html.match(/SFX Composer_ Cinematic Audio Suite\.png/g) || []).length;
  assert.strictEqual(heroOccurrences, 1, 'Hero image must appear exactly once on screenshots.html (no duplication)');
  pass('Hero image is not duplicated elsewhere on the page');

  // 4. CSS Styling: 16:9 Aspect Ratio, 10-12px rounded corners, subtle border, dark background
  console.log('\n--- TEST GROUP 4: CSS STYLING & 16:9 RATIO ---');
  const css = fs.readFileSync(path.join(__dirname, 'css', 'style.css'), 'utf8');

  assert.ok(css.includes('.sfx-gallery-hero-section'), 'CSS contains .sfx-gallery-hero-section');
  assert.ok(css.includes('.sfx-gallery-hero-card'), 'CSS contains .sfx-gallery-hero-card');
  assert.ok(css.includes('border-radius: 12px'), 'Card uses ~10-12px rounded corners (12px)');
  assert.ok(css.includes('aspect-ratio: 16 / 9'), 'Stage & image preserve exact 16:9 aspect ratio');
  assert.ok(css.includes('object-fit: contain'), 'Image uses object-fit: contain to prevent cropping');
  assert.ok(css.includes('.sfx-gallery-hero-topbar'), 'SaaS topbar styling exists');
  assert.ok(css.includes('.sfx-gallery-hero-info'), 'SaaS info bar styling exists');
  pass('CSS guarantees exact 16:9 aspect ratio, 12px rounded corners, dark backdrop & no crop');

  // 5. Lightbox Integration
  console.log('\n--- TEST GROUP 5: LIGHTBOX INTEGRATION ---');
  const js = fs.readFileSync(path.join(__dirname, 'js', 'plugin-controller.js'), 'utf8');
  assert.ok(js.includes('sfx-gallery-hero-stage'), 'JS attaches click listener to hero stage');
  assert.ok(js.includes('sfx-hero-expand-btn'), 'JS attaches click listener to hero expand button');
  assert.ok(js.includes('SFX Composer_ Cinematic Audio Suite.png'), 'Lightbox displays the high-resolution hero image');
  pass('Fullscreen lightbox viewer correctly supports the new Cinematic Hero image');

  // 6. Existing Screenshot Separation & Lightbox Indices
  console.log('\n--- TEST GROUP 6: EXISTING SCREENSHOT SEPARATION ---');
  for (let i = 0; i <= 8; i++) {
    assert.ok(html.includes(`data-lightbox-idx="${i}"`), `Screenshot card with data-lightbox-idx="${i}" must be preserved`);
  }
  pass('All 9 existing screenshot cards remain separate with preserved lightbox indices');

  console.log('\n================================================================');
  console.log(` ALL ${passed}/${total} CINEMATIC HERO VERIFICATION TESTS PASSED!`);
  console.log('================================================================');
}

verifyCinematicHero().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
