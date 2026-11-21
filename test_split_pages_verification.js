const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function verifySplitPages() {
  console.log('================================================================');
  console.log(' SFX COMPOSER — SPLIT PAGES & DEDICATED TABS VERIFICATION');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function pass(msg) {
    total++;
    passed++;
    console.log(`✓ PASS [${total}]: ${msg}`);
  }

  // ── TEST 1: HTTP 200 FOR ALL PAGES & ASSETS ──
  console.log('--- TEST GROUP 1: SERVER ROUTING & CLEAN URLS ---');
  const urls = [
    { url: 'http://localhost:3000/', name: 'Overview Root' },
    { url: 'http://localhost:3000/index.html', name: 'Overview index.html' },
    { url: 'http://localhost:3000/demo.html', name: 'Live Plugin Demo page' },
    { url: 'http://localhost:3000/demo', name: 'Live Plugin Demo clean URL' },
    { url: 'http://localhost:3000/screenshots.html', name: 'Screenshots Gallery page' },
    { url: 'http://localhost:3000/screenshots', name: 'Screenshots Gallery clean URL' }
  ];

  for (const item of urls) {
    const res = await fetch(item.url);
    assert.strictEqual(res.status, 200, `${item.name} (${item.url}) must return 200 OK`);
    pass(`${item.name} returns HTTP 200 OK`);
  }

  // ── TEST 2: ALL 10 SCREENSHOT ASSETS EXIST ──
  console.log('\n--- TEST GROUP 2: ALL 10 SCREENSHOT ASSETS ---');
  const screenshots = [
    'sfx-overview-main.png',
    'sfx-browser-pixabay.png',
    'sfx-browser-downloads.png',
    'sfx-browser-import.png',
    'sfx-ai-assistant.png',
    'sfx-bgm-flow-transitions.png',
    'sfx-analytics-dashboard.png',
    'sfx-scene-ai-timeline.png',
    'sfx-audio-tools-essential-sound.png',
    'sfx-settings-workspace.png'
  ];
  for (const img of screenshots) {
    const res = await fetch(`http://localhost:3000/assets/images/${img}`);
    assert.strictEqual(res.status, 200, `Image /assets/images/${img} must return 200 OK`);
    pass(`Image verified: ${img}`);
  }

  // ── TEST 3: OVERVIEW PAGE (INDEX.HTML) ──
  console.log('\n--- TEST GROUP 3: OVERVIEW PAGE (INDEX.HTML) ---');
  const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

  // Both tabs present in sidebar
  assert.ok(indexHtml.includes('href="demo.html"'), 'Sidebar must include Live Plugin Demo link');
  assert.ok(indexHtml.includes('href="screenshots.html"'), 'Sidebar must include Screenshots Gallery link');

  // Overview is active in sidebar
  assert.ok(indexHtml.includes('href="index.html" class="sfx-site-nav-link is-active"'), 'Overview link must be active on index.html');

  // Two attractive destination cards
  assert.ok(indexHtml.includes('id="explore-destinations"'), 'Destination navigation section must exist on Overview');
  assert.ok(indexHtml.includes('class="sfx-dest-card sfx-dest-card--interactive"'), 'Interactive demo destination card must exist');
  assert.ok(indexHtml.includes('class="sfx-dest-card sfx-dest-card--gallery"'), 'Screenshots gallery destination card must exist');
  assert.ok(indexHtml.includes('Launch Live Plugin Demo'), 'Demo card action must exist');
  assert.ok(indexHtml.includes('Open Screenshots Gallery'), 'Gallery card action must exist');

  // Overview does NOT contain duplicate demo or screenshot cards
  assert.ok(!indexHtml.includes('id="sfx-vlist-container"'), 'Virtual list must be moved out of Overview');
  assert.ok(!indexHtml.includes('id="gallery-showcase"'), 'Screenshots gallery must be moved out of Overview');

  // Retains core sections
  assert.ok(indexHtml.includes('id="features"'), 'Features section must exist on Overview');
  assert.ok(indexHtml.includes('id="tutorials"'), 'Tutorials section must exist on Overview');
  assert.ok(indexHtml.includes('id="pricing"'), 'Pricing section must exist on Overview');
  assert.ok(indexHtml.includes('id="faq"'), 'FAQ section must exist on Overview');
  pass('Overview page is clean, focused, and links to dedicated pages via 2 cards');

  // ── TEST 4: LIVE PLUGIN DEMO PAGE (DEMO.HTML) ──
  console.log('\n--- TEST GROUP 4: LIVE PLUGIN DEMO PAGE (DEMO.HTML) ---');
  const demoHtml = fs.readFileSync(path.join(__dirname, 'demo.html'), 'utf8');

  // Sidebar has Demo active
  assert.ok(demoHtml.includes('href="demo.html" class="sfx-site-nav-link is-active"'), 'Live Plugin Demo must be active in sidebar on demo.html');

  // Contains the genuine interactive CEP application
  assert.ok(demoHtml.includes('id="sfx-live-container"'), 'Live application container must exist on demo.html');
  assert.ok(demoHtml.includes('id="sfx-vlist-container"'), 'Virtual list must exist on demo.html');
  assert.ok(demoHtml.includes('id="sfx-trim-tray"'), 'Waveform trim tray must exist on demo.html');
  assert.ok(demoHtml.includes('17,111'), 'Must display 17,111 indexed sounds on demo.html');
  assert.ok(demoHtml.includes('id="sfx-browser"'), 'Built-in browser overlay must exist on demo.html');
  assert.ok(demoHtml.includes('id="sfx-ai-assistant"'), 'AI SFX Assistant overlay must exist on demo.html');
  assert.ok(demoHtml.includes('id="sfx-bgm-flow"'), 'BGM Flow overlay must exist on demo.html');
  assert.ok(demoHtml.includes('id="sfx-analytics"'), 'Analytics overlay must exist on demo.html');
  assert.ok(demoHtml.includes('id="sfx-scene-designer"'), 'Scene AI overlay must exist on demo.html');
  assert.ok(demoHtml.includes('id="sfx-audio-tools"'), 'Audio Tools overlay must exist on demo.html');
  assert.ok(demoHtml.includes('id="btn-host-ppro"'), 'Host switcher must exist on demo.html');

  // No long screenshot galleries on demo.html
  assert.ok(!demoHtml.includes('id="gallery-showcase"'), 'Screenshots gallery must NOT be duplicated on demo.html');
  pass('Live Plugin Demo page is dedicated, interactive, and uncluttered');

  // ── TEST 5: SCREENSHOTS GALLERY PAGE (SCREENSHOTS.HTML) ──
  console.log('\n--- TEST GROUP 5: SCREENSHOTS GALLERY PAGE (SCREENSHOTS.HTML) ---');
  const screenshotsHtml = fs.readFileSync(path.join(__dirname, 'screenshots.html'), 'utf8');

  // Sidebar has Screenshots active
  assert.ok(screenshotsHtml.includes('href="screenshots.html" class="sfx-site-nav-link is-active"'), 'Screenshots Gallery must be active in sidebar on screenshots.html');

  // Grouped feature sections
  const gallerySections = [
    'gallery-overview',
    'gallery-browser',
    'gallery-ai',
    'gallery-bgm',
    'gallery-analytics',
    'gallery-scene-ai',
    'gallery-audio-tools',
    'gallery-settings'
  ];
  for (const sId of gallerySections) {
    assert.ok(screenshotsHtml.includes(`id="${sId}"`), `Section #${sId} must exist on screenshots.html`);
  }

  // Strict separation of Analytics & Scene AI
  const anStart = screenshotsHtml.indexOf('id="gallery-analytics"');
  const anEnd = screenshotsHtml.indexOf('</section>', anStart);
  const anContent = screenshotsHtml.substring(anStart, anEnd);
  assert.ok(!anContent.includes('Scene AI'), 'Analytics section must not mention Scene AI');

  const scStart = screenshotsHtml.indexOf('id="gallery-scene-ai"');
  const scEnd = screenshotsHtml.indexOf('</section>', scStart);
  const scContent = screenshotsHtml.substring(scStart, scEnd);
  assert.ok(!scContent.includes('Total Sounds Played'), 'Scene AI section must not contain Analytics metrics');

  // Fullscreen Lightbox Modal
  assert.ok(screenshotsHtml.includes('id="sfx-lightbox-modal"'), 'Lightbox modal must exist on screenshots.html');
  assert.ok(screenshotsHtml.includes('id="sfx-lightbox-close"'), 'Lightbox close button must exist');
  assert.ok(screenshotsHtml.includes('id="sfx-lightbox-prev"'), 'Lightbox previous button must exist');
  assert.ok(screenshotsHtml.includes('id="sfx-lightbox-next"'), 'Lightbox next button must exist');
  assert.ok(screenshotsHtml.includes('id="sfx-lightbox-counter"'), 'Lightbox counter must exist');

  // No duplicate interactive demo application on screenshots.html
  assert.ok(!screenshotsHtml.includes('id="sfx-vlist-container"'), 'Virtual list must NOT be duplicated on screenshots.html');
  pass('Screenshots Gallery page is dedicated, organized by feature, with lightbox viewer');

  console.log('\n================================================================');
  console.log(` ALL ${passed}/${total} SPLIT-PAGE & NAVIGATION TESTS PASSED!`);
  console.log('================================================================');
}

verifySplitPages().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
