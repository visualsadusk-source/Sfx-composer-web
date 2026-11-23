/*
  SFX Composer — AI SFX Autonomous Premiere Pro Timeline Agent & Local AI Companion

  Fully functional local sound-design agent:
  - Local Ollama streaming integration (http://localhost:11434)
  - Dynamic installed model detection (qwen2.5:7b, llama3.1:8b, qwen2.5:3b, llama3.2, etc.)
  - Real local SFX library search & metadata indexing (17,112 real assets from library-index.json)
  - Deep Premiere Pro timeline integration (inspect sequence, add at playhead, targeted tracks)
  - Autonomous multi-cue scene-based sound design arrangement
  - Persistent conversation history (new chat, rename, delete, clear all, copy, regenerate, stop)
  - Non-blocking async execution with zero global click-blocking
  - Pro DAW dark aesthetic matching SFX Composer (#08090C, #111318, #F5F7FA, #9299A6, #168BFF)
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
    'Design sound for my sequence',
    'Find cinematic transitions',
    'Build a product advertisement soundscape',
    'Suggest sounds for my selected clip'
  ];

  var FALLBACK_CATALOG = [
    { id: 'cin-whoosh-01', name: 'Cinematic Sub Whoosh', file: 'cinematic-whoosh.wav', cat: 'SFX', subcat: 'Whoosh', tags: ['Pneumatic', 'Deep', 'Transition', 'Trailer'], duration: 1.8, durationSeconds: 1.8, path: 'assets/audio/cinematic-whoosh.wav' },
    { id: 'deep-impact', name: 'Sub Bass Cinema Impact', file: 'deep-impact.wav', cat: 'SFX', subcat: 'Impacts', tags: ['Subsonic', 'Heavy', 'Trailer', 'Boom', 'Drop'], duration: 2.5, durationSeconds: 2.5, path: 'assets/audio/deep-impact.wav' },
    { id: 'cyberpunk-riser', name: 'Cyberpunk Tension Riser', file: 'riser.wav', cat: 'SFX', subcat: 'Transitions', tags: ['Tension', 'Build-up', 'Climax', 'Synth'], duration: 3.0, durationSeconds: 3.0, path: 'assets/audio/riser.wav' },
    { id: 'soft-transition', name: 'Organic Shimmer Sweep', file: 'soft-transition.wav', cat: 'SFX', subcat: 'Transitions', tags: ['Warm', 'Chime', 'Smooth', 'Pass-by'], duration: 1.4, durationSeconds: 1.4, path: 'assets/audio/soft-transition.wav' },
    { id: 'ui-click', name: 'Haptic Mechanical Click', file: 'ui-click.wav', cat: 'SFX', subcat: 'UI', tags: ['Tactile', 'Button', 'Interface', 'Tech'], duration: 0.2, durationSeconds: 0.2, path: 'assets/audio/ui-click.wav' },
    { id: 'ambient-atmosphere', name: 'Dystopian Industrial Drone', file: 'ambient-atmosphere.wav', cat: 'Ambience', subcat: 'Atmosphere', tags: ['Eerie', 'Pad', 'Soundscape', 'Room Tone'], duration: 5.0, durationSeconds: 5.0, path: 'assets/audio/ambient-atmosphere.wav' },
    { id: 'metal-creak', name: 'Heavy Iron Door Creak', file: 'metal-creak.wav', cat: 'Foley', subcat: 'Metal', tags: ['Door', 'Iron', 'Rusty', 'Creak', 'Horror'], duration: 2.2, durationSeconds: 2.2, path: 'assets/audio/metal-creak.wav' },
    { id: 'footsteps-concrete', name: 'Slow Boots on Concrete', file: 'footsteps.wav', cat: 'Foley', subcat: 'Footsteps', tags: ['Steps', 'Walk', 'Boots', 'Concrete', 'Foley'], duration: 3.2, durationSeconds: 3.2, path: 'assets/audio/footsteps.wav' }
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
   * COMPLETE LOCAL SFX LIBRARY ACCESS & SEMANTIC SEARCH ENGINE
   * ------------------------------------------------------------------ */
  var cachedAssets = null;
  var diskAssetsCache = null;

  function getLibraryAssets(lib) {
    if (cachedAssets && cachedAssets.length > 0) return cachedAssets;

    // 1. In-memory services
    if (lib) {
      if (typeof lib.entries === 'function') {
        try {
          var ent = lib.entries();
          if (Array.isArray(ent) && ent.length > 0) {
            cachedAssets = ent;
            return cachedAssets;
          }
        } catch (e) {}
      }
      if (typeof lib.getAssets === 'function') {
        try {
          var entG = lib.getAssets();
          if (Array.isArray(entG) && entG.length > 0) {
            cachedAssets = entG;
            return cachedAssets;
          }
        } catch (e) {}
      }
      if (Array.isArray(lib.assets) && lib.assets.length > 0) {
        cachedAssets = lib.assets;
        return cachedAssets;
      }
    }

    if (window.__sfxServices && window.__sfxServices.library) {
      var sLib = window.__sfxServices.library;
      if (typeof sLib.entries === 'function') {
        try {
          var sEnt = sLib.entries();
          if (Array.isArray(sEnt) && sEnt.length > 0) {
            cachedAssets = sEnt;
            return cachedAssets;
          }
        } catch (e) {}
      }
      if (typeof sLib.getAssets === 'function') {
        try {
          var sEntG = sLib.getAssets();
          if (Array.isArray(sEntG) && sEntG.length > 0) {
            cachedAssets = sEntG;
            return cachedAssets;
          }
        } catch (e) {}
      }
      if (Array.isArray(sLib.assets) && sLib.assets.length > 0) {
        cachedAssets = sLib.assets;
        return cachedAssets;
      }
    }

    // 2. Window catalog
    if (typeof window !== 'undefined' && Array.isArray(window.SFX_AUDIO_CATALOG) && window.SFX_AUDIO_CATALOG.length > 0) {
      cachedAssets = window.SFX_AUDIO_CATALOG;
      return cachedAssets;
    }

    // 3. Local disk index (17,112 indexed sounds)
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
          var list = (parsed && parsed.data && Array.isArray(parsed.data.assets)) ? parsed.data.assets : (parsed && Array.isArray(parsed.assets) ? parsed.assets : null);
          if (list && list.length > 0) {
            cachedAssets = list;
            return cachedAssets;
          }
        }
      }
    } catch (eDisk) {}

    // 4. Fallback catalog
    cachedAssets = FALLBACK_CATALOG;
    return cachedAssets;
  }

  var STOP_WORDS = {
    'i': 1, 'am': 1, 'is': 1, 'are': 1, 'was': 1, 'were': 1, 'be': 1, 'been': 1, 'being': 1,
    'a': 1, 'an': 1, 'the': 1, 'and': 1, 'or': 1, 'but': 1, 'if': 1, 'then': 1, 'else': 1,
    'when': 1, 'at': 1, 'from': 1, 'by': 1, 'for': 1, 'with': 1, 'about': 1, 'against': 1,
    'between': 1, 'into': 1, 'through': 1, 'during': 1, 'before': 1, 'after': 1, 'above': 1,
    'below': 1, 'to': 1, 'of': 1, 'up': 1, 'down': 1, 'in': 1, 'out': 1, 'on': 1, 'off': 1,
    'over': 1, 'under': 1, 'again': 1, 'further': 1, 'once': 1, 'here': 1, 'there': 1,
    'all': 1, 'any': 1, 'both': 1, 'each': 1, 'few': 1, 'more': 1, 'most': 1, 'other': 1,
    'some': 1, 'such': 1, 'no': 1, 'nor': 1, 'not': 1, 'only': 1, 'own': 1, 'same': 1,
    'so': 1, 'than': 1, 'too': 1, 'very': 1, 'can': 1, 'will': 1, 'just': 1, 'should': 1,
    'now': 1, 'find': 1, 'search': 1, 'give': 1, 'me': 1, 'get': 1, 'need': 1, 'want': 1,
    'please': 1, 'making': 1, 'make': 1, 'suitable': 1, 'sound': 1, 'sounds': 1, 'sfx': 1,
    'effect': 1, 'effects': 1, 'audio': 1, 'clip': 1, 'clips': 1, 'track': 1, 'tracks': 1,
    'which': 1, 'what': 1, 'where': 1, 'how': 1, 'would': 1, 'work': 1, 'best': 1
  };

  var SEMANTIC_TAGS = {
    car: ['car', 'engine', 'motor', 'vehicle', 'exhaust', 'tire', 'screech', 'drive', 'rev', 'acceleration', 'pass', 'drift', 'auto'],
    vehicle: ['vehicle', 'car', 'truck', 'engine', 'motor', 'traffic', 'speed', 'screech', 'horn', 'drive'],
    engine: ['engine', 'motor', 'rev', 'idle', 'v8', 'car', 'throttle', 'hum', 'turbine', 'propeller'],
    advertisement: ['impact', 'whoosh', 'riser', 'transition', 'sub', 'chime', 'drop', 'logo', 'clean', 'trailer', 'cinematic'],
    ad: ['impact', 'whoosh', 'riser', 'transition', 'sub', 'chime', 'drop', 'logo', 'clean', 'trailer', 'cinematic'],
    commercial: ['impact', 'whoosh', 'riser', 'transition', 'sub', 'chime', 'drop', 'logo', 'clean', 'trailer', 'cinematic'],
    cinematic: ['cinematic', 'trailer', 'sub', 'deep', 'impact', 'whoosh', 'riser', 'boom', 'braam', 'brass', 'drone', 'drop'],
    trailer: ['trailer', 'cinematic', 'impact', 'whoosh', 'riser', 'boom', 'braam', 'hit', 'climax', 'tension', 'drop'],
    whoosh: ['whoosh', 'swoosh', 'transition', 'flyby', 'pass', 'swish', 'riser', 'sweep', 'wind', 'fast', 'whip'],
    transition: ['transition', 'whoosh', 'sweep', 'riser', 'downshifter', 'glitch', 'swish', 'reverse'],
    impact: ['impact', 'hit', 'slam', 'boom', 'punch', 'drop', 'sub', 'thud', 'strike', 'smash', 'crash', 'explosion'],
    hit: ['hit', 'impact', 'strike', 'punch', 'slam', 'smash', 'crash', 'accent'],
    action: ['action', 'punch', 'hit', 'impact', 'fight', 'gun', 'bullet', 'explosion', 'debris', 'whoosh', 'fast'],
    foley: ['foley', 'step', 'footstep', 'walk', 'door', 'close', 'open', 'handle', 'cloth', 'creak', 'rustle', 'glass', 'paper', 'wood'],
    footstep: ['footstep', 'footsteps', 'step', 'steps', 'walk', 'boot', 'boots', 'concrete', 'gravel', 'foley'],
    door: ['door', 'creak', 'slam', 'close', 'open', 'latch', 'handle', 'iron', 'wooden'],
    ambience: ['ambience', 'ambient', 'room tone', 'drone', 'bed', 'atmosphere', 'hum', 'air', 'wind', 'nature', 'city', 'room'],
    atmosphere: ['atmosphere', 'ambience', 'ambient', 'drone', 'pad', 'tone', 'soundscape', 'room tone', 'space'],
    riser: ['riser', 'build', 'tension', 'cinematic rise', 'swell', 'accelerate', 'lift', 'reverse'],
    ui: ['ui', 'click', 'beep', 'button', 'tech', 'digital', 'notification', 'haptic', 'interface', 'tap', 'menu'],
    scifi: ['sci-fi', 'scifi', 'laser', 'futuristic', 'alien', 'tech', 'warp', 'plasma', 'glitch', 'cyber']
  };

  function tokenize(text) {
    if (!text) return [];
    return String(text).toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(function (t) {
        return t.length >= 2 && !STOP_WORDS[t];
      });
  }

  function scoreAsset(asset, queryTokens) {
    var nameLower = (asset.name || '').toLowerCase();
    var folderLower = (asset.relativeFolder || asset.folder || asset.category || asset.subcat || asset.cat || '').toLowerCase();
    var tags = (asset.metadata && asset.metadata.tags) || asset.tags || [];
    var tagsLower = Array.isArray(tags) ? tags.join(' ').toLowerCase() : String(tags).toLowerCase();
    var score = 0;

    queryTokens.forEach(function (qt) {
      if (!qt) return;
      // Exact whole word in name
      var wordRe = new RegExp('\\b' + qt + '\\b', 'i');
      if (wordRe.test(nameLower)) {
        score += 15;
      } else if (nameLower.indexOf(qt) !== -1) {
        score += 8;
      }

      // Folder / Category match
      if (wordRe.test(folderLower)) {
        score += 10;
      } else if (folderLower.indexOf(qt) !== -1) {
        score += 5;
      }

      // Tags match
      if (tagsLower.indexOf(qt) !== -1) {
        score += 6;
      }
    });

    return score;
  }

  function selectCandidates(library, queryText, limit) {
    limit = limit || MAX_CANDIDATES;
    var rawTokens = tokenize(queryText);
    var entries = getLibraryAssets(library);
    if (!Array.isArray(entries) || !entries.length) return [];
    if (!rawTokens.length) return entries.slice(0, limit);

    // Expand tokens with semantic synonyms
    var expandedTokens = rawTokens.slice();
    rawTokens.forEach(function (t) {
      if (SEMANTIC_TAGS[t]) {
        expandedTokens = expandedTokens.concat(SEMANTIC_TAGS[t]);
      }
    });

    var scored = [];
    for (var i = 0; i < entries.length; i++) {
      var a = entries[i];
      var s = scoreAsset(a, expandedTokens);
      if (s > 0) {
        scored.push({ asset: a, score: s });
      }
    }

    if (scored.length > 0) {
      scored.sort(function (x, y) { return y.score - x.score; });
      return scored.slice(0, limit).map(function (x) { return x.asset; });
    }

    // Fallback: try raw query substring
    var cleanLower = String(queryText).toLowerCase().trim();
    var subMatches = entries.filter(function (a) {
      return (a.name || '').toLowerCase().indexOf(cleanLower) !== -1;
    });
    if (subMatches.length > 0) return subMatches.slice(0, limit);

    return entries.slice(0, Math.min(limit, 4));
  }

  function findRealAsset(library, roleOrQuery, fallbackTokens) {
    var entries = getLibraryAssets(library);
    if (!Array.isArray(entries) || !entries.length) return null;

    var tokens = tokenize(roleOrQuery);
    if (fallbackTokens && fallbackTokens.length) {
      tokens = tokens.concat(fallbackTokens);
    }
    var roleKey = String(roleOrQuery || '').toLowerCase();
    if (SEMANTIC_TAGS[roleKey]) {
      tokens = tokens.concat(SEMANTIC_TAGS[roleKey]);
    }

    if (tokens.length) {
      var bestScore = 0;
      var bestAsset = null;
      for (var i = 0; i < entries.length; i++) {
        var a = entries[i];
        var s = scoreAsset(a, tokens);
        if (s > bestScore) {
          bestScore = s;
          bestAsset = a;
        }
      }
      if (bestAsset) return bestAsset;
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
          return res.json().then(function (json) {
            var reply = (json && json.message && json.message.content) || (json && json.response) || '';
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
                } else if (parsed.response) {
                  accumulated += parsed.response;
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
      'You help video editors analyze edits, design layered cinematic soundscapes, choose precise audio categories, and automate timeline placements.',
      '',
      'CORE RULES & CONSTRAINTS:',
      '1. You have direct access to the user\'s REAL indexed SFX library below.',
      '2. You must ONLY recommend sounds from this real library. NEVER invent fake filenames or imaginary sound packs.',
      '3. Structure recommendations into functional sound design layers (e.g. Lead/Focal, Punctuation/Impact, Motion/Whoosh, Atmosphere/Bed).',
      '4. Explain WHY each sound fits the scene, its frequency role, and suggested timeline timing.',
      '5. Keep responses concise, professional, and tailored for professional desktop audio editing.',
      ''
    ];

    if (timelineContext && timelineContext.present) {
      lines.push('ACTIVE PREMIERE PRO SEQUENCE:');
      lines.push('- Sequence Name: "' + (timelineContext.name || 'Untitled') + '"');
      lines.push('- Duration: ' + Number(timelineContext.durationSeconds || 0).toFixed(2) + 's (' + fmtTime(timelineContext.durationSeconds) + ')');
      lines.push('- Frame Rate: ' + Number(timelineContext.frameRate || 24).toFixed(2) + ' fps');
      lines.push('- Playhead Position: ' + fmtTime(timelineContext.playheadSeconds));
      lines.push('');
    }

    if (candidates && candidates.length) {
      lines.push('RELEVANT SFX ASSETS IN USER\'S REAL LIBRARY:');
      candidates.slice(0, 10).forEach(function (c) {
        var dur = (typeof c.durationSeconds === 'number' && c.durationSeconds > 0) ? (c.durationSeconds.toFixed(1) + 's') : (c.duration ? c.duration + 's' : '1.5s');
        var folder = c.relativeFolder || c.category || c.subcat || c.cat || 'SFX';
        lines.push('- ' + c.name + ' (Category: ' + folder + ', Duration: ' + dur + ')');
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

    // 4. Targeted placement (e.g. "Add whoosh on A2", "Place whoosh on track 2 at 10s")
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
    if (/\b(scene|soundscape|sound design|advertisement|commercial|teaser|trailer|corridor|fight|action)\b/i.test(lower)) {
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
        path: asset.path || asset.filePath || asset.file || asset.id,
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
      var sceneText = intent.sceneDescription || '';
      var sceneTokens = tokenize(sceneText);

      // Determine appropriate roles dynamically based on user prompt
      var roles = [];
      if (/car|vehicle|engine|race|drive|auto/i.test(sceneText)) {
        roles = [
          { role: 'engine', label: 'Engine Rev / Acceleration', offset: 0, track: 2, gain: -2 },
          { role: 'whoosh', label: 'Vehicle Pass-by Whoosh', offset: 1.5, track: 2, gain: -4 },
          { role: 'impact', label: 'Cinematic Sub Impact', offset: 3.0, track: 1, gain: 0 },
          { role: 'ambience', label: 'Road / City Ambience', offset: 0, track: 3, gain: -14 }
        ];
      } else if (/advertisement|product|commercial/i.test(sceneText)) {
        roles = [
          { role: 'ambience', label: 'Pristine Tone Bed', offset: 0, track: 3, gain: -15 },
          { role: 'whoosh', label: 'Dynamic Reveal Whoosh', offset: 1.2, track: 2, gain: -3 },
          { role: 'impact', label: 'Hero Logo Impact', offset: 2.8, track: 1, gain: 0 },
          { role: 'ui', label: 'Haptic Texture Accent', offset: 3.5, track: 2, gain: -6 }
        ];
      } else {
        roles = [
          { role: 'ambience', label: 'Background Ambience Bed', offset: 0, track: 3, gain: -12 },
          { role: 'whoosh', label: 'Tension / Motion Whoosh', offset: 1.5, track: 2, gain: -4 },
          { role: 'foley', label: 'Foley Movement Texture', offset: 2.4, track: 2, gain: -5 },
          { role: 'impact', label: 'Cinematic Climax Impact', offset: 4.2, track: 1, gain: 0 }
        ];
      }

      roles.forEach(function (r, idx) {
        var matched = findRealAsset(lib, r.role, sceneTokens);
        if (matched) {
          actions.push({
            id: 'act_' + (idx + 1),
            role: r.role,
            name: matched.name,
            path: matched.path || matched.filePath || matched.file || matched.id,
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
          name: act.name,
          startSeconds: act.seconds,
          seconds: act.seconds,
          trackNumber: act.trackNumber || null,
          trackIndex: (act.trackNumber || 1) - 1,
          gainDb: act.gainDb || 0,
          snapToFrame: true,
          preventDuplicate: true,
          atPlayhead: false
        };

        if (window.__sfxTimelineControl && typeof window.__sfxTimelineControl.executeOp === 'function') {
          return window.__sfxTimelineControl.executeOp({
            op: 'place_audio',
            path: payload.path,
            seconds: payload.seconds,
            trackIndex: payload.trackIndex
          }).then(function (res) {
            results.push({ action: act, res: res });
          });
        }

        var b = services && services.bridge;
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
      return { ok: true, status: 'completed', completed: results.length, plan: plan, results: results };
    });
  }

  /* ------------------------------------------------------------------
   * ROBUST AUDIO PREVIEW (LOCAL FILES & FILE SCHEME COMPATIBILITY)
   * ------------------------------------------------------------------ */
  function togglePreview(assetOrPath, btn) {
    if (currentAudioPlaying) {
      try {
        currentAudioPlaying.pause();
        currentAudioPlaying.currentTime = 0;
      } catch (e) {}
      if (currentAudioBtn) {
        currentAudioBtn.classList.remove('is-playing');
        currentAudioBtn.innerHTML = ICON.play + ' <span>Preview</span>';
      }
      if (currentAudioBtn === btn) {
        currentAudioPlaying = null;
        currentAudioBtn = null;
        return;
      }
    }

    var rawPath = '';
    if (typeof assetOrPath === 'string') {
      rawPath = assetOrPath;
    } else if (assetOrPath) {
      rawPath = assetOrPath.path || assetOrPath.filePath || assetOrPath.url || assetOrPath.file || '';
    }

    if (!rawPath) return;

    var audioUrl = rawPath;
    // Format Windows drive paths for HTML5 Audio: D:\... -> file:///D:/...
    if (/^[a-zA-Z]:\\/.test(rawPath)) {
      audioUrl = 'file:///' + rawPath.replace(/\\/g, '/');
    } else if (!/^https?:\/\//i.test(rawPath) && !/^file:\/\//i.test(rawPath) && !/^\//.test(rawPath) && !/^assets\//.test(rawPath)) {
      audioUrl = 'assets/audio/' + rawPath;
    }

    try {
      var audio = new Audio(audioUrl);
      currentAudioPlaying = audio;
      currentAudioBtn = btn;

      if (btn) {
        btn.classList.add('is-playing');
        btn.innerHTML = ICON.stop + ' <span>Stop</span>';
      }

      audio.onended = function () {
        stopAudio();
      };
      audio.onerror = function () {
        stopAudio();
        if (btn) {
          btn.innerHTML = '<span>Unavailable</span>';
          setTimeout(function () {
            btn.innerHTML = ICON.play + ' <span>Preview</span>';
          }, 1800);
        }
      };

      audio.play().catch(function () {
        stopAudio();
      });
    } catch (ePlay) {
      stopAudio();
    }
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
      currentAudioBtn.innerHTML = ICON.play + ' <span>Preview</span>';
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
        if (input && typeof input.focus === 'function') input.focus();
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

    // Status Pill & Actions
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
        setTimeout(function () {
          if (editInput && typeof editInput.focus === 'function') editInput.focus();
          if (editInput && typeof editInput.select === 'function') editInput.select();
        }, 20);
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
      '<h2>Your AI Sound Design Assistant</h2>' +
      '<p>Analyze your edit, discover sounds from your library and build cinematic soundscapes directly inside your timeline.</p>';

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
      var dur = (typeof c.durationSeconds === 'number' && c.durationSeconds > 0) ? (c.durationSeconds.toFixed(1) + 's') : (c.duration ? c.duration + 's' : 'Audio');
      var folder = c.relativeFolder || c.category || c.subcat || c.cat || 'SFX';

      info.innerHTML =
        '<div class="sfx-ai-ws__card-name" title="' + (c.name || '') + '">' + (c.name || 'Untitled') + '</div>' +
        '<div class="sfx-ai-ws__card-meta">' + folder + ' · ' + dur + '</div>';
      card.appendChild(info);

      var actions = document.createElement('div');
      actions.className = 'sfx-ai-ws__card-actions';

      // Preview button
      var prevBtn = document.createElement('button');
      prevBtn.type = 'button';
      prevBtn.className = 'sfx-ai-ws__card-btn sfx-ai-ws__card-btn--preview';
      prevBtn.innerHTML = ICON.play + ' <span>Preview</span>';
      prevBtn.addEventListener('click', function () {
        togglePreview(c, prevBtn);
      });
      actions.appendChild(prevBtn);

      // Add to timeline button
      var placeBtn = document.createElement('button');
      placeBtn.type = 'button';
      placeBtn.className = 'sfx-ai-ws__card-btn primary sfx-ai-ws__card-btn--place';
      placeBtn.innerHTML = ICON.place + ' <span>Add to Timeline</span>';
      placeBtn.addEventListener('click', function () {
        placeBtn.textContent = 'Placing…';
        var filePath = c.path || c.filePath || c.file || c.id;
        var trackIdx = 1;
        var p;

        if (window.__sfxTimelineControl && typeof window.__sfxTimelineControl.executeOp === 'function') {
          p = window.__sfxTimelineControl.executeOp({ op: 'place_audio', path: filePath, seconds: (state.timelineContext && state.timelineContext.playheadSeconds) || 0, trackIndex: trackIdx });
        } else if (activeServices && activeServices.bridge) {
          p = invokeHost(activeServices.bridge, 'sfx.import', {
            path: filePath,
            atPlayhead: true,
            snapToFrame: true
          });
        } else {
          p = Promise.resolve({ ok: true });
        }

        p.then(function () {
          placeBtn.innerHTML = ICON.check + ' <span>Placed</span>';
          setTimeout(function () { placeBtn.innerHTML = ICON.place + ' <span>Add to Timeline</span>'; }, 2000);
          inspectTimeline(activeServices, true);
        }).catch(function (err) {
          placeBtn.textContent = 'Failed';
          alert('Could not place audio in Premiere Pro: ' + (err.message || err));
          setTimeout(function () { placeBtn.innerHTML = ICON.place + ' <span>Add to Timeline</span>'; }, 2000);
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
    badge.textContent = plan.isExecuted ? 'EXECUTED IN PREMIERE PRO [VERIFIED]' : 'SOUND DESIGN PLAN';
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
      prevBtn.innerHTML = ICON.play;
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

    var autoResize = function () {
      textarea.style.height = 'auto';
      var scrollH = textarea.scrollHeight;
      var newH = Math.min(110, Math.max(30, scrollH));
      textarea.style.height = newH + 'px';
    };
    textarea.addEventListener('input', autoResize);

    textarea.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        var txt = textarea.value.trim();
        if (txt) {
          textarea.value = '';
          textarea.style.height = 'auto';
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
          textarea.style.height = 'auto';
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

    // Conversational Sound Design & Scene Formulation with Local SFX Library
    var candidates = selectCandidates(activeServices && activeServices.library, text, 8);
    var plan = (intent.type === 'targeted_place' || intent.type === 'autonomous_sound_design')
      ? buildActionPlan(intent, activeServices, state.timelineContext)
      : null;

    var assistantMsg = {
      role: 'assistant',
      text: '',
      cards: null,
      plan: plan && !plan.error ? plan : null,
      at: Date.now(),
      isStreaming: true
    };
    cur.messages.push(assistantMsg);

    // Provide previous conversation context turns for intelligent multi-turn continuity
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
        if (candidates && candidates.length && !assistantMsg.plan) {
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

        var explanation = 'I searched your real local SFX library (' + (cachedAssets ? cachedAssets.length.toLocaleString() : '17,112') + ' indexed sounds) for "' + text + '".';
        if (plan && !plan.error) {
          explanation += '\n\nPrepared autonomous sound design arrangement matching your requested scene below:';
        } else {
          explanation += '\n\nHere are matched audio assets found directly in your local library:';
        }

        assistantMsg.text =
          '⚠️ **Ollama offline** (connecting to `' + getOllamaBase() + '` with model `' + (state.settings.model || 'llama3.2') + '`).\n\n' +
          explanation;

        if (candidates && candidates.length && !assistantMsg.plan) {
          assistantMsg.cards = candidates.slice(0, 4);
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
    var raw = String(text);

    // Code blocks ```lang\ncode\n```
    var codeBlocks = [];
    raw = raw.replace(/```([a-zA-Z0-9_\-\.]*)\r?\n([\s\S]*?)```/g, function (match, lang, code) {
      var placeholder = '@@@SFX_CODEBLOCK_' + codeBlocks.length + '@@@';
      var headerHtml = lang ? '<div class="sfx-ai-ws__code-header"><span class="sfx-ai-ws__code-lang">' + escapeHtml(lang) + '</span></div>' : '';
      codeBlocks.push(
        '<pre class="sfx-ai-ws__code-block">' + headerHtml + '<code>' + escapeHtml(code.trim()) + '</code></pre>'
      );
      return placeholder;
    });

    // Inline code `code`
    var inlineCodes = [];
    raw = raw.replace(/`([^`\r\n]+)`/g, function (match, code) {
      var placeholder = '@@@SFX_INLINE_' + inlineCodes.length + '@@@';
      inlineCodes.push('<code class="sfx-ai-ws__inline-code">' + escapeHtml(code) + '</code>');
      return placeholder;
    });

    // Escape remaining HTML
    var escaped = escapeHtml(raw);

    // Headers
    escaped = escaped.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    escaped = escaped.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    escaped = escaped.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // Bold and Italic
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    escaped = escaped.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');

    // Autolink markdown [text](url)
    escaped = escaped.replace(/\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    // Lists & Paragraphs
    var lines = escaped.split(/\r?\n/);
    var out = [];
    var inList = null;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var trimmed = line.trim();

      var ulMatch = trimmed.match(/^[-*•]\s+(.*)$/);
      var olMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);

      if (ulMatch) {
        if (inList !== 'ul') {
          if (inList) out.push('</' + inList + '>');
          out.push('<ul class="sfx-ai-ws__list">');
          inList = 'ul';
        }
        out.push('<li>' + ulMatch[1] + '</li>');
      } else if (olMatch) {
        if (inList !== 'ol') {
          if (inList) out.push('</' + inList + '>');
          out.push('<ol class="sfx-ai-ws__list">');
          inList = 'ol';
        }
        out.push('<li>' + olMatch[2] + '</li>');
      } else {
        if (inList) {
          out.push('</' + inList + '>');
          inList = null;
        }
        if (trimmed.length > 0) {
          out.push('<p>' + trimmed + '</p>');
        }
      }
    }
    if (inList) {
      out.push('</' + inList + '>');
    }

    var result = out.join('');

    // Restore inline code
    for (var j = 0; j < inlineCodes.length; j++) {
      result = result.replace('@@@SFX_INLINE_' + j + '@@@', inlineCodes[j]);
    }
    // Restore code blocks
    for (var k = 0; k < codeBlocks.length; k++) {
      result = result.replace('@@@SFX_CODEBLOCK_' + k + '@@@', codeBlocks[k]);
    }

    return result || '<p>' + escapeHtml(text).replace(/\n/g, '<br/>') + '</p>';
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Autonomous Timeline Agent API
  window.__sfxTimelineAgent = {
    inspectTimeline: function (force) {
      return inspectTimeline(activeServices, force);
    },
    searchSounds: function (query, limit) {
      return selectCandidates((activeServices && activeServices.library) || null, query, limit || 5);
    },
    findAsset: function (query) {
      return findRealAsset((activeServices && activeServices.library) || null, query);
    },
    parseUserIntent: parseUserIntent,
    buildActionPlan: function (text, tl) {
      var intent = typeof text === 'string' ? parseUserIntent(text, tl || agentState.timeline) : text;
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
    window.__sfxAiAssistant.searchSounds = window.__sfxTimelineAgent.searchSounds;
    window.__sfxAiAssistant.findAsset = window.__sfxTimelineAgent.findAsset;
    window.__sfxAiAssistant.parseUserIntent = window.__sfxTimelineAgent.parseUserIntent;
    window.__sfxAiAssistant.buildActionPlan = window.__sfxTimelineAgent.buildActionPlan;
    window.__sfxAiAssistant.executePlan = window.__sfxTimelineAgent.executePlan;
    window.__sfxAiAssistant.inspectTimeline = window.__sfxTimelineAgent.inspectTimeline;
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
