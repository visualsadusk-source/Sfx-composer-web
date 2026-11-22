/**
 * test_social_community_links.js
 * Automated verification suite for SFX Composer official social media community links.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const http = require('http');

console.log('========================================================================');
console.log(' SFX COMPOSER — SOCIAL MEDIA & COMMUNITY SECTION VERIFICATION');
console.log('========================================================================\n');

const ROOT_DIR = __dirname;
const indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT_DIR, 'css', 'style.css'), 'utf8');

// 1. Check Section Placement
console.log('[TEST 1] Verifying "Join the Community" section placement above footer...');
assert.ok(indexHtml.includes('id="community"'), 'index.html must contain #community section');
assert.ok(indexHtml.includes('Join the Community'), 'Must contain "Join the Community" title');

const communityIdx = indexHtml.indexOf('id="community"');
const footerIdx = indexHtml.indexOf('<footer');
assert.ok(communityIdx !== -1, 'Community section must exist');
assert.ok(footerIdx !== -1, 'Footer must exist');
assert.ok(communityIdx < footerIdx, 'Community section must be located above the footer');
console.log('✓ PASS: Community section exists directly above the footer.\n');

// 2. Check 3 Social Cards with Exact URLs and Labels
console.log('[TEST 2] Verifying 3 official social cards, exact URLs, titles & descriptions...');
const EXPECTED_LINKS = [
  {
    platform: 'Discord',
    url: 'https://discord.gg/zrvYJeq9W',
    desc: 'Join our community'
  },
  {
    platform: 'Instagram',
    url: 'https://www.instagram.com/sfx.composer/',
    desc: 'Follow our updates'
  },
  {
    platform: 'YouTube',
    url: 'https://www.youtube.com/@SfxComposer',
    desc: 'Watch tutorials and product updates'
  }
];

EXPECTED_LINKS.forEach(item => {
  assert.ok(indexHtml.includes(item.url), `index.html must contain exact URL: ${item.url}`);
  assert.ok(indexHtml.includes(item.desc), `index.html must contain exact description: "${item.desc}"`);
  assert.ok(indexHtml.includes(item.platform), `index.html must mention platform: ${item.platform}`);
});
console.log('✓ PASS: All 3 social cards verified with exact URLs, titles, and descriptions.\n');

// 3. Security Attributes (target="_blank" rel="noopener noreferrer")
console.log('[TEST 3] Verifying secure external-link attributes...');
EXPECTED_LINKS.forEach(item => {
  const cardRegex = new RegExp(`<a[^>]*href="${item.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`, 'g');
  const matches = indexHtml.match(cardRegex) || [];
  assert.ok(matches.length >= 1, `Must find links for ${item.platform}`);
  matches.forEach(linkTag => {
    assert.ok(linkTag.includes('target="_blank"'), `${item.platform} link must have target="_blank"`);
    assert.ok(linkTag.includes('rel="noopener noreferrer"'), `${item.platform} link must have rel="noopener noreferrer"`);
  });
});
console.log('✓ PASS: All external social links strictly enforce target="_blank" and rel="noopener noreferrer".\n');

// 4. Footer Quick-Access Social Icons
console.log('[TEST 4] Verifying footer quick-access social icons across pages...');
['index.html', 'demo.html', 'screenshots.html', 'library.html'].forEach(page => {
  const pageHtml = fs.readFileSync(path.join(ROOT_DIR, page), 'utf8');
  assert.ok(pageHtml.includes('https://discord.gg/zrvYJeq9W'), `${page} must contain Discord link`);
  assert.ok(pageHtml.includes('https://www.instagram.com/sfx.composer/'), `${page} must contain Instagram link`);
  assert.ok(pageHtml.includes('https://www.youtube.com/@SfxComposer'), `${page} must contain YouTube link`);
});
console.log('✓ PASS: All 4 primary pages contain quick-access social icons with official links.\n');

// 5. CSS Styling and Responsiveness
console.log('[TEST 5] Verifying CSS design system, hover effects, and responsive layout...');
assert.ok(css.includes('.sfx-community-grid'), 'CSS must define .sfx-community-grid');
assert.ok(css.includes('.sfx-community-card'), 'CSS must define .sfx-community-card');
assert.ok(css.includes('.sfx-community-card:hover'), 'CSS must define hover effects for cards');
assert.ok(css.includes('.sfx-footer-icon-link'), 'CSS must define .sfx-footer-icon-link');
assert.ok(css.includes('@media (max-width: 900px)'), 'CSS must define responsive media query for community grid');
console.log('✓ PASS: CSS styles and responsive transitions confirmed.\n');

// 6. Live Server HTTP Verification
console.log('[TEST 6] Verifying live HTTP 200 response contains community section and links...');
http.get('http://localhost:3000/', (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    assert.strictEqual(res.statusCode, 200, 'HTTP GET / must return 200 OK');
    assert.ok(body.includes('Join the Community'), 'Live response must contain "Join the Community"');
    assert.ok(body.includes('https://discord.gg/zrvYJeq9W'), 'Live response must serve Discord link');
    assert.ok(body.includes('https://www.instagram.com/sfx.composer/'), 'Live response must serve Instagram link');
    assert.ok(body.includes('https://www.youtube.com/@SfxComposer'), 'Live response must serve YouTube link');
    console.log('✓ PASS: Live server serves complete Community section and verified social links.\n');

    console.log('========================================================================');
    console.log(' ALL SOCIAL COMMUNITY LINK TESTS PASSED PERFECTLY!');
    console.log('========================================================================\n');
  });
}).on('error', (err) => {
  console.error('Server request failed:', err);
  process.exit(1);
});
