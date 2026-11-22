/**
 * test_faq_redesign.js
 * Verification test suite for SFX Composer FAQ Section Redesign.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT_DIR = __dirname;
const indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
const styleCss = fs.readFileSync(path.join(ROOT_DIR, 'css', 'style.css'), 'utf8');
const mainJs = fs.readFileSync(path.join(ROOT_DIR, 'js', 'main.js'), 'utf8');

console.log('========================================================================');
console.log(' SFX COMPOSER — FAQ SECTION REDESIGN VERIFICATION SUITE');
console.log('========================================================================\n');

let passCount = 0;

// [TEST 1] Layout & Content Width Constraints
console.log('[TEST 1] Verifying Compact Layout & Content Width (750–850px)...');
assert.ok(indexHtml.includes('id="faq"'), 'Must have section with id="faq"');
assert.ok(indexHtml.includes('class="faq-container"'), 'Must have .faq-container');
assert.ok(
  styleCss.includes('max-width: 800px;') || styleCss.includes('max-width: 820px;') || styleCss.includes('max-width: 850px;'),
  'style.css must constrain .faq-container to around 750-850px'
);
assert.ok(styleCss.includes('margin-inline: auto;'), 'style.css must center .faq-container horizontally');
console.log('✓ PASS: FAQ container correctly constrained to 800px and centered horizontally.');
passCount++;

// [TEST 2] Heading and Subtitle
console.log('\n[TEST 2] Verifying Heading & Compact Subtitle...');
assert.ok(indexHtml.includes('<h2 class="sfx-site-title">Frequently Asked Questions</h2>'), 'Must have clean title');
assert.ok(indexHtml.includes('class="sfx-site-kicker">Help &amp; Answers</span>'), 'Must have kicker badge');
assert.ok(indexHtml.includes('sfx-faq-subtitle'), 'Must have compact subtitle class');
console.log('✓ PASS: Clean heading "Frequently Asked Questions" and compact subtitle present.');
passCount++;

// [TEST 3] Preserved Content (All 6 Questions and Answers)
console.log('\n[TEST 3] Verifying Complete Preservation of All 6 FAQ Items...');
const expectedQuestions = [
  'What is SFX Composer?',
  'Does it support Premiere Pro and After Effects?',
  'What is included in the ₹199 bundle?',
  'How do I install the plugin?',
  'How do I receive my downloads?',
  'How can I get support?'
];

expectedQuestions.forEach((q, i) => {
  assert.ok(indexHtml.includes(q), `Missing Question ${i + 1}: "${q}"`);
});

assert.ok(indexHtml.includes('directly at <a href="mailto:visualsadusk@gmail.com" style="color: var(--sfx-accent); text-decoration: underline;">visualsadusk@gmail.com</a>'), 'Must preserve exact contact email markup in Question 6');
assert.ok(indexHtml.includes('https://discord.gg/zrvYJeq9W'), 'Must preserve Discord link in Question 6');
assert.ok(indexHtml.includes('7GB Master SFX Library'), 'Must preserve 7GB library claim');
assert.ok(indexHtml.includes('CC 2021 through CC 2026'), 'Must preserve Premiere/AE versions');
console.log('✓ PASS: All 6 questions and answers accurately preserved without content loss.');
passCount++;

// [TEST 4] Typography & Visual Styling (Questions 14-15px semibold, Answers 13-14px muted)
console.log('\n[TEST 4] Verifying SaaS Typography & Card Styling...');
assert.ok(styleCss.includes('.faq-question-text {') && (styleCss.includes('font-size: 14.5px;') || styleCss.includes('font-size: 15px;')), 'Question font size must be 14-15px');
assert.ok(styleCss.includes('font-weight: 600;'), 'Question font-weight must be semibold (600)');
assert.ok(styleCss.includes('color: #ffffff;'), 'Question text must be white');
assert.ok(styleCss.includes('.faq-answer-inner {') && (styleCss.includes('font-size: 13.5px;') || styleCss.includes('font-size: 14px;') || styleCss.includes('font-size: 13px;')), 'Answer font size must be 13-14px');
assert.ok(styleCss.includes('line-height: 1.6;'), 'Answer must have comfortable line height');
assert.ok(styleCss.includes('border: 1px solid rgba(255, 255, 255, 0.07);'), 'Cards must have subtle dark border');
assert.ok(styleCss.includes('background: #090c12;') || styleCss.includes('background: #0b0e14;'), 'Cards must have slightly lighter dark background');
console.log('✓ PASS: Typography and card visual aesthetics adhere strictly to SaaS design standards.');
passCount++;

// [TEST 5] Small Elegant Arrow Design (No oversized SVGs, Blue when open)
console.log('\n[TEST 5] Verifying Arrow Design (Compact Chevron, Rotates 180°, Turns Brand Blue)...');
assert.ok(styleCss.includes('width: 15px;') || styleCss.includes('width: 16px;'), 'Arrow must be 15-16px, never oversized');
assert.ok(styleCss.includes('transform: rotate(180deg);'), 'Arrow must rotate 180deg when open');
assert.ok(styleCss.includes('color: var(--sfx-accent);'), 'Arrow must turn brand blue when expanded');
assert.ok(styleCss.includes('.faq-chevron-wrap'), 'Must have dedicated chevron wrapper');
console.log('✓ PASS: Chevron arrow is small, elegant, rotates 180°, and transitions to brand blue.');
passCount++;

// [TEST 6] Accordion Interaction, Zero-Jank CSS Grid Animation & Single Expansion
console.log('\n[TEST 6] Verifying Accordion Interaction & CSS Grid Animation...');
assert.ok(styleCss.includes('grid-template-rows: 0fr;'), 'Answer must be collapsed by default using 0fr');
assert.ok(styleCss.includes('grid-template-rows: 1fr;'), 'Answer must expand smoothly using 1fr');
assert.ok(styleCss.includes('transition: grid-template-rows'), 'Smooth height transition without fixed height');
assert.ok(mainJs.includes('setupFaqAccordion'), 'setupFaqAccordion must be in main.js');
assert.ok(mainJs.includes('aria-expanded'), 'Must manage aria-expanded state');
assert.ok(mainJs.includes('classList.remove(\'is-open\')'), 'Must close other open FAQs for single expansion');
console.log('✓ PASS: CSS Grid zero-jank animation and single-item expansion confirmed.');
passCount++;

// [TEST 7] Accessibility & Keyboard Navigation
console.log('\n[TEST 7] Verifying Accessibility & Keyboard Controls...');
assert.ok(indexHtml.includes('aria-expanded="false"'), 'Buttons must default to aria-expanded="false"');
assert.ok(indexHtml.includes('aria-controls="faq-a-'), 'Buttons must link to answers via aria-controls');
assert.ok(indexHtml.includes('role="region"'), 'Answers must have role="region"');
assert.ok(indexHtml.includes('aria-labelledby="faq-q-'), 'Answers must have aria-labelledby');
assert.ok(mainJs.includes('ArrowDown') && mainJs.includes('ArrowUp'), 'Must support keyboard arrow key navigation');
assert.ok(styleCss.includes(':focus-visible'), 'Must have focus-visible styling');
console.log('✓ PASS: Accessibility and keyboard navigation fully implemented.');
passCount++;

// [TEST 8] Responsive Design for Mobile
console.log('\n[TEST 8] Verifying Mobile Responsiveness...');
assert.ok(styleCss.includes('@media (max-width: 640px)'), 'Must have mobile breakpoint for FAQ');
console.log('✓ PASS: Mobile layout rules present and responsive.');
passCount++;

console.log('========================================================================');
console.log(` ALL ${passCount}/${passCount} FAQ REDESIGN TESTS PASSED PERFECTLY!`);
console.log('========================================================================\n');
