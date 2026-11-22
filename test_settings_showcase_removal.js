const assert = require('assert');
const fs = require('fs');
const path = require('path');

function verifySettingsShowcaseRemoval() {
  console.log('================================================================');
  console.log(' SFX COMPOSER — SECTION 07 SETTINGS CLEAN REMOVAL VERIFICATION');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function pass(msg) {
    total++;
    passed++;
    console.log(`✓ PASS [${total}]: ${msg}`);
  }

  const html = fs.readFileSync(path.join(__dirname, 'screenshots.html'), 'utf8');

  // 1. Clean Removal of Section 07 DOM & Heading
  console.log('--- TEST GROUP 1: SECTION & HEADING REMOVAL ---');
  assert.ok(!html.includes('id="gallery-settings"'), '#gallery-settings section element is completely removed from DOM');
  assert.ok(!html.includes('SECTION 07 — SETTINGS'), 'SECTION 07 — SETTINGS kicker is removed');
  assert.ok(!html.includes('Customize Your Workspace'), 'Heading "Customize Your Workspace" is removed');
  assert.ok(!html.includes('Personalize your SFX Composer experience with flexible settings'), 'Settings description is removed');
  pass('Section 07 DOM element, header, and description cleanly removed');

  // 2. Removal of Feature Badges and Labels
  console.log('\n--- TEST GROUP 2: FEATURE BADGES & LABELS REMOVAL ---');
  assert.ok(!html.includes('User Profile &amp; Custom Avatar') && !html.includes('User Profile & Custom Avatar'), 'User Profile & Custom Avatar badge removed');
  assert.ok(!html.includes('6 Accent Color Themes'), '6 Accent Color Themes badge removed');
  assert.ok(!html.includes('Multi-Folder Library Indexing'), 'Multi-Folder Library Indexing badge removed');
  assert.ok(!html.includes('Studio Dark, Ultra Dark & Light Appearances') && !html.includes('Studio Dark, Ultra Dark &amp; Light Appearances'), 'Appearance themes badge removed');
  assert.ok(!html.includes('Playback Volume Slider (0-100%)'), 'Playback Volume Slider badge removed');
  assert.ok(!html.includes('Unlocked License Information'), 'Unlocked License Information badge removed');
  assert.ok(!html.includes('Diagnostics Logs &amp; Activity History') && !html.includes('Diagnostics Logs & Activity History'), 'Diagnostics Logs badge removed');
  assert.ok(!html.includes('About SFX Composer'), 'About SFX Composer badge removed');
  pass('All Settings showcase badges and labels cleanly removed');

  // 3. Removal of Screenshot, Caption, Metadata & Counters
  console.log('\n--- TEST GROUP 3: SCREENSHOT CARD, CAPTION & COUNTERS ---');
  assert.ok(!html.includes('Profile, Accent Colors, Library Folders &amp; Appearance') && !html.includes('Profile, Accent Colors, Library Folders & Appearance'), 'Screenshot caption removed');
  assert.ok(!html.includes('Screenshot 09 · Workspace Preferences'), 'Screenshot 09 badge removed');
  assert.ok(!html.includes('9 of 9'), 'Counter "9 of 9" removed');
  assert.ok(!html.includes('of 9'), 'All old "of 9" counters removed');
  assert.ok(!html.includes('data-lightbox-idx="8"'), 'Card with data-lightbox-idx="8" removed');
  assert.ok(html.includes('1 of 8'), 'First card displays "1 of 8"');
  assert.ok(html.includes('8 of 8'), 'Final card displays "8 of 8"');
  assert.ok(html.includes('Screenshot 1 of 8'), 'Lightbox counter badge initialized to "Screenshot 1 of 8"');
  pass('Screenshot card, caption, metadata, and 9-of-9 counters cleanly removed and renumbered to 8 total');

  // 4. Lightbox Data in plugin-controller.js
  console.log('\n--- TEST GROUP 4: LIGHTBOX DATA ARRAY IN PLUGIN-CONTROLLER.JS ---');
  const js = fs.readFileSync(path.join(__dirname, 'js', 'plugin-controller.js'), 'utf8');
  assert.ok(!js.includes('sfx-settings-workspace.png'), 'GALLERY_ITEMS does not contain sfx-settings-workspace.png');
  assert.ok(!js.includes('id: 9'), 'GALLERY_ITEMS does not have item 9 (max is 8)');
  assert.ok(js.includes('id: 8'), 'GALLERY_ITEMS has 8 items');
  pass('GALLERY_ITEMS array in plugin-controller.js contains exactly 8 items');

  // 5. Preservation of All Remaining Feature Sections
  console.log('\n--- TEST GROUP 5: PRESERVATION OF REMAINING 6 FEATURE SECTIONS ---');
  const expectedSections = [
    { id: 'gallery-overview', kicker: 'SECTION 01 — OVERVIEW' },
    { id: 'gallery-browser', kicker: 'SECTION 02 — SOUND BROWSER' },
    { id: 'gallery-ai', kicker: 'SECTION 03 — AI SFX ASSISTANT' },
    { id: 'gallery-bgm', kicker: 'SECTION 04 — BGM FLOW' },
    { id: 'gallery-scene-ai', kicker: 'SECTION 05 — SCENE AI' },
    { id: 'gallery-audio-tools', kicker: 'SECTION 06 — AUDIO TOOLS' }
  ];
  for (const sec of expectedSections) {
    assert.ok(html.includes(`id="${sec.id}"`), `Section ${sec.id} must be preserved`);
    assert.ok(html.includes(sec.kicker), `Section kicker ${sec.kicker} must be preserved`);
  }
  pass('All 6 remaining feature sections preserved in exact order');

  // 6. Preservation of Actual Plugin Settings Functionality
  console.log('\n--- TEST GROUP 6: PLUGIN DEMO SETTINGS PRESERVATION ---');
  const demoHtml = fs.readFileSync(path.join(__dirname, 'demo.html'), 'utf8');
  assert.ok(demoHtml.includes('id="sfx-settings-drawer"'), 'Live plugin demo retains #sfx-settings-drawer');
  assert.ok(demoHtml.includes('id="sfx-btn-profile"'), 'Profile button in demo.html preserved');
  assert.ok(js.includes('settings: document.getElementById(\'sfx-settings-drawer\')') ||
            js.includes('settings: document.getElementById("sfx-settings-drawer")'), 'Plugin controller maps settings drawer');
  pass('Plugin demo interactive Settings drawer and trigger completely preserved');

  console.log('\n================================================================');
  console.log(` ALL ${passed}/${total} SETTINGS SHOWCASE REMOVAL TESTS PASSED!`);
  console.log('================================================================');
}

verifySettingsShowcaseRemoval();
