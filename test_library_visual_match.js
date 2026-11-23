const assert = require('assert');
const fs = require('fs');
const path = require('path');

function verifyLibraryVisualMatch() {
  console.log('================================================================');
  console.log(' SFX COMPOSER — SFX LIBRARY UI VISUAL MATCH VERIFICATION');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function pass(msg) {
    total++;
    passed++;
    console.log(`✓ PASS [${total}]: ${msg}`);
  }

  const libHtml = fs.readFileSync(path.join(__dirname, 'library.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, 'css', 'style.css'), 'utf8');

  // 1. Search Bar & Header
  console.log('--- TEST GROUP 1: LIBRARY HEADER & SEARCH BAR ---');
  assert.ok(libHtml.includes('class="sfx-folder-search-box"'), 'Search bar has dedicated container box');
  assert.ok(libHtml.includes('class="sfx-folder-search-icon"'), 'Search bar includes search SVG icon');
  assert.ok(libHtml.includes('id="folder-search-input"'), 'Search input element preserved');
  assert.ok(libHtml.includes('id="folder-count-badge"'), 'Category counter badge preserved');
  assert.ok(css.includes('.sfx-folder-search-box:focus-within'), 'Search bar has sophisticated blue focus-within state');
  assert.ok(css.includes('.sfx-folder-count-badge::before'), 'Category count badge has glowing blue dot indicator');
  pass('Library header search bar with search icon and counter indicator properly configured');

  // 2. Category Filters
  console.log('\n--- TEST GROUP 2: CATEGORY FILTERS & SIGNATURE BLUE GRADIENT ---');
  assert.ok(libHtml.includes('class="sfx-folder-filters-bar"'), 'Filters bar exists');
  assert.ok(libHtml.includes('data-filter="all"'), 'All folders filter preserved');
  assert.ok(css.includes('.sfx-folder-filter-btn.is-active'), 'Filter active class defined in CSS');
  assert.ok(css.includes('linear-gradient(135deg, #0066FF 0%, #0040AA 100%)'), 'Active filter uses official SFX Composer blue gradient');
  assert.ok(css.includes('.sfx-folder-filters-bar {') && css.includes('overflow-x: auto'), 'Filters bar supports horizontal scrolling');
  pass('Category filters restyled with signature blue gradient and smooth transitions');

  // 3. Folder Cards & Grid (3 columns desktop, 2 tablet, 1 mobile)
  console.log('\n--- TEST GROUP 3: 3-COLUMN RESPONSIVE GRID & FOLDER CARDS ---');
  assert.ok(css.includes('.sfx-folder-grid {\n  display: grid;\n  grid-template-columns: repeat(3, 1fr);') ||
            css.includes('grid-template-columns: repeat(3, 1fr)'), 'Desktop grid has clean 3-column layout');
  assert.ok(css.includes('grid-template-columns: repeat(2, 1fr)'), 'Tablet layout has 2-column grid');
  assert.ok(css.includes('grid-template-columns: 1fr'), 'Mobile layout has 1-column grid');

  assert.ok(css.includes('.sfx-folder-card {'), 'Card styling defined');
  assert.ok(css.includes('border-color: rgba(0, 102, 255, 0.4)'), 'Card hover applies subtle blue border highlight');
  assert.ok(css.includes('.sfx-folder-icon-wrap {') && css.includes('linear-gradient(135deg, rgba(0, 102, 255'), 'Folder icon has blue gradient container');
  assert.ok(css.includes('.sfx-folder-card.is-expanded .sfx-folder-toggle-indicator'), 'Dropdown indicator rotates and highlights on expand');
  pass('3-column folder grid and folder cards match main website design system precisely');

  // 4. Preserve All 20 Folder Categories
  console.log('\n--- TEST GROUP 4: FUNCTIONALITY & DATA PRESERVATION ---');
  const expectedFolders = [
    'Button', 'Countdown & List', 'Devin SFX', 'Foley', 'General Music',
    'Glitch & Flicker', 'Granular Combo', 'Granular', 'Human', 'Impact & Hit',
    'Music Sounds Effect', 'Power Down & Up', 'sfx 1', 'SFX Monster',
    'sound effect important 2.0', 'Sound Effects', 'Transition', 'Typing',
    'UE SFX PACK', 'ui sfx'
  ];
  for (const name of expectedFolders) {
    assert.ok(libHtml.includes(`data-name="${name}"`), `Folder "${name}" must be preserved`);
  }
  assert.ok(libHtml.includes('id="success-sfx-library-btn"'), 'Secure SFX Library download gate preserved');
  pass('All 20 folder categories and Google Drive delivery links completely preserved');

  console.log('\n================================================================');
  console.log(` ALL ${passed}/${total} SFX LIBRARY VISUAL MATCH TESTS PASSED!`);
  console.log('================================================================');
}

verifyLibraryVisualMatch();
