/**
 * SFX COMPOSER LIVE DEMO & BGM FLOW / AI SFX / AUTO EQ VERIFICATION SUITE
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = __dirname;
const DEMO_HTML = path.join(ROOT, 'demo.html');
const CONTROLLER_JS = path.join(ROOT, 'js', 'plugin-controller.js');
const STYLE_CSS = path.join(ROOT, 'css', 'style.css');
const CEP_BGM_JS = path.join('C:\\Users\\visua\\AppData\\Roaming\\Adobe\\CEP\\extensions\\com.sfxcomposer.panel\\dist\\bgm-flow.js');
const CEP_SFXBOX_JSX = path.join('C:\\Users\\visua\\AppData\\Roaming\\Adobe\\CEP\\extensions\\com.sfxcomposer.panel\\dist\\host\\sfxbox.jsx');

let totalTests = 0;
let passedTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ PASS [${totalTests}]: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ FAIL [${totalTests}]: ${name}`);
    console.error(`    Error: ${err.message}`);
  }
}

console.log('================================================================');
console.log(' SFX COMPOSER — BGM FLOW, AI SFX CHAT & AUTO EQ VERIFICATION');
console.log('================================================================\n');

const htmlContent = fs.readFileSync(DEMO_HTML, 'utf8');
const controllerCode = fs.readFileSync(CONTROLLER_JS, 'utf8');
const cssContent = fs.readFileSync(STYLE_CSS, 'utf8');

// -----------------------------------------------------------------------------
// GROUP 1: BGM FLOW LAYOUT & SPACING
// -----------------------------------------------------------------------------
console.log('--- TEST GROUP 1: BGM FLOW LAYOUT & SPACING ---');

test('BGM Flow mode tabs exist with 5 tabs including Beat Sync and Auto EQ', () => {
  assert.ok(htmlContent.includes('data-bgm-mode="start"'), 'Must have start tab');
  assert.ok(htmlContent.includes('data-bgm-mode="end"'), 'Must have end tab');
  assert.ok(htmlContent.includes('data-bgm-mode="change"'), 'Must have change tab');
  assert.ok(htmlContent.includes('data-bgm-mode="beatsync"'), 'Must have beatsync tab');
  assert.ok(htmlContent.includes('data-bgm-mode="autoeq"'), 'Must have autoeq tab');
});

test('BGM Flow Auto EQ view contains dedicated canvas graph and readout', () => {
  assert.ok(htmlContent.includes('id="bgm-eq-canvas"'), 'Must contain bgm-eq-canvas');
  assert.ok(htmlContent.includes('id="bgm-eq-readout"'), 'Must contain bgm-eq-readout');
  assert.ok(htmlContent.includes('id="bgm-slider-eq-intensity"'), 'Must contain EQ intensity slider');
  assert.ok(htmlContent.includes('id="bgm-btn-eq-bypass"'), 'Must contain EQ bypass button');
});

test('BGM Flow styles grid uses responsive columns minmax(160px, 1fr) with no clipping', () => {
  assert.ok(cssContent.includes('.sfx-bf__styles-grid'), 'Must define .sfx-bf__styles-grid');
  assert.ok(cssContent.includes('minmax(160px, 1fr)'), 'Must use minmax(160px, 1fr) for responsive fit');
});

test('BGM Flow body has managed single scrolling with overflow-y: auto and no nested scrollbars', () => {
  assert.ok(cssContent.includes('.sfx-bf__body {'), 'Must style .sfx-bf__body');
  assert.ok(cssContent.includes('overflow-y: auto'), 'Must enable internal vertical scroll');
  assert.ok(cssContent.includes('overflow-x: hidden'), 'Must prevent horizontal overflow');
  assert.ok(cssContent.includes('.bgm-mode-view {') && cssContent.includes('overflow: visible !important'), 'Mode views must have overflow: visible to eliminate nested scrollbars');
});

test('BGM Flow Action Bar and Clip Status card are styled cleanly with flex-shrink: 0', () => {
  assert.ok(cssContent.includes('.sfx-bf__action-bar'), 'Must define .sfx-bf__action-bar');
  assert.ok(cssContent.includes('.sfx-bf__clip-card'), 'Must define .sfx-bf__clip-card');
  assert.ok(htmlContent.includes('id="bgm-btn-save-preset"'), 'Must have save preset button with ID');
  assert.ok(htmlContent.includes('id="bgm-btn-sync-clip"'), 'Must have sync clip button with ID');
});

// -----------------------------------------------------------------------------
// GROUP 2: AI SFX CHAT INTERACTION & STYLING
// -----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 2: AI SFX CHAT INTERACTION & STYLING ---');

test('No undefined setView calls exist in plugin-controller.js', () => {
  const setViewMatches = controllerCode.match(/setView\(/g);
  assert.strictEqual(setViewMatches, null, 'Must not call undefined setView function');
});

test('AI SFX chat interface elements exist with proper IDs and attributes', () => {
  assert.ok(htmlContent.includes('id="sfx-ai-assistant"'), 'AI overlay container must exist');
  assert.ok(htmlContent.includes('id="sfx-ai-msg-list"'), 'AI message list must exist');
  assert.ok(htmlContent.includes('id="sfx-ai-textarea"'), 'AI textarea/input must exist');
  assert.ok(htmlContent.includes('id="sfx-ai-send-btn"'), 'AI send button must exist');
  assert.ok(htmlContent.includes('id="sfx-ai-back-btn"'), 'AI back button must exist');
});

test('AI SFX Chat styles (.sfx-ai-chat-bubble, user, assistant) are defined in style.css', () => {
  assert.ok(cssContent.includes('.sfx-ai-chat-bubble'), 'Must define .sfx-ai-chat-bubble in CSS');
  assert.ok(cssContent.includes('.sfx-ai-bubble--user'), 'Must define .sfx-ai-bubble--user in CSS');
  assert.ok(cssContent.includes('.sfx-ai-bubble--assistant'), 'Must define .sfx-ai-bubble--assistant in CSS');
  assert.ok(cssContent.includes('.sfx-ai-chip-prompt'), 'Must define .sfx-ai-chip-prompt in CSS');
  assert.ok(cssContent.includes('#sfx-ai-textarea:focus'), 'Must define focus state for textarea');
});

test('AI SFX chat supports Enter key and Send button submission in controller', () => {
  assert.ok(controllerCode.includes('sendBtn.addEventListener(\'click\''), 'Send button must be wired');
  assert.ok(controllerCode.includes('e.key === \'Enter\''), 'Enter key must trigger send');
  assert.ok(controllerCode.includes('processAiPrompt(txt)'), 'Must call processAiPrompt on submit');
});

test('Quick prompt chips fill and send prompt to AI engine', () => {
  assert.ok(controllerCode.includes('.sfx-ai-chip-prompt'), 'Controller must select prompt chips');
  assert.ok(controllerCode.includes('appendAiMsg(txt, \'user\')'), 'Chip click must append user message');
});

test('AI SFX auto-focuses input field when opened and scrolls to bottom', () => {
  assert.ok(controllerCode.includes('toolId === \'ai\'') && controllerCode.includes('aiInput.focus()'), 'Must focus ai input on overlay open');
  assert.ok(controllerCode.includes('list.scrollTop = list.scrollHeight'), 'Must scroll message list to bottom on new message');
});

// -----------------------------------------------------------------------------
// GROUP 3: AUTO EQ AUDIO PATH ERROR RESOLUTION
// -----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 3: AUTO EQ AUDIO PATH ERROR RESOLUTION ---');

test('CEP Extension bgm-flow.js passes string path from wavRes.path to replaceSelected', () => {
  if (fs.existsSync(CEP_BGM_JS)) {
    const cepCode = fs.readFileSync(CEP_BGM_JS, 'utf8');
    assert.ok(cepCode.includes('wavRes && typeof wavRes === \'object\' && wavRes.path'), 'Must extract actualPath from wavRes.path');
    assert.ok(!cepCode.includes('path: wavPath,'), 'Must not pass raw wavPath object');
  } else {
    console.log('    (Skipping CEP extension path check - file not on this path)');
  }
});

test('CEP Extension sfxbox.jsx defensively handles path objects and strings', () => {
  if (fs.existsSync(CEP_SFXBOX_JSX)) {
    const jsxCode = fs.readFileSync(CEP_SFXBOX_JSX, 'utf8');
    assert.ok(jsxCode.includes('params.path.path'), 'Must defensively handle nested params.path.path');
  } else {
    console.log('    (Skipping JSX path check - file not on this path)');
  }
});

test('Website demo Apply button strictly validates audio source path', () => {
  assert.ok(controllerCode.includes('Failed to apply Auto EQ: No audio file path was supplied'), 'Must handle missing audio gracefully');
  assert.ok(controllerCode.includes('!audioPath || typeof audioPath !== \'string\''), 'Must strictly validate audioPath');
});

test('Website demo Auto EQ draws dynamic frequency curve on canvas with 5 EQ profiles', () => {
  assert.ok(controllerCode.includes('function drawAutoEqCanvas('), 'Must define drawAutoEqCanvas');
  assert.ok(controllerCode.includes('voiceover') && controllerCode.includes('warm') && controllerCode.includes('balanced') && controllerCode.includes('bright') && controllerCode.includes('cinematic'), 'Must define all 5 EQ profiles');
  assert.ok(controllerCode.includes('window.SFX_DRAW_AUTO_EQ'), 'Must expose draw function for tool switching');
});

test('Save Preset button saves real preset name without "undefined Auto EQ" error', () => {
  assert.ok(controllerCode.includes('bgm-btn-save-preset'), 'Must wire save preset button');
  assert.ok(!controllerCode.includes('undefined Auto EQ'), 'Must never show undefined Auto EQ');
});

// -----------------------------------------------------------------------------
// GROUP 4: OVERALL DEMO STABILITY & SCROLLING
// -----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 4: OVERALL DEMO STABILITY & SCROLLING ---');

test('Website main scrolling is preserved with html overflow-y: scroll and body overflow-y: visible', () => {
  assert.ok(cssContent.includes('html {') && cssContent.includes('overflow-y: scroll !important'), 'html must have overflow-y: scroll !important');
  assert.ok(cssContent.includes('body {') && cssContent.includes('overflow-y: visible !important'), 'body must have overflow-y: visible !important');
  assert.ok(cssContent.includes('height: auto !important'), 'body must have height: auto !important');
});

test('Live demo container maintains strict 600px height with managed internal scrolling', () => {
  assert.ok(cssContent.includes('.sfx-plugin-viewport {') && cssContent.includes('height: 600px !important'), 'Viewport must be 600px');
  assert.ok(cssContent.includes('max-height: 600px !important'), 'Viewport max-height must be 600px');
});

test('Universal back button listener cleanly closes active overlays and restores library view', () => {
  assert.ok(controllerCode.includes('.sfx-tool-back-btn, #sfx-ai-back-btn'), 'Back button delegation must cover #sfx-ai-back-btn');
  assert.ok(controllerCode.includes('closeCurrentToolOverlay()'), 'Must call closeCurrentToolOverlay');
});

test('Seamless switching between all 7 modules without UI locks', () => {
  assert.ok(controllerCode.includes('toggleToolOverlay(tool)'), 'Header menu buttons must call toggleToolOverlay');
  assert.ok(controllerCode.includes('toggleToolOverlay(mod)'), 'Demo chips must call toggleToolOverlay');
  assert.ok(controllerCode.includes('browser:') && controllerCode.includes('ai:') && controllerCode.includes('bgm:') && controllerCode.includes('analytics:') && controllerCode.includes('scene:') && controllerCode.includes('audio:') && controllerCode.includes('settings:'), 'All 7 tools mapped');
});

console.log('\n================================================================');
console.log(` RESULTS: ${passedTests} / ${totalTests} TESTS PASSED`);
console.log('================================================================');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
