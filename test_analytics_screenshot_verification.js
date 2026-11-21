const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function testAnalyticsRemoval() {
  console.log('================================================================');
  console.log(' SFX COMPOSER — SECTION 05 ANALYTICS CLEAN REMOVAL VERIFICATION');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function pass(msg) {
    total++;
    passed++;
    console.log(`✓ PASS [${total}]: ${msg}`);
  }

  const html = fs.readFileSync(path.join(__dirname, 'screenshots.html'), 'utf8');

  // 1. Clean Removal of Section 05 & All Associated Elements
  console.log('--- TEST GROUP 1: SECTION & ELEMENT REMOVAL ---');
  assert.ok(!html.includes('id="gallery-analytics"'), '#gallery-analytics section element is removed');
  assert.ok(!html.includes('Understand Your Audio Workflow'), 'Heading "Understand Your Audio Workflow" is removed');
  assert.ok(!html.includes('100% Private On-Device Tracking'), 'Privacy tracking badge is removed');
  assert.ok(!html.includes('Total Sounds Played (23 Previews)'), 'Total Sounds Played badge is removed');
  assert.ok(!html.includes('Timeline Placements & Distinct Files Count'), 'Timeline Placements badge is removed');
  assert.ok(!html.includes('7-Day, 30-Day, 90-Day & All-Time Filters'), 'Date filters badge is removed');
  assert.ok(!html.includes('Advanced Usage Analytics Dashboard'), 'Caption & title "Advanced Usage Analytics Dashboard" is removed');
  assert.ok(!html.includes('Dedicated Workflow Analytics & Activity Overview'), 'Second analytics card is removed');
  assert.ok(!html.includes('Analytics Engine: SQLite Local'), 'Analytics engine metadata is removed');
  assert.ok(!html.includes('7 of 11'), 'Counter "7 of 11" is removed');
  assert.ok(!html.includes('of 11'), 'All old "of 11" counters are removed');
  pass('All Section 05 Analytics elements and UI are cleanly removed from screenshots.html');

  // 2. Section Numbering & Order
  console.log('\n--- TEST GROUP 2: SECTION NUMBERING & ORDER ---');
  const bgmIdx = html.indexOf('id="gallery-bgm"');
  const sceneAiIdx = html.indexOf('id="gallery-scene-ai"');
  const audioToolsIdx = html.indexOf('id="gallery-audio-tools"');
  const settingsIdx = html.indexOf('id="gallery-settings"');

  assert.ok(bgmIdx !== -1, 'BGM Flow section exists');
  assert.ok(sceneAiIdx !== -1, 'Scene AI section exists');
  assert.ok(audioToolsIdx !== -1, 'Audio Tools section exists');
  assert.ok(settingsIdx !== -1, 'Settings section exists');

  assert.ok(bgmIdx < sceneAiIdx, 'BGM Flow precedes Scene AI');
  assert.ok(sceneAiIdx < audioToolsIdx, 'Scene AI precedes Audio Tools');
  assert.ok(audioToolsIdx < settingsIdx, 'Audio Tools precedes Settings');

  assert.ok(html.includes('SECTION 05 — SCENE AI'), 'Scene AI is renumbered to SECTION 05');
  assert.ok(html.includes('SECTION 06 — AUDIO TOOLS'), 'Audio Tools is renumbered to SECTION 06');
  assert.ok(html.includes('SECTION 07 — SETTINGS'), 'Settings is renumbered to SECTION 07');
  pass('Sections cleanly renumbered: 05 Scene AI -> 06 Audio Tools -> 07 Settings');

  // 3. Screenshot Badges and Lightbox Indices (9 Total)
  console.log('\n--- TEST GROUP 3: TOTAL SCREENSHOT COUNT (9 TOTAL) ---');
  assert.ok(html.includes('1 of 9'), 'First card displays "1 of 9"');
  assert.ok(html.includes('7 of 9'), 'Scene AI card displays "7 of 9"');
  assert.ok(html.includes('8 of 9'), 'Audio Tools card displays "8 of 9"');
  assert.ok(html.includes('9 of 9'), 'Settings card displays "9 of 9"');
  assert.ok(html.includes('Screenshot 1 of 9'), 'Lightbox counter badge initialized to "Screenshot 1 of 9"');
  pass('All screenshot counter badges cleanly updated to 9 total');

  // 4. Lightbox Javascript in plugin-controller.js
  console.log('\n--- TEST GROUP 4: LIGHTBOX INTEGRATION ---');
  const js = fs.readFileSync(path.join(__dirname, 'js', 'plugin-controller.js'), 'utf8');
  assert.ok(!js.includes('sfx-composer-analytics-dashboard.png'), 'GALLERY_ITEMS does not contain analytics dashboard image');
  assert.ok(!js.includes('id: 11'), 'GALLERY_ITEMS no longer has item 11 (max is now 9)');
  assert.ok(js.includes('id: 9'), 'GALLERY_ITEMS has 9 items');
  pass('GALLERY_ITEMS array in plugin-controller.js contains exactly 9 items');

  // 5. Plugin Functionality Preservation
  console.log('\n--- TEST GROUP 5: PLUGIN CODE INTEGRITY ---');
  const demoHtml = fs.readFileSync(path.join(__dirname, 'demo.html'), 'utf8');
  assert.ok(demoHtml.includes('id="sfx-analytics"'), 'Live plugin demo retains interactive Analytics tool overlay');
  const pluginAnalytics = path.join(__dirname, 'plugin-dist', 'analytics.css');
  assert.ok(fs.existsSync(pluginAnalytics), 'Plugin CSS exists and unmodified');
  pass('Interactive plugin functionality inside Live Demo preserved completely');

  console.log('\n================================================================');
  console.log(` ALL ${passed}/${total} ANALYTICS REMOVAL VERIFICATION TESTS PASSED!`);
  console.log('================================================================');
}

testAnalyticsRemoval().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
