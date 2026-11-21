/**
 * SFX Composer — Authentic Desktop CEP Plugin Controller
 * Matches the official Adobe CEP extension architecture:
 * - Fixed Shell Header with #sfx-header-menu
 * - Two-Pane Split Library (Sidebar categories + Virtual Sound List / Gallery Grid)
 * - Interactive Waveform Trim Tray with In/Out markers, handles, and timecode
 * - Host Connection Statusbar with live Premiere Pro sequence feedback
 * - 5 Full-Screen Extension Overlays: Audio Tools / Essential Sound Studio,
 *   AI SFX Assistant, Browser Companion, Scene Designer, and Analytics.
 */

(function () {
  'use strict';

  var engine = window.SFX_AUDIO_ENGINE;
  var catalog = window.SFX_AUDIO_CATALOG || [];

  // Extended catalog to represent the 17,420+ library sounds
  var extendedCatalog = [
    ...catalog,
    { id: 'airlock', name: 'Sci-Fi Air Lock Release', file: 'cinematic-whoosh.wav', cat: 'SFX', subcat: 'Whoosh', tags: ['Pneumatic', 'Futuristic', 'Metal'], duration: 1.8, sizeKb: '142.0', url: 'assets/audio/cinematic-whoosh.wav' },
    { id: 'earthquake', name: 'Earthquake Sub Boom 808', file: 'deep-impact.wav', cat: 'SFX', subcat: 'Impacts', tags: ['Subsonic', 'Heavy', 'Trailer'], duration: 2.5, sizeKb: '210.5', url: 'assets/audio/deep-impact.wav' },
    { id: 'cyberriser', name: 'Cyberpunk Tension Riser', file: 'riser.wav', cat: 'SFX', subcat: 'Transitions', tags: ['Tension', 'Build-up', 'Climax'], duration: 3.0, sizeKb: '516.8', url: 'assets/audio/riser.wav' },
    { id: 'shimmer', name: 'Organic Shimmer Sweep', file: 'soft-transition.wav', cat: 'SFX', subcat: 'Transitions', tags: ['Modern', 'Warm', 'Chime'], duration: 1.1, sizeKb: '189.5', url: 'assets/audio/soft-transition.wav' },
    { id: 'haptic', name: 'Haptic Mechanical Click', file: 'ui-click.wav', cat: 'SFX', subcat: 'UI', tags: ['Tactile', 'Button', 'Interface'], duration: 0.15, sizeKb: '48.2', url: 'assets/audio/ui-click.wav' },
    { id: 'dystopia', name: 'Dystopian Industrial Drone', file: 'ambient-atmosphere.wav', cat: 'Ambience', subcat: 'Ambience', tags: ['Eerie', 'Pad', 'Soundscape'], duration: 5.0, sizeKb: '840.0', url: 'assets/audio/ambient-atmosphere.wav' },
    { id: 'cinematic_braam', name: 'Low Brass Trailer Braam', file: 'deep-impact.wav', cat: 'SFX', subcat: 'Impacts', tags: ['Braam', 'Horn', 'Cinematic'], duration: 2.8, sizeKb: '240.0', url: 'assets/audio/deep-impact.wav' },
    { id: 'whosh_flame', name: 'Fireball Whoosh Pass-by', file: 'cinematic-whoosh.wav', cat: 'SFX', subcat: 'Whoosh', tags: ['Fire', 'Magic', 'Whoosh'], duration: 1.6, sizeKb: '160.0', url: 'assets/audio/cinematic-whoosh.wav' }
  ];

  var state = {
    activeSound: extendedCatalog[0],
    selectedCategory: 'all',
    viewMode: 'list', // 'list' | 'grid'
    activeTrack: 'A1',
    searchQuery: '',
    masterVolume: 1.0,
    trimIn: 0.0,
    trimOut: extendedCatalog[0] ? extendedCatalog[0].duration : 1.4,
    trimPitch: 0,
    trimVisible: true,
    favorites: { whoosh: true, impact: true },
    currentTool: null,
    analyticsData: {
      auditions: 38,
      imports: 14,
      session: 'Active Pro'
    }
  };

  // ── BOOTSTRAP ──
  document.addEventListener('DOMContentLoaded', function () {
    initPlugin();
  });

  function initPlugin() {
    setupHeaderMenu();
    setupSidebarCategories();
    setupMainLibrary();
    setupViewToggles();
    setupTrackSelector();
    setupTrimTray();
    setupAudioTools3Panel();
    setupAiAssistantPanel();
    setupBrowserPanel();
    setupSceneDesignerPanel();
    setupAnalyticsPanel();
    setupBgmFlowPanel();
    setupDualHostSwitcher();
    setupSettingsDrawer();
    setupModuleShowcaseTour();
    setupGalleryLightbox();
    setupCustomerDashboard();

    // Select default active sound
    if (state.activeSound) {
      updateTrimTray(state.activeSound);
    }
  }

  // ── 1. HEADER MENU TOOLBAR OVERLAYS ──
  function setupHeaderMenu() {
    var menu = document.getElementById('sfx-header-menu');
    if (!menu) return;

    var buttons = menu.querySelectorAll('.sfx-hm__btn');
    buttons.forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var tool = this.getAttribute('data-tool');
        toggleToolOverlay(tool);
      });
    });

    // Tool back buttons (return to main library)
    document.querySelectorAll('.sfx-tool-back-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        closeCurrentToolOverlay();
      });
    });
  }

  function toggleToolOverlay(toolId) {
    var tools = {
      browser: document.getElementById('sfx-browser'),
      ai: document.getElementById('sfx-ai-assistant'),
      bgm: document.getElementById('sfx-bgm-flow'),
      analytics: document.getElementById('sfx-analytics'),
      scene: document.getElementById('sfx-scene-designer'),
      audio: document.getElementById('sfx-audio-tools')
    };

    if (state.currentTool === toolId) {
      // Toggle off
      closeCurrentToolOverlay();
      return;
    }

    // Close all first
    Object.keys(tools).forEach(function (key) {
      if (tools[key]) tools[key].classList.remove('is-open');
    });

    document.querySelectorAll('.sfx-hm__btn').forEach(function (btn) {
      btn.setAttribute('aria-pressed', 'false');
    });

    // Open target
    if (tools[toolId]) {
      tools[toolId].classList.add('is-open');
      state.currentTool = toolId;

      var activeBtn = document.querySelector('.sfx-hm__btn[data-tool="' + toolId + '"]');
      if (activeBtn) activeBtn.setAttribute('aria-pressed', 'true');

      if (toolId === 'audio' && state.activeSound) {
        loadAudioIntoTools(state.activeSound);
      }
      if (toolId === 'analytics') {
        renderAnalyticsView();
      }
    }
  }

  function closeCurrentToolOverlay() {
    var tools = ['sfx-browser', 'sfx-ai-assistant', 'sfx-bgm-flow', 'sfx-analytics', 'sfx-scene-designer', 'sfx-audio-tools', 'sfx-settings-drawer'];
    tools.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.remove('is-open');
    });
    document.querySelectorAll('.sfx-hm__btn').forEach(function (btn) {
      btn.setAttribute('aria-pressed', 'false');
    });
    state.currentTool = null;
  }

  // ── 2. SIDEBAR CATEGORY FILTERING ──
  function setupSidebarCategories() {
    var catButtons = document.querySelectorAll('.sfx-sidebar-cat-btn');
    catButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        catButtons.forEach(function (b) { b.classList.remove('sfx-cat--on'); });
        this.classList.add('sfx-cat--on');
        state.selectedCategory = this.getAttribute('data-category');
        renderSoundRows();
        renderGalleryCards();
      });
    });
  }

  // ── 3. MAIN LIBRARY SEARCH & CONTROLS ──
  function setupMainLibrary() {
    var searchInput = document.getElementById('sfx-main-search');
    var gainSlider = document.getElementById('sfx-main-gain');
    var gainVal = document.getElementById('sfx-main-gain-val');

    if (searchInput) {
      searchInput.addEventListener('input', function () {
        state.searchQuery = this.value.toLowerCase().trim();
        renderSoundRows();
        renderGalleryCards();
      });
    }

    if (gainSlider) {
      gainSlider.addEventListener('input', function () {
        var val = parseFloat(this.value);
        state.masterVolume = val;
        if (gainVal) gainVal.textContent = Math.round(val * 100) + '%';
        if (engine && engine.setMasterVolume) {
          engine.setMasterVolume(val);
        }
      });
    }

    renderSoundRows();
    renderGalleryCards();
  }

  // View Mode Toggles (List vs Grid Gallery)
  function setupViewToggles() {
    var btnList = document.getElementById('sfx-view-list');
    var btnGrid = document.getElementById('sfx-view-grid');
    var listContainer = document.getElementById('sfx-vlist-container');
    var gridContainer = document.getElementById('sfx-gallery-container');

    if (btnList && btnGrid) {
      btnList.addEventListener('click', function () {
        state.viewMode = 'list';
        btnList.classList.add('sfx-viewtoggle__button--on');
        btnGrid.classList.remove('sfx-viewtoggle__button--on');
        if (listContainer) listContainer.style.display = 'block';
        if (gridContainer) gridContainer.style.display = 'none';
        renderSoundRows();
      });

      btnGrid.addEventListener('click', function () {
        state.viewMode = 'grid';
        btnGrid.classList.add('sfx-viewtoggle__button--on');
        btnList.classList.remove('sfx-viewtoggle__button--on');
        if (listContainer) listContainer.style.display = 'none';
        if (gridContainer) gridContainer.style.display = 'grid';
        renderGalleryCards();
      });
    }
  }

  // Track Selector (A1, A2, A3, A4)
  function setupTrackSelector() {
    var trackSelect = document.getElementById('sfx-track-target');
    if (!trackSelect) return;

    trackSelect.addEventListener('change', function () {
      state.activeTrack = this.value;
      updateTrackLabels();
      updateStatusClipInfo();
    });
  }

  function updateTrackLabels() {
    // Update all "+ Track A1" buttons in rows
    document.querySelectorAll('.sfx-row__import').forEach(function (btn) {
      btn.textContent = '+ Track ' + state.activeTrack;
    });
    // Update gallery card import buttons
    document.querySelectorAll('.sfx-card__import').forEach(function (btn) {
      btn.textContent = '+ Track ' + state.activeTrack;
    });
    // Update trim tray CTA
    var trimImportBtn = document.getElementById('sfx-trim-import-btn');
    if (trimImportBtn) {
      trimImportBtn.textContent = '+ Place at Playhead (Track ' + state.activeTrack + ')';
    }
  }

  function updateStatusClipInfo() {
    var statusMuted = document.getElementById('sfx-status-clip-info');
    if (statusMuted) {
      statusMuted.textContent = 'Track ' + state.activeTrack + ' Active • In/Out: ' + (state.activeSound ? state.activeSound.duration.toFixed(2) + 's' : '00:00:01:40');
    }
  }

  function getFilteredSounds() {
    return extendedCatalog.filter(function (item) {
      var matchCat = true;
      if (state.selectedCategory === 'favorites') {
        matchCat = !!state.favorites[item.id];
      } else if (state.selectedCategory === 'music') {
        matchCat = item.cat.toLowerCase() === 'music' || (item.subcat && item.subcat.toLowerCase() === 'music');
      } else if (state.selectedCategory === 'whoosh') {
        matchCat = item.id.includes('whoosh') || (item.tags && item.tags.some(function (t) { return t.toLowerCase().includes('whoosh'); }));
      } else if (state.selectedCategory === 'impacts') {
        matchCat = item.id.includes('impact') || item.id.includes('earthquake') || item.id.includes('braam');
      } else if (state.selectedCategory === 'transitions') {
        matchCat = item.id.includes('transition') || item.id.includes('shimmer') || item.id.includes('riser');
      } else if (state.selectedCategory === 'ui') {
        matchCat = item.id.includes('click') || item.id.includes('haptic');
      } else if (state.selectedCategory === 'ambience') {
        matchCat = item.cat.toLowerCase() === 'ambience' || item.id.includes('atmosphere') || item.id.includes('drone');
      }

      var matchQuery = !state.searchQuery ||
        item.name.toLowerCase().includes(state.searchQuery) ||
        item.cat.toLowerCase().includes(state.searchQuery) ||
        (item.tags && item.tags.some(function (t) { return t.toLowerCase().includes(state.searchQuery); }));

      return matchCat && matchQuery;
    });
  }

  function renderSoundRows() {
    var container = document.getElementById('sfx-vlist-container');
    var countEl = document.getElementById('sfx-sounds-count');
    if (!container) return;

    var filtered = getFilteredSounds();

    if (countEl) {
      countEl.textContent = filtered.length + ' sounds';
    }

    container.innerHTML = '';
    if (filtered.length === 0) {
      container.innerHTML = '<div style="padding: 40px 20px; color: var(--sfx-text-muted); font-size: 12px; text-align: center;">No audio files found matching query. Try another keyword.</div>';
      return;
    }

    filtered.forEach(function (sound) {
      var row = document.createElement('div');
      var isSelected = state.activeSound && state.activeSound.id === sound.id;
      var isFav = !!state.favorites[sound.id];
      var isPlaying = engine ? engine.isPlayingSample(sound.id) : false;

      row.className = 'sfx-row ' + (isSelected ? 'sfx-row--selected' : '') + (isPlaying ? ' sfx-row--previewing' : '');
      row.setAttribute('data-id', sound.id);

      row.innerHTML =
        '<button class="sfx-star ' + (isFav ? 'sfx-star--on' : '') + '" data-id="' + sound.id + '" title="Toggle Favorite">' +
          (isFav ? '★' : '☆') +
        '</button>' +

        '<button class="sfx-iconbutton sfx-row-play-btn" data-id="' + sound.id + '" title="Audition Sound">' +
          '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">' +
            (isPlaying ? '<rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/>' : '<path d="M8 5v14l11-7z"/>') +
          '</svg>' +
        '</button>' +

        '<div class="sfx-row__main">' +
          '<div class="sfx-row__name">' + sound.name + '</div>' +
          '<div class="sfx-row__meta">' +
            '<span class="sfx-tag">' + sound.cat + '</span>' +
            (sound.tags ? sound.tags.slice(0, 2).map(function (t) { return '<span class="sfx-tag" style="opacity: 0.7;">#' + t + '</span>'; }).join('') : '') +
          '</div>' +
        '</div>' +

        '<div class="sfx-row__wave">' +
          '<canvas class="sfx-waveform sfx-row-wave-canvas" width="90" height="20" data-id="' + sound.id + '"></canvas>' +
        '</div>' +

        '<div class="sfx-row__duration">' + sound.duration.toFixed(1) + 's</div>' +

        '<button class="sfx-iconbutton sfx-btn-row-trim" data-id="' + sound.id + '" title="Non-destructive Trim">' +
          '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>' +
        '</button>' +

        '<button class="sfx-row__import sfx-btn-row-insert" data-id="' + sound.id + '" title="Place at Playhead on Track ' + state.activeTrack + '">' +
          '+ Track ' + state.activeTrack +
        '</button>';

      container.appendChild(row);

      // Draw subtle row waveform
      drawRowWaveform(row.querySelector('.sfx-row-wave-canvas'), sound, isPlaying);

      // Row Selection
      row.addEventListener('click', function (e) {
        if (e.target.closest('button')) return;
        state.activeSound = sound;
        renderSoundRows();
        renderGalleryCards();
        updateTrimTray(sound);
      });
    });

    attachRowEvents(container);
  }

  function renderGalleryCards() {
    var container = document.getElementById('sfx-gallery-container');
    if (!container) return;

    var filtered = getFilteredSounds();
    container.innerHTML = '';

    if (filtered.length === 0) {
      container.innerHTML = '<div style="grid-column: 1/-1; padding: 40px 20px; color: var(--sfx-text-muted); font-size: 12px; text-align: center;">No sounds found matching current filter.</div>';
      return;
    }

    filtered.forEach(function (sound) {
      var card = document.createElement('div');
      var isSelected = state.activeSound && state.activeSound.id === sound.id;
      var isPlaying = engine ? engine.isPlayingSample(sound.id) : false;

      card.className = 'sfx-card ' + (isSelected ? 'sfx-card--on' : '') + (isPlaying ? ' sfx-card--playing' : '');
      card.setAttribute('data-id', sound.id);

      card.innerHTML =
        '<div class="sfx-card__wave">' +
          '<canvas class="sfx-waveform sfx-card-wave-canvas" width="160" height="42" data-id="' + sound.id + '"></canvas>' +
        '</div>' +
        '<div class="sfx-card__name">' + sound.name + '</div>' +
        '<div class="sfx-card__foot">' +
          '<span class="sfx-card__duration">' + sound.duration.toFixed(1) + 's</span>' +
          '<button class="sfx-card__import sfx-btn-card-insert" data-id="' + sound.id + '">+ Track ' + state.activeTrack + '</button>' +
        '</div>';

      container.appendChild(card);
      drawRowWaveform(card.querySelector('.sfx-card-wave-canvas'), sound, isPlaying);

      card.addEventListener('click', function (e) {
        if (e.target.closest('button')) return;
        state.activeSound = sound;
        renderSoundRows();
        renderGalleryCards();
        updateTrimTray(sound);

        // Audition on card click
        if (engine) {
          if (engine.isPlayingSample(sound.id)) {
            engine.stopSample();
          } else {
            state.analyticsData.auditions++;
            engine.playSample(sound, null, function () {
              renderSoundRows();
              renderGalleryCards();
            });
          }
          renderSoundRows();
          renderGalleryCards();
        }
      });
    });

    // Attach card insert events
    container.querySelectorAll('.sfx-btn-card-insert').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var id = this.getAttribute('data-id');
        insertSoundToSequence(id);
      });
    });
  }

  function drawRowWaveform(canvas, sound, isPlaying) {
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var w = canvas.width;
    var h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    var bars = canvas.classList.contains('sfx-card-wave-canvas') ? 36 : 24;
    var barW = (w / bars) - 1.2;

    ctx.fillStyle = isPlaying ? '#4a9eff' : '#8a9bb5';

    for (var i = 0; i < bars; i++) {
      var progress = i / bars;
      var env = Math.sin(progress * Math.PI);
      if (sound.id.includes('impact') || sound.id.includes('earthquake')) env = Math.exp(-progress * 3.2);
      if (sound.id.includes('riser')) env = Math.pow(progress, 1.8);

      var barH = Math.max(2, env * (h - 4) * (0.4 + 0.6 * Math.sin(i * 1.5)));
      var y = (h - barH) / 2;
      ctx.fillRect(i * (barW + 1.2), y, barW, barH);
    }
  }

  function attachRowEvents(container) {
    // Star Favorite Toggle
    container.querySelectorAll('.sfx-star').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var id = this.getAttribute('data-id');
        state.favorites[id] = !state.favorites[id];
        renderSoundRows();
        renderGalleryCards();
        // Update favorites count in sidebar
        var favCount = Object.keys(state.favorites).filter(function (k) { return state.favorites[k]; }).length;
        var favCountEl = document.getElementById('sfx-fav-count');
        if (favCountEl) favCountEl.textContent = favCount;
      });
    });

    // Row Play / Audition Button
    container.querySelectorAll('.sfx-row-play-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var id = this.getAttribute('data-id');
        var sound = extendedCatalog.find(function (c) { return c.id === id; });
        if (!sound) return;

        if (engine && engine.isPlayingSample(id)) {
          engine.stopSample();
          renderSoundRows();
          renderGalleryCards();
        } else {
          state.analyticsData.auditions++;
          if (engine) {
            engine.playSample(sound, null, function () {
              renderSoundRows();
              renderGalleryCards();
            });
          }
          renderSoundRows();
          renderGalleryCards();
        }
      });
    });

    // Row Trim Button (opens trim tray for this sound)
    container.querySelectorAll('.sfx-btn-row-trim').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var id = this.getAttribute('data-id');
        var sound = extendedCatalog.find(function (c) { return c.id === id; });
        if (sound) {
          state.activeSound = sound;
          var tray = document.getElementById('sfx-trim-tray');
          if (tray) tray.style.display = 'flex';
          state.trimVisible = true;
          updateTrimTray(sound);
          renderSoundRows();
        }
      });
    });

    // Insert into Host Sequence
    container.querySelectorAll('.sfx-btn-row-insert').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var id = this.getAttribute('data-id');
        insertSoundToSequence(id);
      });
    });
  }

  // ── 4. TRIM TRAY AT BOTTOM OF MAIN VIEW ──
  function setupTrimTray() {
    var playBtn = document.getElementById('sfx-trim-play-btn');
    var addBtn = document.getElementById('sfx-trim-import-btn');
    var closeBtn = document.getElementById('sfx-trim-close');
    var openStudioBtn = document.getElementById('sfx-trim-open-studio-btn');
    var tray = document.getElementById('sfx-trim-tray');

    if (playBtn) {
      playBtn.addEventListener('click', function () {
        if (!state.activeSound) return;
        if (engine && engine.isPlayingSample(state.activeSound.id)) {
          engine.stopSample();
          playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
        } else {
          state.analyticsData.auditions++;
          if (engine) {
            engine.playSample(state.activeSound, null, function () {
              playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
            });
          }
          playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>';
        }
      });
    }

    if (addBtn) {
      addBtn.addEventListener('click', function () {
        if (state.activeSound) {
          insertSoundToSequence(state.activeSound.id);
        }
      });
    }

    if (closeBtn && tray) {
      closeBtn.addEventListener('click', function () {
        tray.style.display = 'none';
        state.trimVisible = false;
      });
    }

    if (openStudioBtn) {
      openStudioBtn.addEventListener('click', function () {
        if (state.activeSound) {
          loadAudioIntoTools(state.activeSound);
          toggleToolOverlay('audio');
        }
      });
    }

    setupTrimHandles();
  }

  function setupTrimHandles() {
    var handleIn = document.getElementById('sfx-trim-handle-in');
    var handleOut = document.getElementById('sfx-trim-handle-out');
    var track = document.getElementById('sfx-trim-track');
    if (!track || !handleIn || !handleOut) return;

    var dragging = null;

    function onPointerDown(e, handle) {
      e.preventDefault();
      dragging = handle;
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    }

    handleIn.addEventListener('pointerdown', function (e) { onPointerDown(e, 'in'); });
    handleOut.addEventListener('pointerdown', function (e) { onPointerDown(e, 'out'); });

    function onPointerMove(e) {
      if (!dragging || !state.activeSound) return;
      var rect = track.getBoundingClientRect();
      var relX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      var pct = (relX / rect.width) * 100;
      var dur = state.activeSound.duration;

      if (dragging === 'in') {
        var maxIn = (state.trimOut / dur) * 100 - 5;
        pct = Math.max(0, Math.min(maxIn, pct));
        state.trimIn = (pct / 100) * dur;
        handleIn.style.left = pct + '%';
        var shadeLeft = document.getElementById('sfx-trim-shade-left');
        if (shadeLeft) shadeLeft.style.width = pct + '%';
      } else if (dragging === 'out') {
        var minOut = (state.trimIn / dur) * 100 + 5;
        pct = Math.max(minOut, Math.min(100, pct));
        state.trimOut = (pct / 100) * dur;
        handleOut.style.left = pct + '%';
        var shadeRight = document.getElementById('sfx-trim-shade-right');
        if (shadeRight) shadeRight.style.width = (100 - pct) + '%';
      }

      var region = document.getElementById('sfx-trim-region');
      if (region) {
        var inPct = (state.trimIn / dur) * 100;
        var outPct = (state.trimOut / dur) * 100;
        region.style.left = inPct + '%';
        region.style.width = (outPct - inPct) + '%';
      }

      var readout = document.getElementById('sfx-trim-readout');
      if (readout) {
        var activeLen = (state.trimOut - state.trimIn).toFixed(2);
        readout.textContent = 'In: ' + state.trimIn.toFixed(2) + 's • Out: ' + state.trimOut.toFixed(2) + 's (' + activeLen + 's)';
      }
    }

    function onPointerUp() {
      dragging = null;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    }
  }

  function updateTrimTray(sound) {
    var tray = document.getElementById('sfx-trim-tray');
    if (tray) tray.style.display = 'flex';

    var nameEl = document.getElementById('sfx-trim-name');
    var lenEl = document.getElementById('sfx-trim-length');
    var canvas = document.getElementById('sfx-trim-canvas');
    var readout = document.getElementById('sfx-trim-readout');
    var handleIn = document.getElementById('sfx-trim-handle-in');
    var handleOut = document.getElementById('sfx-trim-handle-out');
    var region = document.getElementById('sfx-trim-region');
    var shadeLeft = document.getElementById('sfx-trim-shade-left');
    var shadeRight = document.getElementById('sfx-trim-shade-right');

    state.trimIn = 0.0;
    state.trimOut = sound.duration;

    if (nameEl) nameEl.textContent = sound.name;
    if (lenEl) lenEl.textContent = sound.duration.toFixed(2) + 's';
    if (readout) readout.textContent = 'In: 0.00s • Out: ' + sound.duration.toFixed(2) + 's (' + sound.duration.toFixed(2) + 's)';

    if (handleIn) handleIn.style.left = '0%';
    if (handleOut) handleOut.style.left = '100%';
    if (region) { region.style.left = '0%'; region.style.width = '100%'; }
    if (shadeLeft) shadeLeft.style.width = '0%';
    if (shadeRight) shadeRight.style.width = '0%';

    updateStatusClipInfo();

    if (canvas) {
      var ctx = canvas.getContext('2d');
      var w = canvas.width;
      var h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      ctx.fillStyle = '#08080a';
      ctx.fillRect(0, 0, w, h);

      var bars = 80;
      var barW = (w / bars) - 1;

      ctx.fillStyle = '#8a9bb5';
      for (var i = 0; i < bars; i++) {
        var prog = i / bars;
        var env = Math.sin(prog * Math.PI);
        if (sound.id.includes('impact') || sound.id.includes('earthquake')) env = Math.exp(-prog * 3.5);
        if (sound.id.includes('riser')) env = Math.pow(prog, 1.8);

        var bh = Math.max(3, env * (h - 8) * (0.3 + 0.7 * Math.sin(i * 1.2)));
        var by = (h - bh) / 2;
        ctx.fillRect(i * (barW + 1), by, barW, bh);
      }
    }
  }

  // ── 5. AUDIO TOOLS & ESSENTIAL SOUND 3-PANEL WORKSPACE ──
  var atState = {
    sound: extendedCatalog[0],
    category: 'sfx',
    gainDb: 0,
    hp: 20,
    lp: 20000,
    bass: 0,
    eq: 0,
    fadeIn: 0.02,
    fadeOut: 0.05,
    trimStart: 0,
    trimEnd: extendedCatalog[0] ? extendedCatalog[0].duration : 1.4,
    isPlaying: false
  };

  function setupAudioTools3Panel() {
    var playBtn = document.getElementById('at-transport-play');
    var stopBtn = document.getElementById('at-transport-stop');
    var normBtn = document.getElementById('at-ctrl-norm-btn');
    var exportBtn = document.getElementById('at-export-wav-btn');
    var applyTlBtn = document.getElementById('at-apply-timeline-btn');

    // Category buttons
    document.querySelectorAll('.sfx-es-cat-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.sfx-es-cat-btn').forEach(function (b) {
          b.classList.remove('is-active');
          b.style.background = 'var(--sfx-surface-hover)';
          b.style.color = 'var(--sfx-text)';
        });
        this.classList.add('is-active');
        this.style.background = 'var(--sfx-accent)';
        this.style.color = '#fff';
        atState.category = this.getAttribute('data-cat');
      });
    });

    // Range Sliders
    syncAtInputs();

    if (playBtn) {
      playBtn.addEventListener('click', function () {
        if (!atState.sound) return;
        state.analyticsData.auditions++;
        if (engine && engine.playSampleWithFx) {
          engine.playSampleWithFx(atState.sound, atState, function () {
            playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
          });
        }
        playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>';
      });
    }

    if (stopBtn) {
      stopBtn.addEventListener('click', function () {
        if (engine) engine.stopSample();
        if (playBtn) playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
      });
    }

    if (normBtn) {
      normBtn.addEventListener('click', function () {
        atState.gainDb = 2.5;
        var gainSlider = document.getElementById('at-ctrl-gain');
        var gainVal = document.getElementById('at-val-gain');
        if (gainSlider) gainSlider.value = 2.5;
        if (gainVal) gainVal.textContent = '+2.5 dB';
        showToast('Normalized to -1 dBFS target');
      });
    }

    if (exportBtn) {
      exportBtn.addEventListener('click', function () {
        if (!atState.sound) return;
        showToast('Exporting processed 24-bit 48kHz WAV: ' + atState.sound.name);
        if (engine && engine.exportProcessedWav) {
          engine.exportProcessedWav(atState.sound, atState);
        }
      });
    }

    if (applyTlBtn) {
      applyTlBtn.addEventListener('click', function () {
        if (atState.sound) {
          insertSoundToSequence(atState.sound.id);
        }
      });
    }

    renderAtLibList();
  }

  function syncAtInputs() {
    var gain = document.getElementById('at-ctrl-gain');
    var hp = document.getElementById('at-ctrl-hp');
    var lp = document.getElementById('at-ctrl-lp');
    var bass = document.getElementById('at-ctrl-bass');
    var eq = document.getElementById('at-ctrl-eq');
    var trimStart = document.getElementById('at-trim-start-range');
    var trimEnd = document.getElementById('at-trim-end-range');

    if (gain) {
      gain.addEventListener('input', function () {
        atState.gainDb = parseFloat(this.value);
        var val = document.getElementById('at-val-gain');
        if (val) val.textContent = (atState.gainDb > 0 ? '+' : '') + atState.gainDb.toFixed(1) + ' dB';
      });
    }

    if (hp) {
      hp.addEventListener('input', function () {
        atState.hp = parseFloat(this.value);
        var val = document.getElementById('at-val-hp');
        if (val) val.textContent = atState.hp + ' Hz';
      });
    }

    if (lp) {
      lp.addEventListener('input', function () {
        atState.lp = parseFloat(this.value);
        var val = document.getElementById('at-val-lp');
        if (val) val.textContent = (atState.lp >= 1000 ? (atState.lp / 1000).toFixed(1) + ' kHz' : atState.lp + ' Hz');
      });
    }

    if (bass) {
      bass.addEventListener('input', function () {
        atState.bass = parseFloat(this.value);
        var val = document.getElementById('at-val-bass');
        if (val) val.textContent = (atState.bass > 0 ? '+' : '') + atState.bass.toFixed(1) + ' dB';
      });
    }

    if (eq) {
      eq.addEventListener('input', function () {
        atState.eq = parseFloat(this.value);
        var val = document.getElementById('at-val-eq');
        if (val) val.textContent = (atState.eq > 0 ? '+' : '') + atState.eq.toFixed(1) + ' dB';
      });
    }

    if (trimStart) {
      trimStart.addEventListener('input', function () {
        atState.trimStart = parseFloat(this.value);
        renderAtWaveform();
      });
    }

    if (trimEnd) {
      trimEnd.addEventListener('input', function () {
        atState.trimEnd = parseFloat(this.value);
        renderAtWaveform();
      });
    }
  }

  function loadAudioIntoTools(sound) {
    atState.sound = sound;
    atState.trimStart = 0;
    atState.trimEnd = sound.duration;

    var nameEl = document.getElementById('at-active-sound-name');
    var timecodeEl = document.getElementById('at-center-timecode');
    var startRange = document.getElementById('at-trim-start-range');
    var endRange = document.getElementById('at-trim-end-range');

    if (nameEl) nameEl.textContent = sound.name + ' (' + sound.duration.toFixed(2) + 's)';
    if (timecodeEl) timecodeEl.textContent = '00:00:00:00 / 00:00:' + sound.duration.toFixed(2).replace('.', ':');

    if (startRange) { startRange.max = sound.duration; startRange.value = 0; }
    if (endRange) { endRange.max = sound.duration; endRange.value = sound.duration; }

    renderAtWaveform();
    renderAtLibList();
  }

  function renderAtLibList() {
    var libList = document.getElementById('at-lib-items');
    if (!libList) return;

    libList.innerHTML = '';
    extendedCatalog.forEach(function (sound) {
      var isCurrent = atState.sound && atState.sound.id === sound.id;
      var item = document.createElement('div');
      item.style.padding = '6px 8px';
      item.style.borderRadius = '4px';
      item.style.marginBottom = '2px';
      item.style.fontSize = '11.5px';
      item.style.cursor = 'pointer';
      item.style.background = isCurrent ? 'var(--sfx-accent)' : 'transparent';
      item.style.color = isCurrent ? '#fff' : 'var(--sfx-text)';
      item.innerHTML =
        '<div style="font-weight: 550; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + sound.name + '</div>' +
        '<div style="font-size: 10px; opacity: 0.7;">' + sound.cat + ' • ' + sound.duration.toFixed(1) + 's</div>';

      item.addEventListener('click', function () {
        loadAudioIntoTools(sound);
      });

      libList.appendChild(item);
    });
  }

  function renderAtWaveform() {
    var canvas = document.getElementById('at-center-waveform');
    if (!canvas || !atState.sound) return;

    var ctx = canvas.getContext('2d');
    var w = canvas.width;
    var h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = '#0a0a0e';
    ctx.fillRect(0, 0, w, h);

    // Draw grid lines
    ctx.strokeStyle = '#181820';
    ctx.lineWidth = 1;
    for (var x = 0; x < w; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    var bars = 100;
    var barW = (w / bars) - 1.5;
    var dur = atState.sound.duration;

    for (var i = 0; i < bars; i++) {
      var prog = i / bars;
      var sec = prog * dur;
      var isTrimmed = sec >= atState.trimStart && sec <= atState.trimEnd;

      var env = Math.sin(prog * Math.PI);
      if (atState.sound.id.includes('impact') || atState.sound.id.includes('earthquake')) env = Math.exp(-prog * 3.5);
      if (atState.sound.id.includes('riser')) env = Math.pow(prog, 1.8);

      var bh = Math.max(4, env * (h - 20) * (0.3 + 0.7 * Math.sin(i * 1.4)));
      var by = (h - bh) / 2;

      ctx.fillStyle = isTrimmed ? '#35ea86' : '#334455';
      ctx.fillRect(i * (barW + 1.5), by, barW, bh);
    }
  }

  // ── 6. AI SFX ASSISTANT ──
  function setupAiAssistantPanel() {
    var sendBtn = document.getElementById('sfx-ai-send-btn');
    var textarea = document.getElementById('sfx-ai-textarea');

    if (sendBtn && textarea) {
      function sendMsg() {
        var txt = textarea.value.trim();
        if (!txt) return;
        appendAiMsg(txt, 'user');
        textarea.value = '';
        processAiPrompt(txt);
      }

      sendBtn.addEventListener('click', sendMsg);
      textarea.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          sendMsg();
        }
      });
    }

    document.querySelectorAll('.sfx-ai-chip-prompt').forEach(function (chip) {
      chip.addEventListener('click', function () {
        var txt = this.textContent.replace(/^"|"$/g, '');
        appendAiMsg(txt, 'user');
        processAiPrompt(txt);
      });
    });
  }

  function appendAiMsg(text, sender) {
    var list = document.getElementById('sfx-ai-msg-list');
    if (!list) return;

    var bubble = document.createElement('div');
    bubble.className = 'sfx-ai-chat-bubble sfx-ai-bubble--' + sender;
    bubble.innerHTML = '<div class="sfx-ai-bubble-text">' + text + '</div>';
    list.appendChild(bubble);
    list.scrollTop = list.scrollHeight;
  }

  function processAiPrompt(prompt) {
    var list = document.getElementById('sfx-ai-msg-list');
    if (!list) return;

    var typing = document.createElement('div');
    typing.className = 'sfx-ai-chat-bubble sfx-ai-bubble--assistant';
    typing.innerHTML = '<div class="sfx-ai-bubble-text" style="color: var(--sfx-text-muted);">AI is designing audio layers…</div>';
    list.appendChild(typing);
    list.scrollTop = list.scrollHeight;

    setTimeout(function () {
      typing.remove();
      var resp = document.createElement('div');
      resp.className = 'sfx-ai-chat-bubble sfx-ai-bubble--assistant';

      var lower = prompt.toLowerCase();
      var responseHtml = '';

      if (lower.includes('whoosh') || lower.includes('transition')) {
        responseHtml =
          '<div class="sfx-ai-bubble-text">' +
            'For a smooth transition, combine <strong>Organic Shimmer Sweep</strong> with a subtle rising whoosh. Trim the start to 0.15s to line up with the visual cut frame.' +
          '</div>' +
          '<div style="display: flex; gap: 6px; margin-top: 8px;">' +
            '<button class="sfx-button" onclick="window.SFX_AUDIO_ENGINE.playSample(window.SFX_AUDIO_CATALOG[0])" style="height: 24px; padding: 0 8px; font-size: 11px;">▶ Audition Whoosh</button>' +
            '<button class="sfx-button sfx-button--quiet" onclick="window.SFX_PLUGIN_CONTROLLER.insertSoundToSequence(\'whoosh\')" style="height: 24px; padding: 0 8px; font-size: 11px;">+ Insert to Sequence</button>' +
          '</div>';
      } else if (lower.includes('dialogue') || lower.includes('clean')) {
        responseHtml =
          '<div class="sfx-ai-bubble-text">' +
            'To clean up dialogue, engage the <strong>Essential Sound Studio</strong>: set High-Pass to 80 Hz to roll off microphone rumble, and boost Presence EQ by +2.0 dB for clarity.' +
          '</div>' +
          '<div style="display: flex; gap: 6px; margin-top: 8px;">' +
            '<button class="sfx-button" onclick="window.SFX_PLUGIN_CONTROLLER.toggleToolOverlay(\'audio\')" style="height: 24px; padding: 0 8px; font-size: 11px;">Open in Audio Tools Studio</button>' +
          '</div>';
      } else {
        responseHtml =
          '<div class="sfx-ai-bubble-text">' +
            'Analyzing video intent: Recommended <strong>Deep Impact</strong> followed by <strong>Tension Riser</strong> for maximum drama. Audio ducking is auto-calculated at -4.0 dB.' +
          '</div>' +
          '<div style="display: flex; gap: 6px; margin-top: 8px;">' +
            '<button class="sfx-button" onclick="window.SFX_AUDIO_ENGINE.playSample(window.SFX_AUDIO_CATALOG[1])" style="height: 24px; padding: 0 8px; font-size: 11px;">▶ Audition Deep Impact</button>' +
            '<button class="sfx-button sfx-button--quiet" onclick="window.SFX_PLUGIN_CONTROLLER.insertSoundToSequence(\'impact\')" style="height: 24px; padding: 0 8px; font-size: 11px;">+ Insert to Sequence</button>' +
          '</div>';
      }

      resp.innerHTML = responseHtml;
      list.appendChild(resp);
      list.scrollTop = list.scrollHeight;
    }, 700);
  }

  // ── 7. BROWSER COMPANION ──
  function setupBrowserPanel() {
    var search = document.getElementById('sfx-br-search');
    var list = document.getElementById('sfx-br-downloads-list');

    var resources = [
      { name: 'Trailer Impacts Pack Vol. 4', size: '240 MB', sounds: '128 sounds', format: '24-bit 96kHz' },
      { name: 'Glitch & Cybernetic Whooshes', size: '85 MB', sounds: '64 sounds', format: '24-bit 48kHz' },
      { name: 'Cinematic Risers & Builds Collection', size: '310 MB', sounds: '92 sounds', format: '24-bit 96kHz' },
      { name: 'Foley Everyday Movement Library', size: '520 MB', sounds: '450 sounds', format: '24-bit 48kHz' }
    ];

    function renderResources(items) {
      if (!list) return;
      list.innerHTML = '';
      items.forEach(function (res) {
        var row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.justifyContent = 'space-between';
        row.style.padding = '10px 14px';
        row.style.borderBottom = '1px solid var(--sfx-border)';
        row.innerHTML =
          '<div>' +
            '<strong style="font-size: 12px; display: block;">' + res.name + '</strong>' +
            '<span style="font-size: 10.5px; color: var(--sfx-text-muted);">' + res.sounds + ' • ' + res.size + ' • ' + res.format + '</span>' +
          '</div>' +
          '<button class="sfx-button sfx-br-download-btn" style="height: 26px; font-size: 11px;">Download &amp; Import</button>';

        row.querySelector('.sfx-br-download-btn').addEventListener('click', function () {
          this.textContent = 'Importing…';
          this.disabled = true;
          var self = this;
          setTimeout(function () {
            self.textContent = '✓ In Project';
            self.style.background = 'var(--sfx-positive)';
            showToast('Imported ' + res.name + ' into Premiere Pro project bins!');
          }, 800);
        });

        list.appendChild(row);
      });
    }

    renderResources(resources);

    if (search) {
      search.addEventListener('input', function () {
        var q = this.value.toLowerCase().trim();
        var f = resources.filter(function (r) { return r.name.toLowerCase().includes(q); });
        renderResources(f);
      });
    }
  }

  // ── 8. SCENE SOUND DESIGNER ──
  function setupSceneDesignerPanel() {
    var btn = document.getElementById('sfx-sd-analyze-btn');
    var status = document.getElementById('sfx-sd-status');

    if (btn && status) {
      btn.addEventListener('click', function () {
        status.textContent = 'Scanning active sequence cuts and video marker transitions…';
        status.style.color = 'var(--sfx-accent)';

        setTimeout(function () {
          status.innerHTML =
            '<div style="color: var(--sfx-positive); font-weight: 600; margin-bottom: 8px;">' +
              '✓ 8 video cut transitions detected across 00:00:00:00 - 00:00:30:00' +
            '</div>' +
            '<div style="font-size: 11.5px; color: var(--sfx-text);">' +
              'Placed synchronized whoosh &amp; impact pairs on Track ' + state.activeTrack + ' at cuts: 00:00:02:18, 00:00:05:12, 00:00:09:04.' +
            '</div>';
          insertSoundToSequence('whoosh');
          state.analyticsData.imports += 3;
          updateAnalyticsDisplay();
        }, 900);
      });
    }
  }

  // ── 9. ANALYTICS PANEL ──
  function setupAnalyticsPanel() {
    updateAnalyticsDisplay();
  }

  function renderAnalyticsView() {
    updateAnalyticsDisplay();
  }

  function updateAnalyticsDisplay() {
    var elAud = document.getElementById('an-stat-auditions');
    var elImp = document.getElementById('an-stat-imports');
    var elTl = document.getElementById('an-stat-timelines');

    if (elAud) elAud.textContent = state.analyticsData.auditions;
    if (elImp) elImp.textContent = state.analyticsData.imports;
    if (elTl) elTl.textContent = state.analyticsData.session;
  }

  // ── 10. CUSTOMER DASHBOARD MODAL ──
  function setupCustomerDashboard() {
    var openBtn = document.getElementById('open-customer-dashboard-btn');
    var modal = document.getElementById('customer-dashboard-modal');
    var closeBtn = document.getElementById('cdm-close');
    var backdrop = document.getElementById('cdm-backdrop');

    if (openBtn && modal) {
      openBtn.addEventListener('click', function (e) {
        e.preventDefault();
        modal.classList.add('is-open');
      });
    }
    if (closeBtn && modal) {
      closeBtn.addEventListener('click', function () {
        modal.classList.remove('is-open');
      });
    }
    if (backdrop && modal) {
      backdrop.addEventListener('click', function () {
        modal.classList.remove('is-open');
      });
    }
  }

  // ── 11. HOST SEQUENCE INSERTION (ADOBE CEP BRIDGE) ──
  function insertSoundToSequence(soundId, customTrack) {
    var sound = extendedCatalog.find(function (c) { return c.id === soundId; });
    if (!sound) return;

    var trackSelect = document.getElementById('sfx-track-target');
    var track = customTrack || (trackSelect ? trackSelect.value : state.activeTrack);

    // Play preview audition briefly
    if (engine && engine.playSample) {
      engine.playSample(sound);
    }

    // Animate host status bar indicator
    var statusMuted = document.getElementById('sfx-status-clip-info');
    if (statusMuted) {
      statusMuted.textContent = 'Inserted clip: ' + sound.name + ' (' + sound.duration.toFixed(2) + 's) → Track ' + track;
      statusMuted.style.color = 'var(--sfx-positive)';
      setTimeout(function () {
        statusMuted.textContent = 'Track ' + track + ' Active • Ready to insert';
        statusMuted.style.color = '';
      }, 3500);
    }

    state.analyticsData.imports++;
    updateAnalyticsDisplay();

    showHostToast('✓ Inserted "' + sound.name + '" (' + sound.duration.toFixed(2) + 's) into Premiere Pro sequence: Track ' + track + ' at playhead (00:01:24:08)');
  }

  function showHostToast(msg) {
    var toast = document.getElementById('sfx-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'sfx-toast';
      document.body.appendChild(toast);
    }
    toast.innerHTML =
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--sfx-accent)" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>' +
      '<span>' + msg + '</span>';
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () {
      toast.classList.remove('show');
    }, 4000);
  }

  function showToast(msg) {
    showHostToast(msg);
  }


  // ── 12. BGM FLOW (BACKGROUND MUSIC TRANSITIONS & BEAT SYNC) ──
  function setupBgmFlowPanel() {
    var bgmState = {
      mode: 'start',
      style: 'smooth-fade',
      duration: 2.5,
      volumeDb: 0.0,
      curve: 's-curve',
      autoEq: 'voiceover'
    };

    // Mode tab switching
    var modeBtns = document.querySelectorAll('.sfx-bf__mode-btn');
    modeBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        modeBtns.forEach(function (b) { b.classList.remove('is-active'); });
        this.classList.add('is-active');
        var mode = this.getAttribute('data-bgm-mode');
        bgmState.mode = mode;

        document.querySelectorAll('.bgm-mode-view').forEach(function (v) { v.style.display = 'none'; });
        var view = document.getElementById('bgm-view-' + mode);
        if (view) view.style.display = 'block';

        if (mode === 'beatsync') {
          drawBeatSyncCanvas();
        }
      });
    });

    // Style card selection
    document.querySelectorAll('.sfx-bf__style-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var parentGrid = this.closest('.sfx-bf__styles-grid');
        if (parentGrid) {
          parentGrid.querySelectorAll('.sfx-bf__style-card').forEach(function (c) { c.classList.remove('is-active'); });
        }
        this.classList.add('is-active');
        var style = this.getAttribute('data-style') || this.getAttribute('data-eq');
        if (style) {
          bgmState.style = style;
          var title = this.querySelector('strong') ? this.querySelector('strong').textContent : style;
          showToast('Selected BGM Transition style: ' + title);
        }
      });
    });

    // Sliders
    var durSlider = document.getElementById('bgm-slider-duration');
    var durVal = document.getElementById('bgm-val-duration');
    if (durSlider && durVal) {
      durSlider.addEventListener('input', function () {
        bgmState.duration = parseFloat(this.value);
        durVal.textContent = bgmState.duration.toFixed(1) + 's';
      });
    }

    var volSlider = document.getElementById('bgm-slider-volume');
    var volVal = document.getElementById('bgm-val-volume');
    if (volSlider && volVal) {
      volSlider.addEventListener('input', function () {
        bgmState.volumeDb = parseFloat(this.value);
        volVal.textContent = (bgmState.volumeDb > 0 ? '+' : '') + bgmState.volumeDb.toFixed(1) + ' dB';
      });
    }

    // Curve buttons
    document.querySelectorAll('.sfx-bf__curve-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.sfx-bf__curve-btn').forEach(function (b) { b.classList.remove('is-active'); });
        this.classList.add('is-active');
        bgmState.curve = this.getAttribute('data-curve');
      });
    });

    // Audition Transition (Web Audio API)
    var auditionBtn = document.getElementById('bgm-btn-audition');
    if (auditionBtn) {
      auditionBtn.addEventListener('click', function () {
        state.analyticsData.auditions++;
        updateAnalyticsDisplay();

        if (engine && engine.playSample) {
          var bgmSound = extendedCatalog.find(function (c) { return c.cat === 'Ambience' || c.cat === 'Music'; }) || extendedCatalog[0];
          engine.playSample(bgmSound);
        }

        this.textContent = '▶ Auditioning…';
        var self = this;
        setTimeout(function () {
          self.textContent = '▶ Audition Transition';
        }, 2200);

        showToast('Auditioning ' + bgmState.style + ' transition (' + bgmState.duration + 's, ' + bgmState.curve + ' curve)');
      });
    }

    // Apply to selected clip
    var applyBtn = document.getElementById('bgm-btn-apply');
    if (applyBtn) {
      applyBtn.addEventListener('click', function () {
        state.analyticsData.imports++;
        updateAnalyticsDisplay();
        showHostToast('✓ Applied ' + bgmState.style + ' transition (' + bgmState.duration + 's) to BGM clip on Track A4 in Premiere Pro!');
      });
    }

    // Beat Sync Marker Generation
    var genMarkersBtn = document.getElementById('bgm-btn-gen-markers');
    if (genMarkersBtn) {
      genMarkersBtn.addEventListener('click', function () {
        showHostToast('✓ Generated 32 beat markers on host sequence timeline at 124 BPM!');
      });
    }

    // Beat Canvas Drawing
    function drawBeatSyncCanvas() {
      var canvas = document.getElementById('bgm-beat-canvas');
      if (!canvas) return;
      var ctx = canvas.getContext('2d');
      var w = canvas.width;
      var h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      ctx.fillStyle = '#08080c';
      ctx.fillRect(0, 0, w, h);

      var beats = 16;
      var beatW = w / beats;
      for (var b = 0; b <= beats; b++) {
        var isBar = b % 4 === 0;
        ctx.strokeStyle = isBar ? '#60a5fa' : '#272730';
        ctx.lineWidth = isBar ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(b * beatW, 0);
        ctx.lineTo(b * beatW, h);
        ctx.stroke();

        if (isBar && b < beats) {
          ctx.fillStyle = '#60a5fa';
          ctx.font = '9px monospace';
          ctx.fillText('BAR ' + (Math.floor(b / 4) + 1), b * beatW + 4, 12);
        }
      }

      ctx.fillStyle = 'rgba(59, 130, 246, 0.45)';
      for (var x = 0; x < w; x++) {
        var normX = x / beatW;
        var beatDist = Math.abs(normX - Math.round(normX));
        var transient = Math.exp(-beatDist * 18) * 0.7;
        var noise = (Math.sin(x * 0.1) + Math.cos(x * 0.05)) * 0.15;
        var amp = Math.min(1, Math.max(0.1, transient + noise + 0.15));
        var barH = amp * (h - 24);
        var barY = (h - barH) / 2;
        ctx.fillRect(x, barY, 1, barH);
      }
    }
  }

  // ── 13. DUAL HOST SWITCHER (PREMIERE PRO & AFTER EFFECTS) ──
  function setupDualHostSwitcher() {
    var btnPpro = document.getElementById('btn-host-ppro');
    var btnAe = document.getElementById('btn-host-ae');
    var envPill = document.getElementById('sfx-host-env-pill');
    var hostStatusText = document.getElementById('sfx-status-host-text');
    var timecodeEl = document.getElementById('sfx-status-timecode');
    var trackSelect = document.getElementById('sfx-track-target');

    if (btnPpro && btnAe) {
      btnPpro.addEventListener('click', function () {
        btnPpro.classList.add('is-active');
        btnAe.classList.remove('is-active');
        state.activeHost = 'ppro';
        if (envPill) envPill.textContent = '● Sequence: angela bathroom • Playhead: 01:19:496 @ 23.976 fps';
        if (hostStatusText) hostStatusText.textContent = 'Connected: Premiere Pro 2024 (v24.2) • Sequence: angela bathroom';
        if (timecodeEl) timecodeEl.textContent = 'Sequence Playhead: 01:19:496 @ 23.976 fps';

        if (trackSelect) {
          trackSelect.innerHTML =
            '<option value="A1">Track A1</option>' +
            '<option value="A2">Track A2</option>' +
            '<option value="A3">Track A3</option>' +
            '<option value="A4">Track A4</option>' +
            '<option value="BGM">BGM Track</option>';
          state.activeTrack = 'A1';
          updateTrackLabels();
        }

        showHostToast('Connected to Adobe Premiere Pro CC 2024 • Active Sequence: angela bathroom');
      });

      btnAe.addEventListener('click', function () {
        btnAe.classList.add('is-active');
        btnPpro.classList.remove('is-active');
        state.activeHost = 'ae';
        if (envPill) envPill.textContent = '● Comp: Motion_Graphics_Main_Comp • Playhead: 00:04:12 @ 60.000 fps';
        if (hostStatusText) hostStatusText.textContent = 'Connected: After Effects CC 2024 (v24.2) • Comp: Motion_Graphics_Main_Comp';
        if (timecodeEl) timecodeEl.textContent = 'Comp Playhead: 00:04:12 @ 60.000 fps';

        if (trackSelect) {
          trackSelect.innerHTML =
            '<option value="Layer 1">Layer 1 [Audio]</option>' +
            '<option value="Layer 2">Layer 2 [Audio]</option>' +
            '<option value="Layer 3">Layer 3 [Audio]</option>';
          state.activeTrack = 'Layer 1';
          updateTrackLabels();
        }

        showHostToast('Connected to Adobe After Effects CC 2024 • Active Comp: Motion_Graphics_Main_Comp');
      });
    }
  }

  // ── 14. SETTINGS & PREFERENCES DRAWER ──
  function setupSettingsDrawer() {
    var profileBtn = document.getElementById('sfx-btn-profile');
    var drawer = document.getElementById('sfx-settings-drawer');
    var closeBtn = document.getElementById('btn-close-settings');

    if (profileBtn && drawer) {
      profileBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        drawer.classList.add('is-open');
      });
    }
    if (closeBtn && drawer) {
      closeBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        drawer.classList.remove('is-open');
      });
    }
  }

  // ── 15. MODULE SHOWCASE & TOUR CONTROLLER ──
  function setupModuleShowcaseTour() {
    var btnViewLive = document.getElementById('btn-view-live');
    var btnViewTour = document.getElementById('btn-view-tour');
    var liveContainer = document.getElementById('sfx-live-container');
    var tourContainer = document.getElementById('sfx-tour-container');

    function setView(view) {
      if (view === 'live') {
        if (btnViewLive) btnViewLive.classList.add('is-active');
        if (btnViewTour) btnViewTour.classList.remove('is-active');
        if (liveContainer) liveContainer.style.display = 'flex';
        if (tourContainer) tourContainer.classList.remove('is-visible');
      } else {
        if (btnViewTour) btnViewTour.classList.add('is-active');
        if (btnViewLive) btnViewLive.classList.remove('is-active');
        if (liveContainer) liveContainer.style.display = 'none';
        if (tourContainer) tourContainer.classList.add('is-visible');
      }
    }

    if (btnViewLive) {
      btnViewLive.addEventListener('click', function () { setView('live'); });
    }
    if (btnViewTour) {
      btnViewTour.addEventListener('click', function () { setView('tour'); });
    }

    // Quick module jump chips
    var chips = document.querySelectorAll('.sfx-demo-chip');
    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        chips.forEach(function (c) { c.classList.remove('is-active'); });
        this.classList.add('is-active');
        var mod = this.getAttribute('data-module');

        if (mod === 'library') {
          setView('live');
          closeCurrentToolOverlay();
        } else if (mod === 'host') {
          setView('live');
          var pproBtn = document.getElementById('btn-host-ppro');
          if (pproBtn) pproBtn.click();
        } else {
          setView('live');
          toggleToolOverlay(mod);
        }

        switchTourTab(mod);
      });
    });

    // Tour slide switcher
    function switchTourTab(target) {
      var tabs = document.querySelectorAll('.sfx-tour-tab');
      tabs.forEach(function (t) {
        if (t.getAttribute('data-tour') === target) {
          t.classList.add('is-active');
        } else {
          t.classList.remove('is-active');
        }
      });
      document.querySelectorAll('.sfx-tour-slide').forEach(function (s) { s.classList.remove('is-active'); });
      var slide = document.getElementById('tour-slide-' + target);
      if (slide) slide.classList.add('is-active');
    }

    document.querySelectorAll('.sfx-tour-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        var target = this.getAttribute('data-tour');
        switchTourTab(target);
      });
    });

    document.querySelectorAll('.sfx-jump-to-live').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = this.getAttribute('data-target');
        setView('live');
        if (target === 'library') {
          closeCurrentToolOverlay();
        } else {
          toggleToolOverlay(target);
        }
      });
    });

    // Reset button in trim tray
    var resetBtn = document.getElementById('sfx-trim-reset-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        if (state.activeSound) {
          updateTrimTray(state.activeSound);
          showToast('Reset trim boundaries to full sample length.');
        }
      });
    }

    // Draw analytics chart
    drawAnalyticsChart();
  }

  function drawAnalyticsChart() {
    var canvas = document.getElementById('an-chart-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var w = canvas.width;
    var h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = '#181822';
    ctx.lineWidth = 1;
    for (var y = 0; y < h; y += 25) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    var previewsData = [2, 3, 2, 4, 3, 5, 4, 7, 6, 8, 12, 18, 23];
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    var step = w / (previewsData.length - 1);
    previewsData.forEach(function (val, idx) {
      var x = idx * step;
      var y = h - (val / 25) * (h - 20) - 10;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    var importsData = [0, 1, 1, 1, 2, 2, 3, 3, 4, 6, 9, 11, 14];
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    importsData.forEach(function (val, idx) {
      var x = idx * step;
      var y = h - (val / 25) * (h - 20) - 10;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  // Expose API
  
  // ── GALLERY SHOWCASE & LIGHTBOX CONTROLLER ──
  function setupGalleryLightbox() {
    const GALLERY_ITEMS = [
      {
        id: 1,
        src: 'assets/images/sfx-overview-main.png',
        badge: 'Screenshot 01 · Main Workspace',
        title: 'Main Production Interface & Waveform Trimmer',
        desc: 'Primary desktop interface showcasing the 17,111-sound categorized folder tree (Button, Foley, Glitch, Human, Impact, Transitions, etc.), sub-millisecond search bar, waveform preview list, and the docked bottom audio trimmer with draggable In/Out markers (0.000s to 4.431s) and direct "Add to timeline" insertion.'
      },
      {
        id: 2,
        src: 'assets/images/sfx-browser-pixabay.png',
        badge: 'Screenshot 02 · Built-in Browser',
        title: 'Built-in Browser & Royalty-Free SFX Search',
        desc: 'Docked in-panel browser navigating over 130,000+ royalty-free sounds from Pixabay. Search by keyword or quick tags (whoosh, riser, pop, click, swoosh, glitch) with inline audio waveforms.'
      },
      {
        id: 3,
        src: 'assets/images/sfx-browser-downloads.png',
        badge: 'Screenshot 03 · Downloads Manager',
        title: 'Downloads Manager & Automated Timeline Placement',
        desc: 'Download history tracking completed audio assets with one-click "Import to Active Timeline" (e.g. placed on track A4 at 0:57.77 in "angela bathroom"), file reveals, and clean storage management.'
      },
      {
        id: 4,
        src: 'assets/images/sfx-browser-import.png',
        badge: 'Screenshot 04 · Audio Importer',
        title: 'Multi-Format Audio File Importer',
        desc: 'Native file dialog ingestion supporting WAV, MP3, AIFF, M4A, AAC, and FLAC formats with recent downloads queue, audition previews, and background caching into local sound libraries.'
      },
      {
        id: 5,
        src: 'assets/images/sfx-ai-assistant.png',
        badge: 'Screenshot 05 · AI SFX Assistant',
        title: 'Intelligent AI Sound Recommendations (Ollama)',
        desc: 'Real-time chat interface showing the query "Find the perfect cinematic impact sound". The AI assistant analyzes local library metadata and recommends top matching audio clips complete with interactive "▶ Preview" and "+ Place" buttons.'
      },
      {
        id: 6,
        src: 'assets/images/sfx-bgm-flow-transitions.png',
        badge: 'Screenshot 06 · BGM Flow',
        title: 'BGM Flow Transitions & Parameter Controls',
        desc: 'Interface showing Music Start presets with 5 available styles (Smooth Fade In, Cinematic Rise, Beat Entry, Soft Intro, Volume Ramp). Transition parameters include real-time sliders for Fade Duration (2.5s), Target Volume (0.0 dB), and mathematical curve selection between S-curve, Exponential, Linear, and Logarithmic.'
      },
      {
        id: 7,
        src: 'assets/images/sfx-analytics-dashboard.png',
        badge: 'Screenshot 07 · Usage Analytics',
        title: 'Dedicated Workflow Analytics & Activity Overview',
        desc: 'Dedicated analytics dashboard featuring key metric cards: Total Sounds Played (23), Timeline Imports (1), Most Used Category ("downloads"), and Unique Sounds Used (13). Displays interactive Activity Overview curve graph and "Most Used Sounds" ranking with play counts, import history, and quick preview controls.'
      },
      {
        id: 8,
        src: 'assets/images/sfx-scene-ai-timeline.png',
        badge: 'Screenshot 08 · Scene AI',
        title: 'Scene AI Sequence Designer & Timeline Control',
        desc: 'Scene AI main interface displaying live host status badges for Adobe Host (PPro/AE) and Ollama local AI server. Features "Analyze Composition" trigger and the AI Timeline Control prompt bar with verified operations and write-operation safety approvals.'
      },
      {
        id: 9,
        src: 'assets/images/sfx-audio-tools-essential-sound.png',
        badge: 'Screenshot 09 · Essential Sound Studio',
        title: '3-Column Workstation & Essential Sound DSP Rack',
        desc: 'Pro-grade workstation layout: Left sound browser filtering categories, Center high-resolution waveform editor (with 0:00.00 / 0:02.67 timecode, 48000 Hz, 2 ch display), and Right Essential Sound DSP rack with Peak (-2.4 dB) and RMS (-23.0 dB) meters, Gain/Normalize, Fades, EQ, Dynamics Compress, and Character controls.'
      },
      {
        id: 10,
        src: 'assets/images/sfx-settings-workspace.png',
        badge: 'Screenshot 10 · Workspace Preferences',
        title: 'Profile, Accent Colors, Library Folders & Appearance',
        desc: 'Full settings view displaying User Profile with picture upload, 6 accent color swatches, Library Folders management with folder rescan (17,111 sounds indexed), Appearance themes selector (Studio Dark, Ultra Dark, Light), Playback preview volume slider (80%), License verification ("All features are unlocked"), Diagnostics logging, and About credits.'
      }
    ];

    let currentLightboxIdx = 0;
    const modal = document.getElementById('sfx-lightbox-modal');
    const imgEl = document.getElementById('sfx-lightbox-img');
    const counterEl = document.getElementById('sfx-lightbox-counter');
    const titleEl = document.getElementById('sfx-lightbox-title');
    const descEl = document.getElementById('sfx-lightbox-desc');
    const closeBtn = document.getElementById('sfx-lightbox-close');
    const prevBtn = document.getElementById('sfx-lightbox-prev');
    const nextBtn = document.getElementById('sfx-lightbox-next');

    if (!modal) return;

    function renderLightbox(idx) {
      currentLightboxIdx = ((idx % GALLERY_ITEMS.length) + GALLERY_ITEMS.length) % GALLERY_ITEMS.length;
      const item = GALLERY_ITEMS[currentLightboxIdx];
      if (!item) return;

      imgEl.src = item.src;
      imgEl.alt = item.title;
      counterEl.textContent = 'Screenshot ' + (currentLightboxIdx + 1) + ' of ' + GALLERY_ITEMS.length;
      titleEl.textContent = item.title;
      descEl.textContent = item.desc;
    }

    function openLightbox(idx) {
      renderLightbox(idx);
      modal.classList.add('is-open');
      document.body.style.overflow = 'hidden';
    }

    function closeLightbox() {
      modal.classList.remove('is-open');
      document.body.style.overflow = '';
    }

    function nextImage() {
      renderLightbox(currentLightboxIdx + 1);
    }

    function prevImage() {
      renderLightbox(currentLightboxIdx - 1);
    }

    // Attach click triggers to cards
    document.querySelectorAll('.sfx-screenshot-card[data-lightbox-idx]').forEach(card => {
      const idx = parseInt(card.getAttribute('data-lightbox-idx'), 10);
      card.addEventListener('click', (e) => {
        openLightbox(idx);
      });
    });

    if (closeBtn) closeBtn.addEventListener('click', closeLightbox);
    if (prevBtn) prevBtn.addEventListener('click', (e) => { e.stopPropagation(); prevImage(); });
    if (nextBtn) nextBtn.addEventListener('click', (e) => { e.stopPropagation(); nextImage(); });

    // Click outside dialog to close
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.classList.contains('sfx-lightbox-stage')) {
        closeLightbox();
      }
    });

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (!modal.classList.contains('is-open')) return;
      if (e.key === 'Escape') {
        closeLightbox();
      } else if (e.key === 'ArrowRight') {
        nextImage();
      } else if (e.key === 'ArrowLeft') {
        prevImage();
      }
    });

    // Gallery sticky subnav scroll-spy & smooth scroll
    const navLinks = document.querySelectorAll('.sfx-gallery-nav-link');
    const sections = Array.from(navLinks).map(link => {
      const targetId = link.getAttribute('href');
      return targetId ? document.querySelector(targetId) : null;
    }).filter(Boolean);

    window.addEventListener('scroll', () => {
      const scrollPos = window.scrollY + 180;
      let activeIndex = 0;
      sections.forEach((sec, idx) => {
        if (sec.offsetTop <= scrollPos) {
          activeIndex = idx;
        }
      });
      navLinks.forEach((link, idx) => {
        if (idx === activeIndex) {
          link.classList.add('is-active');
        } else {
          link.classList.remove('is-active');
        }
      });
    }, { passive: true });

    // Interactive simulator drawer toggle
    const toggleSimBtn = document.getElementById('btn-toggle-live-simulator');
    const simDrawer = document.getElementById('sfx-interactive-sim-drawer');
    const simText = document.getElementById('simulator-toggle-text');

    if (toggleSimBtn && simDrawer) {
      toggleSimBtn.addEventListener('click', () => {
        const isHidden = window.getComputedStyle(simDrawer).display === 'none';
        if (isHidden) {
          simDrawer.style.display = 'block';
          if (simText) simText.textContent = 'Hide Live Simulator';
          simDrawer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
          simDrawer.style.display = 'none';
          if (simText) simText.textContent = 'Interactive Live App';
        }
      });
    }
  }


  window.SFX_PLUGIN_CONTROLLER = {
    state: state,
    toggleToolOverlay: toggleToolOverlay,
    closeCurrentToolOverlay: closeCurrentToolOverlay,
    loadAudioIntoTools: loadAudioIntoTools,
    insertSoundToSequence: insertSoundToSequence,
    showToast: showToast
  };

})();
