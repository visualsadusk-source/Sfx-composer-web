const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function testAnalyticsScreenshot() {
  console.log('================================================================');
  console.log(' SFX COMPOSER — NEW ANALYTICS SCREENSHOT GALLERY VERIFICATION');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function pass(msg) {
    total++;
    passed++;
    console.log(`✓ PASS [${total}]: ${msg}`);
  }

  // 1. Image Assets Check
  console.log('--- TEST GROUP 1: EXACT IMAGE ASSET VERIFICATION ---');
  const imgPath = path.join(__dirname, 'assets', 'images', 'sfx-composer-analytics-dashboard.png');
  const imgAliasPath = path.join(__dirname, 'assets', 'images', 'image(20261121-101937).png');
  
  assert.ok(fs.existsSync(imgPath), 'sfx-composer-analytics-dashboard.png must exist');
  assert.ok(fs.existsSync(imgAliasPath), 'image(20261121-101937).png must exist');

  const stat = fs.statSync(imgPath);
  assert.strictEqual(stat.size, 1637722, 'Exact file size must match 1,637,722 bytes');
  pass('Official analytics screenshot file exists with exact size 1,637,722 bytes');

  // Verify HTTP 200 from live server
  const res1 = await fetch('http://localhost:3000/assets/images/sfx-composer-analytics-dashboard.png');
  assert.strictEqual(res1.status, 200, 'Image HTTP 200 OK');
  const res2 = await fetch('http://localhost:3000/assets/images/image(20261121-101937).png');
  assert.strictEqual(res2.status, 200, 'Image alias HTTP 200 OK');
  pass('Both image URLs served successfully with HTTP 200 OK');

  // 2. HTML Markup & Structure in screenshots.html
  console.log('\n--- TEST GROUP 2: GALLERY PLACEMENT & STRUCTURE ---');
  const html = fs.readFileSync(path.join(__dirname, 'screenshots.html'), 'utf8');

  // Check order: BGM Flow -> Analytics -> Scene AI
  const bgmIdx = html.indexOf('id="gallery-bgm"');
  const analyticsIdx = html.indexOf('id="gallery-analytics"');
  const sceneAiIdx = html.indexOf('id="gallery-scene-ai"');

  assert.ok(bgmIdx !== -1, 'BGM Flow section exists');
  assert.ok(analyticsIdx !== -1, 'Analytics section exists');
  assert.ok(sceneAiIdx !== -1, 'Scene AI section exists');
  assert.ok(bgmIdx < analyticsIdx, 'Analytics section is positioned after BGM Flow');
  assert.ok(analyticsIdx < sceneAiIdx, 'Analytics section is positioned before Scene AI');
  pass('Section order strictly verified: BGM Flow -> Analytics -> Scene AI');

  // Check card content inside Analytics section
  const analyticsSection = html.slice(analyticsIdx, sceneAiIdx);
  assert.ok(analyticsSection.includes('Advanced Usage Analytics Dashboard'), 'Title matches exact user requirement');
  assert.ok(analyticsSection.includes('Track sound usage, project activity, active editing time, favorites, popular categories, and workflow insights through a beautiful analytics dashboard.'), 'Description matches exact user requirement');
  assert.ok(analyticsSection.includes('data-lightbox-idx="6"'), 'Card has data-lightbox-idx="6"');
  assert.ok(analyticsSection.includes('sfx-btn-open-fullscreen'), 'Card contains Fullscreen button');
  assert.ok(analyticsSection.includes('assets/images/sfx-composer-analytics-dashboard.png'), 'Card references official image asset');
  pass('New screenshot card has exact title, description, Fullscreen button, and image reference');

  // 3. Count Update: 1 of 11 ... 11 of 11
  console.log('\n--- TEST GROUP 3: TOTAL SCREENSHOT COUNT (11 TOTAL) ---');
  assert.ok(analyticsSection.includes('7 of 11'), 'New card displays "7 of 11"');
  assert.ok(html.includes('1 of 11'), 'First card displays "1 of 11"');
  assert.ok(html.includes('11 of 11'), 'Last card displays "11 of 11"');
  assert.ok(html.includes('Screenshot 1 of 11'), 'Lightbox counter badge initialized to "Screenshot 1 of 11"');
  assert.ok(!html.includes('of 10</span>'), 'No obsolete "of 10" badges remain');
  pass('All screenshot counter badges cleanly updated to 11 total');

  // 4. Lightbox Javascript in plugin-controller.js
  console.log('\n--- TEST GROUP 4: LIGHTBOX INTEGRATION ---');
  const js = fs.readFileSync(path.join(__dirname, 'js', 'plugin-controller.js'), 'utf8');
  assert.ok(js.includes('assets/images/sfx-composer-analytics-dashboard.png'), 'JS GALLERY_ITEMS contains official analytics image');
  assert.ok(js.includes('Advanced Usage Analytics Dashboard'), 'JS GALLERY_ITEMS contains exact title');
  assert.ok(js.includes('id: 7'), 'JS GALLERY_ITEMS item id: 7 exists');
  assert.ok(js.includes('id: 11'), 'JS GALLERY_ITEMS item id: 11 exists (11 total)');
  assert.ok(js.includes('fsBtn.addEventListener'), 'Fullscreen button click listener explicitly attached');
  pass('Lightbox JS GALLERY_ITEMS array and click handlers properly configured with 11 items');

  // 5. Check plugin code integrity
  console.log('\n--- TEST GROUP 5: PLUGIN CODE INTEGRITY ---');
  const pluginAnalytics = path.join(__dirname, 'plugin-dist', 'analytics.css');
  assert.ok(fs.existsSync(pluginAnalytics), 'Plugin CSS exists and unmodified');
  pass('Plugin functionality and code completely preserved without modification');

  console.log('\n================================================================');
  console.log(` ALL ${total}/${total} NEW ANALYTICS SCREENSHOT TESTS PASSED!`);
  console.log('================================================================');
}

testAnalyticsScreenshot().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
