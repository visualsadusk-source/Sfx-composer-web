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
  
  var whooshCatalog = [
    { id: 'w1', name: '_Whoosh 1', cat: 'SFX', subcat: 'SFX monster/Whoosh', duration: 9.1 },
    { id: 'w2', name: '_Whoosh 2', cat: 'SFX', subcat: 'SFX monster/Whoosh', duration: 7.3 },
    { id: 'w3', name: '_Whoosh 3', cat: 'SFX', subcat: 'SFX monster/Whoosh', duration: 4.6 },
    { id: 'w4', name: '_Whoosh 4', cat: 'SFX', subcat: 'SFX monster/Whoosh', duration: 0.5 },
    { id: 'w5', name: '_Whoosh 5', cat: 'SFX', subcat: 'SFX monster/Whoosh', duration: 0.5 },
    { id: 'w6', name: '_Whoosh 6', cat: 'SFX', subcat: 'SFX monster/Whoosh', duration: 0.7 },
    { id: 'w7', name: '_Whoosh 7', cat: 'SFX', subcat: 'SFX monster/Whoosh', duration: 6.0 },
    { id: 'w8', name: '_Whoosh 8', cat: 'SFX', subcat: 'SFX monster/Whoosh', duration: 6.8 },
    { id: 'w9', name: '_Whoosh 9', cat: 'SFX', subcat: 'SFX monster/Whoosh', duration: 4.0 },
    { id: 'w10', name: '_Whoosh 10', cat: 'SFX', subcat: 'SFX monster/Whoosh', duration: 8.0 },
    { id: 'w11', name: '_Whoosh 11', cat: 'SFX', subcat: 'SFX monster/Whoosh', duration: 5.1 },
    { id: 'w12', name: '_Whoosh 12', cat: 'SFX', subcat: 'SFX monster/Whoosh', duration: 6.9 },
    { id: 'w13', name: '_Whoosh 13', cat: 'SFX', subcat: 'SFX monster/Whoosh', duration: 5.0 },
    { id: 'w14', name: '_Whoosh 14', cat: 'SFX', subcat: 'SFX monster/Whoosh', duration: 5.1 },
    { id: 'w15', name: '_Whoosh 15', cat: 'SFX', subcat: 'SFX monster/Whoosh', duration: 3.7 },
    { id: 'w16', name: '_Whoosh 16', cat: 'SFX', subcat: 'SFX monster/Whoosh', duration: 2.1 },
    { id: 'w17', name: '_Whoosh 17', cat: 'SFX', subcat: 'SFX monster/Whoosh', duration: 5.9 },
    { id: 'w18', name: '_Whoosh 18', cat: 'SFX', subcat: 'SFX monster/Whoosh', duration: 1.0 }
  ];

  var defaultWhoosh20 = {
    id: 'w20',
    name: '_Whoosh 20',
    cat: 'SFX', subcat: 'SFX monster/Whoosh',
    duration: 4.431
  };
