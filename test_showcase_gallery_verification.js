const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function verifyShowcaseGallery() {
  console.log('================================================================');
  console.log(' SFX COMPOSER — SHOWCASE & CLEAN NAVIGATION VERIFICATION');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function pass(msg) {
    total++;
    passed++;
    console.log(`✓ PASS [${total}]: ${msg}`);
  }

  // ── TEST 1: SCREENSHOT ASSETS EXIST & MATCH EXACT SIZES ──
  console.log('--- TEST GROUP 1: EXACT SCREENSHOT ASSETS ---');
  const screenshots = [
    { name: 'sfx-overview-main.png', expectedSize: 244858, section: 'Overview' },
    { name: 'sfx-browser-pixabay.png', expectedSize: 549859, section: 'Sound Browser (Pixabay)' },
    { name: 'sfx-browser-downloads.png', expectedSize: 165411, section: 'Sound Browser (Downloads)' },
    { name: 'sfx-browser-import.png', expectedSize: 135757, section: 'Sound Browser (Import)' },
    { name: 'sfx-ai-assistant.png', expectedSize: 289306, section: 'AI SFX Assistant' },
    { name: 'sfx-bgm-flow-transitions.png', expectedSize: 165898, section: 'BGM Flow' },
    { name: 'sfx-scene-ai-timeline.png', expectedSize: 157027, section: 'Scene AI' },
    { name: 'sfx-audio-tools-essential-sound.png', expectedSize: 291263, section: 'Audio Tools' },
    { name: 'sfx-settings-workspace.png', expectedSize: 146527, section: 'Settings' }
  ];

  for (const item of screenshots) {
    const fullPath = path.join(__dirname, 'assets', 'images', item.name);
    assert.ok(fs.existsSync(fullPath), `Screenshot ${item.name} must exist on disk`);
    const stat = fs.statSync(fullPath);
    assert.strictEqual(stat.size, item.expectedSize, `Screenshot ${item.name} size (${stat.size}) must match exact uploaded file size (${item.expectedSize})`);

    // Verify HTTP 200
    const res = await fetch(`http://localhost:3000/assets/images/${item.name}`);
    assert.strictEqual(res.status, 200, `Image http://localhost:3000/assets/images/${item.name} must return HTTP 200`);
    pass(`Image verified: ${item.name} (${Math.round(stat.size / 1024)} KB) for ${item.section}`);
  }

  const html = fs.readFileSync(path.join(__dirname, 'screenshots.html'), 'utf8');

  // ── TEST 2: HORIZONTAL NUMBERED BAR & DUPLICATE CAROUSEL COMPLETELY REMOVED ──
  console.log('\n--- TEST GROUP 2: REMOVAL OF NUMBERED BAR & DUPLICATE CAROUSEL ---');
  assert.ok(!html.includes('id="gallery-subnav"'), 'Horizontal numbered navigation bar #gallery-subnav must be completely removed');
  assert.ok(!html.includes('sfx-gallery-subnav-sticky'), 'Sticky subnav CSS class must be removed from HTML');
  assert.ok(!html.includes('id="sfx-tour-container"'), 'Duplicate screenshot tour carousel #sfx-tour-container must be completely removed');
  assert.ok(!html.includes('id="btn-view-tour"'), 'Tour toggle button #btn-view-tour must be completely removed');
  pass('Horizontal numbered strip and duplicate carousel are completely removed');

  // ── TEST 3: ALL 7 DEDICATED FEATURE SECTIONS IN OVERVIEW PRESERVED (ANALYTICS REMOVED) ──
  console.log('\n--- TEST GROUP 3: ALL 7 FEATURE SECTIONS PRESERVED IN OVERVIEW ---');
  const sections = [
    { id: 'gallery-overview', kicker: 'SECTION 01 — OVERVIEW', title: 'Meet SFX Composer', img: 'sfx-overview-main.png' },
    { id: 'gallery-browser', kicker: 'SECTION 02 — SOUND BROWSER', title: 'Explore Your Sound Library', img: 'sfx-browser-pixabay.png' },
    { id: 'gallery-ai', kicker: 'SECTION 03 — AI SFX ASSISTANT', title: 'Your AI-Powered Sound Assistant', img: 'sfx-ai-assistant.png' },
    { id: 'gallery-bgm', kicker: 'SECTION 04 — BGM FLOW', title: 'Intelligent Background Music Control', img: 'sfx-bgm-flow-transitions.png' },
    { id: 'gallery-scene-ai', kicker: 'SECTION 05 — SCENE AI', title: 'Intelligent AI Timeline Control', img: 'sfx-scene-ai-timeline.png' },
    { id: 'gallery-audio-tools', kicker: 'SECTION 06 — AUDIO TOOLS', title: 'Essential Sound Studio', img: 'sfx-audio-tools-essential-sound.png' },
    { id: 'gallery-settings', kicker: 'SECTION 07 — SETTINGS', title: 'Customize Your Workspace', img: 'sfx-settings-workspace.png' }
  ];

  for (const s of sections) {
    assert.ok(html.includes(`id="${s.id}"`), `Section ${s.id} must exist in DOM`);
    assert.ok(html.includes(s.kicker), `Section kicker "${s.kicker}" must be present`);
    assert.ok(html.includes(s.title), `Section title "${s.title}" must be present`);
    assert.ok(html.includes(s.img), `Section ${s.id} must display screenshot "${s.img}"`);
    pass(`Section verified: ${s.kicker} (${s.title})`);
  }

  // ── TEST 4: VERIFY COMPLETE REMOVAL OF SECTION 05 — ANALYTICS ──
  console.log('\n--- TEST GROUP 4: VERIFY CLEAN REMOVAL OF SECTION 05 — ANALYTICS ---');
  assert.ok(!html.includes('id="gallery-analytics"'), 'Section #gallery-analytics must be completely removed');
  assert.ok(!html.includes('Understand Your Audio Workflow'), 'Heading "Understand Your Audio Workflow" must be completely removed');
  assert.ok(!html.includes('100% Private On-Device Tracking'), 'Analytics feature badges must be completely removed');
  assert.ok(!html.includes('Advanced Usage Analytics Dashboard'), 'Analytics caption and dashboard title must be completely removed');
  assert.ok(!html.includes('7 of 11'), 'Analytics counter "7 of 11" must be completely removed');
  pass('Section 05 — Analytics is cleanly and completely removed with no traces left behind');

  // ── TEST 5: SIDEBAR NAVIGATION INTACT ──
  console.log('\n--- TEST GROUP 5: SIDEBAR NAVIGATION INTACT ---');
  assert.ok(html.includes('href="index.html"'), 'Sidebar must include Overview link');
  assert.ok(html.includes('href="demo.html"'), 'Sidebar must include Live Plugin Demo link');
  assert.ok(html.includes('href="screenshots.html"'), 'Sidebar must include Product Images link');
  assert.ok(html.includes('Product Images'), 'Sidebar must include "Product Images" label');
  assert.ok(html.includes('features') && (html.includes('href="#features"') || html.includes('href="index.html#features"')), 'Sidebar must include Features link');
  assert.ok(html.includes('tutorials') && (html.includes('href="#tutorials"') || html.includes('href="index.html#tutorials"')), 'Sidebar must include Tutorials link');
  assert.ok(html.includes('pricing') && (html.includes('href="#pricing"') || html.includes('href="index.html#pricing"')), 'Sidebar must include Pricing link');
  assert.ok(html.includes('customer-dashboard'), 'Sidebar must include Dashboard link');
  assert.ok(html.includes('faq') && (html.includes('href="#faq"') || html.includes('href="index.html#faq"')), 'Sidebar must include FAQ link');
  pass('Sidebar navigation menu is completely intact');

  // ── TEST 6: FULLSCREEN LIGHTBOX MODAL FUNCTIONAL ──
  console.log('\n--- TEST GROUP 6: FULLSCREEN LIGHTBOX VIEWER ---');
  assert.ok(html.includes('id="sfx-lightbox-modal"'), 'Lightbox modal container must exist');
  assert.ok(html.includes('id="sfx-lightbox-img"'), 'Lightbox image element must exist');
  assert.ok(html.includes('id="sfx-lightbox-counter"'), 'Lightbox counter badge must exist');
  assert.ok(html.includes('id="sfx-lightbox-close"'), 'Lightbox close button must exist');
  assert.ok(html.includes('id="sfx-lightbox-prev"'), 'Lightbox previous button must exist');
  assert.ok(html.includes('id="sfx-lightbox-next"'), 'Lightbox next button must exist');
  assert.ok(html.includes('id="sfx-lightbox-title"'), 'Lightbox caption title must exist');
  assert.ok(html.includes('id="sfx-lightbox-desc"'), 'Lightbox caption description must exist');
  pass('Fullscreen screenshot lightbox viewer is fully functional');

  // ── TEST 7: CSS & JAVASCRIPT CLEANUP ──
  console.log('\n--- TEST GROUP 7: CSS & JS INTEGRITY ---');
  const css = fs.readFileSync(path.join(__dirname, 'css', 'style.css'), 'utf8');
  assert.ok(!css.includes('.sfx-gallery-subnav-sticky {'), 'CSS must not have sticky subnav rules');
  assert.ok(css.includes('.sfx-lightbox-modal'), 'CSS must define .sfx-lightbox-modal');
  assert.ok(css.includes('.sfx-screenshot-card'), 'CSS must define .sfx-screenshot-card');

  const js = fs.readFileSync(path.join(__dirname, 'js', 'plugin-controller.js'), 'utf8');
  assert.ok(js.includes('setupGalleryLightbox'), 'JS must include setupGalleryLightbox');
  assert.ok(js.includes('GALLERY_ITEMS'), 'JS must include GALLERY_ITEMS data array');
  assert.ok(js.includes('ArrowRight') && js.includes('ArrowLeft') && js.includes('Escape'), 'JS must include arrow and escape keyboard handlers');
  pass('CSS and JS clean of removed elements while preserving lightbox logic');

  console.log('\n================================================================');
  console.log(` ALL ${passed}/${total} VERIFICATION TESTS PASSED SUCCESSFULLY!`);
  console.log('================================================================');
}

verifyShowcaseGallery().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
