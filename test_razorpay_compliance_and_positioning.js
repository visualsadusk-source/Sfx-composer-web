const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT_DIR = __dirname;
let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     ${err.message}`);
  }
}

console.log(`\n========================================================================`);
console.log(` SFX COMPOSER — WEBSITE REPOSITIONING & COMPLIANCE VERIFICATION SUITE`);
console.log(`========================================================================\n`);

const indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
const demoHtml = fs.readFileSync(path.join(ROOT_DIR, 'demo.html'), 'utf8');
const screenshotsHtml = fs.readFileSync(path.join(ROOT_DIR, 'screenshots.html'), 'utf8');
const libraryHtml = fs.readFileSync(path.join(ROOT_DIR, 'library.html'), 'utf8');
const allPages = [
  { name: 'index.html', content: indexHtml },
  { name: 'demo.html', content: demoHtml },
  { name: 'screenshots.html', content: screenshotsHtml },
  { name: 'library.html', content: libraryHtml }
];

// 1. Website Brand Positioning
test('Homepage contains exact positioning: SFX Composer — Professional Sound Design & Audio Workflow Software', () => {
  assert.ok(indexHtml.includes('SFX Composer — Professional Sound Design & Audio Workflow Software'), 'index.html title/headline missing exact positioning');
  assert.ok(indexHtml.includes('Professional sound design software designed to simplify audio workflows, manage sound effects, and support creative editing processes.'), 'index.html missing new product positioning');
  assert.ok(indexHtml.includes('17,000+ sound effects library'), 'index.html missing 17,000+ sound library mention');
  assert.ok(indexHtml.includes('precision audio trimming'), 'index.html missing precision audio trimming');
});

// 2. Elimination of Forbidden Terms
test('Zero forbidden terms across all 4 public website pages', () => {
  const forbidden = [
    'third-party plugin',
    'adobe plugin',
    'premiere pro extension',
    'after effects extension',
    'plugin marketplace',
    'extension installation'
  ];
  allPages.forEach(({ name, content }) => {
    forbidden.forEach((term) => {
      assert.ok(!content.toLowerCase().includes(term), `${name} still contains forbidden term: "${term}"`);
    });
  });
});

// 3. Highlighted Genuine Software Features
test('Homepage features highlight 17,000+ library, trimming, fades, normalization, volume, and AI tools', () => {
  assert.ok(indexHtml.includes('17,000+ Sound Library'), 'Missing 17,000+ Sound Library');
  assert.ok(indexHtml.includes('Sound Management'), 'Missing Sound Management');
  assert.ok(indexHtml.includes('Audio Trimming'), 'Missing Audio Trimming');
  assert.ok(indexHtml.includes('Fade In / Fade Out'), 'Missing Fade In / Fade Out');
  assert.ok(indexHtml.includes('Volume &amp; Normalization') || indexHtml.includes('Volume & Normalization'), 'Missing Volume & Normalization');
  assert.ok(indexHtml.includes('AI Sound Design'), 'Missing AI Sound Design');
  assert.ok(indexHtml.includes('Integrated Download Manager'), 'Missing Integrated Download Manager');
  assert.ok(indexHtml.includes('Professional Audio Workflow'), 'Missing Professional Audio Workflow');
});

// 4. Natural Contextual Adobe References
test('Contextual Adobe Premiere Pro and After Effects workflow references retained naturally', () => {
  assert.ok(indexHtml.includes('Adobe Premiere Pro') && indexHtml.includes('Adobe After Effects'), 'Missing natural Adobe references');
  assert.ok(/Supports creative workflows involving.*Adobe Premiere Pro/.test(indexHtml), 'Missing Premiere Pro workflow support');
  assert.ok(/Supports creative workflows involving.*Adobe After Effects/.test(indexHtml), 'Missing After Effects workflow support');
});

// 5. Operating System Specifications
test('Operating system specifications clearly stated', () => {
  assert.ok(indexHtml.includes('Windows 10 / 11') && indexHtml.includes('macOS 11+'), 'Missing OS specs');
  assert.ok(indexHtml.includes('Apple Silicon'), 'Missing Apple Silicon reference');
});

// 6. Section: What You Get With SFX Composer Pro
test('Homepage contains section: What You Get With SFX Composer Pro with software vs library distinction', () => {
  assert.ok(indexHtml.includes('What You Get With SFX Composer Pro'), 'Missing What You Get section');
  assert.ok(indexHtml.includes('Lifetime Software License'), 'Missing Lifetime Software License');
  assert.ok(indexHtml.includes('SFX Composer Software Packages'), 'Missing SFX Composer Software Packages');
  assert.ok(indexHtml.includes('Step-by-Step Software Setup Guide'), 'Missing Setup Guide item');
  assert.ok(indexHtml.includes('Software Updates &amp; Improvements') || indexHtml.includes('Software Updates & Improvements'), 'Missing updates item');
  assert.ok(indexHtml.includes('7GB Master SFX Library'), 'Missing 7GB SFX Library item');
  assert.ok(indexHtml.includes('sfxcomposer@gmail.com'), 'Missing support email');
  assert.ok(indexHtml.includes('professional sound design and audio workflow software'), 'Missing explicit distinction notice');
});

// 7. Website Transparency & Business Information
test('All 4 pages display official support email sfxcomposer@gmail.com prominently', () => {
  allPages.forEach(({ name, content }) => {
    assert.ok(content.includes('sfxcomposer@gmail.com'), `${name} missing official email sfxcomposer@gmail.com`);
    assert.ok(content.includes('mailto:sfxcomposer@gmail.com'), `${name} missing mailto link`);
  });
});

test('Homepage clearly states ₹199 one-time payment with no subscriptions', () => {
  assert.ok(indexHtml.includes('₹199'), 'index.html missing ₹199 price');
  assert.ok(indexHtml.includes('One-time payment') || indexHtml.includes('one-time payment'), 'index.html missing One-time payment');
});

test('Homepage and secondary pages contain 30-Day Money-Back Guarantee', () => {
  allPages.forEach(({ name, content }) => {
    assert.ok(content.includes('30-Day Money-Back Guarantee') || content.includes('30-day money-back guarantee'), `${name} missing 30-Day Money-Back Guarantee`);
  });
});

// 8. Legal & Policy Modals
test('All 4 pages include Terms & Conditions, Privacy Policy, Refund Policy, and Installation Guide modals', () => {
  allPages.forEach(({ name, content }) => {
    assert.ok(content.includes('id="terms-modal"'), `${name} missing terms-modal`);
    assert.ok(content.includes('id="privacy-modal"'), `${name} missing privacy-modal`);
    assert.ok(content.includes('id="refund-modal"'), `${name} missing refund-modal`);
    assert.ok(content.includes('id="install-guide-modal"'), `${name} missing install-guide-modal`);
  });
});

// 9. Navigation Structure & Section Preservation
test('All pages feature clean 5-item navigation and preserve Workflow, Features, Compatibility, and What You Get sections', () => {
  allPages.forEach(({ name, content }) => {
    assert.ok(content.includes('Overview'), `${name} missing Overview nav link`);
    assert.ok(content.includes('Live Demo'), `${name} missing Live Demo nav link`);
    assert.ok(content.includes('SFX Library'), `${name} missing SFX Library nav link`);
    assert.ok(content.includes('Pricing'), `${name} missing Pricing nav link`);
    assert.ok(content.includes('FAQ'), `${name} missing FAQ nav link`);
  });

  // Verify merged/repositioned sections remain fully present on homepage
  const indexHtml = allPages.find(p => p.name === 'index.html').content;
  assert.ok(indexHtml.includes('id="workflow"'), 'index.html missing preserved #workflow section');
  assert.ok(indexHtml.includes('id="features"'), 'index.html missing #features section');
  assert.ok(indexHtml.includes('id="compatibility"'), 'index.html missing preserved #compatibility section');
  assert.ok(indexHtml.includes('id="what-you-get"'), 'index.html missing preserved #what-you-get section');
});

// 10. Brevo Removal Verification
test('Zero Brevo API keys or Brevo dispatch files in repository', () => {
  assert.ok(!fs.existsSync(path.join(ROOT_DIR, 'supabase', 'functions', '_shared', 'brevo.ts')), 'brevo.ts still exists!');
  assert.ok(!fs.existsSync(path.join(ROOT_DIR, 'supabase', 'functions', 'send-license-email')), 'send-license-email still exists!');
  
  const envContent = fs.readFileSync(path.join(ROOT_DIR, '.env'), 'utf8');
  assert.ok(!envContent.includes('BREVO_API_KEY'), '.env still defines BREVO_API_KEY!');

  const adminHtml = fs.readFileSync(path.join(ROOT_DIR, 'admin.html'), 'utf8');
  assert.ok(!adminHtml.toLowerCase().includes('brevo'), 'admin.html still contains brevo reference!');
});

console.log(`\n========================================================================`);
console.log(`Summary: ${passed} / ${total} compliance tests passed.`);
console.log(`========================================================================\n`);

process.exit(passed === total ? 0 : 1);
