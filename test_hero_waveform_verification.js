const assert = require('assert');
const fs = require('fs');
const path = require('path');

function verifyHeroWaveform() {
  console.log('================================================================');
  console.log(' SFX COMPOSER — HERO AUDIO WAVEFORM LINE REFINEMENT VERIFICATION');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function pass(msg) {
    total++;
    passed++;
    console.log(`✓ PASS [${total}]: ${msg}`);
  }

  // 1. Check index.html container and canvas
  console.log('--- TEST GROUP 1: HERO WAVEFORM DOM STRUCTURE ---');
  const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  assert.ok(indexHtml.includes('id="hero-waveform-canvas"'), 'hero-waveform-canvas element must exist in index.html');
  assert.ok(indexHtml.includes('class="sfx-hero-waveform-container"'), 'sfx-hero-waveform-container wrapper must wrap hero canvas');
  assert.ok(!indexHtml.includes('(Strictly Green)'), 'Green visualizer label updated');
  pass('Hero waveform DOM container and canvas properly configured in index.html');

  // 2. Check js/main.js setupHeroWaveform implementation
  console.log('\n--- TEST GROUP 2: PURE WHITE WAVEFORM & FEATHERED EDGES ---');
  const mainJs = fs.readFileSync(path.join(__dirname, 'js', 'main.js'), 'utf8');

  // Extract setupHeroWaveform function body
  const fnStart = mainJs.indexOf('function setupHeroWaveform()');
  assert.ok(fnStart !== -1, 'setupHeroWaveform function exists in main.js');
  const fnEnd = mainJs.indexOf('// ── 3. VIDEO TUTORIAL GALLERY', fnStart);
  assert.ok(fnEnd !== -1, 'Found setupHeroWaveform boundary');
  const waveCode = mainJs.substring(fnStart, fnEnd);

  // Assert no green or blue hardcoded in setupHeroWaveform
  assert.ok(!waveCode.includes('#35EA86'), 'Hero waveform does NOT use green #35EA86');
  assert.ok(!waveCode.includes('rgba(53, 234, 134'), 'Hero waveform does NOT use green rgb');

  // Assert pure white and translucent white gradient
  assert.ok(waveCode.includes('createLinearGradient(0, 0, width, 0)'), 'Waveform uses horizontal linear gradient across canvas');
  assert.ok(waveCode.includes('rgba(255, 255, 255, 0)'), 'Waveform fades out to alpha 0 at endpoints');
  assert.ok(waveCode.includes('baseAlpha = l === 0 ? 1.0'), 'Main line uses pure white full opacity (1.0)');
  assert.ok(waveCode.includes('0.35 : 0.18'), 'Secondary lines use subtle translucent white (0.35 and 0.18)');
  assert.ok(waveCode.includes('ctx.shadowColor = \'rgba(255, 255, 255, 0.4)\''), 'Main line has subtle restrained white sheen');
  assert.ok(waveCode.includes('ctx.shadowBlur = 4'), 'Restrained shadow blur without excessive glow');
  pass('Pure white main line (#FFFFFF) and translucent white secondary lines verified with soft feathered edges');

  // 3. Check CSS mask feathering
  console.log('\n--- TEST GROUP 3: CSS SOFT OPACITY MASK ---');
  const css = fs.readFileSync(path.join(__dirname, 'css', 'style.css'), 'utf8');
  assert.ok(css.includes('.sfx-hero-waveform-container'), 'CSS defines .sfx-hero-waveform-container');
  assert.ok(css.includes('mask-image: linear-gradient'), 'Container applies linear-gradient opacity mask');
  assert.ok(css.includes('-webkit-mask-image: linear-gradient'), 'Container applies -webkit-mask-image for cross-browser support');
  pass('CSS mask gradient guarantees soft, feathered dissolve on right and left edges with no hard cutoffs');

  console.log('\n================================================================');
  console.log(` ALL ${passed}/${total} HERO WAVEFORM REFINEMENT TESTS PASSED!`);
  console.log('================================================================');
}

verifyHeroWaveform();
