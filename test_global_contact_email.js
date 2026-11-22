/**
 * test_global_contact_email.js
 * Verification suite for Global Support Email Update:
 * Ensures all public-facing contact/support emails are updated to sfxcomposer@gmail.com
 * with valid mailto: links and zero remaining public references to visualsadusk@gmail.com.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('========================================================================');
console.log(' SFX COMPOSER — GLOBAL CONTACT EMAIL VERIFICATION SUITE');
console.log('========================================================================\n');

let passedTests = 0;

// 1. Verify all 4 primary HTML pages
const pages = ['index.html', 'demo.html', 'library.html', 'screenshots.html'];

console.log('[TEST 1] Verifying Public HTML Pages for New Official Support Email...');
pages.forEach(page => {
  const filePath = path.join(__dirname, page);
  const html = fs.readFileSync(filePath, 'utf8');

  // Must NOT contain old contact email
  assert.ok(!html.includes('visualsadusk@gmail.com'), `${page} must NOT contain visualsadusk@gmail.com`);

  // Must contain new official contact email with mailto:
  assert.ok(html.includes('sfxcomposer@gmail.com'), `${page} must contain sfxcomposer@gmail.com`);
  assert.ok(html.includes('mailto:sfxcomposer@gmail.com'), `${page} must contain mailto:sfxcomposer@gmail.com`);

  // Verify footer support link
  assert.ok(
    html.includes('href="mailto:sfxcomposer@gmail.com"'),
    `${page} must have an active mailto: link for sfxcomposer@gmail.com`
  );

  // Verify Customer Dashboard support details
  assert.ok(
    html.includes('Need assistance finding your purchase? Contact support:') ||
    html.includes('Need help with your license, activation or downloads? Contact support:'),
    `${page} must include customer dashboard support details`
  );

  // Verify Checkout support details
  assert.ok(
    html.includes('• Support: <a href="mailto:sfxcomposer@gmail.com"') ||
    html.includes('Need assistance with your order? Contact support: <a href="mailto:sfxcomposer@gmail.com"'),
    `${page} must include checkout support details`
  );

  console.log(`  ✓ ${page}: Verified all visible contact & mailto links use sfxcomposer@gmail.com`);
});
passedTests++;

// 2. Verify FAQ section in index.html
console.log('\n[TEST 2] Verifying FAQ Section in index.html...');
const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
assert.ok(
  indexHtml.includes('directly at <a href="mailto:sfxcomposer@gmail.com" style="color: var(--sfx-accent); text-decoration: underline;">sfxcomposer@gmail.com</a>'),
  'index.html FAQ must have hyperlinked mailto:sfxcomposer@gmail.com'
);
assert.ok(
  indexHtml.includes('Support: <a href="mailto:sfxcomposer@gmail.com" style="color: var(--sfx-accent); text-decoration: underline;">sfxcomposer@gmail.com</a>'),
  'index.html pricing trust line must have hyperlinked mailto:sfxcomposer@gmail.com'
);
console.log('✓ PASS: FAQ and pricing trust line correctly link to mailto:sfxcomposer@gmail.com');
passedTests++;

// 3. Verify README.md documentation
console.log('\n[TEST 3] Verifying Documentation & README...');
const readme = fs.readFileSync(path.join(__dirname, 'README.md'), 'utf8');
assert.ok(!readme.includes('visualsadusk@gmail.com'), 'README.md must NOT contain visualsadusk@gmail.com');
assert.ok(readme.includes('mailto:sfxcomposer@gmail.com'), 'README.md must link to mailto:sfxcomposer@gmail.com');
console.log('✓ PASS: README.md documentation links directly to sfxcomposer@gmail.com');
passedTests++;

// 4. Verify Zero Old Public-Facing Email References Across Repository
console.log('\n[TEST 4] Scanning Repository for Old Public-Facing Email Occurrences...');
function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (file === '.git' || file === 'node_modules') continue;
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(walk(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

const allFiles = walk(__dirname);
const publicExtensions = ['.html', '.css', '.js', '.json', '.md'];
const leakedFiles = [];

allFiles.forEach(file => {
  const ext = path.extname(file).toLowerCase();
  // Skip test files, database migrations, and .system_generated
  if (path.basename(file).startsWith('test_') || file.includes('migrations') || file.includes('.system_generated')) return;
  if (!publicExtensions.includes(ext)) return;

  try {
    const content = fs.readFileSync(file, 'utf8');
    if (content.toLowerCase().includes('visualsadusk@gmail.com')) {
      leakedFiles.push(file);
    }
  } catch (e) {}
});

assert.strictEqual(leakedFiles.length, 0, `Old email found in public files: ${leakedFiles.join(', ')}`);
console.log('✓ PASS: Zero old public-facing email references remain across the entire website codebase.');
passedTests++;

console.log('========================================================================');
console.log(` ALL ${passedTests}/${passedTests} CONTACT EMAIL VERIFICATION TESTS PASSED!`);
console.log('========================================================================\n');
