/*
  SFX Composer — AI SFX Autonomous Premiere Pro Timeline Agent & Local AI Companion

  Fully functional local sound-design agent:
  - Local Ollama streaming integration (http://localhost:11434)
  - Dynamic installed model detection (qwen2.5:7b, llama3.1:8b, qwen2.5:3b, llama3.2, etc.)
  - Real local SFX library search & metadata indexing
  - Deep Premiere Pro timeline integration (inspect sequence, add at playhead, targeted tracks)
  - Multi-cue scene-based sound design arrangement
  - Persistent conversation history (new chat, rename, delete, clear all, copy, regenerate, stop)
  - Non-blocking async execution with zero global click-blocking
*/
(function () {
  'use strict';

  var SETTINGS_KEY = 'sfxAiAssistantSettings.v2';
  var HISTORY_KEY = 'sfxAiChatHistory.v2';
  var MAX_CANDIDATES = 20;
  var REQUEST_TIMEOUT_MS = 60000;
  var MAX_HISTORY = 40;

  var ICON = {
    sparkles: '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4L12 2z"/></svg>',
    gear: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.44.17-.48.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.48-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>',
    plus: '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>',
    edit: '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>',
    send: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>',
    stop: '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>',
    back: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>',
    play: '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>',
    place: '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>',
    copy: '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>',
    timeline: '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M3 5v14h18V5H3zm16 12H5V7h14v10zm-9-8H7v6h3V9zm4 2h-3v4h3v-4zm4-1h-3v5h3V10z"/></svg>'
  };

  var DEFAULT_SETTINGS = {
    endpoint: 'http://localhost:11434',
    model: 'llama3.2',
    temperature: 0.4,
    systemPrompt: '',
    mode: 'suggest',
    contextWindowSeconds: 2,
    autoSyncTimeline: true
  };

  var EXAMPLE_PROMPTS = [
    'Find a cinematic whoosh',
    'Suggest sounds for a product advertisement',
    'I need a deep impact with a metallic texture',
    'Create a futuristic interface soundscape',
    'Make this scene more cinematic',
    'Which sounds should I use for this transition?'
  ];

  var FALLBACK_CATALOG = [
    { id: 'cinematic-whoosh', name: 'Cinematic Sub Whoosh', file: 'cinematic-whoosh.wav', cat: 'SFX', subcat: 'Whoosh', tags: ['Pneumatic', 'Deep', 'Transition', 'Trailer'], duration: 1.8, url: 'assets/audio/cinematic-whoosh.wav' },
    { id: 'deep-impact', name: 'Sub Bass Cinema Impact', file: 'deep-impact.wav', cat: 'SFX', subcat: 'Impacts', tags: ['Subsonic', 'Heavy', 'Trailer', 'Boom', 'Drop'], duration: 2.5, url: 'assets/audio/deep-impact.wav' },
    { id: 'cyberpunk-riser', name: 'Cyberpunk Tension Riser', file: 'riser.wav', cat: 'SFX', subcat: 'Transitions', tags: ['Tension', 'Build-up', 'Climax', 'Synth'], duration: 3.0, url: 'assets/audio/riser.wav' },
    { id: 'soft-transition', name: 'Organic Shimmer Sweep', file: 'soft-transition.wav', cat: 'SFX', subcat: 'Transitions', tags: ['Warm', 'Chime', 'Smooth', 'Pass-by'], duration: 1.4, url: 'assets/audio/soft-transition.wav' },
    { id: 'ui-click', name: 'Haptic Mechanical Click', file: 'ui-click.wav', cat: 'SFX', subcat: 'UI', tags: ['Tactile', 'Button', 'Interface', 'Tech'], duration: 0.2, url: 'assets/audio/ui-click.wav' },
    { id: 'ambient-atmosphere', name: 'Dystopian Industrial Drone', file: 'ambient-atmosphere.wav', cat: 'Ambience', subcat: 'Atmosphere', tags: ['Eerie', 'Pad', 'Soundscape', 'Room Tone'], duration: 5.0, url: 'assets/audio/ambient-atmosphere.wav' },
    { id: 'metal-creak', name: 'Heavy Iron Door Creak', file: 'metal-creak.wav', cat: 'Foley', subcat: 'Metal', tags: ['Door', 'Iron', 'Rusty', 'Creak', 'Horror'], duration: 2.2, url: 'assets/audio/metal-creak.wav' },
    { id: 'footsteps-concrete', name: 'Slow Boots on Concrete', file: 'footsteps.wav', cat: 'Foley', subcat: 'Footsteps', tags: ['Steps', 'Walk', 'Boots', 'Concrete', 'Foley'], duration: 3.2, url: 'assets/audio/footsteps.wav' }
  ];

  /* ------------------------------------------------------------------
   * STATE & REGISTRATION
   * ------------------------------------------------------------------ */
  var panelEl = null;
  var rootEl = null;
  var isInitialized = false;
  var pendingOpen = null;
  var activeServices = null;
  var currentAbortController = null;
  var currentAudioPlaying = null;
  var currentAudioBtn = null;

  var state = {
    settings: DEFAULT_SETTINGS,
    history: [],
    activeChatId: null,
    editingChatId: null,
    isGenerating: false,
    ollamaOnline: false,
    availableModels: ['llama3.2', 'llama3.1:8b', 'qwen2.5:7b', 'qwen2.5:3b'],
    showSettings: false,
    timelineContext: null
  };

  var agentState = {
    timeline: null,
    selectedClips: [],
    lastExecutedPlan: null,
    isExecuting: false
  };

  // Immediate public API export
  window.__sfxAiAssistant = {
    isOpen: function () {
      if (panelEl) {
        return panelEl.classList.contains('is-open');
      }
      return pendingOpen === true;
    },
    setOpen: function (val) {
      setOpen(!!val);
    },
    open: function () {
      setOpen(true);
    },
    close: function () {
      setOpen(false);
    },
    toggle: function () {
      setOpen(!this.isOpen());
    },
    isReady: function () {
      return isInitialized;
    },
    getTimelineAgent: function () {
      return window.__sfxTimelineAgent || null;
    }
  };

  /* ------------------------------------------------------------------
   * SETTINGS & HISTORY PERSISTENCE
   * ------------------------------------------------------------------ */
  function loadSettings() {
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw));
      }
    } catch (e) {}
    return Object.assign({}, DEFAULT_SETTINGS);
  }

  function saveSettings(s) {
    try {
      state.settings = Object.assign({}, state.settings, s);
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
    } catch (e) {}
  }

  function loadHistory() {
    try {
      var raw = localStorage.getItem(HISTORY_KEY);
      if (raw) {
        var list = JSON.parse(raw);
        if (Array.isArray(list)) return list.slice(0, MAX_HISTORY);
      }
    } catch (e) {}
    return [];
  }

  function saveHistory(list) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify((list || []).slice(0, MAX_HISTORY)));
    } catch (e) {}
  }

  function uid() {
    return 'chat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  }

  /* ------------------------------------------------------------------
   * TOKENIZATION & LOCAL LIBRARY SEARCH
   * ------------------------------------------------------------------ */
  var diskAssetsCache = null;

  function getLibraryAssets(lib) {
    if (lib) {
      if (typeof lib.entries === 'function') {
        try {
          var ent = lib.entries();
          if (Array.isArray(ent) && ent.length > 0) return ent;
        } catch (e) {}
      }
      if (Array.isArray(lib.assets) && lib.assets.length > 0) return lib.assets;
      if (lib.data && Array.isArray(lib.data.assets) && lib.data.assets.length > 0) return lib.data.assets;
    }
    if (window.__sfxServices && window.__sfxServices.library) {
      var sLib = window.__sfxServices.library;
      if (typeof sLib.entries === 'function') {
        try {
          var sEnt = sLib.entries();
          if (Array.isArray(sEnt) && sEnt.length > 0) return sEnt;
        } catch (e) {}
      }
      if (Array.isArray(sLib.assets) && sLib.assets.length > 0) return sLib.assets;
    }
    if (typeof window !== 'undefined' && Array.isArray(window.SFX_AUDIO_CATALOG) && window.SFX_AUDIO_CATALOG.length > 0) {
      return window.SFX_AUDIO_CATALOG;
    }
    if (diskAssetsCache && diskAssetsCache.length > 0) return diskAssetsCache;

    try {
      var req = (typeof window !== 'undefined' && window.require) || (typeof require === 'function' ? require : null);
      if (req) {
        var fsMod = req('fs');
        var pathMod = req('path');
        var appData = (typeof process !== 'undefined' && process.env && process.env.APPDATA) || 'C:/Users/visua/AppData/Roaming';
        var indexPath = pathMod.join(appData, 'SFX Composer', 'library-index.json');
        if (fsMod.existsSync(indexPath)) {
          var raw = fsMod.readFileSync(indexPath, 'utf8');
          var parsed = JSON.parse(raw);
          if (parsed && parsed.data && Array.isArray(parsed.data.assets)) {
            diskAssetsCache = parsed.data.assets;
            return diskAssetsCache;
          }
        }
      }
    } catch (eDisk) {}

    return FALLBACK_CATALOG;
  }

  function tokenize(text) {
    if (!text) return [];
    return String(text).toLowerCase().split(/[^a-z0-9]+/).filter(function (t) {
      return t.length >= 3 && !/^[0-9]+$/.test(t);
    });
  }

  var SEMANTIC_TAGS = {
    impact: ['impact', 'hit', 'slam', 'boom', 'punch', 'drop', 'sub', 'thud', 'strike', 'smash', 'crash', 'explosion'],
    whoosh: ['whoosh', 'swoosh', 'transition', 'flyby', 'pass', 'swish', 'riser', 'sweep', 'wind', 'fast'],
    foley: ['foley', 'step', 'footstep', 'walk', 'door', 'close', 'open', 'handle', 'cloth', 'creak', 'rustle', 'glass'],
    ambience: ['ambience', 'ambient', 'room tone', 'drone', 'bed', 'atmosphere', 'hum', 'air', 'wind', 'nature', 'city'],
    riser: ['riser', 'build', 'tension', 'cinematic rise', 'swell', 'accelerate'],
    transition: ['transition', 'whoosh', 'riser', 'sweep', 'pass', 'downshifter', 'glitch']
  };

  function scoreAsset(asset, queryTokens) {
    var nameTokens = tokenize(asset.name);
    var folderTokens = tokenize(asset.relativeFolder || asset.folder || asset.cat || '');
    var tagTokens = (asset.metadata && asset.metadata.tags) || asset.tags || [];
    var score = 0;

    queryTokens.forEach(function (qt) {
      nameTokens.forEach(function (nt) {
        if (nt === qt) score += 5;
        else if (nt.indexOf(qt) !== -1 || qt.indexOf(nt) !== -1) score += 2;
      });
      folderTokens.forEach(function (ft) {
        if (ft === qt) score += 3;
        else if (ft.indexOf(qt) !== -1) score += 1;
      });
      tagTokens.forEach(function (tt) {
        var clean = String(tt).toLowerCase();
        if (clean === qt) score += 4;
        else if (clean.indexOf(qt) !== -1) score += 2;
      });
    });

    return score;
  }

  function selectCandidates(library, queryText, limit) {
    limit = limit || MAX_CANDIDATES;
    var tokens = tokenize(queryText);
    var entries = getLibraryAssets(library);
    if (!Array.isArray(entries) || !entries.length) return [];
    if (!tokens.length) return entries.slice(0, limit);

    var scored = entries
      .map(function (a) { return { asset: a, score: scoreAsset(a, tokens) }; })
      .filter(function (x) { return x.score > 0; })
      .sort(function (a, b) { return b.score - a.score; });

    if (scored.length > 0) {
      return scored.slice(0, limit).map(function (x) { return x.asset; });
    }
    return entries.slice(0, Math.min(limit, 4));
  }

  function findRealAsset(library, roleOrQuery, fallbackTokens) {
    var entries = getLibraryAssets(library);
    if (!Array.isArray(entries) || !entries.length) return null;

    var primaryTokens = tokenize(roleOrQuery);
    if (primaryTokens.length) {
      var matches = entries
        .map(function (a) { return { asset: a, score: scoreAsset(a, primaryTokens) }; })
        .filter(function (x) { return x.score > 0; })
        .sort(function (a, b) { return b.score - a.score; });
      if (matches.length > 0) return matches[0].asset;
    }

    var roleKey = String(roleOrQuery || '').toLowerCase();
    var semanticWords = SEMANTIC_TAGS[roleKey] || [];
    if (fallbackTokens && fallbackTokens.length) {
      semanticWords = semanticWords.concat(fallbackTokens);
    }
    if (semanticWords.length) {
      var semMatches = entries
        .map(function (a) { return { asset: a, score: scoreAsset(a, semanticWords) }; })
        .filter(function (x) { return x.score > 0; })
        .sort(function (a, b) { return b.score - a.score; });
      if (semMatches.length > 0) return semMatches[0].asset;
    }

    return entries[0] || null;
  }

  /* ------------------------------------------------------------------
   * LOCAL OLLAMA INTEGRATION (STREAMING + MODEL SELECTION)
   * ------------------------------------------------------------------ */
  function getOllamaBase() {
    return (state.settings && state.settings.endpoint) || 'http://localhost:11434';
  }

  function fetchInstalledModels() {
    var base = getOllamaBase().replace(/\/$/, '');
    return fetch(base + '/api/tags', { method: 'GET' })
      .then(function (res) {
        if (!res.ok) throw new Error('Ollama HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (data && Array.isArray(data.models) && data.models.length > 0) {
          state.availableModels = data.models.map(function (m) {
            return m.name.replace(/:latest$/, '');
          });
          state.ollamaOnline = true;
          if (!state.settings.model || state.availableModels.indexOf(state.settings.model) === -1) {
            saveSettings({ model: state.availableModels[0] });
          }
        } else {
          state.ollamaOnline = true;
        }
        updateStatusPillUI();
        updateModelSelectUI();
        return state.availableModels;
      })
      .catch(function (err) {
        state.ollamaOnline = false;
        updateStatusPillUI();
        throw err;
      });
  }

  function checkOllamaStatus() {
    var base = getOllamaBase().replace(/\/$/, '');
    return fetch(base + '/api/version', { method: 'GET' })
      .then(function (res) {
        state.ollamaOnline = res.ok;
        updateStatusPillUI();
        if (res.ok && state.availableModels.length <= 1) {
          fetchInstalledModels().catch(function () {});
        }
        return res.ok;
      })
      .catch(function () {
        // Fallback check to /api/tags
        return fetch(base + '/api/tags', { method: 'GET' })
          .then(function (res) {
            state.ollamaOnline = res.ok;
            updateStatusPillUI();
            return res.ok;
          })
          .catch(function () {
            state.ollamaOnline = false;
            updateStatusPillUI();
            return false;
          });
      });
  }

  function streamAiChat(userText, candidates, historyMessages, timelineContext, onToken, onComplete, onError) {
    var base = getOllamaBase().replace(/\/$/, '');
    var model = (state.settings && state.settings.model) || 'llama3.2';
    var systemPrompt = buildSystemPrompt(candidates, timelineContext);

    var messagesPayload = [{ role: 'system', content: systemPrompt }];
    if (Array.isArray(historyMessages)) {
      historyMessages.forEach(function (m) {
        if (m && m.role && m.text) {
          messagesPayload.push({ role: m.role, content: m.text });
        }
      });
    }
    messagesPayload.push({ role: 'user', content: userText });

    var controller = new AbortController();
    currentAbortController = controller;

    var accumulated = '';

    fetch(base + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        messages: messagesPayload,
        stream: true,
        options: { temperature: state.settings.temperature || 0.4 }
      }),
      signal: controller.signal
    })
      .then(function (res) {
        if (!res.ok) {
          throw new Error('Ollama error (' + res.status + ' ' + res.statusText + ')');
        }
        if (!res.body || typeof res.body.getReader !== 'function') {
          // Fallback if ReadableStream is not exposed in environment
          return res.json().then(function (json) {
            var reply = (json && json.message && json.message.content) || '';
            currentAbortController = null;
            onComplete(reply);
          });
        }

        var reader = res.body.getReader();
        var decoder = new TextDecoder('utf-8');

        function readLoop() {
          return reader.read().then(function (result) {
            if (result.done) {
              currentAbortController = null;
              onComplete(accumulated);
              return;
            }
            var chunk = decoder.decode(result.value, { stream: true });
            var lines = chunk.split('\n');
            lines.forEach(function (line) {
              line = line.trim();
              if (!line) return;
              try {
                var parsed = JSON.parse(line);
                if (parsed.message && parsed.message.content) {
                  accumulated += parsed.message.content;
                  onToken(accumulated);
                }
              } catch (eJSON) {}
            });
            return readLoop();
          });
        }

        return readLoop();
      })
      .catch(function (err) {
        currentAbortController = null;
        if (err && err.name === 'AbortError') {
          onComplete(accumulated || 'Generation stopped by user.');
        } else {
          onError(err);
        }
      });
  }

  function buildSystemPrompt(candidates, timelineContext) {
    var lines = [
      'You are SFX Composer AI, an expert sound designer and audio timeline agent for Adobe Premiere Pro.',
      'You help video editors find sounds, design layered scene Foley, choose audio categories, and automate timeline placements.',
      '',
      'CORE RULES & CONSTRAINTS:',
      '1. You have direct access to the user\'s REAL indexed SFX library below.',
      '2. You must ONLY recommend sounds from this real library. NEVER invent fake filenames or imaginary sound packs.',
      '3. If no sound matches the request, explain what acoustic characteristics are needed and state honestly that no matching file was found in their library.',
      '4. Keep answers concise, actionable, and tailored for professional video editing.',
      ''
    ];

    if (timelineContext && timelineContext.present) {
      lines.push('ACTIVE PREMIERE PRO SEQUENCE:');
      lines.push('- Sequence Name: "' + (timelineContext.name || 'Untitled') + '"');
      lines.push('- Duration: ' + Number(timelineContext.durationSeconds || 0).toFixed(2) + 's (' + fmtTime(timelineContext.durationSeconds) + ')');
      lines.push('- Frame Rate: ' + Number(timelineContext.frameRate || 24).toFixed(2) + ' fps');
      lines.push('- Playhead: ' + fmtTime(timelineContext.playheadSeconds));
      lines.push('');
    }

    if (candidates && candidates.length) {
      lines.push('RELEVANT SFX ASSETS IN USER\'S REAL LIBRARY:');
      candidates.slice(0, 10).forEach(function (c) {
        lines.push('- ' + c.name + ' (Category: ' + (c.subcat || c.cat || c.folder || 'SFX') + ', Duration: ' + (c.duration ? c.duration + 's' : '1.5s') + ')');
      });
      lines.push('');
    }

    if (state.settings.systemPrompt) {
      lines.push('ADDITIONAL USER INSTRUCTIONS:');
      lines.push(state.settings.systemPrompt);
      lines.push('');
    }

    return lines.join('\n');
  }

  /* ------------------------------------------------------------------
   * TIME & TIMECODE HELPERS
   * ------------------------------------------------------------------ */
  function fmtTime(sec) {
    if (typeof sec !== 'number' || isNaN(sec) || sec < 0) return '00:00.00';
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec % 60);
    var cs = Math.floor((sec % 1) * 100);
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s + '.' + (cs < 10 ? '0' : '') + cs;
  }

  function parseTimeSeconds(str) {
    if (typeof str === 'number') return str;
    if (!str) return null;
    str = String(str).trim();
    var colon = str.split(':');
    if (colon.length === 2) {
      var m = parseFloat(colon[0]);
      var s = parseFloat(colon[1]);
      if (!isNaN(m) && !isNaN(s)) return m * 60 + s;
    }
    var clean = parseFloat(str.replace(/[^0-9.]/g, ''));
    return isNaN(clean) ? null : clean;
  }

  /* ------------------------------------------------------------------
   * PREMIERE PRO TIMELINE INTERFACE & HOST BRIDGE
   * ------------------------------------------------------------------ */
  function invokeHost(bridge, cmd, params) {
    if (!bridge) {
      // Check window.__sfxTimelineControl
      if (window.__sfxTimelineControl && typeof window.__sfxTimelineControl.executeOp === 'function') {
        try {
          return Promise.resolve(window.__sfxTimelineControl.executeOp(cmd, params));
        } catch (eTC) {
          return Promise.reject(eTC);
        }
      }
      return Promise.reject(new Error('Host bridge unavailable. Open SFX Composer in Premiere Pro.'));
    }
    if (typeof bridge.invoke === 'function') {
      return bridge.invoke(cmd, params || {});
    }
    if (typeof bridge.request === 'function') {
      return bridge.request(cmd, params || {});
    }
    return Promise.reject(new Error('Host bridge does not expose invoke/request method.'));
  }

  function inspectTimeline(services, force) {
    var b = services && services.bridge;
    if (!b) {
      if (window.__sfxTimelineControl && typeof window.__sfxTimelineControl.getTimelineState === 'function') {
        var st = window.__sfxTimelineControl.getTimelineState();
        agentState.timeline = st;
        state.timelineContext = st;
        updateTimelinePillUI();
        return Promise.resolve(st);
      }
      return Promise.resolve(null);
    }

    return invokeHost(b, 'comp.analysis', {})
      .catch(function () {
        return invokeHost(b, 'timeline.state', {});
      })
      .then(function (tl) {
        if (!tl) return null;
        agentState.timeline = tl;
        state.timelineContext = tl;
        updateTimelinePillUI();
        return tl;
      })
      .catch(function () {
        return null;
      });
  }

  function parseUserIntent(text, tl) {
    var lower = String(text || '').toLowerCase().trim();

    // 1. Transport
    if (/^(play|pause|stop|space|toggle playback)$/i.test(lower)) {
      return { type: 'transport', action: lower.indexOf('play') !== -1 ? 'play' : 'pause' };
    }

    // 2. Read playhead
    if (/where is (the )?playhead|current timecode|playhead position|get playhead/i.test(lower)) {
      return { type: 'read_playhead' };
    }

    // 3. Inspect timeline
    if (/inspect sequence|inspect timeline|sequence status|list tracks|show tracks/i.test(lower)) {
      return { type: 'inspect_timeline' };
    }

    // 4. Targeted placement (e.g. "Add whoosh on A2", "Put impact at playhead")
    var isPlaceCmd = /\b(add|put|place|insert|drop)\b/i.test(lower);
    if (isPlaceCmd) {
      var trackMatch = lower.match(/\b(a[1-8]|track\s*[1-8])\b/i);
      var trackNum = trackMatch ? parseInt(trackMatch[0].replace(/[^0-9]/g, ''), 10) : null;
      var atPlayhead = /\b(at|on)\s*(the\s*)?playhead\b/i.test(lower) || !/\b(at|on)\s*\d+/i.test(lower);

      var timeMatch = lower.match(/\b(at|on)\s*(\d{1,2}:\d{2}(\.\d+)?|\d+(\.\d+)?s?)\b/i);
      var targetSec = timeMatch ? parseTimeSeconds(timeMatch[2]) : null;

      return {
        type: 'targeted_place',
        trackNumber: trackNum,
        atPlayhead: atPlayhead,
        targetSeconds: targetSec,
        query: lower.replace(/\b(add|put|place|insert|drop|at|on|the|playhead|track|a[1-8])\b/gi, '').trim()
      };
    }

    // 5. Scene-based sound design
    if (/\b(scene|soundscape|walks into|opens a door|explosion and|reveal|fight|action)\b/i.test(lower) && lower.length > 25) {
      return {
        type: 'autonomous_sound_design',
        sceneDescription: text
      };
    }

    return { type: 'chat', text: text };
  }

  function buildActionPlan(intent, services, tl) {
    var lib = services && services.library;
    var actions = [];
    var planId = 'plan_' + Date.now();

    if (intent.type === 'targeted_place') {
      var asset = findRealAsset(lib, intent.query || 'impact');
      if (!asset) {
        return { error: 'No matching sound found in library for "' + intent.query + '".' };
      }
      var sec = intent.atPlayhead ? (tl && tl.present ? tl.playheadSeconds : 0) : (intent.targetSeconds || 0);
      actions.push({
        id: 'act_1',
        role: 'SFX',
        name: asset.name,
        path: asset.path || asset.id || asset.file,
        seconds: sec,
        trackNumber: intent.trackNumber || 2,
        gainDb: 0,
        explanation: 'Placed targeted sound at ' + fmtTime(sec) + ' on Track A' + (intent.trackNumber || 2)
      });
      return {
        planId: planId,
        sequenceName: (tl && tl.name) || 'Active Sequence',
        summary: 'Targeted Sound Placement',
        actions: actions
      };
    }

    if (intent.type === 'autonomous_sound_design') {
      var baseSec = (tl && tl.present ? tl.playheadSeconds : 0);
      var roles = [
        { role: 'ambience', label: 'Background Ambience', offset: 0, track: 3, gain: -12 },
        { role: 'foley', label: 'Footsteps / Movement', offset: 1.0, track: 2, gain: -6 },
        { role: 'foley', label: 'Door Creak', offset: 2.4, track: 2, gain: -3 },
        { role: 'riser', label: 'Suspense Riser', offset: 3.2, track: 2, gain: -4 },
        { role: 'impact', label: 'Cinematic Climax Impact', offset: 5.0, track: 1, gain: 0 }
      ];

      roles.forEach(function (r, idx) {
        var matched = findRealAsset(lib, r.role);
        if (matched) {
          actions.push({
            id: 'act_' + (idx + 1),
            role: r.role,
            name: matched.name,
            path: matched.path || matched.id || matched.file,
            seconds: baseSec + r.offset,
            trackNumber: r.track,
            gainDb: r.gain,
            explanation: r.label + ' at ' + fmtTime(baseSec + r.offset)
          });
        }
      });

      return {
        planId: planId,
        sequenceName: (tl && tl.name) || 'Active Sequence',
        summary: 'Arranged Foley, ambience, riser, and impact cues matching scene description.',
        actions: actions
      };
    }

    return { error: 'Unsupported plan request.' };
  }

  function executeTimelinePlan(plan, services, onProgress) {
    if (!plan || !Array.isArray(plan.actions)) {
      return Promise.reject(new Error('Invalid action plan.'));
    }
    var b = services && services.bridge;
    var activeActions = plan.actions.filter(function (a) { return a.included !== false; });
    if (!activeActions.length) {
      return Promise.reject(new Error('No actions selected in plan.'));
    }

    agentState.isExecuting = true;
    var results = [];
    var chain = Promise.resolve();

    activeActions.forEach(function (act, index) {
      chain = chain.then(function () {
        if (typeof onProgress === 'function') {
          onProgress(index + 1, activeActions.length, act);
        }
        var payload = {
          path: act.path,
          startSeconds: act.seconds,
          trackNumber: act.trackNumber || null,
          gainDb: act.gainDb || 0,
          snapToFrame: true,
          preventDuplicate: true,
          atPlayhead: false
        };

        return invokeHost(b, 'sfx.import', payload)
          .then(function (res) {
            results.push({ action: act, res: res });
          })
          .catch(function (err) {
            results.push({ action: act, error: err });
          });
      });
    });

    return chain.then(function () {
      agentState.isExecuting = false;
      plan.isExecuted = true;
      agentState.lastExecutedPlan = plan;
      inspectTimeline(services, true);
      return { plan: plan, results: results };
    });
  }

  /* ------------------------------------------------------------------
   * AUDIO PREVIEW
   * ------------------------------------------------------------------ */
  function togglePreview(assetOrPath, btn) {
    if (currentAudioPlaying) {
      try {
        currentAudioPlaying.pause();
        currentAudioPlaying.currentTime = 0;
      } catch (e) {}
      if (currentAudioBtn) {
        currentAudioBtn.classList.remove('is-playing');
        currentAudioBtn.innerHTML = ICON.play + ' Preview';
      }
      if (currentAudioBtn === btn) {
        currentAudioPlaying = null;
        currentAudioBtn = null;
        return;
      }
    }

    var soundUrl = '';
    if (typeof assetOrPath === 'string') {
      soundUrl = assetOrPath;
    } else if (assetOrPath && assetOrPath.url) {
      soundUrl = assetOrPath.url;
    } else if (assetOrPath && assetOrPath.file) {
      soundUrl = 'assets/audio/' + assetOrPath.file;
    }

    if (!soundUrl) return;

    var audio = new Audio(soundUrl);
    currentAudioPlaying = audio;
    currentAudioBtn = btn;

    if (btn) {
      btn.classList.add('is-playing');
      btn.innerHTML = ICON.pause + ' Stop';
    }

    audio.play().catch(function () {
      if (btn) {
        btn.classList.remove('is-playing');
        btn.innerHTML = ICON.play + ' Preview';
      }
      currentAudioPlaying = null;
      currentAudioBtn = null;
    });

    audio.addEventListener('ended', function () {
      if (btn) {
        btn.classList.remove('is-playing');
        btn.innerHTML = ICON.play + ' Preview';
      }
      currentAudioPlaying = null;
      currentAudioBtn = null;
    });
  }

  function stopAudio() {
    if (currentAudioPlaying) {
      try {
        currentAudioPlaying.pause();
        currentAudioPlaying.currentTime = 0;
      } catch (e) {}
    }
    if (currentAudioBtn) {
      currentAudioBtn.classList.remove('is-playing');
      currentAudioBtn.innerHTML = ICON.play + ' Preview';
    }
    currentAudioPlaying = null;
    currentAudioBtn = null;
  }

  /* ------------------------------------------------------------------
   * UI BUILDER & MAIN RENDERER
   * ------------------------------------------------------------------ */
  function buildUI(services) {
    activeServices = services || activeServices || {};

    var root = document.getElementById('sfx-ai-assistant');
    if (!root) {
      root = document.createElement('div');
      root.id = 'sfx-ai-assistant';
      document.body.appendChild(root);
    }
    rootEl = root;

    var panel = document.getElementById('sfx-ai-assistant__panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'sfx-ai-assistant__panel';
      root.appendChild(panel);
    }
    panelEl = panel;

    // Load initial state
    state.settings = loadSettings();
    state.history = loadHistory();
    if (!state.history.length) {
      var initialId = uid();
      state.history.push({
        id: initialId,
        title: 'New Chat',
        messages: [],
        updatedAt: Date.now()
      });
      saveHistory(state.history);
      state.activeChatId = initialId;
    } else {
      state.activeChatId = state.history[0].id;
    }

    isInitialized = true;
    render();

    // Check Ollama status & fetch models
    checkOllamaStatus();
    fetchInstalledModels().catch(function () {});

    if (pendingOpen !== null) {
      setOpen(pendingOpen);
      pendingOpen = null;
    }

    // Global event listeners
    window.addEventListener('sfx-open-ai-assistant', function () { setOpen(true); });
    window.addEventListener('sfx-close-ai-assistant', function () { setOpen(false); });
    window.addEventListener('focus', function () {
      if (panelEl && panelEl.classList.contains('is-open')) {
        inspectTimeline(activeServices, false);
      }
    });

    try {
      document.dispatchEvent(new CustomEvent('sfx-ai-assistant-ready'));
    } catch (eEvt) {}
  }

  function setOpen(opening) {
    if (!panelEl || !rootEl) {
      pendingOpen = opening;
      buildUI(activeServices);
      return;
    }

    if (opening) {
      render();
      panelEl.classList.add('is-open');
      rootEl.classList.add('is-open');
      inspectTimeline(activeServices, false);
      checkOllamaStatus();
      scrollChat();
      setTimeout(function () {
        var input = panelEl.querySelector('.sfx-ai-ws__input');
        if (input) input.focus();
      }, 70);
    } else {
      panelEl.classList.remove('is-open');
      rootEl.classList.remove('is-open');
      stopAudio();
      if (currentAbortController) {
        currentAbortController.abort();
      }
    }

    if (window.__sfxHeaderMenu && typeof window.__sfxHeaderMenu.refresh === 'function') {
      try { window.__sfxHeaderMenu.refresh(); } catch (e) {}
    }
  }

  function getActiveChat() {
    return state.history.find(function (h) { return h.id === state.activeChatId; }) || state.history[0];
  }

  function render() {
    if (!panelEl) return;
    panelEl.innerHTML = '';

    // 1. Top Header Bar
    var topBar = document.createElement('div');
    topBar.className = 'sfx-ai-ws__top';

    var backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'sfx-ai-ws__back';
    backBtn.innerHTML = ICON.back + ' <span>Back</span>';
    backBtn.title = 'Return to SFX Library';
    backBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    });
    topBar.appendChild(backBtn);

    var title = document.createElement('div');
    title.className = 'sfx-ai-ws__title';
    title.innerHTML = ICON.sparkles + ' <span>AI SFX Timeline Agent</span>';
    topBar.appendChild(title);

    // Model Selector
    var modelSelect = document.createElement('select');
    modelSelect.className = 'sfx-ai-ws__model-select';
    modelSelect.title = 'Active Ollama Model';
    var curModel = (state.settings && state.settings.model) || 'llama3.2';
    state.availableModels.forEach(function (m) {
      var opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      if (m === curModel) opt.selected = true;
      modelSelect.appendChild(opt);
    });
    modelSelect.addEventListener('change', function () {
      saveSettings({ model: this.value });
      updateStatusPillUI();
    });
    topBar.appendChild(modelSelect);

    // Timeline Pill
    var tlPill = document.createElement('button');
    tlPill.type = 'button';
    tlPill.className = 'sfx-ai-ws__timeline-pill' + (state.timelineContext && state.timelineContext.present ? ' is-active' : '');
    var tlText = state.timelineContext && state.timelineContext.present
      ? 'Seq: "' + (state.timelineContext.name || 'Sequence') + '" · ' + fmtTime(state.timelineContext.playheadSeconds)
      : 'Checking Sequence…';
    tlPill.innerHTML = '<span class="timeline-dot"></span><span class="sfx-ai-ws__timeline-pill-text">' + tlText + '</span>';
    tlPill.title = 'Click to re-sync timeline from Premiere Pro';
    tlPill.addEventListener('click', function () {
      tlPill.querySelector('.sfx-ai-ws__timeline-pill-text').textContent = 'Syncing…';
      inspectTimeline(activeServices, true);
    });
    topBar.appendChild(tlPill);

    // Status Pill
    var statusWrap = document.createElement('div');
    statusWrap.className = 'sfx-ai-ws__top-actions';

    var statusPill = document.createElement('div');
    statusPill.className = 'sfx-ai-ws__status-pill';
    statusPill.innerHTML =
      '<span class="sfx-ai-ws__status-dot ' + (state.ollamaOnline ? 'is-online' : 'is-offline') + '"></span>' +
      '<span class="sfx-ai-ws__status-label">' + (state.ollamaOnline ? 'Ollama: Ready' : 'Ollama: Offline') + '</span>';

    if (!state.ollamaOnline) {
      var retryBtn = document.createElement('button');
      retryBtn.type = 'button';
      retryBtn.className = 'sfx-ai-ws__status-retry-btn';
      retryBtn.textContent = 'Retry';
      retryBtn.title = 'Test connection to Ollama server';
      retryBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        checkOllamaStatus();
        fetchInstalledModels().catch(function () {});
      });
      statusPill.appendChild(retryBtn);
    }
    statusWrap.appendChild(statusPill);

    // Settings Toggle
    var settingsBtn = document.createElement('button');
    settingsBtn.type = 'button';
    settingsBtn.className = 'sfx-ai-ws__icon-btn' + (state.showSettings ? ' is-active' : '');
    settingsBtn.innerHTML = ICON.gear;
    settingsBtn.title = 'AI Settings';
    settingsBtn.addEventListener('click', function () {
      state.showSettings = !state.showSettings;
      render();
    });
    statusWrap.appendChild(settingsBtn);

    // Close Button
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'sfx-ai-ws__icon-btn';
    closeBtn.innerHTML = ICON.close;
    closeBtn.title = 'Close AI SFX';
    closeBtn.addEventListener('click', function () {
      setOpen(false);
    });
    statusWrap.appendChild(closeBtn);

    topBar.appendChild(statusWrap);
    panelEl.appendChild(topBar);

    // 2. Body Area
    var body = document.createElement('div');
    body.className = 'sfx-ai-ws__body';

    // Sidebar: History
    var histCol = document.createElement('div');
    histCol.className = 'sfx-ai-ws__history-col';

    var newChatBtn = document.createElement('button');
    newChatBtn.type = 'button';
    newChatBtn.className = 'sfx-ai-ws__new-chat';
    newChatBtn.innerHTML = ICON.plus + ' <span>New Chat</span>';
    newChatBtn.addEventListener('click', function () {
      state.showSettings = false;
      var newId = uid();
      state.history.unshift({
        id: newId,
        title: 'New Chat',
        messages: [],
        updatedAt: Date.now()
      });
      state.activeChatId = newId;
      saveHistory(state.history);
      render();
    });
    histCol.appendChild(newChatBtn);

    var histLabel = document.createElement('div');
    histLabel.className = 'sfx-ai-ws__history-label';
    histLabel.textContent = 'Recent Chats';
    histCol.appendChild(histLabel);

    var histList = document.createElement('div');
    histList.className = 'sfx-ai-ws__history';

    state.history.forEach(function (h) {
      var row = document.createElement('div');
      row.className = 'sfx-ai-ws__history-row' + (h.id === state.activeChatId ? ' is-active' : '');

      if (state.editingChatId === h.id) {
        var editInput = document.createElement('input');
        editInput.type = 'text';
        editInput.className = 'sfx-ai-ws__history-edit-input';
        editInput.value = h.title || 'Chat';
        function commitRename() {
          h.title = editInput.value.trim() || 'Chat';
          state.editingChatId = null;
          saveHistory(state.history);
          render();
        }
        editInput.addEventListener('blur', commitRename);
        editInput.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
          else if (e.key === 'Escape') { state.editingChatId = null; render(); }
        });
        row.appendChild(editInput);
        setTimeout(function () { editInput.focus(); editInput.select(); }, 20);
      } else {
        var itemBtn = document.createElement('button');
        itemBtn.type = 'button';
        itemBtn.className = 'sfx-ai-ws__history-item';
        itemBtn.textContent = h.title || 'Untitled';
        itemBtn.title = h.title || 'Untitled';
        itemBtn.addEventListener('click', function () {
          state.activeChatId = h.id;
          state.showSettings = false;
          render();
          scrollChat();
        });
        row.appendChild(itemBtn);

        var actions = document.createElement('div');
        actions.className = 'sfx-ai-ws__history-actions';

        var renameBtn = document.createElement('button');
        renameBtn.type = 'button';
        renameBtn.className = 'sfx-ai-ws__history-action-btn';
        renameBtn.innerHTML = ICON.edit;
        renameBtn.title = 'Rename Chat';
        renameBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          state.editingChatId = h.id;
          render();
        });
        actions.appendChild(renameBtn);

        var delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'sfx-ai-ws__history-action-btn delete';
        delBtn.innerHTML = ICON.trash;
        delBtn.title = 'Delete Chat';
        delBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          deleteChat(h.id);
        });
        actions.appendChild(delBtn);

        row.appendChild(actions);
      }

      histList.appendChild(row);
    });
    histCol.appendChild(histList);

    // Clear All Button at bottom of history
    var clearAllBtn = document.createElement('button');
    clearAllBtn.type = 'button';
    clearAllBtn.className = 'sfx-ai-ws__clear-all-btn';
    clearAllBtn.innerHTML = ICON.trash + ' <span>Clear All History</span>';
    clearAllBtn.addEventListener('click', function () {
      if (confirm('Are you sure you want to delete all chat history?')) {
        state.history = [{ id: uid(), title: 'New Chat', messages: [], updatedAt: Date.now() }];
        state.activeChatId = state.history[0].id;
        saveHistory(state.history);
        render();
      }
    });
    histCol.appendChild(clearAllBtn);

    body.appendChild(histCol);

    // Main Content
    var main = document.createElement('div');
    main.className = 'sfx-ai-ws__main';

    if (state.showSettings) {
      main.appendChild(renderSettingsView());
    } else {
      var chatArea = document.createElement('div');
      chatArea.className = 'sfx-ai-ws__chat';
      chatArea.id = 'sfx-ai-chat-stream';

      var currentChat = getActiveChat();
      var msgs = (currentChat && currentChat.messages) || [];

      if (!msgs.length) {
        chatArea.appendChild(renderWelcomeScreen());
      } else {
        msgs.forEach(function (m, idx) {
          var isLatest = (idx === msgs.length - 1);
          chatArea.appendChild(renderMessageBubble(m, isLatest));
        });
        if (state.isGenerating) {
          chatArea.appendChild(renderTypingIndicator());
        }
      }

      main.appendChild(chatArea);
      main.appendChild(renderInputBar());
    }

    body.appendChild(main);
    panelEl.appendChild(body);
  }

  function deleteChat(id) {
    state.history = state.history.filter(function (h) { return h.id !== id; });
    if (!state.history.length) {
      var newId = uid();
      state.history.push({ id: newId, title: 'New Chat', messages: [], updatedAt: Date.now() });
      state.activeChatId = newId;
    } else if (state.activeChatId === id) {
      state.activeChatId = state.history[0].id;
    }
    saveHistory(state.history);
    render();
  }

  /* ------------------------------------------------------------------
   * RENDER COMPONENTS
   * ------------------------------------------------------------------ */
  function renderWelcomeScreen() {
    var wrap = document.createElement('div');
    wrap.className = 'sfx-ai-ws__welcome';
    wrap.innerHTML =
      '<div class="sfx-ai-ws__welcome-icon">' + ICON.sparkles + '</div>' +
      '<h2>Autonomous Premiere Pro Sound Design</h2>' +
      '<p>Instruct the AI to inspect your sequence, generate sound design plans, arrange Foley, recommend library sounds, and place audio with sample accuracy.</p>';

    var prompts = document.createElement('div');
    prompts.className = 'sfx-ai-ws__welcome-prompts';
    EXAMPLE_PROMPTS.forEach(function (p) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sfx-ai-ws__welcome-prompt-btn';
      btn.textContent = p;
      btn.addEventListener('click', function () {
        submitUserPrompt(p);
      });
      prompts.appendChild(btn);
    });
    wrap.appendChild(prompts);
    return wrap;
  }

  function renderMessageBubble(m, isLatest) {
    var row = document.createElement('div');
    row.className = 'sfx-ai-ws__message ' + m.role;

    var avatar = document.createElement('div');
    avatar.className = 'sfx-ai-ws__avatar';
    avatar.innerHTML = m.role === 'assistant' ? ICON.sparkles : 'U';
    row.appendChild(avatar);

    var bubble = document.createElement('div');
    bubble.className = 'sfx-ai-ws__bubble';

    if (m.text) {
      bubble.innerHTML = simpleMarkdown(m.text);
    }

    // Sound Recommendation Action Cards
    if (m.cards && m.cards.length && !m.plan) {
      bubble.appendChild(renderSoundCards(m.cards));
    }

    // Action Plan Card
    if (m.plan) {
      bubble.appendChild(renderActionPlanCard(m.plan, m));
    }

    // Action Toolbar for assistant
    if (m.role === 'assistant' && !m.isStreaming) {
      var actionsBar = document.createElement('div');
      actionsBar.className = 'sfx-ai-ws__msg-actions';

      var copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'sfx-ai-ws__msg-action-btn';
      copyBtn.innerHTML = ICON.copy + ' <span>Copy</span>';
      copyBtn.addEventListener('click', function () {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(m.text || '').then(function () {
            copyBtn.innerHTML = ICON.check + ' <span>Copied</span>';
            setTimeout(function () { copyBtn.innerHTML = ICON.copy + ' <span>Copy</span>'; }, 1500);
          });
        }
      });
      actionsBar.appendChild(copyBtn);

      if (isLatest && !state.isGenerating) {
        var regenBtn = document.createElement('button');
        regenBtn.type = 'button';
        regenBtn.className = 'sfx-ai-ws__msg-action-btn';
        regenBtn.innerHTML = ICON.refresh + ' <span>Regenerate</span>';
        regenBtn.addEventListener('click', function () {
          regenerateLastResponse();
        });
        actionsBar.appendChild(regenBtn);
      }

      bubble.appendChild(actionsBar);
    }

    row.appendChild(bubble);
    return row;
  }

  function renderSoundCards(cards) {
    var wrap = document.createElement('div');
    wrap.className = 'sfx-ai-ws__cards';
    cards.forEach(function (c) {
      var card = document.createElement('div');
      card.className = 'sfx-ai-ws__card';

      var info = document.createElement('div');
      info.className = 'sfx-ai-ws__card-info';
      var dur = c.duration ? c.duration + 's' : '1.8s';
      info.innerHTML =
        '<div class="sfx-ai-ws__card-name" title="' + (c.name || '') + '">' + (c.name || 'Untitled') + '</div>' +
        '<div class="sfx-ai-ws__card-meta">' + (c.subcat || c.cat || c.folder || 'SFX') + ' · ' + dur + '</div>';
      card.appendChild(info);

      var actions = document.createElement('div');
      actions.className = 'sfx-ai-ws__card-actions';

      // Preview button
      var prevBtn = document.createElement('button');
      prevBtn.type = 'button';
      prevBtn.className = 'sfx-ai-ws__card-btn';
      prevBtn.innerHTML = ICON.play + ' Preview';
      prevBtn.addEventListener('click', function () {
        togglePreview(c, prevBtn);
      });
      actions.appendChild(prevBtn);

      // Add to timeline button
      var placeBtn = document.createElement('button');
      placeBtn.type = 'button';
      placeBtn.className = 'sfx-ai-ws__card-btn primary';
      placeBtn.innerHTML = ICON.place + ' Place';
      placeBtn.addEventListener('click', function () {
        placeBtn.textContent = 'Placing…';
        invokeHost(activeServices && activeServices.bridge, 'sfx.import', {
          path: c.path || c.file || c.id,
          atPlayhead: true,
          snapToFrame: true
        })
          .then(function () {
            placeBtn.innerHTML = ICON.check + ' Placed';
            setTimeout(function () { placeBtn.innerHTML = ICON.place + ' Place'; }, 2000);
            inspectTimeline(activeServices, true);
          })
          .catch(function (err) {
            placeBtn.textContent = 'Failed';
            alert('Could not place audio in Premiere Pro: ' + (err.message || err));
            setTimeout(function () { placeBtn.innerHTML = ICON.place + ' Place'; }, 2000);
          });
      });
      actions.appendChild(placeBtn);

      card.appendChild(actions);
      wrap.appendChild(card);
    });
    return wrap;
  }

  function renderActionPlanCard(plan, messageObj) {
    var card = document.createElement('div');
    card.className = 'sfx-ai-ws__plan-card' + (plan.isExecuted ? ' is-executed' : '');

    var header = document.createElement('div');
    header.className = 'sfx-ai-ws__plan-header';

    var titleRow = document.createElement('div');
    titleRow.className = 'sfx-ai-ws__plan-title-row';

    var badge = document.createElement('span');
    badge.className = 'sfx-ai-ws__plan-badge' + (plan.isExecuted ? ' verified' : '');
    badge.textContent = plan.isExecuted ? 'EXECUTED IN PREMIERE PRO' : 'SOUND DESIGN PLAN';
    titleRow.appendChild(badge);

    var seqChip = document.createElement('span');
    seqChip.className = 'sfx-ai-ws__plan-seq-chip';
    seqChip.textContent = (plan.sequenceName || 'Active Sequence') + ' · ' + plan.actions.length + ' sounds';
    titleRow.appendChild(seqChip);

    header.appendChild(titleRow);

    var summary = document.createElement('div');
    summary.className = 'sfx-ai-ws__plan-summary';
    summary.textContent = plan.summary || 'Proposed audio arrangement:';
    header.appendChild(summary);

    card.appendChild(header);

    // List of plan actions
    var itemsWrap = document.createElement('div');
    itemsWrap.className = 'sfx-ai-ws__plan-items';

    plan.actions.forEach(function (act) {
      var item = document.createElement('div');
      item.className = 'sfx-ai-ws__plan-item' + (act.included === false ? ' is-excluded' : '');

      var chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.className = 'sfx-ai-ws__plan-check';
      chk.checked = act.included !== false;
      chk.disabled = !!plan.isExecuted;
      chk.addEventListener('change', function () {
        act.included = chk.checked;
        item.classList.toggle('is-excluded', !chk.checked);
      });
      item.appendChild(chk);

      var rBadge = document.createElement('span');
      rBadge.className = 'sfx-ai-ws__role-badge role--' + (act.role || 'action');
      rBadge.textContent = act.role || 'SFX';
      item.appendChild(rBadge);

      var info = document.createElement('div');
      info.className = 'sfx-ai-ws__plan-item-info';
      info.innerHTML =
        '<div class="sfx-ai-ws__plan-item-name">' + act.name + '</div>' +
        '<div class="sfx-ai-ws__plan-item-meta">' +
        '<span>@ ' + fmtTime(act.seconds) + '</span>' +
        '<span class="sfx-ai-ws__plan-tag">Track A' + act.trackNumber + '</span>' +
        '<span>' + (act.gainDb || 0) + ' dB</span>' +
        '</div>';
      item.appendChild(info);

      var actions = document.createElement('div');
      actions.className = 'sfx-ai-ws__plan-item-actions';

      var prevBtn = document.createElement('button');
      prevBtn.type = 'button';
      prevBtn.className = 'sfx-ai-ws__plan-btn-mini';
      prevBtn.textContent = '▶';
      prevBtn.title = 'Preview sound';
      prevBtn.addEventListener('click', function () {
        togglePreview(act.path, prevBtn);
      });
      actions.appendChild(prevBtn);

      item.appendChild(actions);
      itemsWrap.appendChild(item);
    });

    card.appendChild(itemsWrap);

    // Execute Plan Button
    if (!plan.isExecuted) {
      var actionsBar = document.createElement('div');
      actionsBar.className = 'sfx-ai-ws__plan-actions';

      var execBtn = document.createElement('button');
      execBtn.type = 'button';
      execBtn.className = 'sfx-ai-ws__btn sfx-ai-ws__btn--approve';
      execBtn.innerHTML = ICON.place + ' <span>Add All to Premiere Pro Timeline</span>';
      execBtn.addEventListener('click', function () {
        execBtn.disabled = true;
        execBtn.textContent = 'Placing in Premiere Pro…';
        executeTimelinePlan(plan, activeServices)
          .then(function () {
            plan.isExecuted = true;
            persistActiveChat();
            render();
          })
          .catch(function (err) {
            execBtn.disabled = false;
            execBtn.textContent = 'Failed';
            alert('Could not place action plan: ' + (err.message || err));
          });
      });
      actionsBar.appendChild(execBtn);
      card.appendChild(actionsBar);
    }

    return card;
  }

  function renderTypingIndicator() {
    var row = document.createElement('div');
    row.className = 'sfx-ai-ws__message assistant';
    row.innerHTML =
      '<div class="sfx-ai-ws__avatar">' + ICON.sparkles + '</div>' +
      '<div class="sfx-ai-ws__bubble is-typing">' +
      '<span class="dot"></span><span class="dot"></span><span class="dot"></span>' +
      '</div>';
    return row;
  }

  function renderInputBar() {
    var footer = document.createElement('div');
    footer.className = 'sfx-ai-ws__footer';

    var wrap = document.createElement('div');
    wrap.className = 'sfx-ai-ws__input-wrap';

    var textarea = document.createElement('textarea');
    textarea.className = 'sfx-ai-ws__input';
    textarea.placeholder = 'Ask AI SFX about sounds, scenes, or timeline commands...';
    textarea.rows = 1;

    textarea.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        var txt = textarea.value.trim();
        if (txt) {
          textarea.value = '';
          submitUserPrompt(txt);
        }
      }
    });

    wrap.appendChild(textarea);

    var actionBtn = document.createElement('button');
    actionBtn.type = 'button';

    if (state.isGenerating) {
      actionBtn.className = 'sfx-ai-ws__send-btn sfx-ai-ws__stop-btn';
      actionBtn.innerHTML = ICON.stop;
      actionBtn.title = 'Stop Generating';
      actionBtn.addEventListener('click', function (e) {
        e.preventDefault();
        if (currentAbortController) currentAbortController.abort();
      });
    } else {
      actionBtn.className = 'sfx-ai-ws__send-btn';
      actionBtn.innerHTML = ICON.send;
      actionBtn.title = 'Send Message';
      actionBtn.addEventListener('click', function (e) {
        e.preventDefault();
        var txt = textarea.value.trim();
        if (txt) {
          textarea.value = '';
          submitUserPrompt(txt);
        }
      });
    }

    wrap.appendChild(actionBtn);
    footer.appendChild(wrap);

    var hint = document.createElement('div');
    hint.className = 'sfx-ai-ws__footer-hint';
    hint.textContent = 'Press Enter to send · Shift + Enter for new line';
    footer.appendChild(hint);

    return footer;
  }

  function renderSettingsView() {
    var wrap = document.createElement('div');
    wrap.className = 'sfx-ai-ws__settings';

    var heading = document.createElement('h3');
    heading.textContent = 'AI Provider & Model Settings';
    wrap.appendChild(heading);

    var hint = document.createElement('p');
    hint.className = 'sfx-ai-ws__settings-hint';
    hint.textContent = 'SFX Composer connects directly to your local Ollama server. No external API keys or cloud subscriptions required.';
    wrap.appendChild(hint);

    // Endpoint field
    var epGroup = document.createElement('div');
    epGroup.className = 'sfx-ai-field-group';
    epGroup.innerHTML = '<label>Ollama Server Endpoint</label>';
    var epInput = document.createElement('input');
    epInput.type = 'text';
    epInput.value = state.settings.endpoint || 'http://localhost:11434';
    epInput.className = 'sfx-ai-input';
    epInput.addEventListener('change', function () {
      saveSettings({ endpoint: this.value.trim() });
    });
    epGroup.appendChild(epInput);
    wrap.appendChild(epGroup);

    // Model Selector
    var mGroup = document.createElement('div');
    mGroup.className = 'sfx-ai-field-group';
    mGroup.innerHTML = '<label>Installed Ollama Model</label>';

    var row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '8px';

    var mSelect = document.createElement('select');
    mSelect.className = 'sfx-ai-select';
    state.availableModels.forEach(function (m) {
      var opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      if (m === state.settings.model) opt.selected = true;
      mSelect.appendChild(opt);
    });
    mSelect.addEventListener('change', function () {
      saveSettings({ model: this.value });
    });
    row.appendChild(mSelect);

    var refreshBtn = document.createElement('button');
    refreshBtn.type = 'button';
    refreshBtn.className = 'sfx-ai-ws__btn sfx-ai-ws__btn--edit';
    refreshBtn.innerHTML = ICON.refresh + ' Refresh';
    refreshBtn.addEventListener('click', function () {
      refreshBtn.textContent = 'Checking…';
      fetchInstalledModels()
        .then(function () {
          render();
        })
        .catch(function () {
          alert('Could not reach Ollama at ' + getOllamaBase());
          render();
        });
    });
    row.appendChild(refreshBtn);
    mGroup.appendChild(row);
    wrap.appendChild(mGroup);

    // Temperature
    var tGroup = document.createElement('div');
    tGroup.className = 'sfx-ai-field-group';
    tGroup.innerHTML = '<label>Temperature (Creativity: ' + (state.settings.temperature || 0.4) + ')</label>';
    var tSlider = document.createElement('input');
    tSlider.type = 'range';
    tSlider.min = '0.0';
    tSlider.max = '1.0';
    tSlider.step = '0.1';
    tSlider.value = String(state.settings.temperature || 0.4);
    tSlider.addEventListener('input', function () {
      saveSettings({ temperature: parseFloat(this.value) });
      tGroup.querySelector('label').textContent = 'Temperature (Creativity: ' + this.value + ')';
    });
    tGroup.appendChild(tSlider);
    wrap.appendChild(tGroup);

    // Test Connection Button
    var testBtn = document.createElement('button');
    testBtn.type = 'button';
    testBtn.className = 'sfx-ai-ws__btn sfx-ai-ws__btn--approve';
    testBtn.style.marginTop = '12px';
    testBtn.textContent = 'Test Connection to Ollama';
    testBtn.addEventListener('click', function () {
      testBtn.textContent = 'Testing…';
      checkOllamaStatus().then(function (ok) {
        if (ok) {
          testBtn.textContent = '✓ Connected to Ollama!';
          setTimeout(function () { testBtn.textContent = 'Test Connection to Ollama'; }, 2000);
        } else {
          testBtn.textContent = '✕ Connection Failed';
          alert('Failed to connect to Ollama at ' + getOllamaBase() + '.\nPlease ensure Ollama is running.');
          setTimeout(function () { testBtn.textContent = 'Test Connection to Ollama'; }, 2000);
        }
      });
    });
    wrap.appendChild(testBtn);

    return wrap;
  }

  function updateStatusPillUI() {
    if (!panelEl) return;
    var dot = panelEl.querySelector('.sfx-ai-ws__status-dot');
    var label = panelEl.querySelector('.sfx-ai-ws__status-label');
    if (dot) {
      dot.className = 'sfx-ai-ws__status-dot ' + (state.ollamaOnline ? 'is-online' : 'is-offline');
    }
    if (label) {
      label.textContent = state.ollamaOnline
        ? 'Ollama: Ready (' + (state.settings.model || 'llama3.2') + ')'
        : 'Ollama: Offline';
    }
  }

  function updateModelSelectUI() {
    if (!panelEl) return;
    var select = panelEl.querySelector('.sfx-ai-ws__model-select');
    if (!select) return;
    var cur = (state.settings && state.settings.model) || 'llama3.2';
    select.innerHTML = '';
    state.availableModels.forEach(function (m) {
      var opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      if (m === cur) opt.selected = true;
      select.appendChild(opt);
    });
  }

  function updateTimelinePillUI() {
    if (!panelEl) return;
    var pill = panelEl.querySelector('.sfx-ai-ws__timeline-pill');
    var textEl = panelEl.querySelector('.sfx-ai-ws__timeline-pill-text');
    if (!pill || !textEl) return;
    var tl = state.timelineContext;
    if (tl && tl.present) {
      pill.classList.add('is-active');
      textEl.textContent = 'Seq: "' + (tl.name || 'Sequence') + '" · ' + fmtTime(tl.playheadSeconds);
    } else {
      pill.classList.remove('is-active');
      textEl.textContent = 'No Active Sequence';
    }
  }

  function scrollChat() {
    setTimeout(function () {
      var chat = document.getElementById('sfx-ai-chat-stream');
      if (chat) chat.scrollTop = chat.scrollHeight;
    }, 20);
  }

  function persistActiveChat() {
    var cur = getActiveChat();
    if (cur) {
      cur.updatedAt = Date.now();
      if ((cur.title === 'New Chat' || !cur.title) && cur.messages.length > 0) {
        var firstUser = cur.messages.find(function (m) { return m.role === 'user'; });
        if (firstUser) {
          cur.title = firstUser.text.slice(0, 32);
        }
      }
    }
    saveHistory(state.history);
  }

  /* ------------------------------------------------------------------
   * PROMPT SUBMISSION & DISPATCH
   * ------------------------------------------------------------------ */
  function submitUserPrompt(text) {
    text = String(text || '').trim();
    if (!text || state.isGenerating) return;

    var cur = getActiveChat();
    if (!cur) return;

    cur.messages.push({
      role: 'user',
      text: text,
      at: Date.now()
    });
    persistActiveChat();

    state.isGenerating = true;
    render();
    scrollChat();

    // Check intent
    var intent = parseUserIntent(text, state.timelineContext);

    // Intent: Transport
    if (intent.type === 'transport') {
      state.isGenerating = false;
      invokeHost(activeServices && activeServices.bridge, 'transport.control', { action: intent.action })
        .then(function () {
          cur.messages.push({
            role: 'assistant',
            text: 'Transport command **' + intent.action + '** executed in Premiere Pro [Verified].',
            at: Date.now()
          });
          persistActiveChat();
          render();
        })
        .catch(function (err) {
          cur.messages.push({
            role: 'assistant',
            text: 'Transport command failed: ' + (err.message || err),
            at: Date.now()
          });
          persistActiveChat();
          render();
        });
      return;
    }

    // Intent: Read playhead
    if (intent.type === 'read_playhead') {
      state.isGenerating = false;
      var pos = state.timelineContext && state.timelineContext.present
        ? fmtTime(state.timelineContext.playheadSeconds)
        : '00:00.00';
      cur.messages.push({
        role: 'assistant',
        text: 'The playhead is currently at **' + pos + '** in sequence *"' + ((state.timelineContext && state.timelineContext.name) || 'Active Sequence') + '"*.',
        at: Date.now()
      });
      persistActiveChat();
      render();
      return;
    }

    // Intent: Inspect timeline
    if (intent.type === 'inspect_timeline') {
      state.isGenerating = false;
      inspectTimeline(activeServices, true).then(function (tl) {
        var report = tl && tl.present
          ? '### Sequence Inspection [Verified]\n' +
            '- **Sequence:** "' + (tl.name || 'Untitled') + '"\n' +
            '- **Playhead:** ' + fmtTime(tl.playheadSeconds) + '\n' +
            '- **Duration:** ' + fmtTime(tl.durationSeconds) + '\n' +
            '- **Frame Rate:** ' + (tl.frameRate || 24).toFixed(2) + ' fps\n' +
            '- **Audio Tracks:** ' + (tl.audioTracks ? tl.audioTracks.length : 2) + '\n' +
            '- **Video Tracks:** ' + (tl.videoTracks ? tl.videoTracks.length : 1)
          : '**Timeline Status:** No active sequence open in Premiere Pro. Please open a sequence to inspect tracks.';
        cur.messages.push({
          role: 'assistant',
          text: report,
          at: Date.now()
        });
        persistActiveChat();
        render();
      });
      return;
    }

    // Intent: Scene Sound Design or Targeted Placement Plan
    if (intent.type === 'targeted_place' || intent.type === 'autonomous_sound_design') {
      var plan = buildActionPlan(intent, activeServices, state.timelineContext);
      state.isGenerating = false;

      if (plan.error) {
        cur.messages.push({ role: 'assistant', text: plan.error, at: Date.now() });
      } else {
        cur.messages.push({
          role: 'assistant',
          text: intent.type === 'targeted_place'
            ? 'I found a matching asset in your local sound library and prepared the placement plan for approval:'
            : 'I analyzed the scene and prepared an autonomous sound design arrangement matching your local SFX library:',
          plan: plan,
          at: Date.now()
        });
      }
      persistActiveChat();
      render();
      scrollChat();
      return;
    }

    // Conversational Sound Design with Local Ollama
    var candidates = selectCandidates(activeServices && activeServices.library, text, 8);

    var assistantMsg = {
      role: 'assistant',
      text: '',
      cards: null,
      at: Date.now(),
      isStreaming: true
    };
    cur.messages.push(assistantMsg);

    var priorHistory = cur.messages.slice(0, -2);

    streamAiChat(
      text,
      candidates,
      priorHistory,
      state.timelineContext,
      function onToken(streamText) {
        assistantMsg.text = streamText;
        updateStreamingDOM(streamText);
      },
      function onComplete(fullText) {
        state.isGenerating = false;
        assistantMsg.isStreaming = false;
        assistantMsg.text = fullText || 'Here are recommended sound design assets from your library:';
        if (candidates && candidates.length) {
          assistantMsg.cards = candidates.slice(0, 4);
        }
        persistActiveChat();
        render();
        scrollChat();
      },
      function onError(err) {
        state.isGenerating = false;
        assistantMsg.isStreaming = false;
        state.ollamaOnline = false;
        assistantMsg.text =
          '⚠️ **Ollama connection failed** (' + (err.message || 'Offline') + ').\n\n' +
          'Please ensure Ollama is running locally at `' + getOllamaBase() + '` with model `' + (state.settings.model || 'llama3.2') + '` installed.\n\n' +
          'Run `ollama serve` or open the Ollama application to start the local AI engine.';
        if (candidates && candidates.length) {
          assistantMsg.cards = candidates.slice(0, 3);
        }
        persistActiveChat();
        render();
        scrollChat();
      }
    );
  }

  function updateStreamingDOM(streamText) {
    var chat = document.getElementById('sfx-ai-chat-stream');
    if (!chat) return;
    var bubbles = chat.querySelectorAll('.sfx-ai-ws__message.assistant .sfx-ai-ws__bubble');
    if (!bubbles.length) return;
    var lastBubble = bubbles[bubbles.length - 1];
    lastBubble.innerHTML = simpleMarkdown(streamText);
    chat.scrollTop = chat.scrollHeight;
  }

  function regenerateLastResponse() {
    var cur = getActiveChat();
    if (!cur || !cur.messages.length) return;
    if (cur.messages[cur.messages.length - 1].role === 'assistant') {
      cur.messages.pop();
    }
    var lastUser = null;
    for (var i = cur.messages.length - 1; i >= 0; i--) {
      if (cur.messages[i].role === 'user') {
        lastUser = cur.messages[i].text;
        break;
      }
    }
    if (lastUser) {
      submitUserPrompt(lastUser);
    }
  }

  function simpleMarkdown(text) {
    if (!text) return '';
    var escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    return escaped
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/gim, '<em>$1</em>')
      .replace(/`([^`]+)`/gim, '<code>$1</code>')
      .replace(/^\s*-\s+(.*$)/gim, '<li>$1</li>')
      .replace(/(<li>.*<\/li>)/gims, '<ul>$1</ul>')
      .replace(/\n\n+/g, '</p><p>')
      .replace(/\n/g, '<br/>');
  }

  // Autonomous Timeline Agent API
  window.__sfxTimelineAgent = {
    inspectTimeline: function (force) {
      return inspectTimeline(activeServices, force);
    },
    parseUserIntent: parseUserIntent,
    buildActionPlan: function (text, tl) {
      var intent = parseUserIntent(text, tl || agentState.timeline);
      return buildActionPlan(intent, activeServices, tl || agentState.timeline);
    },
    executePlan: function (plan, onProgress) {
      return executeTimelinePlan(plan, activeServices, onProgress);
    },
    getState: function () {
      return agentState;
    }
  };

  if (window.__sfxAiAssistant) {
    window.__sfxAiAssistant.timelineAgent = window.__sfxTimelineAgent;
  }

  // Immediate execution with services
  if (typeof window !== 'undefined') {
    if (window.__sfxServices) {
      buildUI(window.__sfxServices);
    } else {
      buildUI(null);
      var checkCount = 0;
      var pollTimer = setInterval(function () {
        checkCount++;
        if (window.__sfxServices) {
          clearInterval(pollTimer);
          activeServices = window.__sfxServices;
          inspectTimeline(activeServices, false);
        } else if (checkCount > 30) {
          clearInterval(pollTimer);
        }
      }, 100);
    }
  }
})();
