const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function verifyShowcaseGallery() {
  console.log('================================================================');
  console.log(' SFX COMPOSER — 8-SECTION SCREENSHOT SHOWCASE & LIGHTBOX TESTS');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function pass(msg) {
    total++;
    passed++;
    console.log(`✓ PASS [${total}]: ${msg}`);
  }

  // ── TEST 1: ALL 10 UPLOADED SCREENSHOTS EXIST & MATCH EXACT SIZES ──
  console.log('--- TEST GROUP 1: EXACT SCREENSHOT ASSETS ---');
  const screenshots = [
    { name: 'sfx-overview-main.png', expectedSize: 244858, section: 'Overview' },
    { name: 'sfx-browser-pixabay.png', expectedSize: 549859, section: 'Sound Browser (Pixabay)' },
    { name: 'sfx-browser-downloads.png', expectedSize: 165411, section: 'Sound Browser (Downloads)' },
    { name: 'sfx-browser-import.png', expectedSize: 135757, section: 'Sound Browser (Import)' },
    { name: 'sfx-ai-assistant.png', expectedSize: 289306, section: 'AI SFX Assistant' },
    { name: 'sfx-bgm-flow-transitions.png', expectedSize: 165898, section: 'BGM Flow' },
    { name: 'sfx-analytics-dashboard.png', expectedSize: 238212, section: 'Analytics' },
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

  // ── TEST 2: HERO SECTION UPDATE ──
  console.log('\n--- TEST GROUP 2: HERO SECTION ---');
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

  assert.ok(html.includes('Meet the New <span class="blue-highlight">SFX Composer</span>'), 'Hero headline must be "Meet the New SFX Composer"');
  assert.ok(html.includes('A smarter sound design workspace built for modern video editors.'), 'Hero subheading must match requirement');
  assert.ok(html.includes('Explore Screenshots'), 'Primary CTA must be "Explore Screenshots"');
  assert.ok(html.includes('Explore Features'), 'Secondary CTA must be "Explore Features"');
  pass('Hero section headlines, subheadings, and CTAs verified');

  // ── TEST 3: 8 DEDICATED FEATURE SECTIONS ──
  console.log('\n--- TEST GROUP 3: 8 DEDICATED FEATURE SECTIONS ---');
  const sections = [
    { id: 'gallery-overview', kicker: 'SECTION 01 — OVERVIEW', title: 'Meet SFX Composer', img: 'sfx-overview-main.png' },
    { id: 'gallery-browser', kicker: 'SECTION 02 — SOUND BROWSER', title: 'Explore Your Sound Library', img: 'sfx-browser-pixabay.png' },
    { id: 'gallery-ai', kicker: 'SECTION 03 — AI SFX ASSISTANT', title: 'Your AI-Powered Sound Assistant', img: 'sfx-ai-assistant.png' },
    { id: 'gallery-bgm', kicker: 'SECTION 04 — BGM FLOW', title: 'Intelligent Background Music Control', img: 'sfx-bgm-flow-transitions.png' },
    { id: 'gallery-analytics', kicker: 'SECTION 05 — ANALYTICS', title: 'Understand Your Audio Workflow', img: 'sfx-analytics-dashboard.png' },
    { id: 'gallery-scene-ai', kicker: 'SECTION 06 — SCENE AI', title: 'Intelligent AI Timeline Control', img: 'sfx-scene-ai-timeline.png' },
    { id: 'gallery-audio-tools', kicker: 'SECTION 07 — AUDIO TOOLS', title: 'Essential Sound Studio', img: 'sfx-audio-tools-essential-sound.png' },
    { id: 'gallery-settings', kicker: 'SECTION 08 — SETTINGS', title: 'Customize Your Workspace', img: 'sfx-settings-workspace.png' }
  ];

  for (const s of sections) {
    assert.ok(html.includes(`id="${s.id}"`), `Section ${s.id} must exist in DOM`);
    assert.ok(html.includes(s.kicker), `Section kicker "${s.kicker}" must be present`);
    assert.ok(html.includes(s.title), `Section title "${s.title}" must be present`);
    assert.ok(html.includes(s.img), `Section ${s.id} must display screenshot "${s.img}"`);
    pass(`Section verified: ${s.kicker} (${s.title})`);
  }

  // ── TEST 4: STRICT SEPARATION OF ANALYTICS & SCENE AI ──
  console.log('\n--- TEST GROUP 4: STRICT SEPARATION OF ANALYTICS & SCENE AI ---');
  const analyticsSecStart = html.indexOf('id="gallery-analytics"');
  const analyticsSecEnd = html.indexOf('</section>', analyticsSecStart);
  const analyticsContent = html.substring(analyticsSecStart, analyticsSecEnd);

  assert.ok(!analyticsContent.includes('Scene AI'), 'Analytics section must NOT mention Scene AI');
  assert.ok(!analyticsContent.includes('sfx-scene-ai-timeline.png'), 'Analytics section must NOT contain Scene AI image');
  assert.ok(analyticsContent.includes('sfx-analytics-dashboard.png'), 'Analytics section must contain sfx-analytics-dashboard.png');

  const sceneAiSecStart = html.indexOf('id="gallery-scene-ai"');
  const sceneAiSecEnd = html.indexOf('</section>', sceneAiSecStart);
  const sceneAiContent = html.substring(sceneAiSecStart, sceneAiSecEnd);

  assert.ok(!sceneAiContent.includes('Total Sounds Played'), 'Scene AI section must NOT contain Analytics metrics');
  assert.ok(!sceneAiContent.includes('sfx-analytics-dashboard.png'), 'Scene AI section must NOT contain Analytics image');
  assert.ok(sceneAiContent.includes('sfx-scene-ai-timeline.png'), 'Scene AI section must contain sfx-scene-ai-timeline.png');
  pass('Analytics and Scene AI are strictly independent and separated');

  // ── TEST 5: STICKY FEATURE NAVIGATION ──
  console.log('\n--- TEST GROUP 5: STICKY FEATURE NAVIGATION ---');
  assert.ok(html.includes('id="gallery-subnav"'), 'Gallery sticky subnav must exist');
  for (const s of sections) {
    assert.ok(html.includes(`href="#${s.id}"`), `Subnav link to #${s.id} must exist`);
  }
  pass('Subnav links for all 8 sections verified');

  // ── TEST 6: FULLSCREEN LIGHTBOX MODAL ──
  console.log('\n--- TEST GROUP 6: FULLSCREEN LIGHTBOX MODAL ---');
  assert.ok(html.includes('id="sfx-lightbox-modal"'), 'Lightbox modal container must exist');
  assert.ok(html.includes('id="sfx-lightbox-img"'), 'Lightbox image element must exist');
  assert.ok(html.includes('id="sfx-lightbox-counter"'), 'Lightbox counter badge must exist');
  assert.ok(html.includes('id="sfx-lightbox-close"'), 'Lightbox close button must exist');
  assert.ok(html.includes('id="sfx-lightbox-prev"'), 'Lightbox previous button must exist');
  assert.ok(html.includes('id="sfx-lightbox-next"'), 'Lightbox next button must exist');
  assert.ok(html.includes('id="sfx-lightbox-title"'), 'Lightbox caption title must exist');
  assert.ok(html.includes('id="sfx-lightbox-desc"'), 'Lightbox caption description must exist');

  // Verify all 10 cards have data-lightbox-idx
  for (let i = 0; i < 10; i++) {
    assert.ok(html.includes(`data-lightbox-idx="${i}"`), `Screenshot card for index ${i} must exist`);
  }
  pass('Lightbox modal and all 10 card triggers verified');

  // ── TEST 7: CSS & JAVASCRIPT LOGIC ──
  console.log('\n--- TEST GROUP 7: CSS & JAVASCRIPT LOGIC ---');
  const css = fs.readFileSync(path.join(__dirname, 'css', 'style.css'), 'utf8');
  assert.ok(css.includes('.sfx-gallery-subnav-sticky'), 'CSS must define .sfx-gallery-subnav-sticky');
  assert.ok(css.includes('.sfx-lightbox-modal'), 'CSS must define .sfx-lightbox-modal');
  assert.ok(css.includes('.sfx-screenshot-card'), 'CSS must define .sfx-screenshot-card');

  const js = fs.readFileSync(path.join(__dirname, 'js', 'plugin-controller.js'), 'utf8');
  assert.ok(js.includes('setupGalleryLightbox'), 'JS must include setupGalleryLightbox');
  assert.ok(js.includes('GALLERY_ITEMS'), 'JS must include GALLERY_ITEMS data array');
  assert.ok(js.includes('ArrowRight') && js.includes('ArrowLeft') && js.includes('Escape'), 'JS must include arrow and escape keyboard handlers');
  pass('CSS styles and JS controllers verified');

  console.log('\n================================================================');
  console.log(` ALL ${passed}/${total} SHOWCASE & GALLERY TESTS PASSED!`);
  console.log('================================================================');
}

verifyShowcaseGallery().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