var extendedCatalog = whooshCatalog;

  var state = {
    activeSound: defaultWhoosh20,
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

  // ── 1. HEADER MENU TOOLBAR OVERLAYS & EMBEDDED NAVIGATION ──
  function setupHeaderMenu() {
    var menu = document.getElementById('sfx-header-menu');
    if (menu) {
      var buttons = menu.querySelectorAll('.sfx-hm__btn');
      buttons.forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var tool = this.getAttribute('data-tool');
          toggleToolOverlay(tool);
        });
      });
    }

    // Universal back button listener (delegated for 100% click reliability)
    document.addEventListener('click', function (e) {
      var backBtn = e.target.closest('.sfx-tool-back-btn, #sfx-ai-back-btn, #btn-back-settings, #btn-close-settings, .sfx-au__back, .sfx-sd__back, .sfx-an__back');
      if (backBtn) {
        e.preventDefault();
        e.stopPropagation();
        closeCurrentToolOverlay();
      }
    });

    // Clicking SFX Composer header title or mark returns to main library
    var shellTitle = document.querySelector('.sfx-shell__title');
    var shellMark = document.querySelector('.sfx-shell__mark');
    if (shellTitle) {
      shellTitle.style.cursor = 'pointer';
      shellTitle.setAttribute('title', 'Return to Main SFX Library');
      shellTitle.addEventListener('click', function () {
        closeCurrentToolOverlay();
      });
    }
    if (shellMark) {
      shellMark.style.cursor = 'pointer';
      shellMark.setAttribute('title', 'Return to Main SFX Library');
      shellMark.addEventListener('click', function () {
        closeCurrentToolOverlay();
      });
    }

    setupHistoryNavigation();
  }

  function setupHistoryNavigation() {
    window.addEventListener('popstate', function (event) {
      if (event.state && event.state.sfxOverlay) {
        toggleToolOverlay(event.state.sfxOverlay, true);
      } else if (window.location.hash && window.location.hash.indexOf('#demo-') === 0) {
        var tool = window.location.hash.replace('#demo-', '');
        toggleToolOverlay(tool, true);
      } else {
        closeCurrentToolOverlay(true);
      }
    });

    // Check initial hash on page load
    if (window.location.hash && window.location.hash.indexOf('#demo-') === 0) {
      var initialTool = window.location.hash.replace('#demo-', '');
      toggleToolOverlay(initialTool, true);
    }
  }

  function toggleToolOverlay(toolId, isPopState) {
    var tools = {
      browser: document.getElementById('sfx-browser'),
      ai: document.getElementById('sfx-ai-assistant'),
      bgm: document.getElementById('sfx-bgm-flow'),
      analytics: document.getElementById('sfx-analytics'),
      scene: document.getElementById('sfx-scene-designer'),
      audio: document.getElementById('sfx-audio-tools'),
      settings: document.getElementById('sfx-settings-drawer')
    };

    if (state.currentTool === toolId) {
      // Toggle off -> returns to main library
      closeCurrentToolOverlay();
      return;
    }

    // Close all first
    Object.keys(tools).forEach(function (key) {
      if (tools[key]) tools[key].classList.remove('is-open');
    });

    document.querySelectorAll('.sfx-hm__btn').forEach(function (btn) {
      btn.setAttribute('aria-pressed', 'false');
      btn.classList.remove('is-active');
    });

    // Open target
    if (tools[toolId]) {
      tools[toolId].classList.add('is-open');
      state.currentTool = toolId;

      var activeBtn = document.querySelector('.sfx-hm__btn[data-tool="' + toolId + '"]');
      if (activeBtn) {
        activeBtn.setAttribute('aria-pressed', 'true');
        activeBtn.classList.add('is-active');
      }

      // Sync top showcase chips
      var chips = document.querySelectorAll('.sfx-demo-chip');
      chips.forEach(function (c) {
        if (c.getAttribute('data-module') === toolId) {
          c.classList.add('is-active');
        } else {
          c.classList.remove('is-active');
        }
      });

      // Push history state if not from popstate
      if (!isPopState && window.history && window.history.pushState) {
        try {
          window.history.pushState({ sfxOverlay: toolId }, '', '#demo-' + toolId);
        } catch (err) {}
      }

      if (toolId === 'ai') {
        var aiInput = document.getElementById('sfx-ai-textarea');
        if (aiInput) {
          setTimeout(function () {
            try { aiInput.focus(); } catch (err) {}
          }, 60);
        }
      }
      if (toolId === 'bgm') {
        if (window.SFX_DRAW_AUTO_EQ) {
          window.SFX_DRAW_AUTO_EQ();
        }
      }
      if (toolId === 'audio' && state.activeSound) {
        loadAudioIntoTools(state.activeSound);
      }
      if (toolId === 'analytics') {
        renderAnalyticsView();
      }
    }
  }

  function closeCurrentToolOverlay(isPopState) {
    var tools = ['sfx-browser', 'sfx-ai-assistant', 'sfx-bgm-flow', 'sfx-analytics', 'sfx-scene-designer', 'sfx-audio-tools', 'sfx-settings-drawer'];
    tools.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.remove('is-open');
    });
    document.querySelectorAll('.sfx-hm__btn').forEach(function (btn) {
      btn.setAttribute('aria-pressed', 'false');
      btn.classList.remove('is-active');
    });
    state.currentTool = null;

    // Sync showcase chips back to library
    var chips = document.querySelectorAll('.sfx-demo-chip');
    chips.forEach(function (c) {
      if (c.getAttribute('data-module') === 'library') {
        c.classList.add('is-active');
      } else {
        c.classList.remove('is-active');
      }
    });

    // Clean hash if was #demo-...
    if (!isPopState && window.location.hash && window.location.hash.indexOf('#demo-') === 0) {
      if (window.history && window.history.pushState) {
        try {
          var cleanUrl = window.location.pathname + window.location.search;
          window.history.pushState({ sfxOverlay: null }, '', cleanUrl);
        } catch (err) {}
      } else {
        window.location.hash = '';
      }
    }

    // Preserve active sound and trim tray state
    if (state.activeSound) {
      updateTrimTray(state.activeSound);
    }
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
    var container = document.getElementById('sfx-sound-rows') || document.getElementById('sfx-vlist-container');
    if (!container) return;

    var sounds = whooshCatalog;
    var query = state.searchQuery ? state.searchQuery.toLowerCase() : '';
    if (query) {
      sounds = whooshCatalog.filter(function (s) {
        return s.name.toLowerCase().includes(query) || s.subcat.toLowerCase().includes(query);
      });
    }

    container.innerHTML = '';
    sounds.forEach(function (sound) {
      var row = document.createElement('div');
      var isSelected = state.activeSound && state.activeSound.name === sound.name;
      var isFav = !!state.favorites[sound.id];

      row.className = 'sfx-row' + (isSelected ? ' sfx-row--selected' : '');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.padding = '5px 12px';
      row.style.borderBottom = '1px solid #141416';
      row.style.cursor = 'pointer';
      row.style.background = isSelected ? '#121e33' : 'transparent';
      row.style.userSelect = 'none';

      row.innerHTML =
        '<button type="button" class="sfx-star" data-id="' + sound.id + '" style="background: none; border: none; color: ' + (isFav ? '#ffd60a' : '#5e5e64') + '; font-size: 11px; cursor: pointer; padding: 0 4px 0 0;">' +
          (isFav ? '★' : '☆') +
        '</button>' +

        '<button type="button" class="sfx-iconbutton sfx-row-play-btn" data-id="' + sound.id + '" style="background: #18181c; border: 1px solid #28282c; border-radius: 50%; width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center; color: #fff; font-size: 8px; cursor: pointer; margin-right: 8px;">' +
          '▶' +
        '</button>' +

        '<div class="sfx-row__main" style="flex: 1; min-width: 0;">' +
          '<div class="sfx-row__name" style="font-size: 11.5px; font-weight: 600; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + sound.name + '</div>' +
          '<div class="sfx-row__meta" style="font-size: 10px; color: #707076; margin-top: 1px;">' + sound.subcat + '</div>' +
        '</div>' +

        '<div class="sfx-row__wave" style="width: 140px; margin: 0 16px; flex-shrink: 0;">' +
          '<canvas class="sfx-row-wave-canvas" width="140" height="18" data-id="' + sound.id + '" style="display: block; width: 140px; height: 18px;"></canvas>' +
        '</div>' +

        '<div class="sfx-row__duration" style="font-family: var(--sfx-font-mono); font-size: 11px; color: #8e8e93; min-width: 34px; text-align: right; flex-shrink: 0;">' + sound.duration.toFixed(1) + 's</div>' +

        '<button type="button" class="sfx-iconbutton sfx-btn-row-trim" data-id="' + sound.id + '" title="Trim" style="background: none; border: none; color: #707076; cursor: pointer; padding: 2px 6px; margin-left: 8px; font-size: 12px;">' +
          '✂' +
        '</button>';

      container.appendChild(row);

      // Draw authentic waveform
      var cvs = row.querySelector('.sfx-row-wave-canvas');
      if (cvs) {
        var ctx = cvs.getContext('2d');
        var w = cvs.width;
        var h = cvs.height;
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#93c5fd';
        var bars = 35;
        var barW = w / bars;
        for (var i = 0; i < bars; i++) {
          var p = i / bars;
          var env = Math.sin(p * Math.PI) * (0.3 + 0.7 * Math.sin(i * 1.7));
          var barH = Math.max(2, env * (h - 2));
          var y = (h - barH) / 2;
          ctx.fillRect(i * barW + 1, y, barW - 1.5, barH);
        }
      }

      // Click row loads into docked trimmer tray
      row.addEventListener('click', function (e) {
        if (e.target.closest('button')) return;
        state.activeSound = sound;
        updateTrimTray(sound);
        renderSoundRows();
      });
    });

    // Star favorite toggle
    container.querySelectorAll('.sfx-star').forEach(function (star) {
      star.addEventListener('click', function (e) {
        e.stopPropagation();
        var id = this.getAttribute('data-id');
        state.favorites[id] = !state.favorites[id];
        renderSoundRows();
      });
    });
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
          if (tray) { tray.style.display = 'flex'; tray.style.flexDirection = 'column'; }
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

    if (nameEl) nameEl.textContent = sound.name || '_Whoosh 20';
    if (lenEl) lenEl.textContent = sound.duration.toFixed(2) + 's';
    if (readout) { var dur = (sound.duration || 4.431).toFixed(3); readout.innerHTML = 'In <span style="color: #fff;">0.000s</span> · Out <span style="color: #fff;">' + dur + 's</span> · Length <span style="color: #0a84ff; font-weight: 600;">' + dur + 's</span>'; }

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
        if (!atState.sound) {
          showToast('Select an audio sound first');
          return;
        }

        function applyNormalization(buf) {
          var peak = engine.measurePeak(buf, atState.trimStart, atState.trimEnd);
          if (peak < 1e-6) {
            showToast('Audio is silent or empty; cannot normalize.');
            return;
          }

          var targetDb = -1.0;
          var currentPeakDb = 20 * Math.log10(peak);
          var neededGainDb = targetDb - currentPeakDb;
          neededGainDb = Math.round(neededGainDb * 10) / 10;
          neededGainDb = Math.max(-24, Math.min(24, neededGainDb));

          atState.gainDb = neededGainDb;

          var gainSlider = document.getElementById('at-ctrl-gain');
          var gainVal = document.getElementById('at-val-gain');
          if (gainSlider) gainSlider.value = neededGainDb;
          if (gainVal) gainVal.textContent = (neededGainDb > 0 ? '+' : '') + neededGainDb.toFixed(1) + ' dB';

          var newPeakDb = Math.min(0, currentPeakDb + neededGainDb);
          var rms = engine.measureRms ? engine.measureRms(buf, atState.trimStart, atState.trimEnd) : 0;
          var newRmsDb = rms > 1e-6 ? ((20 * Math.log10(rms)) + neededGainDb).toFixed(1) + ' dB' : '-∞ dB';

          var peakEl = document.getElementById('at-peak-val');
          var rmsEl = document.getElementById('at-rms-val');
          if (peakEl) peakEl.textContent = newPeakDb.toFixed(1) + ' dB';
          if (rmsEl) rmsEl.textContent = newRmsDb;

          renderAtWaveform();
          showToast('Normalized to ' + targetDb.toFixed(1) + ' dBFS (Gain: ' + (neededGainDb > 0 ? '+' : '') + neededGainDb.toFixed(1) + ' dB)');
        }

        if (atState.sound.buffer) {
          applyNormalization(atState.sound.buffer);
        } else if (engine && engine.loadSound && sound && sound.url) {
          showToast('Analyzing audio buffer...');
          engine.loadSound(atState.sound).then(function (buf) {
            atState.sound.buffer = buf;
            applyNormalization(buf);
          }).catch(function (err) {
            showToast('Normalization failed: ' + (err.message || 'audio load error'));
          });
        }
      });
    }

    // Open Custom Audio File Handler
    var openFileBtn = document.getElementById('at-open-file-btn');
    var fileInput = document.getElementById('at-file-input');

    if (openFileBtn && fileInput) {
      openFileBtn.addEventListener('click', function (e) {
        e.preventDefault();
        fileInput.click();
      });

      fileInput.addEventListener('change', function (e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;

        showToast('Decoding ' + file.name + '...');
        if (engine && engine.decodeAudioFile) {
          engine.decodeAudioFile(file).then(function (buffer) {
            var customSound = {
              id: 'audio-custom-' + Date.now(),
              name: file.name.replace(/\.[^/.]+$/, ''),
              file: file.name,
              cat: 'Custom',
              duration: buffer.duration,
              sampleRate: buffer.sampleRate,
              channels: buffer.numberOfChannels,
              buffer: buffer
            };
            extendedCatalog.unshift(customSound);
            renderAtLibList();
            loadAudioIntoTools(customSound);
            showToast('Loaded ' + customSound.name + ' (' + buffer.duration.toFixed(2) + 's, ' + buffer.numberOfChannels + 'ch)');
          }).catch(function (err) {
            showToast('Failed to decode audio: ' + (err.message || 'Unsupported or corrupted format'));
          });
        }
        fileInput.value = '';
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

        if (atState.sound && atState.sound.buffer && engine) {
          var pk = engine.measurePeak(atState.sound.buffer, atState.trimStart, atState.trimEnd);
          if (pk > 1e-6) {
            var curPkDb = Math.min(0, 20 * Math.log10(pk) + atState.gainDb);
            var peakEl = document.getElementById('at-peak-val');
            if (peakEl) peakEl.textContent = curPkDb.toFixed(1) + ' dB';
          }
          var rms = engine.measureRms ? engine.measureRms(atState.sound.buffer, atState.trimStart, atState.trimEnd) : 0;
          if (rms > 1e-6) {
            var curRmsDb = (20 * Math.log10(rms)) + atState.gainDb;
            var rmsEl = document.getElementById('at-rms-val');
            if (rmsEl) rmsEl.textContent = curRmsDb.toFixed(1) + ' dB';
          }
        }
        renderAtWaveform();
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
        if (atState.sound && atState.sound.buffer && engine) {
          var pk = engine.measurePeak(atState.sound.buffer, atState.trimStart, atState.trimEnd);
          if (pk > 1e-6) {
            var curPkDb = Math.min(0, 20 * Math.log10(pk) + atState.gainDb);
            var peakEl = document.getElementById('at-peak-val');
            if (peakEl) peakEl.textContent = curPkDb.toFixed(1) + ' dB';
          }
        }
        renderAtWaveform();
      });
    }

    if (trimEnd) {
      trimEnd.addEventListener('input', function () {
        atState.trimEnd = parseFloat(this.value);
        if (atState.sound && atState.sound.buffer && engine) {
          var pk = engine.measurePeak(atState.sound.buffer, atState.trimStart, atState.trimEnd);
          if (pk > 1e-6) {
            var curPkDb = Math.min(0, 20 * Math.log10(pk) + atState.gainDb);
            var peakEl = document.getElementById('at-peak-val');
            if (peakEl) peakEl.textContent = curPkDb.toFixed(1) + ' dB';
          }
        }
        renderAtWaveform();
      });
    }
  }

  function loadAudioIntoTools(sound) {
    atState.sound = sound;
    atState.trimStart = 0;
    atState.trimEnd = sound.duration;
    atState.gainDb = 0;

    var nameEl = document.getElementById('at-active-sound-name');
    var timecodeEl = document.getElementById('at-center-timecode');
    var startRange = document.getElementById('at-trim-start-range');
    var endRange = document.getElementById('at-trim-end-range');
    var gainSlider = document.getElementById('at-ctrl-gain');
    var gainVal = document.getElementById('at-val-gain');

    if (gainSlider) gainSlider.value = 0;
    if (gainVal) gainVal.textContent = '0.0 dB';

    if (nameEl) nameEl.textContent = sound.name + ' (' + sound.duration.toFixed(2) + 's)';
    if (timecodeEl) timecodeEl.textContent = '00:00:00:00 / 00:00:' + sound.duration.toFixed(2).replace('.', ':');

    if (startRange) { startRange.max = sound.duration; startRange.value = 0; }
    if (endRange) { endRange.max = sound.duration; endRange.value = sound.duration; }

    renderAtWaveform();
    renderAtLibList();

    if (engine && engine.loadSound) {
      engine.loadSound(sound).then(function (buf) {
        if (!buf) return;
        sound.buffer = buf;
        var pk = engine.measurePeak(buf, atState.trimStart, atState.trimEnd);
        var pkDb = pk > 1e-6 ? (20 * Math.log10(pk)).toFixed(1) + ' dB' : '-∞ dB';
        var rms = engine.measureRms ? engine.measureRms(buf, atState.trimStart, atState.trimEnd) : 0;
        var rmsDb = rms > 1e-6 ? (20 * Math.log10(rms)).toFixed(1) + ' dB' : '-∞ dB';

        var peakEl = document.getElementById('at-peak-val');
        var rmsEl = document.getElementById('at-rms-val');
        if (peakEl) peakEl.textContent = pkDb;
        if (rmsEl) rmsEl.textContent = rmsDb;
        renderAtWaveform();
      }).catch(function (e) {
        console.warn('Could not load sound buffer for analysis:', e);
      });
    }
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
    var gainMult = Math.pow(10, (atState.gainDb || 0) / 20);
    var buf = atState.sound.buffer;
    var chData = buf && buf.numberOfChannels > 0 ? buf.getChannelData(0) : null;
    var totalFrames = buf ? buf.length : 0;

    for (var i = 0; i < bars; i++) {
      var prog = i / bars;
      var sec = prog * dur;
      var isTrimmed = sec >= atState.trimStart && sec <= atState.trimEnd;
      var bh = 4;

      if (chData && totalFrames > 0) {
        var startFrame = Math.floor((i / bars) * totalFrames);
        var endFrame = Math.floor(((i + 1) / bars) * totalFrames);
        var pk = 0;
        var step = Math.max(1, Math.floor((endFrame - startFrame) / 16));
        for (var f = startFrame; f < endFrame; f += step) {
          var v = Math.abs(chData[f] || 0);
          if (v > pk) pk = v;
        }
        var scaled = Math.min(1.0, pk * gainMult);
        bh = Math.max(3, scaled * (h - 16));
      } else {
        var env = Math.sin(prog * Math.PI);
        if (atState.sound.id && (atState.sound.id.includes('impact') || atState.sound.id.includes('earthquake'))) env = Math.exp(-prog * 3.5);
        if (atState.sound.id && atState.sound.id.includes('riser')) env = Math.pow(prog, 1.8);
        var scaled = Math.min(1.0, env * (0.3 + 0.7 * Math.sin(i * 1.4)) * gainMult);
        bh = Math.max(4, scaled * (h - 20));
      }

      var by = (h - bh) / 2;
      ctx.fillStyle = isTrimmed ? '#3b82f6' : '#334455';
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
        textarea.focus();
        processAiPrompt(txt);
      }

      sendBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        sendMsg();
      });

      textarea.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          sendMsg();
        }
      });
    }

    document.querySelectorAll('.sfx-ai-chip-prompt').forEach(function (chip) {
      chip.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var txt = this.textContent.replace(/^"|"$/g, '').trim();
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

    // Browser Subtabs Switching (Browse, Downloads, Import)
    var brTabs = document.querySelectorAll('.sfx-br-tab-btn');
    brTabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        brTabs.forEach(function (t) {
          t.classList.remove('is-active');
          t.classList.add('sfx-button--quiet');
        });
        this.classList.add('is-active');
        this.classList.remove('sfx-button--quiet');
        var tabName = this.getAttribute('data-tab');
        var browseView = document.getElementById('sfx-br-view-browse');
        var downloadsView = document.getElementById('sfx-br-view-downloads');
        var importView = document.getElementById('sfx-br-view-import');
        if (browseView) browseView.style.display = (tabName === 'browse') ? 'flex' : 'none';
        if (downloadsView) downloadsView.style.display = (tabName === 'downloads') ? 'flex' : 'none';
        if (importView) importView.style.display = (tabName === 'import') ? 'flex' : 'none';
      });
    });

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


  // ── 12. BGM FLOW (BACKGROUND MUSIC TRANSITIONS, BEAT SYNC & AUTO EQ) ──
  function setupBgmFlowPanel() {
    var EQ_PROFILES = {
      voiceover: {
        id: 'voiceover',
        name: 'Voiceover Clarity',
        readout: 'Voiceover Clarity • Notch 2.2 kHz (-4.5 dB)',
        lowGain: -1.5,
        lowFreq: 100,
        midGain: -4.5,
        midFreq: 2200,
        midQ: 1.2,
        highGain: 2.0,
        highFreq: 10000,
        highpassFreq: 75
      },
      warm: {
        id: 'warm',
        name: 'Warm',
        readout: 'Warm • Low-Mid Boost 180 Hz (+2.5 dB) • Soft Highs',
        lowGain: 2.5,
        lowFreq: 180,
        midGain: -1.5,
        midFreq: 2500,
        midQ: 1.0,
        highGain: -3.0,
        highFreq: 8000,
        highpassFreq: 35
      },
      balanced: {
        id: 'balanced',
        name: 'Balanced',
        readout: 'Balanced • Reference Mastering Curve (Flat ±1 dB)',
        lowGain: 1.0,
        lowFreq: 100,
        midGain: -1.5,
        midFreq: 450,
        midQ: 1.4,
        highGain: 1.5,
        highFreq: 10000,
        highpassFreq: 30
      },
      bright: {
        id: 'bright',
        name: 'Bright',
        readout: 'Bright • High Presence Boost 4.2 kHz (+3.5 dB)',
        lowGain: 0.0,
        lowFreq: 120,
        midGain: 3.5,
        midFreq: 4200,
        midQ: 1.0,
        highGain: 3.0,
        highFreq: 10000,
        highpassFreq: 45
      },
      cinematic: {
        id: 'cinematic',
        name: 'Cinematic',
        readout: 'Cinematic • Deep Sub 65 Hz (+3.5 dB) • Scooped Mids',
        lowGain: 3.5,
        lowFreq: 65,
        midGain: -2.5,
        midFreq: 600,
        midQ: 1.1,
        highGain: 2.8,
        highFreq: 12000,
        highpassFreq: 25
      }
    };

    var bgmState = {
      mode: 'start',
      style: 'smooth-fade',
      duration: 2.5,
      volumeDb: 0.0,
      curve: 's-curve',
      autoEq: 'voiceover',
      eqIntensity: 100,
      eqBypass: false,
      selectedClip: {
        name: 'Summer_Vlog_Upbeat_BGM.mp3',
        track: 'A4',
        duration: 165.0,
        bpm: 124,
        key: 'G Major',
        path: 'assets/audio/Summer_Vlog_Upbeat_BGM.mp3'
      }
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

        var transParams = document.getElementById('bgm-transition-params');
        if (transParams) {
          transParams.style.display = (mode === 'autoeq' || mode === 'beatsync') ? 'none' : 'flex';
        }

        if (mode === 'beatsync') {
          drawBeatSyncCanvas();
        } else if (mode === 'autoeq') {
          drawAutoEqCanvas(bgmState.autoEq, bgmState.eqIntensity, bgmState.eqBypass);
        }
      });
    });

    // Style card selection (Transitions & Auto EQ)
    document.querySelectorAll('.sfx-bf__style-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var parentGrid = this.closest('.sfx-bf__styles-grid');
        if (parentGrid) {
          parentGrid.querySelectorAll('.sfx-bf__style-card').forEach(function (c) { c.classList.remove('is-active'); });
        }
        this.classList.add('is-active');

        var eq = this.getAttribute('data-eq');
        var style = this.getAttribute('data-style');

        if (eq) {
          bgmState.autoEq = eq;
          var prof = EQ_PROFILES[eq] || EQ_PROFILES.voiceover;
          var readout = document.getElementById('bgm-eq-readout');
          if (readout) readout.textContent = prof.readout;
          drawAutoEqCanvas(eq, bgmState.eqIntensity, bgmState.eqBypass);
          showToast('Selected Auto EQ profile: ' + prof.name);
        } else if (style) {
          bgmState.style = style;
          var title = this.querySelector('strong') ? this.querySelector('strong').textContent : style;
          showToast('Selected BGM Transition style: ' + title);
        }
      });
    });

    // Auto EQ Intensity Slider & Bypass Controls
    var eqSlider = document.getElementById('bgm-slider-eq-intensity');
    var eqVal = document.getElementById('bgm-val-eq-intensity');
    if (eqSlider && eqVal) {
      eqSlider.addEventListener('input', function () {
        bgmState.eqIntensity = parseInt(this.value, 10);
        eqVal.textContent = bgmState.eqIntensity + '%';
        drawAutoEqCanvas(bgmState.autoEq, bgmState.eqIntensity, bgmState.eqBypass);
      });
    }

    var eqBypassBtn = document.getElementById('bgm-btn-eq-bypass');
    if (eqBypassBtn) {
      eqBypassBtn.addEventListener('click', function () {
        bgmState.eqBypass = !bgmState.eqBypass;
        this.classList.toggle('is-active', bgmState.eqBypass);
        this.textContent = bgmState.eqBypass ? 'Bypass Active (Dry)' : 'A/B Bypass';
        drawAutoEqCanvas(bgmState.autoEq, bgmState.eqIntensity, bgmState.eqBypass);
        showToast(bgmState.eqBypass ? 'Auto EQ Bypassed (Auditioning dry original)' : 'Auto EQ Filter Active');
      });
    }

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

    // Save Preset button
    var savePresetBtn = document.getElementById('bgm-btn-save-preset');
    if (savePresetBtn) {
      savePresetBtn.addEventListener('click', function () {
        var name = (bgmState.mode === 'autoeq') ? (EQ_PROFILES[bgmState.autoEq] ? EQ_PROFILES[bgmState.autoEq].name : 'Auto EQ') : (bgmState.style || 'Custom');
        showToast('✦ Saved preset: ' + name + ' (' + bgmState.mode.toUpperCase() + ')');
      });
    }

    // Sync Clip button
    var syncClipBtn = document.getElementById('bgm-btn-sync-clip');
    if (syncClipBtn) {
      syncClipBtn.addEventListener('click', function () {
        showToast('✓ Resynced timeline clip: ' + bgmState.selectedClip.name + ' on Track A4 (00:00:10 - 00:02:55)');
      });
    }

    // Beat Sync buttons
    var snapBeatBtn = document.getElementById('bgm-btn-snap-beat');
    if (snapBeatBtn) {
      snapBeatBtn.addEventListener('click', function () {
        showHostToast('✓ Snapped edit cut to nearest beat at 00:01:24:12 on Track A4');
      });
    }

    var snapBarBtn = document.getElementById('bgm-btn-snap-bar');
    if (snapBarBtn) {
      snapBarBtn.addEventListener('click', function () {
        showHostToast('✓ Snapped edit cut to Downbeat (Bar 12) at 00:01:21:00 on Track A4');
      });
    }

    var genMarkersBtn = document.getElementById('bgm-btn-gen-markers');
    if (genMarkersBtn) {
      genMarkersBtn.addEventListener('click', function () {
        showHostToast('✓ Generated 32 beat markers on host sequence timeline at 124 BPM!');
      });
    }

    // Audition Transition & Auto EQ (Web Audio API)
    var auditionBtn = document.getElementById('bgm-btn-audition');
    if (auditionBtn) {
      auditionBtn.addEventListener('click', function () {
        state.analyticsData.auditions++;
        updateAnalyticsDisplay();

        var bgmSound = extendedCatalog.find(function (c) { return c.cat === 'Ambience' || c.cat === 'Music'; }) || extendedCatalog[0];
        if (engine && engine.playSample) {
          engine.playSample(bgmSound);
        }

        if (bgmState.mode === 'autoeq') {
          var prof = EQ_PROFILES[bgmState.autoEq] || EQ_PROFILES.voiceover;
          showToast('Auditioning Auto EQ (' + prof.name + ') on ' + bgmState.selectedClip.name + (bgmState.eqBypass ? ' [BYPASS ACTIVE]' : ''));
        } else {
          showToast('Auditioning ' + bgmState.style + ' transition (' + bgmState.duration + 's, ' + bgmState.curve + ' curve)');
        }

        this.textContent = '▶ Auditioning…';
        var self = this;
        setTimeout(function () {
          self.textContent = '▶ Audition Transition';
        }, 2200);
      });
    }

    // Apply to selected clip (with STRICT audio source path validation)
    var applyBtn = document.getElementById('bgm-btn-apply');
    if (applyBtn) {
      applyBtn.addEventListener('click', function () {
        // Source audio path resolution & validation
        var audioPath = (bgmState.selectedClip && bgmState.selectedClip.path) || (state.activeSound && state.activeSound.url) || '';

        if (!audioPath || typeof audioPath !== 'string') {
          showToast('Failed to apply Auto EQ: No audio file path was supplied. Please select a valid audio clip first.', true);
          return;
        }

        state.analyticsData.imports++;
        updateAnalyticsDisplay();

        if (bgmState.mode === 'autoeq') {
          var prof = EQ_PROFILES[bgmState.autoEq] || EQ_PROFILES.voiceover;
          showHostToast('✓ Applied Auto EQ (' + prof.name + ') to BGM clip: ' + bgmState.selectedClip.name + ' on Track A4 in Premiere Pro!');
        } else if (bgmState.mode === 'beatsync') {
          showHostToast('✓ Applied beat-synced timeline markers to clip: ' + bgmState.selectedClip.name + ' on Track A4!');
        } else {
          showHostToast('✓ Applied ' + bgmState.style + ' transition (' + bgmState.duration + 's) to BGM clip on Track A4 in Premiere Pro!');
        }
      });
    }

    // Undo button
    var undoBtn = document.getElementById('bgm-btn-undo');
    if (undoBtn) {
      undoBtn.addEventListener('click', function () {
        showHostToast('↩ Undid BGM ' + (bgmState.mode === 'autoeq' ? 'Auto EQ' : 'Transition') + ' on Track A4 in Premiere Pro.');
      });
    }

    // Auto EQ Interactive Graph Drawing
    function drawAutoEqCanvas(profileId, intensity, isBypassed) {
      var canvas = document.getElementById('bgm-eq-canvas');
      if (!canvas) return;
      var ctx = canvas.getContext('2d');
      var w = canvas.width;
      var h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Dark background
      ctx.fillStyle = '#08080c';
      ctx.fillRect(0, 0, w, h);

      // dB Grid lines (-12dB, -6dB, 0dB, +6dB, +12dB)
      ctx.strokeStyle = '#1e1e24';
      ctx.lineWidth = 1;

      var gridDbs = [-12, -6, 0, 6, 12];
      ctx.font = '9px monospace';
      gridDbs.forEach(function (db) {
        var y = ((-db + 15) / 30) * h;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();

        ctx.fillStyle = db === 0 ? '#505060' : '#303038';
        ctx.fillText((db > 0 ? '+' : '') + db + 'dB', 4, y - 2);
      });

      // Frequency grid lines (100Hz, 1kHz, 10kHz)
      var freqs = [100, 1000, 10000];
      freqs.forEach(function (f) {
        var r = (Math.log10(f) - Math.log10(20)) / (Math.log10(20000) - Math.log10(20));
        var x = r * w;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();

        ctx.fillStyle = '#40404c';
        var label = f >= 1000 ? (f / 1000 + 'k') : (f + 'Hz');
        ctx.fillText(label, x + 3, h - 4);
      });

      // Plot frequency response curve
      var prof = EQ_PROFILES[profileId] || EQ_PROFILES.voiceover;
      var factor = isBypassed ? 0 : (intensity / 100);

      ctx.beginPath();
      var numPts = 120;
      for (var i = 0; i <= numPts; i++) {
        var r = i / numPts;
        var freq = Math.pow(10, Math.log10(20) + r * (Math.log10(20000) - Math.log10(20)));

        var db = 0;
        if (freq < prof.highpassFreq) {
          db -= 18 * Math.log2(prof.highpassFreq / Math.max(10, freq));
        }
        if (freq < prof.lowFreq) {
          db += prof.lowGain * factor * (1 - (freq / prof.lowFreq) * 0.5);
        }
        var midOctDiff = Math.abs(Math.log2(freq / prof.midFreq));
        var bell = Math.exp(-Math.pow(midOctDiff * prof.midQ * 1.5, 2));
        db += prof.midGain * factor * bell;
        if (freq > prof.highFreq * 0.5) {
          var hRatio = Math.min(1, (freq - prof.highFreq * 0.5) / (prof.highFreq * 0.5));
          db += prof.highGain * factor * hRatio;
        }

        db = Math.max(-18, Math.min(15, db));
        var y = ((-db + 15) / 30) * h;
        var x = r * w;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      ctx.lineWidth = 2.5;
      ctx.strokeStyle = isBypassed ? '#ef4444' : '#38bdf8';
      ctx.stroke();

      // Fill area underneath
      ctx.lineTo(w, h * 0.5);
      ctx.lineTo(0, h * 0.5);
      ctx.closePath();
      ctx.fillStyle = isBypassed ? 'rgba(239, 68, 68, 0.08)' : 'rgba(56, 189, 248, 0.12)';
      ctx.fill();
    }

    // Expose drawAutoEqCanvas for initial render on tool switch
    window.SFX_DRAW_AUTO_EQ = function () {
      drawAutoEqCanvas(bgmState.autoEq, bgmState.eqIntensity, bgmState.eqBypass);
    };

    // Initial pre-draw of canvases
    drawBeatSyncCanvas();
    drawAutoEqCanvas(bgmState.autoEq, bgmState.eqIntensity, bgmState.eqBypass);

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
    var backBtn = document.getElementById('btn-back-settings');

    if (profileBtn && drawer) {
      profileBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleToolOverlay('settings');
        syncBuddySettingsUI();
      });
    }
    if (closeBtn && drawer) {
      closeBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        closeCurrentToolOverlay();
      });
    }
    if (backBtn && drawer) {
      backBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        closeCurrentToolOverlay();
      });
    }

    // Accent Color Palette
    var accentDots = drawer ? drawer.querySelectorAll('[style*="border-radius: 50%"]') : [];
    accentDots.forEach(function (dot) {
      dot.style.cursor = 'pointer';
      dot.addEventListener('click', function () {
        accentDots.forEach(function (d) { d.style.boxShadow = 'none'; });
        this.style.boxShadow = '0 0 0 2px #fff, 0 0 8px rgba(255,255,255,0.4)';
        var bg = this.style.backgroundColor || this.style.background;
        if (bg) {
          document.documentElement.style.setProperty('--sfx-accent', bg);
        }
      });
    });

    // Theme Switcher Cards
    var themeCards = drawer ? drawer.querySelectorAll('[style*="border-radius: 6px"]') : [];
    themeCards.forEach(function (card) {
      if (card.textContent.includes('Studio Dark') || card.textContent.includes('Ultra Dark')) {
        card.style.cursor = 'pointer';
        card.addEventListener('click', function () {
          themeCards.forEach(function (c) {
            if (c.textContent.includes('Studio Dark') || c.textContent.includes('Ultra Dark')) {
              c.style.borderColor = 'var(--sfx-border)';
            }
          });
          this.style.borderColor = 'var(--sfx-accent)';
        });
      }
    });

    // Standalone SFX Buddy Display Controls
    var currentBuddyMode = 'floating';
    var floatingToggle = document.getElementById('sfx-buddy-floating-toggle');
    var toggleStatus = document.getElementById('sfx-buddy-toggle-status');
    var modeButtons = [
      { id: 'sfx-mode-btn-floating', mode: 'floating' },
      { id: 'sfx-mode-btn-docked', mode: 'docked' },
      { id: 'sfx-mode-btn-hidden', mode: 'hidden' }
    ];

    function syncBuddySettingsUI() {
      modeButtons.forEach(function (item) {
        var btn = document.getElementById(item.id);
        if (btn) {
          btn.classList.toggle('sfx-buddy-mode-card--active', item.mode === currentBuddyMode);
        }
      });

      if (floatingToggle) {
        floatingToggle.checked = (currentBuddyMode === 'floating');
      }
      if (toggleStatus) {
        toggleStatus.textContent = (currentBuddyMode === 'floating') ? 'Currently Active' : (currentBuddyMode === 'docked' ? 'Docked Side Panel' : 'Hidden');
      }
    }

    modeButtons.forEach(function (item) {
      var btn = document.getElementById(item.id);
      if (btn) {
        btn.addEventListener('click', function () {
          currentBuddyMode = item.mode;
          syncBuddySettingsUI();
        });
      }
    });

    if (floatingToggle) {
      floatingToggle.addEventListener('change', function () {
        if (window.__sfxBuddy && typeof window.__sfxBuddy.setFloatingEnabled === 'function') {
          window.__sfxBuddy.setFloatingEnabled(this.checked);
        }
        syncBuddySettingsUI();
      });
    }

    window.addEventListener('sfx-buddy-mode-changed', function () {
      syncBuddySettingsUI();
    });

    // Initial sync
    setTimeout(syncBuddySettingsUI, 300);

    // ── Direct License System (v8.0 Engine Simulation) ──
    var btnOpenLicModal = document.getElementById('btn-open-license-modal');
    var btnDemoDeactivate = document.getElementById('btn-demo-deactivate');
    var licOverlay = document.getElementById('sfx-license-overlay');
    var licCloseBtn = document.getElementById('sfx-lic-close');
    var licEyeBtn = document.getElementById('sfx-lic-eye');
    var licKeyInput = document.getElementById('sfx-lic-key');
    var licEmailInput = document.getElementById('sfx-lic-email');
    var licForm = document.getElementById('sfx-lic-form');
    var licBtn = document.getElementById('sfx-lic-btn');
    var licBtnText = document.getElementById('sfx-lic-btn-text');
    var licBanner = document.getElementById('sfx-lic-banner');
    var licBannerTitle = document.getElementById('sfx-lic-banner-title');
    var licBannerMsg = document.getElementById('sfx-lic-banner-msg');
    var licBadge = document.getElementById('sfx-demo-lic-badge');

    if (btnOpenLicModal && licOverlay) {
      btnOpenLicModal.addEventListener('click', function (e) {
        e.stopPropagation();
        licOverlay.style.display = 'flex';
        licOverlay.classList.add('is-open');
        licOverlay.classList.remove('is-gate');
      });
    }

    if (licCloseBtn && licOverlay) {
      licCloseBtn.addEventListener('click', function () {
        licOverlay.classList.remove('is-open', 'is-gate');
        licOverlay.style.display = 'none';
      });
    }

    if (licEyeBtn && licKeyInput) {
      licEyeBtn.addEventListener('click', function () {
        var isPwd = licKeyInput.type === 'password';
        licKeyInput.type = isPwd ? 'text' : 'password';
      });
    }

    if (btnDemoDeactivate) {
      btnDemoDeactivate.addEventListener('click', function () {
        if (confirm('Simulate deactivating SFX Composer on this machine? This tests the mandatory first-launch gate.')) {
          if (licBadge) {
            licBadge.className = 'sfx-license-badge sfx-license-badge--inactive';
            licBadge.innerHTML = 'Inactive';
          }
          if (licOverlay) {
            licOverlay.style.display = 'flex';
            licOverlay.classList.add('is-open');
            if (licBanner && licBannerTitle && licBannerMsg) {
              licBanner.style.display = 'flex';
              licBanner.className = 'sfx-lic__banner sfx-lic__banner--warning';
              licBannerTitle.textContent = 'Workstation Deactivated';
              licBannerMsg.textContent = 'This machine was deactivated. Enter your registered email and key to reactivate.';
            }
          }
        }
      });
    }

    if (licForm && licBtn) {
      licForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var email = (licEmailInput ? licEmailInput.value : '').trim();
        var key = (licKeyInput ? licKeyInput.value : '').trim();

        if (!email || !key) {
          if (licBanner && licBannerTitle && licBannerMsg) {
            licBanner.style.display = 'flex';
            licBanner.className = 'sfx-lic__banner sfx-lic__banner--error';
            licBannerTitle.textContent = 'Missing Credentials';
            licBannerMsg.textContent = 'Please provide both your registered email and license key.';
          }
          return;
        }

        licBtn.disabled = true;
        if (licBtnText) licBtnText.innerHTML = '<span class="sfx-lic__spinner"></span> Verifying with Supabase…';

        setTimeout(function () {
          licBtn.disabled = false;
          if (licBtnText) licBtnText.textContent = 'Verify & Activate';

          if (licBanner && licBannerTitle && licBannerMsg) {
            licBanner.style.display = 'flex';
            licBanner.className = 'sfx-lic__banner sfx-lic__banner--success';
            licBannerTitle.textContent = 'Direct Activation Verified ✓';
            licBannerMsg.textContent = 'Workstation hardware bound successfully. Lifetime access unlocked.';
          }

          if (licBadge) {
            licBadge.className = 'sfx-license-badge sfx-license-badge--active';
            licBadge.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> Active';
          }

          setTimeout(function () {
            if (licOverlay) {
              licOverlay.classList.remove('is-open', 'is-gate');
              licOverlay.style.display = 'none';
            }
          }, 1400);
        }, 800);
      });
    }
  }

  // ── 15. MODULE SHOWCASE CONTROLLER ──
  function setupModuleShowcaseTour() {

    // Quick module jump chips
    var chips = document.querySelectorAll('.sfx-demo-chip');
    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        chips.forEach(function (c) { c.classList.remove('is-active'); });
        this.classList.add('is-active');
        var mod = this.getAttribute('data-module');

        if (mod === 'library') {
          closeCurrentToolOverlay();
        } else if (mod === 'host') {
          var pproBtn = document.getElementById('btn-host-ppro');
          if (pproBtn) pproBtn.click();
        } else {
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
        src: 'assets/images/sfx-scene-ai-timeline.png',
        badge: 'Screenshot 07 · Scene AI',
        title: 'Scene AI Sequence Designer & Timeline Control',
        desc: 'Scene AI main interface displaying live host status badges for Adobe Host (PPro/AE) and Ollama local AI server. Features "Analyze Composition" trigger and the AI Timeline Control prompt bar with verified operations and write-operation safety approvals.'
      },
      {
        id: 8,
        src: 'assets/images/sfx-audio-tools-essential-sound.png',
        badge: 'Screenshot 08 · Essential Sound Studio',
        title: '3-Column Workstation & Essential Sound DSP Rack',
        desc: 'Pro-grade workstation layout: Left sound browser filtering categories, Center high-resolution waveform editor (with 0:00.00 / 0:02.67 timecode, 48000 Hz, 2 ch display), and Right Essential Sound DSP rack with Peak (-2.4 dB) and RMS (-23.0 dB) meters, Gain/Normalize, Fades, EQ, Dynamics Compress, and Character controls.'
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
      const fsBtn = card.querySelector('.sfx-btn-open-fullscreen');
      if (fsBtn) {
        fsBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openLightbox(idx);
        });
      }
    });

    // Hero image triggers lightbox
    const heroStage = document.getElementById('sfx-gallery-hero-stage');
    const heroBtn = document.getElementById('sfx-hero-expand-btn');
    function openHeroInLightbox(e) {
      if (e) e.stopPropagation();
      imgEl.src = 'assets/images/SFX Composer_ Cinematic Audio Suite.png';
      imgEl.alt = 'SFX Composer — The Cinematic Audio Suite';
      counterEl.textContent = 'Flagship Showcase · 16:9';
      titleEl.textContent = 'SFX Composer — The Cinematic Audio Suite';
      descEl.textContent = 'The all-in-one audio suite for video editors: find, design, and place SFX with instant waveform preview, local Ollama AI assistant, BGM Flow, and multi-track timeline automation in Premiere Pro CC, After Effects CC, DaVinci Resolve & Final Cut Pro.';
      modal.classList.add('is-open');
      document.body.style.overflow = 'hidden';
    }
    if (heroStage) heroStage.addEventListener('click', openHeroInLightbox);
    if (heroBtn) heroBtn.addEventListener('click', openHeroInLightbox);

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
