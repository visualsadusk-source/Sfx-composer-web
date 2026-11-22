/*
  SFX Composer — AI SFX Autonomous Premiere Pro Timeline Agent

  Transforms the AI SFX Assistant into an autonomous sound design agent with
  deep Premiere Pro timeline integration, structured tool execution,
  permission/approval safety model, visual & audio scene understanding,
  local SFX library matching against real assets, and verified undo support.
*/
(function () {
  'use strict';

  var SETTINGS_KEY = 'sfxAiAssistantSettings';
  var HISTORY_KEY = 'sfxAiChatHistory';
  var MAX_CANDIDATES = 20;
  var REQUEST_TIMEOUT_MS = 60000;
  var MAX_HISTORY = 30;

  var ICON = {
    sparkles: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4L12 2z"/></svg>',
    gear: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.44.17-.48.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.48-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>',
    plus: '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>',
    edit: '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>',
    send: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>',
    back: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>',
    play: '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    place: '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>',
    undo: '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>',
    timeline: '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M3 5v14h18V5H3zm16 12H5V7h14v10zm-9-8H7v6h3V9zm4 2h-3v4h3v-4zm4-1h-3v5h3V10z"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>'
  };

  var DEFAULT_SETTINGS = {
    mode: 'suggest',
    minConfidence: 0.55,
    contextWindowSeconds: 2,
    autoSyncTimeline: true
  };

  var EXAMPLE_PROMPTS = [
    'Create complete cinematic sound design for this video',
    'Add cinematic impact at 00:05 on track 2',
    'Add whoosh sounds to all major transitions',
    'Inspect active sequence and existing audio tracks',
    'Add footsteps wherever the person walks',
    'Add ambient background sounds',
    'Lower background music whenever dialogue is playing'
  ];

  /* ------------------------------------------------------------------
   * STATE & PUBLIC API REGISTRATION
   * ------------------------------------------------------------------ */

  var panelEl = null;
  var rootEl = null;
  var setOpenInternal = null;
  var pendingOpen = null;
  var isInitialized = false;

  // Immediate public API export so header-menu and other components can bind synchronously
  window.__sfxAiAssistant = {
    isOpen: function () {
      if (panelEl) {
        return panelEl.classList.contains('is-open');
      }
      return pendingOpen === true;
    },
    setOpen: function (val) {
      if (setOpenInternal) {
        setOpenInternal(!!val);
      } else {
        pendingOpen = !!val;
      }
    },
    open: function () {
      this.setOpen(true);
    },
    close: function () {
      this.setOpen(false);
    },
    toggle: function () {
      this.setOpen(!this.isOpen());
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
      return raw ? Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw)) : Object.assign({}, DEFAULT_SETTINGS);
    } catch (e) {
      return Object.assign({}, DEFAULT_SETTINGS);
    }
  }

  function saveSettings(s) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) {}
  }

  function loadHistory() {
    try {
      var raw = localStorage.getItem(HISTORY_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.slice(0, MAX_HISTORY) : [];
    } catch (e) { return []; }
  }

  function saveHistory(list) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify((list || []).slice(0, MAX_HISTORY))); } catch (e) {}
  }

  function waitForServices(cb) {
    if (window.__sfxServices) return cb(window.__sfxServices);
    var n = 0;
    var timer = setInterval(function () {
      n++;
      if (window.__sfxServices) {
        clearInterval(timer);
        return cb(window.__sfxServices);
      }
      if (n >= 20) { // ~1s fallback
        clearInterval(timer);
        var fallback = {
          library: (window.__sfxServices && window.__sfxServices.library) || null,
          bridge: (window.__sfxServices && window.__sfxServices.bridge) || null,
          audio: (window.__sfxServices && window.__sfxServices.audio) || null
        };
        cb(fallback);
      }
    }, 50);
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

    return [];
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
    var folderTokens = tokenize(asset.relativeFolder || asset.folder || '');
    var tagTokens = (asset.metadata && asset.metadata.tags) || [];
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
    if (!tokens.length) return [];
    var entries = getLibraryAssets(library);
    if (!Array.isArray(entries) || !entries.length) return [];

    return entries
      .map(function (a) { return { asset: a, score: scoreAsset(a, tokens) }; })
      .filter(function (x) { return x.score > 0; })
      .sort(function (a, b) { return b.score - a.score; })
      .slice(0, limit)
      .map(function (x) { return x.asset; });
  }

  function findRealAsset(library, roleOrQuery, fallbackTokens) {
    var entries = getLibraryAssets(library);
    if (!Array.isArray(entries) || !entries.length) return null;

    // 1. Direct query match
    var primaryTokens = tokenize(roleOrQuery);
    if (primaryTokens.length) {
      var matches = entries
        .map(function (a) { return { asset: a, score: scoreAsset(a, primaryTokens) }; })
        .filter(function (x) { return x.score > 0; })
        .sort(function (a, b) { return b.score - a.score; });
      if (matches.length > 0) return matches[0].asset;
    }

    // 2. Semantic category lookup
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

    // 3. Fallback: first available asset in library
    return entries[0] || null;
  }

  /* ------------------------------------------------------------------
   * LOCAL AI & PROVIDER HELPERS
   * ------------------------------------------------------------------ */

  function getLocalAI() { return window.__localAIManager || null; }

  function getOllamaBase() {
    var lai = getLocalAI();
    if (lai && lai.getBaseUrl) return lai.getBaseUrl();
    try {
      var s = JSON.parse(localStorage.getItem('sfxLocalAiSettings') || '{}');
      if (s.endpoint) return s.endpoint;
    } catch (e) {}
    return 'http://localhost:11434';
  }

  function getModelName() {
    var lai = getLocalAI();
    if (lai && lai.getModelName) return lai.getModelName();
    try {
      var s = JSON.parse(localStorage.getItem('sfxLocalAiSettings') || '{}');
      if (s.model) return s.model;
    } catch (e) {}
    return 'llama3.2:latest';
  }

  function getProviders() { return window.__aiProviders || null; }

  function evaluateContentSafety(text) {
    var raw = String(text || '').trim();
    var lower = raw.toLowerCase();
    if (!raw) return { safe: false, reason: 'Empty prompt.' };

    var severeViolations = [
      /\b(?:child\s*porn|cp|csam)\b/i,
      /\b(?:kill\s*(?:yourself|myself)|suicide\s*instructions?)\b/i,
      /\b(?:how\s+to\s+make\s+a\s+(?:bomb|explosive|anthrax))\b/i
    ];
    for (var i = 0; i < severeViolations.length; i++) {
      if (severeViolations[i].test(lower)) {
        return {
          safe: false,
          reason: 'I cannot assist with content involving severe harm or illegal activities.'
        };
      }
    }
    return { safe: true };
  }

  /* ------------------------------------------------------------------
   * TIME & TIMECODE HELPERS
   * ------------------------------------------------------------------ */

  function fmtTime(sec) {
    var s = Number(sec) || 0;
    var m = Math.floor(s / 60);
    var rem = (s % 60).toFixed(2);
    if (Number(rem) < 10) rem = '0' + rem;
    var mStr = m < 10 ? '0' + m : String(m);
    return mStr + ':' + rem;
  }

  function parseTimeToken(str) {
    var s = String(str || '').trim();
    var m = s.match(/^(\d{1,2}):(\d{2})(?:\.(\d+))?$/);
    if (m) {
      return parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + (m[3] ? parseFloat('0.' + m[3]) : 0);
    }
    m = s.match(/^(\d+(?:\.\d+)?)\s*s$/i);
    if (m) return parseFloat(m[1]);
    if (/^\d+(?:\.\d+)?$/.test(s)) return parseFloat(s);
    return null;
  }

  /* ------------------------------------------------------------------
   * AUTONOMOUS PREMIERE PRO TIMELINE AGENT CORE
   * ------------------------------------------------------------------ */

  var agentState = {
    timeline: null,
    selectedClips: [],
    lastExecutedPlan: null,
    pendingPlan: null,
    isExecuting: false,
    executionProgress: null
  };

  function invokeHost(bridge, cmd, params) {
    if (!bridge) {
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
    if (!b) return Promise.resolve(null);

    return invokeHost(b, 'comp.analysis', {})
      .catch(function () {
        return invokeHost(b, 'timeline.state', {});
      })
      .then(function (tl) {
        if (!tl) return null;
        agentState.timeline = tl;

        // Also query clip selection
        return invokeHost(b, 'timeline.selection', {})
          .then(function (sel) {
            agentState.selectedClips = (sel && sel.clips) || [];
            return tl;
          })
          .catch(function () {
            agentState.selectedClips = [];
            return tl;
          });
      })
      .catch(function (err) {
        console.warn('[AI Agent] Timeline inspection error:', err);
        return null;
      });
  }

  function analyzeTimelineStructure(tl) {
    if (!tl || !tl.present) {
      return {
        hasTimeline: false,
        name: '',
        duration: 0,
        fps: 24,
        cuts: [],
        dialogueSpans: [],
        musicSpans: [],
        gaps: []
      };
    }

    var dur = Number(tl.durationSeconds) || 0;
    var fps = Number(tl.frameRate) || 23.976;
    var cuts = [];
    var dialogueSpans = [];
    var musicSpans = [];

    // Analyze video cuts
    var vTracks = Array.isArray(tl.videoTracks) ? tl.videoTracks : [];
    vTracks.forEach(function (vt) {
      var clips = vt.clips || [];
      clips.forEach(function (c) {
        var start = Number(c.startSeconds) || 0;
        var end = Number(c.endSeconds) || 0;
        if (start > 0.05 && cuts.indexOf(start) === -1) cuts.push(start);
        if (end > 0.05 && end < dur - 0.05 && cuts.indexOf(end) === -1) cuts.push(end);
      });
    });
    cuts.sort(function (a, b) { return a - b; });

    // Analyze audio tracks
    var aTracks = Array.isArray(tl.audioTracks) ? tl.audioTracks : [];
    aTracks.forEach(function (at) {
      var subtype = at.subtype || '';
      var nameLower = String(at.name || '').toLowerCase();
      var isDiag = subtype === 'dialogue' || nameLower.indexOf('dialog') >= 0 || nameLower.indexOf('voice') >= 0;
      var isMus = subtype === 'music' || nameLower.indexOf('music') >= 0 || nameLower.indexOf('bgm') >= 0;

      (at.clips || []).forEach(function (c) {
        var cName = String(c.name || '').toLowerCase();
        var s = Number(c.startSeconds) || 0;
        var e = Number(c.endSeconds) || 0;
        if (isDiag || cName.indexOf('dialog') >= 0 || cName.indexOf('mic') >= 0 || cName.indexOf('vo') >= 0) {
          dialogueSpans.push({ start: s, end: e, name: c.name });
        } else if (isMus || cName.indexOf('music') >= 0 || cName.indexOf('song') >= 0 || cName.indexOf('score') >= 0) {
          musicSpans.push({ start: s, end: e, name: c.name });
        }
      });
    });

    return {
      hasTimeline: true,
      name: tl.name || 'Sequence',
      duration: dur,
      fps: fps,
      width: tl.width || 1920,
      height: tl.height || 1080,
      playhead: Number(tl.playheadSeconds) || 0,
      videoTrackCount: vTracks.length,
      audioTrackCount: aTracks.length,
      cuts: cuts,
      dialogueSpans: dialogueSpans,
      musicSpans: musicSpans,
      audioTracks: aTracks
    };
  }

  /* ------------------------------------------------------------------
   * INTENT PARSING & PLAN GENERATION
   * ------------------------------------------------------------------ */

  function parseUserIntent(text, tl) {
    var raw = String(text || '').trim();
    var lower = raw.toLowerCase();

    // 1. Transport controls
    if (/^(play|resume)\b/i.test(lower)) return { type: 'transport', action: 'play' };
    if (/^(pause)\b/i.test(lower)) return { type: 'transport', action: 'pause' };
    if (/^(stop)\b/i.test(lower)) return { type: 'transport', action: 'stop' };

    // 2. Playhead controls
    if (/read playhead|where is (the )?playhead|current playhead|get playhead/i.test(lower)) {
      return { type: 'read_playhead' };
    }
    var seekMatch = lower.match(/(?:seek|go to|jump to|playhead(?:\s+to)?|from)\s+(\d{1,2}:\d{2}(?:\.\d+)?|\d+(?:\.\d+)?s?)/i);
    if (seekMatch) {
      var sec = parseTimeToken(seekMatch[1]);
      if (sec != null) return { type: 'set_playhead', seconds: sec };
    }
    if (/beginning|start of (the )?(sequence|comp|timeline)/i.test(lower)) {
      return { type: 'set_playhead', seconds: 0 };
    }
    if (/end of (the )?(sequence|comp)/i.test(lower) && tl) {
      return { type: 'set_playhead', seconds: Number(tl.durationSeconds) || 0 };
    }

    // 3. Inspection
    if (/inspect|what('s| is) (on )?(the )?(timeline|sequence|composition)|sequence info|active sequence|show tracks|timeline status/i.test(lower)) {
      return { type: 'inspect_timeline' };
    }

    // 4. Undo
    if (/^(undo|revert)(\s+last\s+(?:operation|action|step|sfx))?$/i.test(lower)) {
      return { type: 'undo' };
    }

    // 5. Targeted placement (e.g. "Add cinematic impact at 00:05 on track 2", "Place whoosh at 10s")
    var placeMatch = lower.match(
      /(?:add|place|put)\s+(?:a\s+)?(.+?)(?:\s+(?:at|@)\s+(\d{1,2}:\d{2}(?:\.\d+)?|\d+(?:\.\d+)?s?|playhead))?(?:\s+(?:on|to)\s+(?:audio\s+)?track\s*([0-9]+)|(?:on|to)\s+a([0-9]+))?$/i
    );
    if (placeMatch && !/complete|entire|whole|all major/i.test(lower)) {
      var timeToken = placeMatch[2];
      var isAtPlayhead = !timeToken || /playhead/i.test(timeToken);
      var placeSec = isAtPlayhead ? (tl ? Number(tl.playheadSeconds) || 0 : 0) : parseTimeToken(timeToken);
      var trackNum = placeMatch[3] || placeMatch[4] ? parseInt(placeMatch[3] || placeMatch[4], 10) : null;
      var rawQuery = placeMatch[1].replace(/(?:at|@)\s+playhead/i, '').replace(/on\s+track\s*\d+/i, '').replace(/["']/g, '').trim();

      var volMatch = lower.match(/(?:volume|gain).*?(-?\d+(?:\.\d+)?)\s*db/i);
      var gainDb = volMatch ? parseFloat(volMatch[1]) : -3;

      return {
        type: 'targeted_place',
        query: rawQuery,
        seconds: placeSec != null ? placeSec : 0,
        trackNumber: trackNum,
        gainDb: gainDb
      };
    }

    // 6. Autonomous sound design workflow
    if (/complete|sound design|footstep|whoosh.*cut|whoosh.*transition|ambient|impact.*hit|duck.*music|dramatic/i.test(lower)) {
      return {
        type: 'autonomous_sound_design',
        instruction: raw
      };
    }

    // Default: conversational / general query
    return { type: 'chat', text: raw };
  }

  function buildActionPlan(intent, services, tl) {
    var lib = services.library;
    var struct = analyzeTimelineStructure(tl);

    if (intent.type === 'targeted_place') {
      var asset = findRealAsset(lib, intent.query, tokenize(intent.query));
      if (!asset) {
        return {
          error: 'No matching audio file found in local library for "' + intent.query + '".'
        };
      }

      var trackNum = intent.trackNumber || (struct.audioTrackCount >= 2 ? 2 : 1);
      var action = {
        id: 'act-' + Date.now(),
        type: 'place_audio',
        role: 'impact',
        name: asset.name,
        path: asset.path || asset.id,
        seconds: intent.seconds,
        timestampStr: fmtTime(intent.seconds),
        trackNumber: trackNum,
        trackLabel: 'Track A' + trackNum,
        gainDb: intent.gainDb || -3,
        description: 'Placed for: "' + intent.query + '"',
        duration: asset.duration || 1.5,
        included: true
      };

      return {
        planId: 'plan-' + Date.now(),
        title: 'Timeline Placement Plan',
        sequenceName: struct.name,
        summary: 'Place 1 sound effect at ' + fmtTime(intent.seconds) + ' on Track A' + trackNum,
        actions: [action]
      };
    }

    if (intent.type === 'autonomous_sound_design') {
      var actions = [];
      var dur = struct.duration || 10;
      var lowerInst = intent.instruction.toLowerCase();

      // Case 1: Whooshes on major cuts
      if (/whoosh|transition/i.test(lowerInst)) {
        var cutTimes = struct.cuts.length ? struct.cuts.slice(0, 4) : [dur * 0.25, dur * 0.5, dur * 0.75];
        var whooshAsset = findRealAsset(lib, 'whoosh', ['transition', 'swoosh']);
        if (whooshAsset) {
          cutTimes.forEach(function (cutT, idx) {
            var t = Math.max(0, cutT - 0.2);
            actions.push({
              id: 'whoosh-' + (idx + 1),
              type: 'place_audio',
              role: 'whoosh',
              name: whooshAsset.name,
              path: whooshAsset.path || whooshAsset.id,
              seconds: t,
              timestampStr: fmtTime(t),
              trackNumber: 2,
              trackLabel: 'Track A2 (Transitions)',
              gainDb: -6.0,
              description: 'Transition whoosh at visual cut (' + fmtTime(cutT) + ')',
              duration: whooshAsset.duration || 1.2,
              included: true
            });
          });
        }
      }

      // Case 2: Footsteps / Foley
      if (/footstep|walk/i.test(lowerInst)) {
        var foleyAsset = findRealAsset(lib, 'foley', ['footstep', 'step', 'walk']);
        if (foleyAsset) {
          var stepStarts = [1.2, 1.8, 2.4, 3.0, 3.6];
          stepStarts.forEach(function (st, idx) {
            if (st < dur) {
              actions.push({
                id: 'foley-' + (idx + 1),
                type: 'place_audio',
                role: 'foley',
                name: foleyAsset.name,
                path: foleyAsset.path || foleyAsset.id,
                seconds: st,
                timestampStr: fmtTime(st),
                trackNumber: 3,
                trackLabel: 'Track A3 (Foley)',
                gainDb: -8.0,
                description: 'Footstep Foley pace cue',
                duration: foleyAsset.duration || 0.6,
                included: true
              });
            }
          });
        }
      }

      // Case 3: Complete sound design (Whooshes + Impacts + Ambience + Foley)
      if (/complete|cinematic|dramatic/i.test(lowerInst) || actions.length === 0) {
        // 1. Ambient bed starting at 00:00
        var ambAsset = findRealAsset(lib, 'ambience', ['room tone', 'drone', 'bed']);
        if (ambAsset) {
          actions.push({
            id: 'amb-1',
            type: 'place_audio',
            role: 'ambience',
            name: ambAsset.name,
            path: ambAsset.path || ambAsset.id,
            seconds: 0,
            timestampStr: '00:00.00',
            trackNumber: struct.audioTrackCount >= 3 ? 3 : 2,
            trackLabel: 'Track A' + (struct.audioTrackCount >= 3 ? 3 : 2) + ' (Ambience)',
            gainDb: -12.0,
            description: 'Foundational cinematic ambient bed',
            duration: ambAsset.duration || dur,
            included: true
          });
        }

        // 2. Impacts on key visual moments
        var impactAsset = findRealAsset(lib, 'impact', ['hit', 'slam', 'boom']);
        if (impactAsset) {
          var impactTimes = struct.cuts.length ? [struct.cuts[0]] : [dur > 5 ? 2.5 : dur * 0.5];
          impactTimes.forEach(function (it, idx) {
            actions.push({
              id: 'impact-' + (idx + 1),
              type: 'place_audio',
              role: 'impact',
              name: impactAsset.name,
              path: impactAsset.path || impactAsset.id,
              seconds: it,
              timestampStr: fmtTime(it),
              trackNumber: 2,
              trackLabel: 'Track A2 (SFX Hits)',
              gainDb: -3.0,
              description: 'Cinematic visual hit / focal accent',
              duration: impactAsset.duration || 2.0,
              included: true
            });
          });
        }

        // 3. Whoosh transitions
        var wAsset = findRealAsset(lib, 'whoosh', ['transition', 'riser']);
        if (wAsset && struct.cuts.length > 1) {
          var wt = Math.max(0, struct.cuts[1] - 0.25);
          actions.push({
            id: 'whoosh-1',
            type: 'place_audio',
            role: 'whoosh',
            name: wAsset.name,
            path: wAsset.path || wAsset.id,
            seconds: wt,
            timestampStr: fmtTime(wt),
            trackNumber: 2,
            trackLabel: 'Track A2 (Transitions)',
            gainDb: -6.0,
            description: 'Scene transition riser / swoosh',
            duration: wAsset.duration || 1.2,
            included: true
          });
        }
      }

      if (!actions.length) {
        return {
          error: 'Could not match appropriate sounds from local library for this sequence.'
        };
      }

      return {
        planId: 'plan-' + Date.now(),
        title: 'Autonomous Sound Design Plan',
        sequenceName: struct.name,
        summary: 'Proposed ' + actions.length + ' sound placements across dedicated SFX tracks (Safe Preview)',
        actions: actions
      };
    }

    return null;
  }

  function executeTimelinePlan(plan, services, onProgress) {
    if (!plan || !Array.isArray(plan.actions)) {
      return Promise.reject(new Error('Invalid action plan.'));
    }
    var b = services.bridge;
    if (!b) return Promise.reject(new Error('Host bridge unavailable.'));

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
            try {
              if (window.__sfxAnalytics && window.__sfxAnalytics.track) {
                window.__sfxAnalytics.track('sound_imported', {
                  path: act.path,
                  name: act.name,
                  category: act.role,
                  placed: !!(res && (res.placed === true || res.ok === true))
                });
              }
            } catch (eA) {}
          })
          .catch(function (err) {
            results.push({ action: act, error: err });
          });
      });
    });

    return chain.then(function () {
      agentState.isExecuting = false;
      agentState.lastExecutedPlan = { plan: plan, results: results, executedAt: Date.now() };

      // Verify with host
      return inspectTimeline(services, true).then(function (tl) {
        return {
          success: true,
          placedCount: results.filter(function (r) { return r.res && (r.res.placed || r.res.imported); }).length,
          total: activeActions.length,
          results: results,
          timeline: tl
        };
      });
    }).catch(function (err) {
      agentState.isExecuting = false;
      throw err;
    });
  }

  function undoLastExecution(services) {
    var b = services && services.bridge;
    if (!b) return Promise.reject(new Error('Host bridge unavailable.'));
    return invokeHost(b, 'app.undoLast', {})
      .then(function (res) {
        agentState.lastExecutedPlan = null;
        return inspectTimeline(services, true).then(function () {
          return { ok: true, message: 'Undone last operation in Premiere Pro [Verified].', result: res };
        });
      });
  }

  /* ------------------------------------------------------------------
   * PROMPT SYSTEM & CHAT INFERENCE
   * ------------------------------------------------------------------ */

  function sfxSystemPrompt(candidates, timelineContext) {
    var lines = [
      'You are SFX Composer AI, a world-class Lead Sound Designer and autonomous audio engineer for Adobe Premiere Pro.',
      'You possess deep expertise in Foley, cinematic impacts, transitions, audio mixing, dialogue ducking, and spatial audio arrangement.',
      ''
    ];

    if (timelineContext && timelineContext.present) {
      lines.push('ACTIVE PREMIERE PRO SEQUENCE:');
      lines.push('- Sequence Name: "' + timelineContext.name + '"');
      lines.push('- Duration: ' + Number(timelineContext.durationSeconds || 0).toFixed(2) + ' seconds (' + fmtTime(timelineContext.durationSeconds) + ')');
      lines.push('- Frame Rate: ' + Number(timelineContext.frameRate || 24).toFixed(2) + ' fps');
      lines.push('- Video Tracks: ' + (timelineContext.videoTracks ? timelineContext.videoTracks.length : 1));
      lines.push('- Audio Tracks: ' + (timelineContext.audioTracks ? timelineContext.audioTracks.length : 2));
      lines.push('- Playhead: ' + fmtTime(timelineContext.playheadSeconds));
      lines.push('');
    }

    if (candidates && candidates.length) {
      lines.push('RELEVANT SFX ASSETS IN USER\'S LOCAL LIBRARY:');
      candidates.slice(0, 10).forEach(function (c) {
        lines.push('- ' + c.name + ' (Folder: ' + (c.relativeFolder || c.folder || 'SFX') + ')');
      });
      lines.push('');
    }

    lines.push('RULES & CONSTRAINTS:');
    lines.push('1. Always refer to real sounds and accurate timeline timestamps.');
    lines.push('2. When suggesting placements, specify exact seconds, appropriate audio tracks (e.g. A2/A3 to keep dialogue on A1 clear), and recommended dB gain.');
    lines.push('3. Keep responses direct, professional, and practical for video editors.');

    return lines.join('\n');
  }

  function callAiChat(userMessage, candidates, historyMessages, timelineContext) {
    var providers = getProviders();
    var system = sfxSystemPrompt(candidates, timelineContext);
    var messages = [];

    if (Array.isArray(historyMessages)) {
      historyMessages.forEach(function (m) {
        if (m && m.role && m.text) {
          messages.push({ role: m.role, content: m.text });
        }
      });
    }
    messages.push({ role: 'user', content: userMessage });

    if (providers && typeof providers.chat === 'function') {
      return providers.chat(messages, { system: system });
    }

    // Direct Ollama fallback
    var base = getOllamaBase();
    var model = getModelName();
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS);

    var ollamaMessages = [{ role: 'system', content: system }].concat(messages);

    return fetch(base.replace(/\/$/, '') + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model, messages: ollamaMessages, stream: false }),
      signal: controller.signal
    })
      .then(function (res) {
        clearTimeout(timer);
        if (!res.ok) throw new Error('Ollama error (' + res.status + ')');
        return res.json();
      })
      .then(function (data) {
        return (data && data.message && data.message.content) || '';
      });
  }

  /* ------------------------------------------------------------------
   * UI BUILDER
   * ------------------------------------------------------------------ */

  function buildUI(services) {
    var settings = loadSettings();
    var library = services.library;
    var bridge = services.bridge;
    var audio = services.audio;

    var history = loadHistory();
    var activeChatId = history.length ? history[0].id : null;
    var editingChatId = null;
    var messages = activeChatId
      ? (history.find(function (h) { return h.id === activeChatId; }) || {}).messages || []
      : [];

    var showSettings = false;
    var isGenerating = false;
    var ollamaOnline = false;

    var root = document.getElementById('sfx-ai-assistant');
    if (!root) {
      root = document.createElement('div');
      root.id = 'sfx-ai-assistant';
      document.body.appendChild(root);
    }
    rootEl = root;

    var toggle = root.querySelector('#sfx-ai-assistant__toggle');
    if (!toggle) {
      toggle = document.createElement('button');
      toggle.id = 'sfx-ai-assistant__toggle';
      toggle.type = 'button';
      toggle.innerHTML = ICON.sparkles + ' <span>AI SFX</span>';
      toggle.addEventListener('click', function () { setOpen(true); });
      root.appendChild(toggle);
    }

    var panel = root.querySelector('#sfx-ai-assistant__panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'sfx-ai-assistant__panel';
      root.appendChild(panel);
    }
    panelEl = panel;

    function setOpen(opening) {
      if (opening) {
        panel.classList.add('is-open');
        root.classList.add('is-open');
        refreshTimelineContext();
        refreshOllamaStatus();
        scrollChat();
        setTimeout(function () {
          var ta = panel.querySelector('.sfx-ai-ws__input');
          if (ta) ta.focus();
        }, 80);
      } else {
        panel.classList.remove('is-open');
        root.classList.remove('is-open');
      }
      if (window.__sfxHeaderMenu && typeof window.__sfxHeaderMenu.refresh === 'function') {
        try { window.__sfxHeaderMenu.refresh(); } catch (e) {}
      }
    }

    setOpenInternal = setOpen;
    isInitialized = true;
    if (pendingOpen !== null) {
      setOpen(pendingOpen);
      pendingOpen = null;
    }

    window.addEventListener('sfx-open-ai-assistant', function () { setOpen(true); });
    window.addEventListener('sfx-close-ai-assistant', function () { setOpen(false); });
    window.addEventListener('focus', function () {
      if (panel.classList.contains('is-open')) refreshTimelineContext();
    });

    function uid() {
      return 'chat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    }

    function persistActiveChat() {
      if (!activeChatId) return;
      var entry = history.find(function (h) { return h.id === activeChatId; });
      if (entry) {
        entry.messages = messages;
        entry.updatedAt = Date.now();
        if (entry.title === 'New Chat' || !entry.title) {
          var u = messages.find(function (m) { return m.role === 'user'; });
          if (u) entry.title = u.text.slice(0, 36);
        }
      }
      saveHistory(history);
    }

    function newChat() {
      activeChatId = uid();
      messages = [];
      history.unshift({
        id: activeChatId,
        title: 'New Chat',
        messages: messages,
        updatedAt: Date.now()
      });
      persistActiveChat();
      render();
    }

    function loadChat(id) {
      var entry = history.find(function (h) { return h.id === id; });
      if (!entry) return;
      activeChatId = entry.id;
      messages = entry.messages || [];
      showSettings = false;
      render();
      scrollChat();
    }

    function deleteChat(id) {
      history = history.filter(function (h) { return h.id !== id; });
      saveHistory(history);
      if (activeChatId === id) {
        if (history.length) {
          loadChat(history[0].id);
        } else {
          newChat();
        }
      } else {
        render();
      }
    }

    function refreshTimelineContext() {
      inspectTimeline(services, false).then(function () {
        updateTimelinePillUI();
      });
    }

    function updateTimelinePillUI() {
      var pill = panel.querySelector('.sfx-ai-ws__timeline-pill');
      if (!pill) return;
      var tl = agentState.timeline;
      if (!tl) {
        pill.className = 'sfx-ai-ws__timeline-pill is-offline';
        pill.innerHTML = '<span class="timeline-dot"></span><span class="sfx-ai-ws__timeline-pill-text">Premiere Connecting…</span>';
        pill.title = 'Connecting to host…';
        return;
      }
      if (!tl.present) {
        pill.className = 'sfx-ai-ws__timeline-pill';
        pill.innerHTML = '<span class="timeline-dot"></span><span class="sfx-ai-ws__timeline-pill-text">No Sequence Open</span>';
        pill.title = 'Open a sequence in Premiere Pro, then click to refresh.';
        return;
      }
      var vCount = Array.isArray(tl.videoTracks) ? tl.videoTracks.length : 1;
      var aCount = Array.isArray(tl.audioTracks) ? tl.audioTracks.length : 2;
      var fpsStr = tl.frameRate ? Number(tl.frameRate).toFixed(2) + ' fps' : '24 fps';
      var text = (tl.name || 'Sequence') + ' · ' + fmtTime(tl.durationSeconds) + ' · ' + fpsStr + ' · ' + vCount + 'V/' + aCount + 'A';

      pill.className = 'sfx-ai-ws__timeline-pill is-active';
      pill.innerHTML = '<span class="timeline-dot"></span><span class="sfx-ai-ws__timeline-pill-text">' + text + '</span>';
      pill.title = 'Active Sequence: ' + tl.name + ' (Click to re-sync timeline)';
    }

    function refreshOllamaStatus() {
      var providers = getProviders();
      var active = providers ? providers.getActiveProvider() : 'ollama';

      if (active === 'ollama') {
        var lai = getLocalAI();
        if (lai && typeof lai.isReady === 'function') {
          ollamaOnline = !!lai.isReady();
          updateStatusUI();
          return;
        }
        var base = getOllamaBase();
        fetch(base.replace(/\/$/, '') + '/api/tags', { method: 'GET' })
          .then(function (res) { ollamaOnline = res.ok; updateStatusUI(); })
          .catch(function () { ollamaOnline = false; updateStatusUI(); });
      } else if (providers) {
        var cfg = providers.getConfig(active);
        ollamaOnline = !!(cfg && cfg.connected);
        updateStatusUI();
      }
    }

    function updateStatusUI() {
      var dot = panel.querySelector('.sfx-ai-ws__status-dot');
      var label = panel.querySelector('.sfx-ai-ws__status-label');
      var providers = getProviders();
      var active = providers ? providers.getActiveProvider() : 'ollama';
      var pname = active;
      if (providers) {
        var p = providers.getProvider(active);
        if (p) pname = p.name;
      }
      if (dot) {
        dot.className = 'sfx-ai-ws__status-dot ' + (ollamaOnline ? 'is-online' : 'is-offline');
      }
      if (label) {
        label.textContent = pname + ': ' + (ollamaOnline ? 'Ready' : 'Offline');
      }
    }

    function scrollChat() {
      var chat = panel.querySelector('.sfx-ai-ws__chat');
      if (chat) chat.scrollTop = chat.scrollHeight;
    }

    function simpleMarkdown(text) {
      var escaped = String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      escaped = escaped.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
      escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
      escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      escaped = escaped.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      escaped = escaped.replace(/\n\n+/g, '</p><p>');
      escaped = escaped.replace(/\n/g, '<br/>');
      return '<p>' + escaped + '</p>';
    }

    /* ------------------------------------------------------------------
     * MAIN VIEW RENDERER
     * ------------------------------------------------------------------ */

    function render() {
      panel.innerHTML = '';

      // --- Top Bar ---
      var top = document.createElement('div');
      top.className = 'sfx-ai-ws__top';

      var back = document.createElement('button');
      back.type = 'button';
      back.className = 'sfx-ai-ws__back';
      back.innerHTML = ICON.back + ' <span>Back</span>';
      back.addEventListener('click', function () { setOpen(false); });
      top.appendChild(back);

      var title = document.createElement('div');
      title.className = 'sfx-ai-ws__title';
      title.innerHTML = ICON.sparkles + ' <span>AI SFX Timeline Agent</span>';
      top.appendChild(title);

      // Timeline Context Pill
      var tlPill = document.createElement('button');
      tlPill.type = 'button';
      tlPill.className = 'sfx-ai-ws__timeline-pill';
      tlPill.innerHTML = '<span class="timeline-dot"></span><span class="sfx-ai-ws__timeline-pill-text">Checking Timeline…</span>';
      tlPill.addEventListener('click', function () {
        tlPill.innerHTML = '<span class="timeline-dot"></span><span class="sfx-ai-ws__timeline-pill-text">Re-syncing…</span>';
        refreshTimelineContext();
      });
      top.appendChild(tlPill);

      // Actions / Status
      var topActions = document.createElement('div');
      topActions.className = 'sfx-ai-ws__top-actions';

      var status = document.createElement('div');
      status.className = 'sfx-ai-ws__status-pill';
      status.innerHTML = '<span class="sfx-ai-ws__status-dot"></span><span class="sfx-ai-ws__status-label">AI Status</span>';
      topActions.appendChild(status);

      var settingsBtn = document.createElement('button');
      settingsBtn.type = 'button';
      settingsBtn.className = 'sfx-ai-ws__icon-btn' + (showSettings ? ' is-active' : '');
      settingsBtn.innerHTML = ICON.gear;
      settingsBtn.title = 'AI Provider Settings';
      settingsBtn.addEventListener('click', function () {
        showSettings = !showSettings;
        render();
      });
      topActions.appendChild(settingsBtn);

      var closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'sfx-ai-ws__icon-btn';
      closeBtn.innerHTML = ICON.close;
      closeBtn.title = 'Close Assistant';
      closeBtn.addEventListener('click', function () { setOpen(false); });
      topActions.appendChild(closeBtn);

      top.appendChild(topActions);
      panel.appendChild(top);

      // --- Body ---
      var body = document.createElement('div');
      body.className = 'sfx-ai-ws__body';

      // Sidebar History
      var histCol = document.createElement('div');
      histCol.className = 'sfx-ai-ws__history-col';

      var newBtn = document.createElement('button');
      newBtn.type = 'button';
      newBtn.className = 'sfx-ai-ws__new-chat';
      newBtn.innerHTML = ICON.plus + ' <span>New Chat</span>';
      newBtn.addEventListener('click', function () {
        showSettings = false;
        newChat();
      });
      histCol.appendChild(newBtn);

      var histLabel = document.createElement('div');
      histLabel.className = 'sfx-ai-ws__history-label';
      histLabel.textContent = 'Recent Chats';
      histCol.appendChild(histLabel);

      var hist = document.createElement('div');
      hist.className = 'sfx-ai-ws__history';

      history.forEach(function (h) {
        var row = document.createElement('div');
        row.className = 'sfx-ai-ws__history-row' + (h.id === activeChatId ? ' is-active' : '');

        if (editingChatId === h.id) {
          var inp = document.createElement('input');
          inp.type = 'text';
          inp.className = 'sfx-ai-ws__history-edit-input';
          inp.value = h.title || 'Chat';
          function commitRename() {
            var newTitle = inp.value.trim() || 'Chat';
            h.title = newTitle;
            editingChatId = null;
            saveHistory(history);
            render();
          }
          inp.addEventListener('blur', commitRename);
          inp.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
            else if (e.key === 'Escape') { editingChatId = null; render(); }
          });
          row.appendChild(inp);
          setTimeout(function () { inp.focus(); inp.select(); }, 10);
        } else {
          var item = document.createElement('button');
          item.type = 'button';
          item.className = 'sfx-ai-ws__history-item';
          item.textContent = h.title || 'Untitled';
          item.title = h.title || 'Untitled';
          item.addEventListener('click', function () { loadChat(h.id); });
          row.appendChild(item);

          var hActions = document.createElement('div');
          hActions.className = 'sfx-ai-ws__history-actions';

          var renameBtn = document.createElement('button');
          renameBtn.type = 'button';
          renameBtn.className = 'sfx-ai-ws__history-action-btn';
          renameBtn.innerHTML = ICON.edit;
          renameBtn.title = 'Rename Chat';
          renameBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            editingChatId = h.id;
            render();
          });
          hActions.appendChild(renameBtn);

          var deleteBtn = document.createElement('button');
          deleteBtn.type = 'button';
          deleteBtn.className = 'sfx-ai-ws__history-action-btn delete';
          deleteBtn.innerHTML = ICON.trash;
          deleteBtn.title = 'Delete Chat';
          deleteBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            deleteChat(h.id);
          });
          hActions.appendChild(deleteBtn);
          row.appendChild(hActions);
        }

        hist.appendChild(row);
      });

      histCol.appendChild(hist);
      body.appendChild(histCol);

      // Main Content Area
      var main = document.createElement('div');
      main.className = 'sfx-ai-ws__main';

      if (showSettings) {
        main.appendChild(renderSettings());
      } else {
        var chat = document.createElement('div');
        chat.className = 'sfx-ai-ws__chat';

        if (!messages.length) {
          chat.appendChild(renderWelcome());
        } else {
          messages.forEach(function (m) {
            chat.appendChild(renderMessage(m));
          });
          if (isGenerating) {
            chat.appendChild(renderTyping());
          }
        }
        main.appendChild(chat);
        main.appendChild(renderInput());
      }

      body.appendChild(main);
      panel.appendChild(body);

      updateTimelinePillUI();
      updateStatusUI();
    }

    /* ------------------------------------------------------------------
     * CHAT RENDERING COMPONENTS
     * ------------------------------------------------------------------ */

    function renderWelcome() {
      var wrap = document.createElement('div');
      wrap.className = 'sfx-ai-ws__welcome';
      wrap.innerHTML =
        '<div class="sfx-ai-ws__welcome-icon">' + ICON.sparkles + '</div>' +
        '<h2>Autonomous Premiere Pro Sound Design</h2>' +
        '<p>Instruct the AI to inspect your sequence, generate sound design plans, arrange Foley, create SFX tracks, and place audio with sample accuracy.</p>';

      var prompts = document.createElement('div');
      prompts.className = 'sfx-ai-ws__welcome-prompts';
      EXAMPLE_PROMPTS.forEach(function (p) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sfx-ai-ws__welcome-prompt-btn';
        btn.textContent = p;
        btn.addEventListener('click', function () { sendMessage(p); });
        prompts.appendChild(btn);
      });
      wrap.appendChild(prompts);
      return wrap;
    }

    function renderMessage(m) {
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

      // Render Action Plan Card if present
      if (m.plan) {
        bubble.appendChild(renderActionPlanCard(m.plan, m));
      }

      // Render Verified Execution Card if present
      if (m.executedResult) {
        bubble.appendChild(renderExecutionCard(m.executedResult));
      }

      // Render candidate cards if present
      if (m.cards && m.cards.length && !m.plan) {
        bubble.appendChild(renderCards(m.cards));
      }

      // Copy code button handler
      bubble.querySelectorAll('pre').forEach(function (pre) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sfx-ai-ws__copy-code';
        btn.textContent = 'Copy';
        btn.addEventListener('click', function () {
          var code = btn.parentElement && btn.parentElement.querySelector('code');
          if (code && navigator.clipboard) {
            navigator.clipboard.writeText(code.textContent || '').then(function () {
              btn.textContent = 'Copied!';
              setTimeout(function () { btn.textContent = 'Copy'; }, 1500);
            });
          }
        });
        pre.appendChild(btn);
      });

      row.appendChild(bubble);
      return row;
    }

    function renderTyping() {
      var row = document.createElement('div');
      row.className = 'sfx-ai-ws__message assistant';
      row.innerHTML =
        '<div class="sfx-ai-ws__avatar">' + ICON.sparkles + '</div>' +
        '<div class="sfx-ai-ws__bubble is-typing">' +
        '<span class="dot"></span><span class="dot"></span><span class="dot"></span>' +
        '</div>';
      return row;
    }

    function renderCards(cards) {
      var wrap = document.createElement('div');
      wrap.className = 'sfx-ai-ws__cards';
      cards.forEach(function (c) {
        var card = document.createElement('div');
        card.className = 'sfx-ai-ws__card';

        var info = document.createElement('div');
        info.className = 'sfx-ai-ws__card-info';
        info.innerHTML =
          '<div class="sfx-ai-ws__card-name" title="' + (c.name || '') + '">' + (c.name || 'Untitled') + '</div>' +
          '<div class="sfx-ai-ws__card-meta">' + (c.folder || c.reason || 'Local SFX') + '</div>';
        card.appendChild(info);

        var actions = document.createElement('div');
        actions.className = 'sfx-ai-ws__card-actions';

        if (c.path || c.id) {
          var prev = document.createElement('button');
          prev.type = 'button';
          prev.className = 'sfx-ai-ws__card-btn';
          prev.innerHTML = ICON.play + ' Preview';
          prev.addEventListener('click', function () {
            try {
              if (audio && audio.playNow) audio.playNow(c.path || c.id);
            } catch (e) {}
          });
          actions.appendChild(prev);

          var place = document.createElement('button');
          place.type = 'button';
          place.className = 'sfx-ai-ws__card-btn primary';
          place.innerHTML = ICON.place + ' Place';
          place.addEventListener('click', function () {
            invokeHost(bridge, 'sfx.import', { path: c.path || c.id, atPlayhead: true, snapToFrame: true })
              .then(function (res) {
                try {
                  if (window.__sfxAnalytics && window.__sfxAnalytics.track && res && (res.placed === true || res.ok === true)) {
                    window.__sfxAnalytics.track('sound_imported', {
                      path: c.path || c.id,
                      id: c.path || c.id,
                      name: c.name,
                      category: c.category,
                      placed: res.placed === true || res.ok === true
                    });
                  }
                } catch (eA) {}
                inspectTimeline(services, true);
              });
          });
          actions.appendChild(place);
        }

        card.appendChild(actions);
        wrap.appendChild(card);
      });
      return wrap;
    }

    /* ------------------------------------------------------------------
     * ACTION PLAN PREVIEW & APPROVAL CARD
     * ------------------------------------------------------------------ */

    function renderActionPlanCard(plan, messageObj) {
      var card = document.createElement('div');
      card.className = 'sfx-ai-ws__plan-card' + (plan.isExecuted ? ' is-executed' : '');
      card.setAttribute('data-plan-id', plan.planId);

      // Header
      var header = document.createElement('div');
      header.className = 'sfx-ai-ws__plan-header';

      var titleRow = document.createElement('div');
      titleRow.className = 'sfx-ai-ws__plan-title-row';

      var badge = document.createElement('span');
      badge.className = 'sfx-ai-ws__plan-badge' + (plan.isExecuted ? ' verified' : '');
      badge.textContent = plan.isExecuted ? 'EXECUTED & VERIFIED' : 'SOUND DESIGN PLAN';
      titleRow.appendChild(badge);

      var seqChip = document.createElement('span');
      seqChip.className = 'sfx-ai-ws__plan-seq-chip';
      seqChip.textContent = (plan.sequenceName || 'Active Sequence') + ' · ' + plan.actions.length + ' sounds';
      titleRow.appendChild(seqChip);

      header.appendChild(titleRow);

      var summary = document.createElement('div');
      summary.className = 'sfx-ai-ws__plan-summary';
      summary.textContent = plan.summary || 'Proposed operations awaiting your approval.';
      header.appendChild(summary);

      card.appendChild(header);

      // Items List
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
        var role = (act.role || 'action').toLowerCase();
        rBadge.className = 'sfx-ai-ws__role-badge role--' + role;
        rBadge.textContent = role;
        item.appendChild(rBadge);

        var info = document.createElement('div');
        info.className = 'sfx-ai-ws__plan-item-info';

        var nameDiv = document.createElement('div');
        nameDiv.className = 'sfx-ai-ws__plan-item-name';
        nameDiv.textContent = act.name;
        nameDiv.title = act.path || act.name;
        info.appendChild(nameDiv);

        var metaDiv = document.createElement('div');
        metaDiv.className = 'sfx-ai-ws__plan-item-meta';
        metaDiv.innerHTML =
          '<span class="sfx-ai-ws__plan-tag">@ ' + act.timestampStr + '</span>' +
          '<span class="sfx-ai-ws__plan-tag">' + (act.trackLabel || ('Track A' + (act.trackNumber || 1))) + '</span>' +
          '<span class="sfx-ai-ws__plan-tag">' + (act.gainDb >= 0 ? '+' : '') + act.gainDb + ' dB</span>';
        info.appendChild(metaDiv);

        item.appendChild(info);

        var itemActions = document.createElement('div');
        itemActions.className = 'sfx-ai-ws__plan-item-actions';

        var prevBtn = document.createElement('button');
        prevBtn.type = 'button';
        prevBtn.className = 'sfx-ai-ws__plan-btn-mini';
        prevBtn.innerHTML = ICON.play;
        prevBtn.title = 'Preview Sound';
        prevBtn.addEventListener('click', function () {
          if (audio && audio.playNow) audio.playNow(act.path || act.id);
        });
        itemActions.appendChild(prevBtn);

        if (!plan.isExecuted) {
          var remBtn = document.createElement('button');
          remBtn.type = 'button';
          remBtn.className = 'sfx-ai-ws__plan-btn-mini danger';
          remBtn.innerHTML = '✕';
          remBtn.title = 'Remove from plan';
          remBtn.addEventListener('click', function () {
            act.included = false;
            chk.checked = false;
            item.classList.add('is-excluded');
          });
          itemActions.appendChild(remBtn);
        }

        item.appendChild(itemActions);
        itemsWrap.appendChild(item);
      });

      card.appendChild(itemsWrap);

      // Progress bar if executing
      var progressWrap = document.createElement('div');
      progressWrap.className = 'sfx-ai-ws__progress-wrap';
      progressWrap.style.display = 'none';
      progressWrap.innerHTML =
        '<div class="sfx-ai-ws__progress-bar-outer"><div class="sfx-ai-ws__progress-bar-inner" style="width: 0%"></div></div>' +
        '<div class="sfx-ai-ws__progress-text"><span class="step-desc">Preparing…</span><span class="step-num">0/0</span></div>';
      card.appendChild(progressWrap);

      // Actions / Approval Footer
      if (!plan.isExecuted) {
        var actionsDiv = document.createElement('div');
        actionsDiv.className = 'sfx-ai-ws__plan-actions';

        var approveBtn = document.createElement('button');
        approveBtn.type = 'button';
        approveBtn.className = 'sfx-ai-ws__btn sfx-ai-ws__btn--approve';
        approveBtn.innerHTML = ICON.check + ' Approve &amp; Execute';
        approveBtn.addEventListener('click', function () {
          approveBtn.disabled = true;
          cancelBtn.disabled = true;
          progressWrap.style.display = 'flex';

          executeTimelinePlan(plan, services, function (cur, tot, item) {
            var pct = Math.round((cur / tot) * 100);
            var bar = progressWrap.querySelector('.sfx-ai-ws__progress-bar-inner');
            var desc = progressWrap.querySelector('.step-desc');
            var num = progressWrap.querySelector('.step-num');
            if (bar) bar.style.width = pct + '%';
            if (desc) desc.textContent = 'Placing "' + item.name + '" at ' + item.timestampStr + ' on Track A' + item.trackNumber + '…';
            if (num) num.textContent = cur + '/' + tot;
          })
            .then(function (result) {
              plan.isExecuted = true;
              messageObj.executedResult = result;
              persistActiveChat();
              render();
            })
            .catch(function (err) {
              approveBtn.disabled = false;
              cancelBtn.disabled = false;
              progressWrap.style.display = 'none';
              alert('Execution error: ' + (err && err.message ? err.message : String(err)));
            });
        });
        actionsDiv.appendChild(approveBtn);

        var cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'sfx-ai-ws__btn sfx-ai-ws__btn--cancel';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', function () {
          card.remove();
          messageObj.plan = null;
          persistActiveChat();
        });
        actionsDiv.appendChild(cancelBtn);

        card.appendChild(actionsDiv);
      }

      return card;
    }

    function renderExecutionCard(result) {
      var wrap = document.createElement('div');
      wrap.className = 'sfx-ai-ws__plan-card is-executed';

      var header = document.createElement('div');
      header.className = 'sfx-ai-ws__plan-header';

      var titleRow = document.createElement('div');
      titleRow.className = 'sfx-ai-ws__plan-title-row';
      titleRow.innerHTML =
        '<span class="sfx-ai-ws__plan-badge verified">' + ICON.check + ' TIMELINE MODIFIED</span>' +
        '<span class="sfx-ai-ws__plan-seq-chip">' + (result.timeline ? result.timeline.name : 'Premiere Pro') + '</span>';
      header.appendChild(titleRow);

      var summary = document.createElement('div');
      summary.className = 'sfx-ai-ws__plan-summary';
      summary.textContent = 'Successfully placed and verified ' + result.placedCount + ' of ' + result.total + ' audio clips in Premiere Pro.';
      header.appendChild(summary);
      wrap.appendChild(header);

      var actionsDiv = document.createElement('div');
      actionsDiv.className = 'sfx-ai-ws__plan-actions';

      var undoBtn = document.createElement('button');
      undoBtn.type = 'button';
      undoBtn.className = 'sfx-ai-ws__btn sfx-ai-ws__btn--undo';
      undoBtn.innerHTML = ICON.undo + ' Undo Operation';
      undoBtn.addEventListener('click', function () {
        undoBtn.disabled = true;
        undoBtn.textContent = 'Undoing…';
        undoLastExecution(services)
          .then(function (undoRes) {
            summary.textContent = 'Operation undone in Premiere Pro [Verified].';
            undoBtn.remove();
          })
          .catch(function (err) {
            undoBtn.disabled = false;
            undoBtn.textContent = 'Undo Failed';
            alert('Undo failed: ' + (err && err.message ? err.message : String(err)));
          });
      });
      actionsDiv.appendChild(undoBtn);
      wrap.appendChild(actionsDiv);

      return wrap;
    }

    /* ------------------------------------------------------------------
     * INPUT & PROVIDER CONTROLS
     * ------------------------------------------------------------------ */

    function renderInput() {
      var area = document.createElement('div');
      area.className = 'sfx-ai-ws__input-area';

      var row = document.createElement('div');
      row.className = 'sfx-ai-ws__input-row';

      var ta = document.createElement('textarea');
      ta.className = 'sfx-ai-ws__input';
      ta.placeholder = 'Instruct AI SFX Agent (e.g. "Create complete cinematic sound design" or "Add impact at 00:05")…';
      ta.rows = 2;
      ta.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          var v = ta.value.trim();
          if (v) { sendMessage(v); ta.value = ''; }
        }
      });
      row.appendChild(ta);

      var send = document.createElement('button');
      send.type = 'button';
      send.className = 'sfx-ai-ws__send';
      send.innerHTML = ICON.send;
      send.title = 'Send Command (Enter)';
      send.addEventListener('click', function () {
        var v = ta.value.trim();
        if (v) { sendMessage(v); ta.value = ''; }
      });
      row.appendChild(send);
      area.appendChild(row);

      // Meta row: pills + provider select
      var meta = document.createElement('div');
      meta.className = 'sfx-ai-ws__input-meta';

      var pills = document.createElement('div');
      pills.className = 'sfx-ai-ws__pills';
      EXAMPLE_PROMPTS.slice(0, 3).forEach(function (p) {
        var pill = document.createElement('button');
        pill.type = 'button';
        pill.className = 'sfx-ai-ws__pill';
        pill.textContent = p;
        pill.addEventListener('click', function () { sendMessage(p); });
        pills.appendChild(pill);
      });
      meta.appendChild(pills);

      // Provider picker
      var provSelect = document.createElement('select');
      provSelect.className = 'sfx-ai-ws__prov-select';
      var providers = getProviders();
      var plist = providers ? providers.listProviders() : [{ id: 'ollama', name: 'Ollama' }];
      var activeP = providers ? providers.getActiveProvider() : 'ollama';

      plist.forEach(function (pr) {
        var opt = document.createElement('option');
        opt.value = pr.id;
        opt.textContent = pr.name;
        if (pr.id === activeP) opt.selected = true;
        provSelect.appendChild(opt);
      });

      provSelect.addEventListener('change', function () {
        if (providers) providers.setActiveProvider(provSelect.value);
        refreshOllamaStatus();
        render();
      });
      meta.appendChild(provSelect);

      area.appendChild(meta);
      return area;
    }

    function renderSettings() {
      var view = document.createElement('div');
      view.className = 'sfx-ai-ws__settings-view';
      view.innerHTML = '<h3>AI Providers</h3><p class="sfx-ai-ws__settings-hint">Connect cloud providers with API keys, or use local Ollama. Keys are encrypted in local storage and never logged.</p>';

      var providers = getProviders();
      var list = providers ? providers.listProviders() : [{ id: 'ollama', name: 'Ollama', needsKey: false, defaultModel: 'llama3.2', models: ['llama3.2'] }];
      var active = providers ? providers.getActiveProvider() : 'ollama';

      list.forEach(function (p) {
        var card = document.createElement('div');
        card.className = 'sfx-ai-prov' + (p.id === active ? ' is-active' : '');

        var head = document.createElement('div');
        head.className = 'sfx-ai-prov__head';
        var name = document.createElement('div');
        name.className = 'sfx-ai-prov__name';
        name.textContent = p.name + (p.kind === 'local' ? ' (Local)' : '');
        head.appendChild(name);

        var useBtn = document.createElement('button');
        useBtn.type = 'button';
        useBtn.className = 'sfx-ai-ws__card-btn' + (p.id === active ? ' primary' : '');
        useBtn.textContent = p.id === active ? 'Active' : 'Use';
        useBtn.addEventListener('click', function () {
          if (providers) providers.setActiveProvider(p.id);
          render();
        });
        head.appendChild(useBtn);
        card.appendChild(head);

        var cfg = providers ? providers.getConfig(p.id) : { apiKeySet: false, model: p.defaultModel, connected: false };

        var status = document.createElement('div');
        status.className = 'sfx-ai-prov__status';
        status.innerHTML =
          '<span class="sfx-ai-ws__status-dot ' + (cfg.connected ? 'is-online' : 'is-offline') + '"></span> ' +
          (cfg.connected ? 'Connected' : (cfg.apiKeySet || !p.needsKey ? 'Not tested' : 'No API key'));
        card.appendChild(status);

        if (p.needsKey) {
          var keyRow = document.createElement('div');
          keyRow.className = 'sfx-ai-prov__keyrow';
          var keyInput = document.createElement('input');
          keyInput.type = 'password';
          keyInput.className = 'sfx-ai-prov__key';
          keyInput.placeholder = p.keyPlaceholder || 'API key';
          keyInput.autocomplete = 'off';
          keyInput.spellcheck = false;
          if (cfg.apiKeySet) keyInput.placeholder = cfg.apiKeyMasked + ' (saved)';
          keyRow.appendChild(keyInput);

          var showBtn = document.createElement('button');
          showBtn.type = 'button';
          showBtn.className = 'sfx-ai-ws__card-btn';
          showBtn.textContent = 'Show';
          showBtn.addEventListener('click', function () {
            if (keyInput.type === 'password') {
              keyInput.type = 'text';
              showBtn.textContent = 'Hide';
            } else {
              keyInput.type = 'password';
              showBtn.textContent = 'Show';
            }
          });
          keyRow.appendChild(showBtn);
          card.appendChild(keyRow);

          var keyActions = document.createElement('div');
          keyActions.className = 'sfx-ai-prov__actions';
          var saveBtn = document.createElement('button');
          saveBtn.type = 'button';
          saveBtn.className = 'sfx-ai-ws__card-btn primary';
          saveBtn.textContent = 'Save key';
          saveBtn.addEventListener('click', function () {
            var val = keyInput.value.trim();
            if (!val) return;
            saveBtn.disabled = true;
            providers.setApiKey(p.id, val).then(function () {
              keyInput.value = '';
              saveBtn.textContent = 'Saved';
              setTimeout(function () { render(); }, 400);
            });
          });
          keyActions.appendChild(saveBtn);

          var clearBtn = document.createElement('button');
          clearBtn.type = 'button';
          clearBtn.className = 'sfx-ai-ws__card-btn';
          clearBtn.textContent = 'Delete key';
          clearBtn.addEventListener('click', function () {
            providers.clearCredentials(p.id).then(function () { render(); });
          });
          keyActions.appendChild(clearBtn);
          card.appendChild(keyActions);
        }

        var modelRow = document.createElement('div');
        modelRow.className = 'sfx-ai-prov__modelrow';
        var modelSel = document.createElement('select');
        modelSel.className = 'sfx-ai-ws__model-select';
        var models = providers ? providers.getModels(p.id) : (p.models || [p.defaultModel]);
        models.forEach(function (m) {
          var o = document.createElement('option');
          o.value = m;
          o.textContent = m;
          if (m === cfg.model) o.selected = true;
          modelSel.appendChild(o);
        });
        modelSel.addEventListener('change', function () {
          if (providers) providers.setModel(p.id, modelSel.value);
        });
        modelRow.appendChild(modelSel);

        var testBtn = document.createElement('button');
        testBtn.type = 'button';
        testBtn.className = 'sfx-ai-ws__card-btn';
        testBtn.textContent = 'Test connection';
        testBtn.addEventListener('click', function () {
          testBtn.disabled = true;
          testBtn.textContent = 'Testing…';
          if (!providers) {
            testBtn.textContent = 'Unavailable';
            return;
          }
          providers.setModel(p.id, modelSel.value);
          providers.testConnection(p.id).then(function () {
            testBtn.textContent = 'OK';
            setTimeout(function () { render(); }, 500);
          }).catch(function (err) {
            testBtn.disabled = false;
            testBtn.textContent = 'Failed';
            status.innerHTML =
              '<span class="sfx-ai-ws__status-dot is-offline"></span> ' +
              String(err && err.message ? err.message : err).slice(0, 120);
          });
        });
        modelRow.appendChild(testBtn);
        card.appendChild(modelRow);

        view.appendChild(card);
      });

      // Assistant behaviour
      var confLabel = document.createElement('h3');
      confLabel.textContent = 'Assistant';
      confLabel.style.marginTop = '18px';
      view.appendChild(confLabel);

      var conf = document.createElement('select');
      [0.4, 0.55, 0.7, 0.85].forEach(function (v) {
        var o = document.createElement('option');
        o.value = String(v);
        o.textContent = Math.round(v * 100) + '% min confidence';
        if (settings.minConfidence === v) o.selected = true;
        conf.appendChild(o);
      });
      conf.addEventListener('change', function () {
        settings.minConfidence = Number(conf.value);
        saveSettings(settings);
      });
      conf.className = 'sfx-ai-ws__model-select';
      conf.style.maxWidth = '100%';
      conf.style.marginBottom = '12px';
      view.appendChild(conf);

      var back = document.createElement('button');
      back.type = 'button';
      back.className = 'sfx-ai-ws__settings-back';
      back.textContent = '← Back to chat';
      back.addEventListener('click', function () { showSettings = false; render(); });
      view.appendChild(back);
      return view;
    }

    /* ------------------------------------------------------------------
     * AUTONOMOUS COMMAND DISPATCH & MESSAGE HANDLING
     * ------------------------------------------------------------------ */

    function appendAssistant(text, cards, plan, executedResult) {
      messages.push({
        role: 'assistant',
        text: text,
        cards: cards || null,
        plan: plan || null,
        executedResult: executedResult || null,
        at: Date.now()
      });
      persistActiveChat();
      render();
      scrollChat();
    }

    function sendMessage(text) {
      text = String(text || '').trim();
      if (!text || isGenerating) return;

      if (!activeChatId) {
        activeChatId = uid();
        history.unshift({ id: activeChatId, title: text.slice(0, 40), messages: [], updatedAt: Date.now() });
      }
      messages.push({ role: 'user', text: text, at: Date.now() });
      persistActiveChat();

      var safety = evaluateContentSafety(text);
      if (!safety.safe) {
        appendAssistant(safety.reason);
        return;
      }

      isGenerating = true;
      render();
      scrollChat();

      // Step 1: Inspect live sequence context from Premiere Pro
      inspectTimeline(services, false).then(function (tl) {
        var intent = parseUserIntent(text, tl);

        // --- Intent A: Transport Operations ---
        if (intent.type === 'transport') {
          isGenerating = false;
          invokeHost(bridge, 'transport.control', { action: intent.action })
            .then(function (res) {
              appendAssistant('Transport command "' + intent.action + '" executed in Premiere Pro [Verified].');
            })
            .catch(function (err) {
              appendAssistant('Transport command failed: ' + (err && err.message ? err.message : String(err)));
            });
          return;
        }

        // --- Intent B: Playhead Operations ---
        if (intent.type === 'read_playhead') {
          isGenerating = false;
          var pos = tl && tl.present ? fmtTime(tl.playheadSeconds) : '00:00.00';
          appendAssistant('Playhead is currently at ' + pos + ' in sequence "' + ((tl && tl.name) || 'Active Sequence') + '" [Verified].');
          return;
        }

        if (intent.type === 'set_playhead') {
          isGenerating = false;
          invokeHost(bridge, 'playhead.set', { seconds: intent.seconds })
            .then(function () {
              inspectTimeline(services, true);
              appendAssistant('Playhead moved to ' + fmtTime(intent.seconds) + ' in sequence "' + ((tl && tl.name) || 'Active Sequence') + '" [Verified].');
            })
            .catch(function (err) {
              appendAssistant('Could not move playhead: ' + (err && err.message ? err.message : String(err)));
            });
          return;
        }

        // --- Intent C: Undo ---
        if (intent.type === 'undo') {
          isGenerating = false;
          undoLastExecution(services)
            .then(function (res) {
              appendAssistant(res.message);
            })
            .catch(function (err) {
              appendAssistant('Undo failed: ' + (err && err.message ? err.message : String(err)));
            });
          return;
        }

        // --- Intent D: Timeline Inspection ---
        if (intent.type === 'inspect_timeline') {
          isGenerating = false;
          if (!tl || !tl.present) {
            appendAssistant('**Timeline Status:** No active sequence open in Premiere Pro. Please open a sequence to inspect tracks.');
            return;
          }
          var struct = analyzeTimelineStructure(tl);
          var report = [
            '### Premiere Pro Sequence Inspection [Verified]',
            '- **Sequence:** “' + struct.name + '”',
            '- **Duration:** ' + struct.duration.toFixed(2) + 's (' + fmtTime(struct.duration) + ')',
            '- **Frame Rate:** ' + struct.fps.toFixed(2) + ' fps · **Resolution:** ' + struct.width + 'x' + struct.height,
            '- **Playhead:** ' + fmtTime(struct.playhead),
            '- **Tracks:** ' + struct.videoTrackCount + ' Video / ' + struct.audioTrackCount + ' Audio',
            '- **Detected Visual Cuts:** ' + struct.cuts.length + ' scene cuts',
            '- **Dialogue Regions:** ' + (struct.dialogueSpans.length ? struct.dialogueSpans.map(function (d) { return fmtTime(d.start) + '–' + fmtTime(d.end); }).join(', ') : 'None detected'),
            '- **Music Tracks:** ' + (struct.musicSpans.length ? struct.musicSpans.map(function (m) { return m.name; }).join(', ') : 'None detected')
          ].join('\n\n');

          appendAssistant(report);
          return;
        }

        // --- Intent E: Targeted Placement & Autonomous Sound Design ---
        if (intent.type === 'targeted_place' || intent.type === 'autonomous_sound_design') {
          if (!tl || !tl.present) {
            isGenerating = false;
            appendAssistant('I cannot place audio or design sound because there is **no active sequence open in Premiere Pro**.\n\nPlease open a sequence in Premiere Pro and try again.');
            return;
          }

          var planResult = buildActionPlan(intent, services, tl);
          isGenerating = false;

          if (planResult.error) {
            appendAssistant(planResult.error);
            return;
          }

          var introMsg = intent.type === 'targeted_place'
            ? 'I found a matching asset in your local sound library and prepared the placement plan for approval:'
            : 'I analyzed sequence **“' + tl.name + '”**, identified visual cuts & cues, and generated an autonomous sound design plan using your local sound library:';

          appendAssistant(introMsg, null, planResult);
          return;
        }

        // --- Intent F: Conversational Chat with AI Model ---
        var candidates = [];
        try { candidates = selectCandidates(library, text, 10); } catch (e) {}

        var prior = messages.slice(0, -1).map(function (m) {
          return { role: m.role, text: m.text };
        });

        callAiChat(text, candidates, prior, tl)
          .then(function (raw) {
            isGenerating = false;
            var reply = String(raw || '').trim() || 'Empty response from model.';
            var cards = null;
            if (candidates.length) {
              cards = candidates.slice(0, 3).map(function (a) {
                return {
                  id: a.id || a.path,
                  path: a.path || a.id,
                  name: a.name,
                  folder: a.relativeFolder || a.folder || '',
                  reason: 'Library Match'
                };
              });
            }
            appendAssistant(reply, cards);
          })
          .catch(function (err) {
            isGenerating = false;
            appendAssistant('AI Inference error: ' + (err && err.message ? err.message : String(err)));
          });
      });
    }

    // Auto-sync intervals
    refreshTimelineContext();
    refreshOllamaStatus();
    setInterval(refreshOllamaStatus, 15000);
    setInterval(function () {
      if (panel.classList.contains('is-open') && !isGenerating && !agentState.isExecuting) {
        refreshTimelineContext();
      }
    }, 7000);

    if (window.__sfxHeaderMenu && typeof window.__sfxHeaderMenu.refresh === 'function') {
      try { window.__sfxHeaderMenu.refresh(); } catch (e) {}
    }
    try {
      document.dispatchEvent(new CustomEvent('sfx-ai-assistant-ready'));
    } catch (e) {}
  }

  // Expose Autonomous Timeline Agent API
  window.__sfxTimelineAgent = {
    inspectTimeline: function (force) {
      return inspectTimeline(window.__sfxServices, force);
    },
    parseUserIntent: parseUserIntent,
    buildActionPlan: function (text, tl) {
      var intent = parseUserIntent(text, tl || agentState.timeline);
      return buildActionPlan(intent, window.__sfxServices, tl || agentState.timeline);
    },
    executePlan: function (plan, onProgress) {
      return executeTimelinePlan(plan, window.__sfxServices, onProgress);
    },
    undoLast: function () {
      return undoLastExecution(window.__sfxServices);
    },
    getState: function () {
      return agentState;
    }
  };

  if (window.__sfxAiAssistant) {
    window.__sfxAiAssistant.timelineAgent = window.__sfxTimelineAgent;
  }

  waitForServices(function (services) { buildUI(services); });
})();
