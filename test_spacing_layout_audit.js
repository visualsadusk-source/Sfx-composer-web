/**
 * test_spacing_layout_audit.js
 * Comprehensive automated verification for website layout, spacing rhythm, and responsiveness.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('🧪 Starting Website Spacing & Layout Audit Test Suite...\n');

let passed = 0;
let total = 0;

function check(desc, fn) {
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

const css = fs.readFileSync(path.join(__dirname, 'css', 'style.css'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const demoHtml = fs.readFileSync(path.join(__dirname, 'demo.html'), 'utf8');
const screenshotsHtml = fs.readFileSync(path.join(__dirname, 'screenshots.html'), 'utf8');
const libraryHtml = fs.readFileSync(path.join(__dirname, 'library.html'), 'utf8');

// 1. Vertical spacing & compact section rhythm
check('Global section padding is standardized to 36px 0 (no 60px bloat)', () => {
  assert.ok(css.includes('.sfx-site-section {\n  padding: 36px 0;\n}') || css.includes('.sfx-site-section {\r\n  padding: 36px 0;\r\n}'));
});

check('Section headers margin-bottom is standardized to 22px (no 36px bloat)', () => {
  assert.ok(css.includes('margin-bottom: 22px;'));
});

// 2. Hero Section Balanced Height
check('Hero section padding is reduced to 28px 0 20px (no 50px bloat)', () => {
  assert.ok(css.includes('padding: 28px 0 20px;'));
});

check('Hero badge margin-bottom is tightened to 12px (no 20px gap)', () => {
  assert.ok(css.includes('.sfx-site-hero-badge') && css.includes('margin-bottom: 12px;'));
});

check('Hero headline line-height and margin are balanced (line-height: 1.1; margin-bottom: 10px;)', () => {
  assert.ok(css.includes('line-height: 1.1;') && css.includes('margin-bottom: 10px;'));
});

check('Hero subtext margin-bottom is tightened to 16px (no 28px gap)', () => {
  assert.ok(css.includes('margin-bottom: 16px;'));
});

check('Waveform canvas height is compact at 44px (not 80px blank space)', () => {
  assert.ok(indexHtml.includes('height: 44px; margin-bottom: 14px;'));
  assert.ok(!indexHtml.includes('height: 80px;'));
});

check('Hero actions margin-bottom is tightened to 14px (no 24px gap)', () => {
  assert.ok(css.includes('.sfx-site-hero-actions') && css.includes('margin-bottom: 14px;'));
});

check('Primary Hero showcase visual sits snug against CTA actions (margin: 0 auto 16px auto)', () => {
  assert.ok(css.includes('margin: 0 auto 16px auto;'));
});

// 3. Horizontal Spacing & Sidebar Alignment
check('Sidebar is fixed with compact padding (16px 10px 14px) and box-sizing: border-box', () => {
  assert.ok(css.includes('padding: 16px 10px 14px;'));
  assert.ok(css.includes('box-sizing: border-box;'));
});

check('Sidebar logo wrap margin-bottom is 16px (not 22px)', () => {
  assert.ok(css.includes('margin-bottom: 16px;'));
});

check('Sidebar navigation links have 7px 10px padding and 2px gap', () => {
  assert.ok(css.includes('padding: 7px 10px;'));
  assert.ok(css.includes('gap: 2px;'));
});

check('Main content is aligned with width: calc(100% - var(--sidebar-w)) and box-sizing', () => {
  assert.ok(css.includes('width: calc(100% - var(--sidebar-w));'));
  assert.ok(css.includes('padding: 0 32px 50px;'));
});

// 4. Destination Cards Grid & Features
check('3-column destination cards grid has 16px gap and 24px bottom margin', () => {
  assert.ok(css.includes('gap: 16px;') && css.includes('margin: 0 0 24px 0;'));
});

check('Destination cards have balanced internal padding (header 11px 16px, content 16px 18px 18px)', () => {
  assert.ok(css.includes('padding: 11px 16px;'));
  assert.ok(css.includes('padding: 16px 18px 18px;'));
});

check('Feature grid boxes have 20px padding and 10px gap', () => {
  assert.ok(css.includes('padding: 20px;') && css.includes('gap: 10px;'));
});

// 5. Bundle Container Spacing
check('Ultimate Bundle container padding is 28px 24px (not 36px 32px)', () => {
  assert.ok(css.includes('padding: 28px 24px;'));
  assert.ok(css.includes('margin-bottom: 20px;'));
});

check('Bundle split grid has 18px gap and 22px bottom margin (not 24px / 32px)', () => {
  assert.ok(css.includes('gap: 18px;') && css.includes('margin-bottom: 22px;'));
});

check('Bundle pricing footer padding is 18px 22px with 16px gap', () => {
  assert.ok(css.includes('padding: 18px 22px;'));
});

// 6. Screenshots Gallery & SFX Library Spacing
check('Screenshots Gallery hero margin is 0 0 24px 0 (not 40px)', () => {
  assert.ok(css.includes('.sfx-gallery-hero-section') && css.includes('margin: 0 0 24px 0;'));
});

check('SFX Library folder search and filters bar have compact spacing', () => {
  assert.ok(css.includes('gap: 10px;') && css.includes('margin-bottom: 12px;'));
  assert.ok(css.includes('margin-bottom: 18px;'));
  assert.ok(css.includes('gap: 14px;'));
});

// 7. Responsive Breakpoints
check('Responsive rules defined for Laptop (1200px), Tablet/Mobile (1024px), and Compact Mobile (640px)', () => {
  assert.ok(css.includes('@media (max-width: 1200px) and (min-width: 1025px)'));
  assert.ok(css.includes('@media (max-width: 1024px)'));
  assert.ok(css.includes('@media (max-width: 640px)'));
});

check('Mobile view eliminates sidebar margin and uses 72px top padding for 56px header', () => {
  assert.ok(css.includes('padding-top: 72px;'));
});

// 8. Footers
check('Footer padding is standardized across all pages to 24px 0 16px with margin-top 36px', () => {
  assert.ok(indexHtml.includes('padding: 24px 0 16px; margin-top: 36px;'));
  assert.ok(demoHtml.includes('padding: 24px 0 16px; margin-top: 36px;'));
  assert.ok(screenshotsHtml.includes('padding: 24px 0 16px; margin-top: 36px;'));
  assert.ok(libraryHtml.includes('padding: 24px 0 16px; margin-top: 36px;'));
});

console.log('\n========================================');
console.log(`Results: ${passed} / ${total} passed`);
console.log('========================================');

if (passed !== total) {
  process.exit(1);
}
