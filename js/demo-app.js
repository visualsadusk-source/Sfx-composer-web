/**
 * SFX Composer — Interactive Plugin Demo Controller
 * Manages Tab navigation, SFX Library, Essential Sound Studio,
 * Audio Tools Waveform & Trim/WAV Export, Browser Search Hub,
 * Scripted AI Assistant Chat, and the Multi-track Mini Timeline.
 */

(function () {
  'use strict';

  var currentTab = 'library';
  var catalog = window.SFX_AUDIO_CATALOG || [];
  var engine = window.SFX_AUDIO_ENGINE;

  // Selected sample for Audio Tools and Essential Sound
  var activeSample = catalog[0] || null;

  // Essential Sound state
  var esState = {
    category: 'sfx',
    gainDb: 0,
    fadeIn: 0.05,
    fadeOut: 0.1,
    highpass: 30,
    lowpass: 18000,
    bass: 2,
    eq: 1.5,
    isPlaying: false
  };

  // Audio Tools state
  var atState = {
    trimStart: 0,
    trimEnd: activeSample ? activeSample.duration : 1.4,
    fadeIn: 0.05,
    fadeOut: 0.1,
    gainDb: 0,
    normalize: false,
    zoom: 1,
    isPlaying: false
  };

  // Default Timeline clips (Pre-assembled cinematic demo)
  var defaultClips = [
    {
      id: 'clip_amb_1',
      soundId: 'atmosphere',
      name: 'Ambient Atmosphere',
      track: 2,
      startTime: 0.0,
      duration: 5.0,
      gain: 0.85,
      fadeIn: 0.4,
      fadeOut: 0.6,
      color: '#35EA86'
    },
    {
      id: 'clip_whoosh_1',
      soundId: 'whoosh',
      name: 'Cinematic Whoosh',
      track: 0,
      startTime: 1.4,
      duration: 1.4,
      gain: 1.1,
      fadeIn: 0.02,
      fadeOut: 0.05,
      color: '#10B981'
    },
    {
      id: 'clip_impact_1',
      soundId: 'impact',
      name: 'Deep Impact',
      track: 0,
      startTime: 2.8,
      duration: 2.2,
      gain: 1.25,
      fadeIn: 0.01,
      fadeOut: 0.1,
      color: '#22c55e'
    },
    {
      id: 'clip_trans_1',
      soundId: 'transition',
      name: 'Soft Transition',
      track: 1,
      startTime: 4.6,
      duration: 1.1,
      gain: 0.95,
      fadeIn: 0.05,
      fadeOut: 0.05,
      color: '#4ade80'
    },
    {
      id: 'clip_click_1',
      soundId: 'click',
      name: 'UI Snap',
      track: 1,
      startTime: 5.8,
      duration: 0.15,
      gain: 1.0,
      fadeIn: 0.005,
      fadeOut: 0.02,
      color: '#86efac'
    }
  ];

  var timelineClips = JSON.parse(JSON.stringify(defaultClips));
  var selectedClipId = null;

  // Initialize Demo Application
  function initDemoApp() {
    setupTabSwitching();
    renderLibrary();
    setupLibraryFilters();
    setupEssentialSound();
    setupAudioTools();
    setupBrowserHub();
    setupAiChat();
    setupTimeline();

    // Preload catalog audio buffers in background
    if (engine && catalog.length) {
      engine.preloadCatalog(catalog);
    }
  }

  // ── TAB SWITCHING ──
  function setupTabSwitching() {
    var tabBtns = document.querySelectorAll('.sfx-tab-btn');
    tabBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = this.getAttribute('data-tab');
        switchTab(target);
      });
    });
  }

  function switchTab(tabId) {
    currentTab = tabId;
    var tabBtns = document.querySelectorAll('.sfx-tab-btn');
    var tabPanes = document.querySelectorAll('.sfx-demo-pane');

    tabBtns.forEach(function (b) {
      if (b.getAttribute('data-tab') === tabId) {
        b.classList.add('is-active');
      } else {
        b.classList.remove('is-active');
      }
    });

    tabPanes.forEach(function (pane) {
      if (pane.id === 'sfx-pane-' + tabId) {
        pane.classList.add('is-active');
      } else {
        pane.classList.remove('is-active');
      }
    });

    // Refresh sub-views
    if (tabId === 'audio-tools') {
      renderWaveformEditor();
    } else if (tabId === 'essential-sound') {
      updateEsSampleDisplay();
    }
  }

  // ── 1. SFX LIBRARY TAB ──
  function renderLibrary(filteredCatalog) {
    var list = filteredCatalog || catalog;
    var container = document.getElementById('sfx-lib-cards');
    if (!container) return;

    container.innerHTML = '';
    if (list.length === 0) {
      container.innerHTML = '<div class="sfx-empty-msg">No sounds match your filter. Try another keyword.</div>';
      return;
    }

    list.forEach(function (item) {
      var card = document.createElement('div');
      card.className = 'sfx-sound-card';
      card.setAttribute('data-id', item.id);

      var isPlaying = engine.isPlayingSample(item.id);

      card.innerHTML =
        '<div class="sfx-sound-card-top">' +
          '<div class="sfx-sound-info">' +
            '<span class="sfx-sound-cat-tag">' + item.cat + '</span>' +
            '<h4 class="sfx-sound-title">' + item.name + '</h4>' +
          '</div>' +
          '<div class="sfx-sound-meta">' +
            '<span class="sfx-sound-dur">' + item.duration.toFixed(1) + 's</span>' +
            '<span class="sfx-sound-size">' + item.sizeKb + ' KB</span>' +
          '</div>' +
        '</div>' +

        '<div class="sfx-sound-wave-wrap">' +
          '<canvas class="sfx-mini-wave" width="240" height="34" data-id="' + item.id + '"></canvas>' +
          '<div class="sfx-mini-progress" id="prog-' + item.id + '"></div>' +
        '</div>' +

        '<div class="sfx-sound-card-bottom">' +
          '<button class="sfx-play-btn ' + (isPlaying ? 'is-playing' : '') + '" data-id="' + item.id + '" title="Audition Sound">' +
            '<svg class="sfx-play-icon" viewBox="0 0 24 24" width="14" height="14" fill="currentColor">' +
              (isPlaying ? '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>' : '<polygon points="7 4 20 12 7 20 7 4"/>') +
            '</svg>' +
            '<span>' + (isPlaying ? 'Pause' : 'Play') + '</span>' +
          '</button>' +

          '<div class="sfx-sound-actions">' +
            '<button class="sfx-action-btn sfx-btn-timeline" data-id="' + item.id + '" title="Add to Mini Timeline">' +
              '<svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" fill="none" stroke-width="2">' +
                '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>' +
              '</svg>' +
              'Timeline' +
            '</button>' +
            '<button class="sfx-action-btn sfx-btn-tool" data-id="' + item.id + '" title="Open in Audio Tools">' +
              'Audio Tools' +
            '</button>' +
            '<button class="sfx-action-btn sfx-btn-es" data-id="' + item.id + '" title="Test in Essential Sound">' +
              'Studio' +
            '</button>' +
          '</div>' +
        '</div>';

      container.appendChild(card);

      // Draw static waveform preview for card
      drawMiniWaveform(card.querySelector('.sfx-mini-wave'), item);
    });

    // Attach card event listeners
    attachLibraryEvents(container);
  }

  function drawMiniWaveform(canvas, item) {
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var w = canvas.width;
    var h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Subtle background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.fillRect(0, 0, w, h);

    // If buffer loaded, draw real samples, else draw synthetic audio profile
    var buf = engine.bufferCache[item.id];
    var bars = 48;
    var barW = (w / bars) - 1.5;

    ctx.fillStyle = '#35EA86';

    if (buf) {
      var data = buf.getChannelData(0);
      var step = Math.floor(data.length / bars);
      for (var i = 0; i < bars; i++) {
        var max = 0;
        for (var j = 0; j < step; j++) {
          var val = Math.abs(data[i * step + j] || 0);
          if (val > max) max = val;
        }
        var barH = Math.max(2, max * (h - 4));
        var y = (h - barH) / 2;
        ctx.fillRect(i * (barW + 1.5), y, barW, barH);
      }
    } else {
      // Procedural waveform profile
      for (var k = 0; k < bars; k++) {
        var progress = k / bars;
        var env = Math.sin(progress * Math.PI);
        if (item.id === 'impact') env = Math.exp(-progress * 3.5);
        if (item.id === 'riser') env = Math.pow(progress, 1.8);
        var rand = 0.3 + 0.7 * Math.sin(k * 0.9);
        var bh = Math.max(3, env * rand * (h - 6));
        var by = (h - bh) / 2;
        ctx.fillRect(k * (barW + 1.5), by, barW, bh);
      }
    }
  }

  function attachLibraryEvents(container) {
    // Play button handler
    container.querySelectorAll('.sfx-play-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var id = this.getAttribute('data-id');
        var item = catalog.find(function (c) { return c.id === id; });
        if (!item) return;

        var progBar = document.getElementById('prog-' + id);

        if (engine.isPlayingSample(id)) {
          engine.stopSample();
          updatePlayButtons();
          if (progBar) progBar.style.width = '0%';
        } else {
          engine.playSample(item, function (elapsed, dur) {
            if (progBar) {
              var pct = (elapsed / dur) * 100;
              progBar.style.width = pct + '%';
            }
          }, function () {
            updatePlayButtons();
            if (progBar) progBar.style.width = '0%';
          });
          updatePlayButtons(id);
        }
      });
    });

    // Add to timeline button
    container.querySelectorAll('.sfx-btn-timeline').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var id = this.getAttribute('data-id');
        addSoundToTimeline(id);
      });
    });

    // Open in Audio Tools
    container.querySelectorAll('.sfx-btn-tool').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var id = this.getAttribute('data-id');
        var item = catalog.find(function (c) { return c.id === id; });
        if (item) {
          activeSample = item;
          atState.trimStart = 0;
          atState.trimEnd = item.duration;
          switchTab('audio-tools');
          loadAudioToolsSample(item);
        }
      });
    });

    // Open in Essential Sound
    container.querySelectorAll('.sfx-btn-es').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var id = this.getAttribute('data-id');
        var item = catalog.find(function (c) { return c.id === id; });
        if (item) {
          activeSample = item;
          switchTab('essential-sound');
          updateEsSampleDisplay();
        }
      });
    });
  }

  function updatePlayButtons(playingId) {
    document.querySelectorAll('.sfx-play-btn').forEach(function (b) {
      var id = b.getAttribute('data-id');
      var label = b.querySelector('span');
      var icon = b.querySelector('.sfx-play-icon');
      if (playingId && id === playingId) {
        b.classList.add('is-playing');
        if (label) label.textContent = 'Pause';
        if (icon) icon.innerHTML = '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>';
      } else {
        b.classList.remove('is-playing');
        if (label) label.textContent = 'Play';
        if (icon) icon.innerHTML = '<polygon points="7 4 20 12 7 20 7 4"/>';
      }
    });
  }

  function setupLibraryFilters() {
    var searchInput = document.getElementById('sfx-lib-search');
    var catChips = document.querySelectorAll('.sfx-cat-chip');

    var currentCat = 'all';

    function applyFilter() {
      var query = searchInput ? searchInput.value.toLowerCase().trim() : '';
      var filtered = catalog.filter(function (item) {
        var matchCat = (currentCat === 'all') || (item.cat.toLowerCase() === currentCat.toLowerCase()) || (item.tags.some(function (t) { return t.toLowerCase() === currentCat.toLowerCase(); }));
        var matchSearch = !query || item.name.toLowerCase().includes(query) || item.cat.toLowerCase().includes(query) || item.tags.some(function (t) { return t.toLowerCase().includes(query); });
        return matchCat && matchSearch;
      });
      renderLibrary(filtered);
    }

    if (searchInput) {
      searchInput.addEventListener('input', applyFilter);
    }

    catChips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        catChips.forEach(function (c) { return c.classList.remove('is-active'); });
        chip.classList.add('is-active');
        currentCat = chip.getAttribute('data-cat') || 'all';
        applyFilter();
      });
    });
  }

  // ── 2. ESSENTIAL SOUND DEMO ──
  function setupEssentialSound() {
    var catBtns = document.querySelectorAll('.sfx-es-cat-btn');
    var sliders = {
      gain: document.getElementById('es-gain'),
      fadeIn: document.getElementById('es-fade-in'),
      fadeOut: document.getElementById('es-fade-out'),
      eq: document.getElementById('es-eq'),
      bass: document.getElementById('es-bass'),
      hp: document.getElementById('es-hp'),
      lp: document.getElementById('es-lp')
    };

    var valLabels = {
      gain: document.getElementById('es-gain-val'),
      fadeIn: document.getElementById('es-fade-in-val'),
      fadeOut: document.getElementById('es-fade-out-val'),
      eq: document.getElementById('es-eq-val'),
      bass: document.getElementById('es-bass-val'),
      hp: document.getElementById('es-hp-val'),
      lp: document.getElementById('es-lp-val')
    };

    var playBtn = document.getElementById('es-play-btn');
    var normBtn = document.getElementById('es-norm-btn');
    var sampleSelect = document.getElementById('es-sample-select');

    // Populate sample select
    if (sampleSelect) {
      sampleSelect.innerHTML = '';
      catalog.forEach(function (c) {
        var opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name + ' (' + c.cat + ')';
        sampleSelect.appendChild(opt);
      });
      sampleSelect.addEventListener('change', function () {
        var found = catalog.find(function (c) { return c.id === sampleSelect.value; });
        if (found) {
          activeSample = found;
          updateEsSampleDisplay();
        }
      });
    }

    // Category presets
    var presets = {
      sfx: { hp: 30, lp: 18000, bass: 3, eq: 1.5, gain: 1, fadeIn: 0.02, fadeOut: 0.1 },
      music: { hp: 20, lp: 20000, bass: 1, eq: 0, gain: -2, fadeIn: 0.2, fadeOut: 0.4 },
      dialogue: { hp: 120, lp: 12000, bass: -2, eq: 3, gain: 2, fadeIn: 0.01, fadeOut: 0.05 },
      ambience: { hp: 60, lp: 8500, bass: -1, eq: -2, gain: -4, fadeIn: 0.5, fadeOut: 0.8 }
    };

    catBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        catBtns.forEach(function (b) { return b.classList.remove('is-active'); });
        btn.classList.add('is-active');
        var cat = btn.getAttribute('data-cat');
        esState.category = cat;

        var p = presets[cat];
        if (p) {
          if (sliders.hp) sliders.hp.value = p.hp;
          if (sliders.lp) sliders.lp.value = p.lp;
          if (sliders.bass) sliders.bass.value = p.bass;
          if (sliders.eq) sliders.eq.value = p.eq;
          if (sliders.gain) sliders.gain.value = p.gain;
          if (sliders.fadeIn) sliders.fadeIn.value = p.fadeIn;
          if (sliders.fadeOut) sliders.fadeOut.value = p.fadeOut;
          syncEsValues();
        }
      });
    });

    function syncEsValues() {
      if (sliders.gain) esState.gainDb = parseFloat(sliders.gain.value);
      if (sliders.fadeIn) esState.fadeIn = parseFloat(sliders.fadeIn.value);
      if (sliders.fadeOut) esState.fadeOut = parseFloat(sliders.fadeOut.value);
      if (sliders.eq) esState.eq = parseFloat(sliders.eq.value);
      if (sliders.bass) esState.bass = parseFloat(sliders.bass.value);
      if (sliders.hp) esState.highpass = parseFloat(sliders.hp.value);
      if (sliders.lp) esState.lowpass = parseFloat(sliders.lp.value);

      if (valLabels.gain) valLabels.gain.textContent = (esState.gainDb > 0 ? '+' : '') + esState.gainDb.toFixed(1) + ' dB';
      if (valLabels.fadeIn) valLabels.fadeIn.textContent = esState.fadeIn.toFixed(2) + ' s';
      if (valLabels.fadeOut) valLabels.fadeOut.textContent = esState.fadeOut.toFixed(2) + ' s';
      if (valLabels.eq) valLabels.eq.textContent = (esState.eq > 0 ? '+' : '') + esState.eq.toFixed(1) + ' dB';
      if (valLabels.bass) valLabels.bass.textContent = (esState.bass > 0 ? '+' : '') + esState.bass.toFixed(1) + ' dB';
      if (valLabels.hp) valLabels.hp.textContent = Math.round(esState.highpass) + ' Hz';
      if (valLabels.lp) valLabels.lp.textContent = (esState.lowpass >= 1000 ? (esState.lowpass / 1000).toFixed(1) + ' kHz' : Math.round(esState.lowpass) + ' Hz');

      // If already playing in essential sound, push live updates to the Web Audio DSP nodes!
      if (engine.essentialChain) {
        engine.essentialChain.updateParams({
          highpass: esState.highpass,
          lowpass: esState.lowpass,
          bass: esState.bass,
          eq: esState.eq,
          gainDb: esState.gainDb
        });
      }
    }

    Object.keys(sliders).forEach(function (key) {
      if (sliders[key]) {
        sliders[key].addEventListener('input', syncEsValues);
      }
    });

    syncEsValues();

    // Normalize Action (calculates peak and lifts/lowers to -1.0 dBFS)
    if (normBtn) {
      normBtn.addEventListener('click', function () {
        if (!activeSample) return;
        engine.loadSound(activeSample).then(function (buf) {
          var peak = engine.measurePeak(buf);
          if (peak > 1e-4) {
            var targetGain = engine.dbToGain(-1); // -1 dBFS
            var neededGain = targetGain / peak;
            var neededDb = engine.gainToDb(neededGain);
            neededDb = Math.max(-24, Math.min(12, neededDb));
            if (sliders.gain) {
              sliders.gain.value = neededDb;
              syncEsValues();
            }
            showToast('Normalized ' + activeSample.name + ' to -1.0 dBFS (' + (neededDb > 0 ? '+' : '') + neededDb.toFixed(1) + ' dB)');
          }
        });
      });
    }

    // Play preview with live DSP
    if (playBtn) {
      playBtn.addEventListener('click', function () {
        if (esState.isPlaying) {
          engine.stopEssentialSound();
          esState.isPlaying = false;
          playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="7 4 20 12 7 20 7 4"/></svg> Play Studio Preview';
        } else {
          if (!activeSample) activeSample = catalog[0];
          esState.isPlaying = true;
          playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg> Stop Preview';

          engine.playWithEssentialSound(activeSample, esState, function () {
            esState.isPlaying = false;
            playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="7 4 20 12 7 20 7 4"/></svg> Play Studio Preview';
          });
        }
      });
    }
  }

  function updateEsSampleDisplay() {
    var display = document.getElementById('es-sample-name');
    var select = document.getElementById('es-sample-select');
    if (activeSample) {
      if (display) display.textContent = activeSample.name + ' (' + activeSample.duration.toFixed(1) + 's)';
      if (select && select.value !== activeSample.id) select.value = activeSample.id;
    }
  }

  // ── 3. AUDIO TOOLS DEMO ──
  function setupAudioTools() {
    var sampleSelect = document.getElementById('at-sample-select');
    var trimStartSlider = document.getElementById('at-trim-start') || document.getElementById('at-trim-start-range');
    var trimEndSlider = document.getElementById('at-trim-end') || document.getElementById('at-trim-end-range');
    var fadeInSlider = document.getElementById('at-fade-in');
    var fadeOutSlider = document.getElementById('at-fade-out');
    var gainSlider = document.getElementById('at-gain') || document.getElementById('at-ctrl-gain');
    var normBtn = document.getElementById('at-norm-btn') || document.getElementById('at-ctrl-norm-btn');
    var playTrimBtn = document.getElementById('at-play-btn') || document.getElementById('at-transport-play');
    var resetBtn = document.getElementById('at-reset-btn');
    var exportBtn = document.getElementById('at-export-btn') || document.getElementById('at-export-wav-btn');

    // Populate Sample Selector
    if (sampleSelect) {
      sampleSelect.innerHTML = '';
      catalog.forEach(function (c) {
        var opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name + ' (' + c.duration.toFixed(1) + 's)';
        sampleSelect.appendChild(opt);
      });
      sampleSelect.addEventListener('change', function () {
        var found = catalog.find(function (c) { return c.id === sampleSelect.value; });
        if (found) {
          activeSample = found;
          loadAudioToolsSample(found);
        }
      });
    }

    if (activeSample) {
      loadAudioToolsSample(activeSample);
    }

    // Sliders
    function syncAtSliders() {
      if (trimStartSlider) atState.trimStart = parseFloat(trimStartSlider.value);
      if (trimEndSlider) atState.trimEnd = parseFloat(trimEndSlider.value);
      if (fadeInSlider) atState.fadeIn = parseFloat(fadeInSlider.value);
      if (fadeOutSlider) atState.fadeOut = parseFloat(fadeOutSlider.value);
      if (gainSlider) atState.gainDb = parseFloat(gainSlider.value);

      var lblStart = document.getElementById('at-trim-start-val');
      var lblEnd = document.getElementById('at-trim-end-val');
      var lblFadeIn = document.getElementById('at-fade-in-val');
      var lblFadeOut = document.getElementById('at-fade-out-val');
      var lblGain = document.getElementById('at-gain-val');

      if (lblStart) lblStart.textContent = atState.trimStart.toFixed(2) + ' s';
      if (lblEnd) lblEnd.textContent = atState.trimEnd.toFixed(2) + ' s';
      if (lblFadeIn) lblFadeIn.textContent = atState.fadeIn.toFixed(2) + ' s';
      if (lblFadeOut) lblFadeOut.textContent = atState.fadeOut.toFixed(2) + ' s';
      if (lblGain) lblGain.textContent = (atState.gainDb > 0 ? '+' : '') + atState.gainDb.toFixed(1) + ' dB';

      renderWaveformEditor();
    }

    [trimStartSlider, trimEndSlider, fadeInSlider, fadeOutSlider, gainSlider].forEach(function (sl) {
      if (sl) sl.addEventListener('input', syncAtSliders);
    });

    // Normalize
    if (normBtn) {
      normBtn.addEventListener('click', function () {
        if (!activeSample) return;
        engine.loadSound(activeSample).then(function (buf) {
          var peak = engine.measurePeak(buf, atState.trimStart, atState.trimEnd);
          if (peak > 1e-4) {
            var targetGain = engine.dbToGain(-1); // -1.0 dBFS
            var neededGain = targetGain / peak;
            var neededDb = engine.gainToDb(neededGain);
            neededDb = Math.max(-24, Math.min(12, neededDb));
            if (gainSlider) {
              gainSlider.value = neededDb;
              syncAtSliders();
            }
            showToast('Peak normalized to -1 dBFS (' + (neededDb > 0 ? '+' : '') + neededDb.toFixed(1) + ' dB)');
          }
        });
      });
    }

    // Reset Trims
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        if (!activeSample) return;
        atState.trimStart = 0;
        atState.trimEnd = activeSample.duration;
        atState.fadeIn = 0.02;
        atState.fadeOut = 0.05;
        atState.gainDb = 0;
        if (trimStartSlider) trimStartSlider.value = 0;
        if (trimEndSlider) trimEndSlider.value = activeSample.duration;
        if (fadeInSlider) fadeInSlider.value = 0.02;
        if (fadeOutSlider) fadeOutSlider.value = 0.05;
        if (gainSlider) gainSlider.value = 0;
        syncAtSliders();
      });
    }

    // Play Trimmed Preview
    if (playTrimBtn) {
      playTrimBtn.addEventListener('click', function () {
        if (atState.isPlaying) {
          engine.stopSample();
          atState.isPlaying = false;
          playTrimBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="7 4 20 12 7 20 7 4"/></svg> Play Selection';
        } else {
          if (!activeSample) activeSample = catalog[0];
          atState.isPlaying = true;
          playTrimBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg> Stop';

          engine.loadSound(activeSample).then(function (buf) {
            var ctx = engine.getAudioContext();
            var src = ctx.createBufferSource();
            src.buffer = buf;

            var gain = ctx.createGain();
            var targetGain = engine.dbToGain(atState.gainDb);
            var now = ctx.currentTime;
            var dur = atState.trimEnd - atState.trimStart;

            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.exponentialRampToValueAtTime(Math.max(0.001, targetGain), now + Math.min(dur * 0.4, atState.fadeIn));

            if (dur > atState.fadeOut) {
              gain.gain.setValueAtTime(Math.max(0.001, targetGain), now + dur - atState.fadeOut);
              gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
            }

            src.connect(gain);
            gain.connect(ctx.destination);

            src.start(0, atState.trimStart, dur);

            // Animate playhead on waveform canvas
            var startT = performance.now();
            var animId = null;
            function updatePlayhead() {
              var elapsed = (performance.now() - startT) / 1000;
              if (elapsed >= dur) {
                renderWaveformEditor();
                return;
              }
              renderWaveformEditor(atState.trimStart + elapsed);
              animId = requestAnimationFrame(updatePlayhead);
            }
            animId = requestAnimationFrame(updatePlayhead);

            src.onended = function () {
              cancelAnimationFrame(animId);
              atState.isPlaying = false;
              playTrimBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="7 4 20 12 7 20 7 4"/></svg> Play Selection';
              renderWaveformEditor();
            };

            engine.currentSoloPlayer = {
              stop: function () {
                cancelAnimationFrame(animId);
                try { src.stop(); } catch (e) {}
                atState.isPlaying = false;
                playTrimBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="7 4 20 12 7 20 7 4"/></svg> Play Selection';
                renderWaveformEditor();
              }
            };
          });
        }
      });
    }

    // ── CLIENT-SIDE WAV EXPORT ──
    if (exportBtn) {
      exportBtn.addEventListener('click', function () {
        if (!activeSample) return;
        showToast('Processing audio buffer for export…');

        engine.loadSound(activeSample).then(function (buf) {
          return engine.renderProcessedSample(buf, {
            trimStart: atState.trimStart,
            trimEnd: atState.trimEnd,
            fadeIn: atState.fadeIn,
            fadeOut: atState.fadeOut,
            gainDb: atState.gainDb,
            normalize: atState.normalize
          });
        }).then(function (renderedBuffer) {
          var wavBlob = engine.audioBufferToWav(renderedBuffer);
          var downloadUrl = URL.createObjectURL(wavBlob);
          var a = document.createElement('a');
          a.style.display = 'none';
          a.href = downloadUrl;
          a.download = 'SFX-Composer_' + activeSample.id + '_processed.wav';
          document.body.appendChild(a);
          a.click();
          setTimeout(function () {
            document.body.removeChild(a);
            URL.revokeObjectURL(downloadUrl);
          }, 1000);
          showToast('Downloaded ' + a.download + ' (' + (wavBlob.size / 1024).toFixed(1) + ' KB)!');
        }).catch(function (err) {
          console.error(err);
          showToast('Export failed: ' + err.message);
        });
      });
    }
  }

  function loadAudioToolsSample(sample) {
    var select = document.getElementById('at-sample-select');
    if (select && select.value !== sample.id) {
      select.value = sample.id;
    }
    var trimStartSlider = document.getElementById('at-trim-start');
    var trimEndSlider = document.getElementById('at-trim-end');
    if (trimStartSlider && trimEndSlider) {
      trimStartSlider.max = sample.duration;
      trimEndSlider.max = sample.duration;
      trimStartSlider.value = 0;
      trimEndSlider.value = sample.duration;
      atState.trimStart = 0;
      atState.trimEnd = sample.duration;
      var lblStart = document.getElementById('at-trim-start-val');
      var lblEnd = document.getElementById('at-trim-end-val');
      if (lblStart) lblStart.textContent = '0.00 s';
      if (lblEnd) lblEnd.textContent = sample.duration.toFixed(2) + ' s';
    }
    renderWaveformEditor();
  }

  function renderWaveformEditor(currentPlayheadSec) {
    var canvas = document.getElementById('at-waveform-canvas');
    if (!canvas || !activeSample) return;

    var ctx = canvas.getContext('2d');
    var w = canvas.width;
    var h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    var dur = activeSample.duration;
    var tStart = atState.trimStart;
    var tEnd = atState.trimEnd;
    var xStart = (tStart / dur) * w;
    var xEnd = (tEnd / dur) * w;

    // Background
    ctx.fillStyle = '#0c0f0d';
    ctx.fillRect(0, 0, w, h);

    // Grid lines (seconds)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (var s = 0.5; s < dur; s += 0.5) {
      var gx = (s / dur) * w;
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, h);
      ctx.stroke();
    }

    // Inactive outside regions (dimmed)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    if (xStart > 0) ctx.fillRect(0, 0, xStart, h);
    if (xEnd < w) ctx.fillRect(xEnd, 0, w - xEnd, h);

    // Active selection background
    ctx.fillStyle = 'rgba(53, 234, 134, 0.06)';
    ctx.fillRect(xStart, 0, xEnd - xStart, h);

    // Render Waveform
    var buf = engine.bufferCache[activeSample.id];
    var bars = 120;
    var barW = (w / bars) - 1;

    if (buf) {
      var data = buf.getChannelData(0);
      var step = Math.floor(data.length / bars);
      for (var i = 0; i < bars; i++) {
        var bx = i * (barW + 1);
        var inTrim = (bx >= xStart - 2 && bx <= xEnd + 2);

        var max = 0;
        for (var j = 0; j < step; j++) {
          var val = Math.abs(data[i * step + j] || 0);
          if (val > max) max = val;
        }

        var barH = Math.max(3, max * (h - 16));
        var by = (h - barH) / 2;

        ctx.fillStyle = inTrim ? '#35EA86' : 'rgba(255, 255, 255, 0.18)';
        ctx.fillRect(bx, by, barW, barH);
      }
    }

    // Fade In visual curve overlay
    if (atState.fadeIn > 0) {
      var xFadeIn = xStart + (atState.fadeIn / dur) * w;
      ctx.fillStyle = 'rgba(53, 234, 134, 0.15)';
      ctx.beginPath();
      ctx.moveTo(xStart, h);
      ctx.lineTo(xStart, (h / 2));
      ctx.lineTo(xFadeIn, 8);
      ctx.lineTo(xFadeIn, h);
      ctx.closePath();
      ctx.fill();
    }

    // Fade Out visual curve overlay
    if (atState.fadeOut > 0) {
      var xFadeOut = xEnd - (atState.fadeOut / dur) * w;
      ctx.fillStyle = 'rgba(53, 234, 134, 0.15)';
      ctx.beginPath();
      ctx.moveTo(xFadeOut, h);
      ctx.lineTo(xFadeOut, 8);
      ctx.lineTo(xEnd, (h / 2));
      ctx.lineTo(xEnd, h);
      ctx.closePath();
      ctx.fill();
    }

    // Trim Boundary Markers
    ctx.strokeStyle = '#35EA86';
    ctx.lineWidth = 2;
    // Left marker
    ctx.beginPath();
    ctx.moveTo(xStart, 0);
    ctx.lineTo(xStart, h);
    ctx.stroke();

    // Right marker
    ctx.beginPath();
    ctx.moveTo(xEnd, 0);
    ctx.lineTo(xEnd, h);
    ctx.stroke();

    // Playhead line
    if (currentPlayheadSec !== undefined) {
      var phX = (currentPlayheadSec / dur) * w;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#35EA86';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(phX, 0);
      ctx.lineTo(phX, h);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  // ── 4. BROWSER SEARCH HUB DEMO ──
  function setupBrowserHub() {
    var searchInput = document.getElementById('browser-search-input');
    var resultsContainer = document.getElementById('browser-results-grid');
    var catTabs = document.querySelectorAll('.browser-cat-tab');

    var mockLibrary = [
      { id: 'b_whoosh1', title: 'Cinematic Sub Whoosh', cat: 'Sound Effects', duration: '1.4s', tags: ['Trailer', 'Fast'], mappedSound: 'whoosh' },
      { id: 'b_impact1', title: 'Trailer Sub Boom 808', cat: 'Sound Effects', duration: '2.2s', tags: ['Deep', 'Low End'], mappedSound: 'impact' },
      { id: 'b_trans1', title: 'Organic Shimmer Sweep', cat: 'Sound Effects', duration: '1.1s', tags: ['Modern', 'Warm'], mappedSound: 'transition' },
      { id: 'b_riser1', title: 'Cyberpunk Tension Riser', cat: 'Sound Effects', duration: '3.0s', tags: ['Tension', 'Climax'], mappedSound: 'riser' },
      { id: 'b_click1', title: 'Haptic Device Click', cat: 'Foley', duration: '0.15s', tags: ['Clean', 'Minimal'], mappedSound: 'click' },
      { id: 'b_drone1', title: 'Deep Space Drone Pad', cat: 'Ambient', duration: '5.0s', tags: ['Evolving', 'Dark'], mappedSound: 'atmosphere' },
      { id: 'b_cin1', title: 'Sci-Fi Air Lock Release', cat: 'Cinematic', duration: '1.8s', tags: ['Pneumatic', 'Futuristic'], mappedSound: 'whoosh' },
      { id: 'b_cin2', title: 'Earthquake Bass Tremor', cat: 'Cinematic', duration: '2.5s', tags: ['Subsonic', 'Heavy'], mappedSound: 'impact' },
      { id: 'b_mus1', title: 'Midnight Chill Beat Loop', cat: 'Music', duration: '4.0s', tags: ['120 BPM', 'Bed'], mappedSound: 'atmosphere' }
    ];

    var currentCat = 'All';

    function renderBrowserResults() {
      if (!resultsContainer) return;
      var q = searchInput ? searchInput.value.toLowerCase().trim() : '';

      var filtered = mockLibrary.filter(function (item) {
        var matchCat = (currentCat === 'All') || (item.cat.toLowerCase() === currentCat.toLowerCase());
        var matchSearch = !q || item.title.toLowerCase().includes(q) || item.cat.toLowerCase().includes(q) || item.tags.some(function (t) { return t.toLowerCase().includes(q); });
        return matchCat && matchSearch;
      });

      resultsContainer.innerHTML = '';
      if (filtered.length === 0) {
        resultsContainer.innerHTML = '<div class="sfx-empty-msg">No assets found matching "' + q + '". Try searching "whoosh", "impact", or "drone".</div>';
        return;
      }

      filtered.forEach(function (item) {
        var card = document.createElement('div');
        card.className = 'browser-item-card';
        card.innerHTML =
          '<div class="browser-item-header">' +
            '<span class="browser-badge">' + item.cat + '</span>' +
            '<span class="browser-dur">' + item.duration + '</span>' +
          '</div>' +
          '<h4 class="browser-item-title">' + item.title + '</h4>' +
          '<div class="browser-item-tags">' +
            item.tags.map(function (t) { return '<span class="b-tag">#' + t + '</span>'; }).join('') +
          '</div>' +
          '<div class="browser-item-actions">' +
            '<button class="b-audition-btn" data-sound="' + item.mappedSound + '">' +
              '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><polygon points="7 4 20 12 7 20 7 4"/></svg> Audition' +
            '</button>' +
            '<button class="b-add-btn" data-sound="' + item.mappedSound + '">' +
              '+ Add to Timeline' +
            '</button>' +
          '</div>';

        resultsContainer.appendChild(card);
      });

      // Attach events
      resultsContainer.querySelectorAll('.b-audition-btn').forEach(function (b) {
        b.addEventListener('click', function () {
          var sId = this.getAttribute('data-sound');
          var sound = catalog.find(function (c) { return c.id === sId; });
          if (sound) engine.playSample(sound);
        });
      });

      resultsContainer.querySelectorAll('.b-add-btn').forEach(function (b) {
        b.addEventListener('click', function () {
          var sId = this.getAttribute('data-sound');
          addSoundToTimeline(sId);
        });
      });
    }

    if (searchInput) {
      searchInput.addEventListener('input', renderBrowserResults);
    }

    catTabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        catTabs.forEach(function (t) { return t.classList.remove('is-active'); });
        tab.classList.add('is-active');
        currentCat = tab.getAttribute('data-cat') || 'All';
        renderBrowserResults();
      });
    });

    renderBrowserResults();
  }

  // ── 5. AI CHAT ASSISTANT DEMO ──
  function setupAiChat() {
    var chatMessages = document.getElementById('ai-chat-messages');
    var chatInput = document.getElementById('ai-chat-input');
    var sendBtn = document.getElementById('ai-send-btn');
    var promptChips = document.querySelectorAll('.ai-prompt-chip');

    var knowledgeBase = [
      {
        patterns: ['whoosh', 'impact', 'cinematic whoosh', 'deep impact'],
        reply: 'Try a rising cinematic whoosh followed by a low-frequency impact. Place the impact exactly at the visual cut or transition frame for maximum visceral punch.',
        suggestedSound: 'whoosh',
        impactSound: 'impact'
      },
      {
        patterns: ['dialogue', 'muffled', 'clean', 'room hum', 'voice'],
        reply: 'For muffled dialogue in Essential Sound: engage the High-pass filter at 120 Hz to cut rumble, boost the Peaking EQ at 2.8 kHz by +3 dB to restore intelligibility, and set Normalize to -1 dB.',
        suggestedSound: 'transition'
      },
      {
        patterns: ['logo', 'reveal', 'intro', 'tech', 'hud'],
        reply: 'For a high-tech logo reveal: layer an ethereal ambient swell in Track 3, trigger a tension riser into a crisp UI snap at the final lockup.',
        suggestedSound: 'riser',
        impactSound: 'click'
      },
      {
        patterns: ['horror', 'tension', 'eerie', 'suspense'],
        reply: 'Build tension using a rising pitch texture layered with an evolving dark ambient drone. Leave 200ms of dead silence right before the shock moment.',
        suggestedSound: 'atmosphere',
        impactSound: 'riser'
      }
    ];

    function appendMessage(sender, text, soundActions) {
      if (!chatMessages) return;
      var msg = document.createElement('div');
      msg.className = 'ai-msg ai-msg-' + sender;

      var html =
        '<div class="ai-msg-avatar">' + (sender === 'user' ? 'YOU' : 'AI') + '</div>' +
        '<div class="ai-msg-bubble">' +
          '<div class="ai-msg-text">' + text + '</div>';

      if (soundActions && soundActions.length) {
        html += '<div class="ai-msg-sound-actions">';
        soundActions.forEach(function (sa) {
          html +=
            '<button class="ai-audition-btn" data-sound="' + sa.soundId + '">' +
              '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><polygon points="7 4 20 12 7 20 7 4"/></svg> Audition ' + sa.label +
            '</button>' +
            '<button class="ai-add-tl-btn" data-sound="' + sa.soundId + '">' +
              '+ Add to Timeline' +
            '</button>';
        });
        html += '</div>';
      }

      html += '</div>';
      msg.innerHTML = html;
      chatMessages.appendChild(msg);
      chatMessages.scrollTop = chatMessages.scrollHeight;

      // Attach actions
      msg.querySelectorAll('.ai-audition-btn').forEach(function (b) {
        b.addEventListener('click', function () {
          var sId = this.getAttribute('data-sound');
          var sound = catalog.find(function (c) { return c.id === sId; });
          if (sound) engine.playSample(sound);
        });
      });

      msg.querySelectorAll('.ai-add-tl-btn').forEach(function (b) {
        b.addEventListener('click', function () {
          var sId = this.getAttribute('data-sound');
          addSoundToTimeline(sId);
        });
      });
    }

    function processAiInput(userText) {
      if (!userText.trim()) return;
      appendMessage('user', userText);

      // Search knowledgebase
      var lower = userText.toLowerCase();
      var match = knowledgeBase.find(function (kb) {
        return kb.patterns.some(function (p) { return lower.includes(p); });
      });

      var responseText = '';
      var actions = [];

      if (match) {
        responseText = match.reply;
        if (match.suggestedSound) {
          var s1 = catalog.find(function (c) { return c.id === match.suggestedSound; });
          if (s1) actions.push({ soundId: s1.id, label: s1.name });
        }
        if (match.impactSound) {
          var s2 = catalog.find(function (c) { return c.id === match.impactSound; });
          if (s2) actions.push({ soundId: s2.id, label: s2.name });
        }
      } else {
        responseText =
          'I recommend pairing an accent whoosh with a subtle low-end impact. Adjust your clip gain in Audio Tools and align the peak hit exactly with the video transition keyframe.';
        actions.push({ soundId: 'whoosh', label: 'Cinematic Whoosh' });
        actions.push({ soundId: 'impact', label: 'Deep Impact' });
      }

      // Simulated typing latency
      setTimeout(function () {
        appendMessage('assistant', responseText, actions);
      }, 350);
    }

    if (sendBtn && chatInput) {
      sendBtn.addEventListener('click', function () {
        var text = chatInput.value;
        chatInput.value = '';
        processAiInput(text);
      });
      chatInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          var text = chatInput.value;
          chatInput.value = '';
          processAiInput(text);
        }
      });
    }

    promptChips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        var prompt = this.textContent.replace(/"/g, '').trim();
        processAiInput(prompt);
      });
    });
  }

  // ── 6. MINI TIMELINE CONTROLLER ──
  function setupTimeline() {
    var tl = engine.timeline;
    tl.setClips(timelineClips);

    var playBtn = document.getElementById('tl-play-btn');
    var stopBtn = document.getElementById('tl-stop-btn');
    var loopBtn = document.getElementById('tl-loop-btn');
    var addBtn = document.getElementById('tl-add-btn');
    var resetBtn = document.getElementById('tl-reset-btn');
    var timecodeEl = document.getElementById('tl-timecode');
    var rulerEl = document.getElementById('tl-ruler');
    var playheadEl = document.getElementById('tl-playhead');
    var meterCanvas = document.getElementById('tl-vu-meter');

    renderTimelineTracks();

    // Timeline tick callback
    tl.onTick = function (timeSec) {
      updateTimelinePlayhead(timeSec);
      updateTimecode(timeSec);
    };

    // State change callback
    tl.onStateChange = function () {
      if (playBtn) {
        if (tl.isPlaying) {
          playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg> Pause';
          playBtn.classList.add('is-active');
        } else {
          playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="7 4 20 12 7 20 7 4"/></svg> Play';
          playBtn.classList.remove('is-active');
        }
      }
    };

    if (playBtn) {
      playBtn.addEventListener('click', function () {
        if (tl.isPlaying) {
          tl.pause();
        } else {
          tl.play();
        }
      });
    }

    if (stopBtn) {
      stopBtn.addEventListener('click', function () {
        tl.stop();
        tl.currentTime = 0;
        updateTimelinePlayhead(0);
        updateTimecode(0);
      });
    }

    if (loopBtn) {
      loopBtn.addEventListener('click', function () {
        tl.isLooping = !tl.isLooping;
        if (tl.isLooping) {
          loopBtn.classList.add('is-active');
          showToast('Timeline looping enabled.');
        } else {
          loopBtn.classList.remove('is-active');
          showToast('Timeline looping disabled.');
        }
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        tl.stop();
        timelineClips = JSON.parse(JSON.stringify(defaultClips));
        tl.setClips(timelineClips);
        selectedClipId = null;
        renderTimelineTracks();
        updateTimelinePlayhead(0);
        showToast('Reset timeline to default sequence.');
      });
    }

    if (addBtn) {
      addBtn.addEventListener('click', function () {
        if (activeSample) {
          addSoundToTimeline(activeSample.id);
        }
      });
    }

    // Click on ruler to seek
    if (rulerEl) {
      rulerEl.addEventListener('click', function (e) {
        var rect = rulerEl.getBoundingClientRect();
        var clickX = e.clientX - rect.left;
        var pct = Math.max(0, Math.min(1, clickX / rect.width));
        var targetSec = pct * tl.totalDuration;
        tl.seek(targetSec);
        updateTimelinePlayhead(targetSec);
        updateTimecode(targetSec);
      });
    }

    // VU meter animation loop
    if (meterCanvas) {
      var meterCtx = meterCanvas.getContext('2d');
      function drawVuMeter() {
        var level = tl.getMeterLevel();
        meterCtx.clearRect(0, 0, meterCanvas.width, meterCanvas.height);

        var segments = 14;
        var lit = Math.round(level * segments * 2.2);
        var segW = (meterCanvas.width / segments) - 2;

        for (var i = 0; i < segments; i++) {
          var isLit = i < lit;
          var x = i * (segW + 2);

          if (i > 11) {
            meterCtx.fillStyle = isLit ? '#ef4444' : 'rgba(239, 68, 68, 0.2)'; // Peak red
          } else if (i > 8) {
            meterCtx.fillStyle = isLit ? '#eab308' : 'rgba(234, 179, 8, 0.2)'; // Yellow
          } else {
            meterCtx.fillStyle = isLit ? '#35EA86' : 'rgba(53, 234, 134, 0.15)'; // Green
          }

          meterCtx.fillRect(x, 2, segW, meterCanvas.height - 4);
        }

        requestAnimationFrame(drawVuMeter);
      }
      requestAnimationFrame(drawVuMeter);
    }
  }

  function renderTimelineTracks() {
    var tracks = [
      document.getElementById('tl-track-0'),
      document.getElementById('tl-track-1'),
      document.getElementById('tl-track-2')
    ];

    tracks.forEach(function (t) { if (t) t.innerHTML = ''; });

    var totalDur = engine.timeline.totalDuration;

    timelineClips.forEach(function (clip) {
      var trackEl = tracks[clip.track];
      if (!trackEl) return;

      var clipEl = document.createElement('div');
      clipEl.className = 'tl-clip ' + (selectedClipId === clip.id ? 'is-selected' : '');
      clipEl.setAttribute('data-id', clip.id);

      var leftPct = (clip.startTime / totalDur) * 100;
      var widthPct = (clip.duration / totalDur) * 100;

      clipEl.style.left = leftPct + '%';
      clipEl.style.width = widthPct + '%';

      clipEl.innerHTML =
        '<div class="tl-clip-handle tl-clip-handle-l"></div>' +
        '<div class="tl-clip-content">' +
          '<div class="tl-clip-title">' + clip.name + '</div>' +
          '<div class="tl-clip-meta">' + (clip.gain ? (clip.gain * 100).toFixed(0) + '%' : '100%') + '</div>' +
        '</div>' +
        '<button class="tl-clip-del" data-id="' + clip.id + '" title="Remove clip">×</button>' +
        '<div class="tl-clip-handle tl-clip-handle-r"></div>';

      trackEl.appendChild(clipEl);

      // Drag repositioning handler
      setupClipDragging(clipEl, clip);

      // Click to select
      clipEl.addEventListener('click', function (e) {
        if (e.target.classList.contains('tl-clip-del')) return;
        selectedClipId = clip.id;
        renderTimelineTracks();
        openClipInspector(clip);
      });

      // Delete clip
      var delBtn = clipEl.querySelector('.tl-clip-del');
      if (delBtn) {
        delBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          engine.timeline.removeClip(clip.id);
          timelineClips = engine.timeline.clips;
          renderTimelineTracks();
          closeClipInspector();
        });
      }
    });
  }

  // Dragging clips horizontally along track
  function setupClipDragging(clipEl, clip) {
    var startX = 0;
    var origStartTime = clip.startTime;
    var trackEl = clipEl.parentElement;

    function onPointerDown(e) {
      if (e.target.classList.contains('tl-clip-del')) return;
      startX = e.clientX;
      origStartTime = clip.startTime;
      clipEl.classList.add('is-dragging');

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    }

    function onPointerMove(e) {
      var trackWidth = trackEl.getBoundingClientRect().width;
      var dx = e.clientX - startX;
      var dSec = (dx / trackWidth) * engine.timeline.totalDuration;
      var newTime = Math.max(0, Math.min(engine.timeline.totalDuration - clip.duration, origStartTime + dSec));

      // Snap to 0.05s increments
      newTime = Math.round(newTime * 20) / 20;

      clip.startTime = newTime;
      var leftPct = (newTime / engine.timeline.totalDuration) * 100;
      clipEl.style.left = leftPct + '%';
    }

    function onPointerUp() {
      clipEl.classList.remove('is-dragging');
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      engine.timeline.updateClip(clip.id, { startTime: clip.startTime });
    }

    clipEl.addEventListener('pointerdown', onPointerDown);
  }

  function addSoundToTimeline(soundId) {
    var item = catalog.find(function (c) { return c.id === soundId; });
    if (!item) return;

    var newClip = {
      id: 'clip_' + Date.now(),
      soundId: item.id,
      name: item.name,
      track: item.cat === 'Ambience' ? 2 : (item.id === 'whoosh' || item.id === 'impact' ? 0 : 1),
      startTime: Math.min(6.5, engine.timeline.currentTime || 0),
      duration: item.duration,
      gain: 1.0,
      fadeIn: 0.02,
      fadeOut: 0.05,
      color: '#35EA86'
    };

    engine.timeline.addClip(newClip);
    timelineClips = engine.timeline.clips;
    renderTimelineTracks();
    showToast('Added "' + item.name + '" to timeline!');
  }

  function updateTimelinePlayhead(timeSec) {
    var playhead = document.getElementById('tl-playhead');
    if (!playhead) return;
    var totalDur = engine.timeline.totalDuration;
    var pct = (timeSec / totalDur) * 100;
    playhead.style.left = pct + '%';
  }

  function updateTimecode(timeSec) {
    var el = document.getElementById('tl-timecode');
    if (!el) return;
    var totalFrames = Math.floor(timeSec * 30); // 30 fps
    var ff = totalFrames % 30;
    var ss = Math.floor(timeSec) % 60;
    var mm = Math.floor(timeSec / 60) % 60;
    var hh = Math.floor(timeSec / 3600);

    function pad(n) { return (n < 10 ? '0' : '') + n; }
    el.textContent = pad(hh) + ':' + pad(mm) + ':' + pad(ss) + ':' + pad(ff);
  }

  function openClipInspector(clip) {
    var inspector = document.getElementById('tl-clip-inspector');
    if (!inspector) return;
    inspector.classList.add('is-open');

    var nameEl = document.getElementById('insp-clip-name');
    var gainSlider = document.getElementById('insp-clip-gain');
    var gainVal = document.getElementById('insp-gain-val');
    var fadeSlider = document.getElementById('insp-clip-fade');
    var fadeVal = document.getElementById('insp-fade-val');

    if (nameEl) nameEl.textContent = clip.name;
    if (gainSlider) {
      gainSlider.value = clip.gain != null ? clip.gain : 1.0;
      if (gainVal) gainVal.textContent = Math.round(gainSlider.value * 100) + '%';
      gainSlider.oninput = function () {
        clip.gain = parseFloat(gainSlider.value);
        if (gainVal) gainVal.textContent = Math.round(clip.gain * 100) + '%';
        engine.timeline.updateClip(clip.id, { gain: clip.gain });
      };
    }

    if (fadeSlider) {
      fadeSlider.value = clip.fadeIn || 0.02;
      if (fadeVal) fadeVal.textContent = (fadeSlider.value * 1000).toFixed(0) + ' ms';
      fadeSlider.oninput = function () {
        clip.fadeIn = parseFloat(fadeSlider.value);
        clip.fadeOut = parseFloat(fadeSlider.value);
        if (fadeVal) fadeVal.textContent = (clip.fadeIn * 1000).toFixed(0) + ' ms';
        engine.timeline.updateClip(clip.id, { fadeIn: clip.fadeIn, fadeOut: clip.fadeOut });
      };
    }
  }

  function closeClipInspector() {
    var inspector = document.getElementById('tl-clip-inspector');
    if (inspector) inspector.classList.remove('is-open');
  }

  // Toast notification helper
  function showToast(msg) {
    var toast = document.getElementById('sfx-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'sfx-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () {
      toast.classList.remove('show');
    }, 2800);
  }

  // Public export
  window.SFX_DEMO_APP = {
    init: initDemoApp,
    switchTab: switchTab,
    addSoundToTimeline: addSoundToTimeline,
    showToast: showToast
  };

  // Auto init when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDemoApp);
  } else {
    initDemoApp();
  }
})();
