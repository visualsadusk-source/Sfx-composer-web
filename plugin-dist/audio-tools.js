/*
  SFX Composer — Essential Sound Studio + Integrated Audio Library

  Three-panel workspace:
    LEFT   — Local 17K+ library (search, categories, favorites, collections)
    CENTER — Waveform, transport, trim/fade envelopes, real-time preview
    RIGHT  — Essential Sound category controls (Music / SFX / Dialogue / Ambience)

  Non-destructive. Originals never overwritten.
  Timeline integration via existing host bridge (Premiere Pro + After Effects).
*/
(function () {
  'use strict';

  var ICON = {
    wave: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 12h2l2-6 3 12 3-9 2 3h6"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>',
    stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6.9L22 9.2l-5 4.9 1.2 7.2L12 17.8 5.8 21.3 7 14.1 2 9.2l7.1-.3z"/></svg>',
    starOut: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2l2.9 6.9L22 9.2l-5 4.9 1.2 7.2L12 17.8 5.8 21.3 7 14.1 2 9.2l7.1-.3z"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
    library: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19V5a1 1 0 011-1h3v16H5a1 1 0 01-1-1zM10 4h4v16h-4zM16 4h3a1 1 0 011 1v14a1 1 0 01-1 1h-3V4z"/></svg>',
    sparkle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"/><path d="M19 3l.6 1.7L21 5.3l-1.4.6L19 7.6l-.6-1.7L17 5.3l1.4-.6L19 3z"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>',
    compare: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="8" height="14" rx="2"/><rect x="13" y="5" width="8" height="14" rx="2"/></svg>'
  };

  var ENHANCE_PRESETS = {
    podcast: {
      label: 'Voiceover & Podcast (Recommended)',
      intensity: 0.85,
      noiseReduction: 0.80,
      voiceClarity: 0.75,
      deReverb: 0.60,
      deEss: 0.50,
      deClip: true,
      targetLufs: -16.0
    },
    noisy: {
      label: 'Dialogue — AC / Fan / Hiss Removal',
      intensity: 0.90,
      noiseReduction: 0.95,
      voiceClarity: 0.80,
      deReverb: 0.65,
      deEss: 0.50,
      deClip: true,
      targetLufs: -16.0
    },
    reverb: {
      label: 'Echo & Room Reverb Reduction',
      intensity: 0.85,
      noiseReduction: 0.75,
      voiceClarity: 0.70,
      deReverb: 0.90,
      deEss: 0.45,
      deClip: true,
      targetLufs: -16.0
    },
    polish: {
      label: 'Clean Speech Polish',
      intensity: 0.70,
      noiseReduction: 0.50,
      voiceClarity: 0.60,
      deReverb: 0.30,
      deEss: 0.40,
      deClip: true,
      targetLufs: -16.0
    },
    broadcast: {
      label: 'Broadcast TV (EBU R128 -24 LUFS)',
      intensity: 0.85,
      noiseReduction: 0.80,
      voiceClarity: 0.75,
      deReverb: 0.60,
      deEss: 0.55,
      deClip: true,
      targetLufs: -24.0
    }
  };

  var CATEGORIES = [
    { id: 'all', label: 'All' },
    { id: 'music', label: 'Music' },
    { id: 'sfx', label: 'SFX' },
    { id: 'dialogue', label: 'Dialogue' },
    { id: 'ambience', label: 'Ambience' }
  ];

  var ES_DEFAULTS = {
    music: {
      gainDb: 0, fadeIn: 0.01, fadeOut: 0.05, normalize: true, targetDb: -14,
      bass: 0, highpass: 20, lowpass: 20000, presence: 0, compress: 0, duck: false, pitch: 0, reverb: 0, width: 0
    },
    sfx: {
      gainDb: 0, fadeIn: 0, fadeOut: 0.05, normalize: true, targetDb: -1,
      bass: 0, highpass: 20, lowpass: 20000, presence: 0, compress: 0, duck: false, pitch: 0, reverb: 0, width: 0, transient: 0
    },
    dialogue: {
      gainDb: 0, fadeIn: 0, fadeOut: 0.02, normalize: true, targetDb: -16,
      bass: 0, highpass: 80, lowpass: 12000, presence: 0.35, compress: 0.4, duck: false, pitch: 0, reverb: 0, width: 0, deess: 0
    },
    ambience: {
      gainDb: -3, fadeIn: 0.5, fadeOut: 0.5, normalize: false, targetDb: -18,
      bass: 0, highpass: 20, lowpass: 16000, presence: 0, compress: 0, duck: false, pitch: 0, reverb: 0.15, width: 0.25, loop: false
    }
  };

  var panel = null;
  var libEl = null;
  var centerEl = null;
  var esEl = null;
  var waveCanvas = null;
  var waveCanvasOrig = null;
  var waveCanvasEnh = null;
  var audioCtx = null;
  var sourceNode = null;
  var gainNode = null;
  var filterHP = null;
  var filterLP = null;
  var filterBass = null;
  var filterPresence = null;
  var compressorNode = null;
  var raf = 0;
  var previewPlaying = false;
  var libraryUnsubscribe = null;
  var selectionSyncTimer = 0;
  var selectionSyncBusy = false;
  var suppressSyncUntil = 0;
  var clipEdits = {};

  var state = {
    // Mode: 'essential' (Essential Sound Studio) | 'enhance' (AI Audio Enhance)
    activeMode: 'essential',
    // file
    path: '',
    name: '',
    buffer: null,
    duration: 0,
    sampleRate: 0,
    channels: 0,
    peaks: null,
    // edit
    trimStart: 0,
    trimEnd: 0,
    // es
    esCategory: 'sfx',
    params: Object.assign({}, ES_DEFAULTS.sfx),
    // AI Audio Enhance state
    enhanceParams: Object.assign({}, ENHANCE_PRESETS.podcast),
    isEnhancing: false,
    enhanceProgress: 0,
    enhanceStage: '',
    enhancedBuffer: null,
    enhancedPeaks: null,
    enhancedPath: '',
    enhancedMetrics: null,
    abMode: 'B', // 'A' = Original, 'B' = Enhanced
    depsInfo: null,
    // playback
    playing: false,
    playStartCtx: 0,
    playOffset: 0,
    // ui
    libCollapsed: false,
    libTab: 'browse', // browse | favorites | collections
    libCategory: 'all',
    libQuery: '',
    libMood: '',
    libGenre: '',
    libSort: 'name',
    status: '',
    error: '',
    timelineClip: null, // { name, mediaPath, startSeconds, endSeconds }
    timelineSelection: null,
    activeSelectionIndex: 0,
    libraryAssets: [],
    libraryLoaded: false,
    libraryError: '',
    favorites: {},
    filtered: [],
    selectedLibPath: '',
    exporting: false,
    syncPreview: false
  };

  // ── Helpers ──────────────────────────────────────────────────────────

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function nodeRequire() {
    try {
      if (window.cep_node && typeof window.cep_node.require === 'function') return window.cep_node.require;
      if (typeof window.require === 'function') return window.require;
    } catch (e) {}
    return null;
  }

  function mods() {
    var req = nodeRequire();
    if (!req) throw new Error('File access is not available in this panel.');
    return { fs: req('fs'), path: req('path'), os: req('os') };
  }

  function getCtx() {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error('Web Audio API is not available.');
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') {
      try { audioCtx.resume(); } catch (e) {}
    }
    return audioCtx;
  }
  function dbToLin(db) {
    return Math.pow(10, Number(db) / 20);
  }

  function linToDb(v) {
    if (v <= 1e-12) return -96;
    return 20 * Math.log10(v);
  }

  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var m = Math.floor(sec / 60);
    var s = sec - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
  }

  function guessCategory(name, path, keywords) {
    var n = (String(name || '') + ' ' + String(path || '') + ' ' + (keywords || []).join(' ')).toLowerCase();
    if (/\b(music|song|score|theme|underscore|bed|loop.?music)\b/.test(n)) return 'music';
    if (/\b(dialog|dialogue|voice|vo|narrat|speech|talk)\b/.test(n)) return 'dialogue';
    if (/\b(ambi|atmos|room.?tone|bg|background|env|nature|wind|rain|crowd)\b/.test(n)) return 'ambience';
    return 'sfx';
  }

  function loadFavorites() {
    try {
      var raw = localStorage.getItem('sfx_au_favorites');
      state.favorites = raw ? JSON.parse(raw) : {};
    } catch (e) {
      state.favorites = {};
    }
  }

  function saveFavorites() {
    try {
      localStorage.setItem('sfx_au_favorites', JSON.stringify(state.favorites));
    } catch (e) {}
  }

  function isFav(path) {
    return !!state.favorites[String(path).replace(/\\/g, '/').toLowerCase()];
  }

  function toggleFav(path) {
    var key = String(path).replace(/\\/g, '/').toLowerCase();
    if (state.favorites[key]) delete state.favorites[key];
    else state.favorites[key] = true;
    saveFavorites();
  }

  // ── Library index ────────────────────────────────────────────────────

  function libraryService() {
    try {
      return window.__sfxServices && window.__sfxServices.library ? window.__sfxServices.library : null;
    } catch (e) {
      return null;
    }
  }

  function normaliseLibraryAssets(assets) {
    var m = mods();
    return (assets || []).map(function (a) {
      var p = a.path || a.filePath || a.file || '';
      var meta = a.metadata || {};
      var name = a.name || a.fileName || (p ? m.path.basename(p) : 'Unknown');
      var keywords = a.keywords || a.tags || meta.tags || [];
      if (!Array.isArray(keywords)) keywords = [];
      var cat = a.category || a.type || guessCategory(name, p, keywords);
      // The main library has no required category field; infer it from the
      // real file/path/tags so Music and SFX remain discoverable.
      cat = String(cat || guessCategory(name, p, keywords)).toLowerCase();
      if (cat === 'effect' || cat === 'effects') cat = 'sfx';
      return {
        id: a.id || p,
        path: p,
        name: name,
        duration: Number(a.duration || a.durationSeconds || a.length || 0) || 0,
        category: cat,
        genre: a.genre || '',
        mood: a.mood || a.emotion || '',
        keywords: keywords,
        collection: a.collection || a.folder || '',
        favourite: !!meta.favourite
      };
    }).filter(function (a) { return a.path; });
  }

  function applyLibraryAssets(assets) {
    state.libraryAssets = normaliseLibraryAssets(assets);
    state.libraryLoaded = true;
    state.libraryError = '';
    filterLibrary();
  }

  function findLibraryIndexPaths() {
    var paths = [];
    try {
      var m = mods();
      var home = m.os.homedir();
      var platform = m.os.platform();
      var candidates = [];
      if (platform === 'win32') {
        var appdata = process.env.APPDATA || m.path.join(home, 'AppData', 'Roaming');
        candidates.push(m.path.join(appdata, 'SFX Composer'));
        candidates.push(m.path.join(appdata, 'sfxcomposer'));
        candidates.push(m.path.join(appdata, 'Adobe', 'CEP', 'extensions', 'com.sfxcomposer.panel'));
      } else if (platform === 'darwin') {
        candidates.push(m.path.join(home, 'Library', 'Application Support', 'SFX Composer'));
        candidates.push(m.path.join(home, 'Library', 'Application Support', 'sfxcomposer'));
      } else {
        candidates.push(m.path.join(home, '.sfxcomposer'));
        candidates.push(m.path.join(home, '.config', 'SFX Composer'));
      }
      // Also try extension folder relative
      try {
        var extRoot = m.path.resolve(__dirname || '.', '..');
        candidates.push(extRoot);
        candidates.push(m.path.join(extRoot, 'data'));
      } catch (e) {}
      for (var i = 0; i < candidates.length; i++) {
        var p = m.path.join(candidates[i], 'library-index.json');
        if (m.fs.existsSync(p)) paths.push(p);
        var p2 = m.path.join(candidates[i], 'library', 'library-index.json');
        if (m.fs.existsSync(p2)) paths.push(p2);
      }
    } catch (e) {}
    return paths;
  }

  function loadLibrary() {
    state.libraryLoaded = false;
    state.libraryError = '';
    state.libraryAssets = [];
    try {
      var m = mods();
      var paths = findLibraryIndexPaths();
      var index = null;
      var used = '';
      for (var i = 0; i < paths.length; i++) {
        try {
          var raw = m.fs.readFileSync(paths[i], 'utf8');
          var data = JSON.parse(raw);
          if (data && Array.isArray(data.assets) && data.assets.length) {
            index = data;
            used = paths[i];
            break;
          }
        } catch (e) {}
      }
      // Prefer the live main-library service. The old getAssets() probe never
      // matched its real entries() API, which is why Browse falsely claimed
      // that an index was missing.
      var live = libraryService();
      if (live && typeof live.entries === 'function') {
        var liveAssets = live.entries() || [];
        if (liveAssets.length) {
          applyLibraryAssets(liveAssets);
          return;
        }
        var snap = typeof live.snapshot === 'function' ? live.snapshot() : null;
        if (snap && snap.locations && snap.locations.length && typeof live.rescan === 'function') {
          state.libraryError = 'Scanning configured library folders…';
          state.libraryLoaded = true;
          live.rescan().catch(function () {}).then(function () {
            applyLibraryAssets(live.entries ? live.entries() : []);
            if (!state.libraryAssets.length) state.libraryError = 'No supported audio files were found in the configured library folders.';
            renderLib();
          });
          return;
        }
      }
      // Compatibility fallback for older panel builds.
      if (!index && window.__sfxServices) {
        try {
          var svc = window.__sfxServices;
          if (svc.library && typeof svc.library.getAssets === 'function') {
            var assets = svc.library.getAssets();
            if (assets && assets.length) {
              index = { assets: assets, locations: [] };
              used = 'services';
            }
          }
        } catch (e2) {}
      }
      if (!index) {
        state.libraryError = 'Library index not found. Open the main Library tab once so SFX Composer can build library-index.json, then reopen Audio Tools.';
        state.libraryLoaded = true;
        return;
      }
      applyLibraryAssets(index.assets || []);
    } catch (err) {
      state.libraryError = err && err.message ? err.message : String(err);
      state.libraryLoaded = true;
    }
  }

  function filterLibrary() {
    var q = (state.libQuery || '').trim().toLowerCase();
    var tokens = q ? q.split(/\s+/).filter(Boolean) : [];
    var cat = state.libCategory;
    var list = state.libraryAssets;
    if (state.libTab === 'favorites') {
      list = list.filter(function (a) { return isFav(a.path) || a.favourite; });
    } else if (state.libTab === 'collections') {
      // show unique collections as pseudo-items later; for now filter assets that have collection
      list = list.filter(function (a) { return a.collection; });
    }
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      if (cat !== 'all' && a.category !== cat) {
        // also allow loose match
        if (!(cat === 'sfx' && a.category === 'effect')) continue;
      }
      if (state.libMood && a.mood && a.mood.toLowerCase().indexOf(state.libMood.toLowerCase()) < 0) continue;
      if (state.libGenre && a.genre && a.genre.toLowerCase().indexOf(state.libGenre.toLowerCase()) < 0) continue;
      if (tokens.length) {
        var hay = (a.name + ' ' + (a.keywords || []).join(' ') + ' ' + a.mood + ' ' + a.genre + ' ' + a.collection).toLowerCase();
        var ok = tokens.every(function (t) { return hay.indexOf(t) >= 0; });
        if (!ok) continue;
      }
      out.push(a);
      if (out.length >= 400) break; // keep UI responsive
    }
    out.sort(function (a, b) {
      return state.libSort === 'duration' ? a.duration - b.duration : a.name.localeCompare(b.name);
    });
    state.filtered = out;
  }

  // ── Audio load / process ─────────────────────────────────────────────

  function loadBuffer(path) {
    var req = nodeRequire();
    if (!req) return Promise.reject(new Error('No file access'));
    var fs = req('fs');
    var buf = fs.readFileSync(path);
    var ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    var ctx = getCtx();
    return new Promise(function (resolve, reject) {
      ctx.decodeAudioData(ab.slice(0), resolve, function () {
        reject(new Error('Could not decode audio'));
      });
    });
  }

  function measurePeak(buffer, t0, t1) {
    if (!buffer) return 0;
    var sr = buffer.sampleRate;
    var i0 = t0 != null ? Math.floor(t0 * sr) : 0;
    var i1 = t1 != null ? Math.floor(t1 * sr) : buffer.length;
    i0 = Math.max(0, i0);
    i1 = Math.min(buffer.length, i1);
    var peak = 0;
    for (var c = 0; c < buffer.numberOfChannels; c++) {
      var d = buffer.getChannelData(c);
      for (var i = i0; i < i1; i++) {
        var v = Math.abs(d[i]);
        if (v > peak) peak = v;
      }
    }
    return peak;
  }

  function measureRms(buffer, t0, t1) {
    if (!buffer) return 0;
    var sr = buffer.sampleRate;
    var i0 = t0 != null ? Math.floor(t0 * sr) : 0;
    var i1 = t1 != null ? Math.floor(t1 * sr) : buffer.length;
    i0 = Math.max(0, i0);
    i1 = Math.min(buffer.length, i1);
    var ch = buffer.getChannelData(0);
    var sum = 0;
    var step = Math.max(1, Math.floor((i1 - i0) / 40000));
    var n = 0;
    for (var i = i0; i < i1; i += step) {
      sum += ch[i] * ch[i];
      n++;
    }
    return Math.sqrt(sum / Math.max(1, n));
  }

  function buildPeaks(buffer) {
    if (!buffer) return null;
    var ch = buffer.getChannelData(0);
    var buckets = 800;
    var peaks = new Float32Array(buckets);
    var step = Math.max(1, Math.floor(ch.length / buckets));
    for (var b = 0; b < buckets; b++) {
      var start = b * step;
      var end = Math.min(ch.length, start + step);
      var peak = 0;
      for (var i = start; i < end; i++) {
        var v = Math.abs(ch[i]);
        if (v > peak) peak = v;
      }
      peaks[b] = peak;
    }
    return peaks;
  }

  /** Offline process → new AudioBuffer (non-destructive export and rendering path) */
  function processBuffer(src, params, trimStart, trimEnd) {
    if (!src) return null;
    var ctx = getCtx();
    var sr = src.sampleRate;
    var i0 = Math.max(0, Math.floor((trimStart || 0) * sr));
    var i1 = Math.min(src.length, Math.floor((trimEnd != null ? trimEnd : src.duration) * sr));
    if (i1 <= i0) i1 = Math.min(src.length, i0 + 1);
    var frames = Math.max(1, i1 - i0);
    var out = ctx.createBuffer(src.numberOfChannels, frames, sr);

    params = params || {};
    var gain = dbToLin(params.gainDb || 0);
    if (params.normalize) {
      var peak = measurePeak(src, trimStart || 0, trimEnd != null ? trimEnd : src.duration);
      if (peak > 1e-9) gain *= dbToLin(params.targetDb != null ? params.targetDb : -1) / peak;
    }
    var peakCheck = measurePeak(src, trimStart || 0, trimEnd != null ? trimEnd : src.duration) * gain;
    if (peakCheck > 1) gain /= peakCheck;

    var fadeInN = Math.min(frames, Math.floor((params.fadeIn || 0) * sr));
    var fadeOutN = Math.min(frames, Math.floor((params.fadeOut || 0) * sr));
    var hp = Math.max(0, Number(params.highpass) || 0);
    var lp = Math.min(20000, Number(params.lowpass) || 20000);
    var bass = Number(params.bass) || 0;
    var presence = Number(params.presence) || 0;
    var deess = Number(params.deess) || 0;
    var transient = Number(params.transient) || 0;
    var width = Number(params.width) || 0;
    var rev = Number(params.reverb) || 0;
    var compress = Number(params.compress) || 0;

    var dt = 1 / sr;

    // Highpass 1-pole RC
    var alphaHp = 1;
    if (hp > 20) {
      var rcHp = 1 / (2 * Math.PI * hp);
      alphaHp = rcHp / (rcHp + dt);
    }

    // Lowpass 1-pole RC
    var alphaLp = 1;
    if (lp < 19500) {
      var rcLp = 1 / (2 * Math.PI * lp);
      alphaLp = dt / (rcLp + dt);
    }

    // Bass lowshelf 2nd order biquad (120 Hz)
    var b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
    var hasBass = Math.abs(bass) > 0.05;
    if (hasBass) {
      var A = Math.pow(10, bass / 40);
      var w0 = 2 * Math.PI * 120 / sr;
      var cosw = Math.cos(w0);
      var sinw = Math.sin(w0);
      var alphaB = sinw / 2 * Math.SQRT2;
      var a0_b = (A + 1) + (A - 1) * cosw + 2 * Math.sqrt(A) * alphaB;
      b0 = (A * ((A + 1) - (A - 1) * cosw + 2 * Math.sqrt(A) * alphaB)) / a0_b;
      b1 = (2 * A * ((A - 1) - (A + 1) * cosw)) / a0_b;
      b2 = (A * ((A + 1) - (A - 1) * cosw - 2 * Math.sqrt(A) * alphaB)) / a0_b;
      a1 = (-2 * ((A - 1) + (A + 1) * cosw)) / a0_b;
      a2 = ((A + 1) + (A - 1) * cosw - 2 * Math.sqrt(A) * alphaB) / a0_b;
    }

    for (var c = 0; c < src.numberOfChannels; c++) {
      var input = src.getChannelData(c);
      var output = out.getChannelData(c);
      var hpState = 0;
      var prevIn = 0;
      var lpState = 0;
      var bx1 = 0, bx2 = 0, by1 = 0, by2 = 0;
      var env = 0;

      for (var i = 0; i < frames; i++) {
        var s = input[i0 + i] || 0;

        // High-pass
        if (hp > 20) {
          var yHp = alphaHp * (hpState + s - prevIn);
          prevIn = s;
          hpState = yHp;
          s = yHp;
        }

        // Bass lowshelf
        if (hasBass) {
          var yBass = b0 * s + b1 * bx1 + b2 * bx2 - a1 * by1 - a2 * by2;
          bx2 = bx1; bx1 = s;
          by2 = by1; by1 = yBass;
          s = yBass;
        }

        // Low-pass
        if (lp < 19500) {
          var yLp = lpState + alphaLp * (s - lpState);
          lpState = yLp;
          s = yLp;
        }

        // Presence
        if (presence > 0.01) {
          s = s + presence * 0.35 * Math.tanh(s * 3);
        }

        // De-esser
        if (deess > 0.01) {
          var bright = s - (lpState || s);
          if (Math.abs(bright) > 0.05) s -= deess * 0.5 * bright;
        }

        // Transient
        if (transient > 0.01) {
          var absVal = Math.abs(s);
          env = Math.max(absVal, env * 0.995);
          if (absVal > env * 0.7) s *= 1 + transient * 0.4;
        }

        // Soft compression
        if (compress > 0.01) {
          var thr = 0.35;
          var abs2 = Math.abs(s);
          if (abs2 > thr) {
            var over = abs2 - thr;
            s = (s >= 0 ? 1 : -1) * (thr + over * (1 - compress * 0.7));
          }
        }

        s *= gain;

        // Fades
        if (i < fadeInN && fadeInN > 0) {
          var fi = i / fadeInN;
          s *= fi * fi * (3 - 2 * fi);
        }
        if (i > frames - fadeOutN && fadeOutN > 0) {
          var fo = (frames - 1 - i) / fadeOutN;
          s *= fo * fo * (3 - 2 * fo);
        }

        if (isNaN(s) || !isFinite(s)) s = 0;
        output[i] = s;
      }
    }

    // Stereo width
    if (width !== 0 && out.numberOfChannels >= 2) {
      var L = out.getChannelData(0);
      var R = out.getChannelData(1);
      var wVal = Math.max(-1, Math.min(1, width));
      for (var j = 0; j < frames; j++) {
        var mid = (L[j] + R[j]) * 0.5;
        var side = (L[j] - R[j]) * 0.5 * (1 + wVal);
        L[j] = mid + side;
        R[j] = mid - side;
      }
    }

    // Reverb
    if (rev > 0.01) {
      var delaySamples = Math.floor(0.028 * sr);
      for (var c2 = 0; c2 < out.numberOfChannels; c2++) {
        var ch = out.getChannelData(c2);
        var tmp = new Float32Array(ch.length);
        tmp.set(ch);
        for (var k = delaySamples; k < ch.length; k++) {
          ch[k] += tmp[k - delaySamples] * rev * 0.35;
        }
      }
    }

    return out;
  }
  function bufferToWav(audioBuffer) {
    var numCh = audioBuffer.numberOfChannels;
    var sr = audioBuffer.sampleRate;
    var len = audioBuffer.length;
    var bytesPerSample = 2;
    var blockAlign = numCh * bytesPerSample;
    var dataSize = len * blockAlign;
    var buffer = new ArrayBuffer(44 + dataSize);
    var view = new DataView(buffer);
    function str(o, s) {
      for (var i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
    }
    str(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    str(8, 'WAVE');
    str(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numCh, true);
    view.setUint32(24, sr, true);
    view.setUint32(28, sr * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    str(36, 'data');
    view.setUint32(40, dataSize, true);
    var offset = 44;
    for (var i = 0; i < len; i++) {
      for (var c = 0; c < numCh; c++) {
        var s = audioBuffer.getChannelData(c)[i];
        s = Math.max(-1, Math.min(1, s));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        offset += 2;
      }
    }
    return buffer;
  }

  // ── Real-time playback graph ─────────────────────────────────────────

  function stopPlay() {
    if (sourceNode) {
      try { sourceNode.onended = null; } catch (e0) {}
      try { sourceNode.stop(); } catch (e) {}
      try { sourceNode.disconnect(); } catch (e2) {}
      sourceNode = null;
    }
    state.playing = false;
    previewPlaying = false;
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    updateTransportUI();
    if (state.activeMode === 'enhance') {
      drawEnhanceWaveforms();
    } else {
      drawWaveform();
    }
  }

  function buildLiveGraph(isProcessed, fromTime) {
    if (!state.buffer) return;
    var ctx = getCtx();
    if (ctx.state === 'suspended') {
      try { ctx.resume(); } catch (eResume) {}
    }
    stopPlay();

    var startAt = state.trimStart;
    if (fromTime != null && isFinite(fromTime)) {
      startAt = Math.max(state.trimStart, Math.min(state.trimEnd - 0.01, fromTime));
    } else if (state.playOffset != null && isFinite(state.playOffset) &&
               state.playOffset >= state.trimStart && state.playOffset < state.trimEnd - 0.01) {
      startAt = state.playOffset;
    }
    var dur = Math.max(0.01, state.trimEnd - startAt);

    var src = ctx.createBufferSource();
    src.buffer = state.buffer;

    if (isProcessed) {
      var pitch = Number(state.params.pitch) || 0;
      if (pitch) {
        try { src.playbackRate.value = Math.pow(2, pitch / 12); } catch (ePitch) {}
      }

      var g = dbToLin(state.params.gainDb || 0);
      if (state.params.normalize && state.buffer) {
        var peak = measurePeak(state.buffer, state.trimStart, state.trimEnd);
        if (peak > 1e-9) g *= dbToLin(state.params.targetDb != null ? state.params.targetDb : -1) / peak;
      }
      g = Math.min(Math.max(0, g), 4);

      gainNode = ctx.createGain();
      gainNode.gain.value = g;

      filterHP = ctx.createBiquadFilter();
      filterHP.type = 'highpass';
      filterHP.frequency.value = Math.max(20, Number(state.params.highpass) || 20);

      filterLP = ctx.createBiquadFilter();
      filterLP.type = 'lowpass';
      filterLP.frequency.value = Math.min(20000, Number(state.params.lowpass) || 20000);

      filterBass = ctx.createBiquadFilter();
      filterBass.type = 'lowshelf';
      filterBass.frequency.value = 120;
      filterBass.gain.value = Number(state.params.bass || 0);

      filterPresence = ctx.createBiquadFilter();
      filterPresence.type = 'peaking';
      filterPresence.frequency.value = 3200;
      filterPresence.Q.value = 1.2;
      filterPresence.gain.value = (Number(state.params.presence) || 0) * 8;

      compressorNode = ctx.createDynamicsCompressor();
      var comp = Number(state.params.compress) || 0;
      compressorNode.threshold.value = -24 + comp * -18;
      compressorNode.knee.value = 12;
      compressorNode.ratio.value = 1 + comp * 8;
      compressorNode.attack.value = 0.01;
      compressorNode.release.value = 0.15;

      src.connect(filterHP);
      filterHP.connect(filterLP);
      filterLP.connect(filterBass);
      filterBass.connect(filterPresence);
      filterPresence.connect(compressorNode);
      compressorNode.connect(gainNode);
      gainNode.connect(ctx.destination);

      // Schedule fades on gainNode
      var now = ctx.currentTime;
      var fi = Number(state.params.fadeIn) || 0;
      var fo = Number(state.params.fadeOut) || 0;
      if (fi > 0 && Math.abs(startAt - state.trimStart) < 0.02) {
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(g, now + Math.min(fi, dur));
      } else {
        gainNode.gain.setValueAtTime(g, now);
      }
      if (fo > 0) {
        var foStart = Math.max(now, now + dur - fo);
        gainNode.gain.setValueAtTime(g, foStart);
        gainNode.gain.linearRampToValueAtTime(0, now + dur);
      }
    } else {
      gainNode = ctx.createGain();
      gainNode.gain.value = 1;
      src.connect(gainNode);
      gainNode.connect(ctx.destination);
    }

    src.onended = function () {
      if (sourceNode !== src) return;
      sourceNode = null;
      state.playing = false;
      previewPlaying = false;
      state.playOffset = state.trimStart;
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      updateTransportUI();
      drawWaveform();
    };

    try {
      src.start(0, startAt, dur);
    } catch (eStart) {
      try { src.disconnect(); } catch (eDisc) {}
      sourceNode = null;
      state.playing = false;
      previewPlaying = false;
      updateTransportUI();
      drawWaveform();
      return;
    }

    sourceNode = src;
    state.playStartCtx = ctx.currentTime;
    state.playOffset = startAt;
    state.playing = true;
    previewPlaying = !!isProcessed;
    tickPlayhead();
    updateTransportUI();
  }

  function playProcessedPreview(fromTime) {
    if (!state.buffer) return;
    previewPlaying = true;
    buildLiveGraph(true, fromTime);
  }

  function playOriginal(fromTime) {
    if (!state.buffer) return;
    previewPlaying = false;
    buildLiveGraph(false, fromTime);
  }

  function updateLiveParams() {
    if (!state.playing || !previewPlaying) return;
    try {
      var ctx = getCtx();
      var now = ctx.currentTime;
      if (gainNode) {
        var g = dbToLin(state.params.gainDb || 0);
        if (state.params.normalize && state.buffer) {
          var peak = measurePeak(state.buffer, state.trimStart, state.trimEnd);
          if (peak > 1e-9) g *= dbToLin(state.params.targetDb != null ? state.params.targetDb : -1) / peak;
        }
        g = Math.min(Math.max(0, g), 4);
        gainNode.gain.setTargetAtTime(g, now, 0.03);
      }
      if (filterBass) {
        filterBass.gain.setTargetAtTime(Number(state.params.bass || 0), now, 0.03);
      }
      if (filterHP) {
        filterHP.frequency.setTargetAtTime(Math.max(20, Number(state.params.highpass) || 20), now, 0.03);
      }
      if (filterLP) {
        filterLP.frequency.setTargetAtTime(Math.min(20000, Number(state.params.lowpass) || 20000), now, 0.03);
      }
      if (filterPresence) {
        filterPresence.gain.setTargetAtTime((Number(state.params.presence) || 0) * 8, now, 0.03);
      }
      if (compressorNode) {
        var comp = Number(state.params.compress) || 0;
        compressorNode.threshold.setTargetAtTime(-24 + comp * -18, now, 0.03);
        compressorNode.ratio.setTargetAtTime(1 + comp * 8, now, 0.03);
      }
    } catch (e) {}
  }

  function tickPlayhead() {
    if (!state.playing) return;
    if (state.activeMode === 'enhance') {
      drawEnhanceWaveforms();
    } else {
      drawWaveform();
    }
    updateTransportUI();
    raf = requestAnimationFrame(tickPlayhead);
  }

  // ── Waveform drawing ─────────────────────────────────────────────────

  function drawWaveform() {
    if (state.activeMode === 'enhance') {
      drawEnhanceWaveforms();
      return;
    }
    if (!waveCanvas || !state.peaks) return;
    var canvas = waveCanvas;
    var rect = canvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    var w = Math.max(1, Math.floor(rect.width * dpr));
    var h = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(0, 0, w, h);

    var peaks = state.peaks;
    var n = peaks.length;
    var mid = h / 2;
    var dur = state.duration || 1;

    // trim region background
    var x0 = (state.trimStart / dur) * w;
    var x1 = (state.trimEnd / dur) * w;
    ctx.fillStyle = 'rgba(10, 132, 255, 0.08)';
    ctx.fillRect(x0, 0, Math.max(1, x1 - x0), h);

    // waveform
    ctx.strokeStyle = '#3d9bff';
    ctx.lineWidth = Math.max(1, dpr);
    ctx.beginPath();
    for (var i = 0; i < n; i++) {
      var x = (i / n) * w;
      var amp = peaks[i] * (mid - 4);
      if (i === 0) ctx.moveTo(x, mid - amp);
      else ctx.lineTo(x, mid - amp);
    }
    for (var j = n - 1; j >= 0; j--) {
      var x2 = (j / n) * w;
      var amp2 = peaks[j] * (mid - 4);
      ctx.lineTo(x2, mid + amp2);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(61, 155, 255, 0.25)';
    ctx.fill();
    ctx.stroke();

    // fade envelopes
    var fi = state.params.fadeIn || 0;
    var fo = state.params.fadeOut || 0;
    if (fi > 0) {
      var fx = x0 + (fi / dur) * w;
      ctx.strokeStyle = 'rgba(48, 209, 88, 0.7)';
      ctx.beginPath();
      ctx.moveTo(x0, h - 2);
      ctx.lineTo(fx, 2);
      ctx.stroke();
    }
    if (fo > 0) {
      var fx2 = x1 - (fo / dur) * w;
      ctx.strokeStyle = 'rgba(48, 209, 88, 0.7)';
      ctx.beginPath();
      ctx.moveTo(fx2, 2);
      ctx.lineTo(x1, h - 2);
      ctx.stroke();
    }

    // trim handles
    ctx.fillStyle = '#0a84ff';
    ctx.fillRect(x0 - 1 * dpr, 0, 2 * dpr, h);
    ctx.fillRect(x1 - 1 * dpr, 0, 2 * dpr, h);

    // playhead
    var curT = state.playOffset;
    if (state.playing && audioCtx) {
      curT = state.playOffset + (audioCtx.currentTime - state.playStartCtx);
    }
    if (curT != null && curT >= 0 && curT <= dur) {
      var px = (curT / dur) * w;
      ctx.strokeStyle = '#ffd60a';
      ctx.lineWidth = Math.max(1.5, 1.5 * dpr);
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
      ctx.stroke();
    }
  }

  // ── AI Audio Enhance Implementation ───────────────────────────────────

  function updateAbToggleUI() {
    if (!panel) return;
    var btnA = panel.querySelector('[data-ab="A"]');
    var btnB = panel.querySelector('[data-ab="B"]');
    if (btnA) btnA.classList.toggle('is-active', state.abMode === 'A');
    if (btnB) btnB.classList.toggle('is-active', state.abMode === 'B');

    var boxA = panel.querySelector('.sfx-au__enh-wave-box[data-wave="orig"]');
    var boxB = panel.querySelector('.sfx-au__enh-wave-box[data-wave="enh"]');
    if (boxA) boxA.classList.toggle('is-active-ab', state.abMode === 'A');
    if (boxB) boxB.classList.toggle('is-active-ab', state.abMode === 'B');
  }

  function updateEnhanceProgressUI() {
    if (!panel) return;
    var fill = panel.querySelector('.sfx-au__enh-progress-fill');
    var text = panel.querySelector('.sfx-au__enh-progress-text');
    var stage = panel.querySelector('.sfx-au__enh-progress-stage');
    var wrap = panel.querySelector('.sfx-au__enh-progress');
    var enhBtn = panel.querySelector('.sfx-au__btn--enhance');

    if (fill) fill.style.width = Math.min(100, Math.max(0, state.enhanceProgress || 0)) + '%';
    if (text) text.textContent = Math.round(state.enhanceProgress || 0) + '%';
    if (stage) stage.textContent = state.enhanceStage || 'Processing…';
    if (wrap) wrap.style.display = (state.isEnhancing || state.enhanceProgress > 0) ? 'block' : 'none';

    if (enhBtn) {
      if (state.isEnhancing) {
        enhBtn.classList.add('is-loading');
        enhBtn.disabled = true;
        enhBtn.textContent = '⏳ Processing (' + Math.round(state.enhanceProgress || 0) + '%)…';
      } else {
        enhBtn.classList.remove('is-loading');
        enhBtn.disabled = false;
        enhBtn.textContent = state.enhancedBuffer ? '✨ Re-Enhance Audio' : '✨ Enhance Audio';
      }
    }
  }

  function playAB(fromTime, targetMode) {
    var ctx = getCtx();
    if (ctx.state === 'suspended') {
      try { ctx.resume(); } catch (e) {}
    }
    stopPlay();

    var mode = targetMode || state.abMode || 'B';
    if (mode === 'B' && !state.enhancedBuffer) {
      mode = 'A';
    }
    state.abMode = mode;

    var bufToPlay = (mode === 'B' && state.enhancedBuffer) ? state.enhancedBuffer : state.buffer;
    if (!bufToPlay) return;

    var startAt = 0;
    if (fromTime != null && isFinite(fromTime)) {
      startAt = Math.max(0, Math.min(bufToPlay.duration - 0.01, fromTime));
    } else if (state.playOffset != null && isFinite(state.playOffset) &&
               state.playOffset >= 0 && state.playOffset < bufToPlay.duration - 0.01) {
      startAt = state.playOffset;
    }
    var dur = Math.max(0.01, bufToPlay.duration - startAt);

    var src = ctx.createBufferSource();
    src.buffer = bufToPlay;

    gainNode = ctx.createGain();
    gainNode.gain.value = 1.0;
    src.connect(gainNode);
    gainNode.connect(ctx.destination);

    src.onended = function () {
      if (sourceNode !== src) return;
      sourceNode = null;
      state.playing = false;
      state.playOffset = 0;
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      updateTransportUI();
      drawEnhanceWaveforms();
    };

    try {
      src.start(0, startAt, dur);
    } catch (eStart) {
      try { src.disconnect(); } catch (eDisc) {}
      sourceNode = null;
      state.playing = false;
      updateTransportUI();
      drawEnhanceWaveforms();
      return;
    }

    sourceNode = src;
    state.playStartCtx = ctx.currentTime;
    state.playOffset = startAt;
    state.playing = true;
    previewPlaying = false;
    tickPlayhead();
    updateTransportUI();
    updateAbToggleUI();
  }

  function switchAB(newMode) {
    if (!state.enhancedBuffer && newMode === 'B') {
      state.status = 'Click "Enhance Audio" to generate the enhanced version first.';
      updateStatusUI();
      return;
    }
    if (state.playing && audioCtx) {
      var currentOffset = Math.max(0, (audioCtx.currentTime - state.playStartCtx) + state.playOffset);
      playAB(currentOffset, newMode);
    } else {
      state.abMode = newMode;
      updateAbToggleUI();
      drawEnhanceWaveforms();
    }
  }

  function drawEnhanceWaveforms() {
    var dur = state.duration || 1;
    var curT = state.playOffset;
    if (state.playing && audioCtx) {
      curT = state.playOffset + (audioCtx.currentTime - state.playStartCtx);
    }

    // 1. Draw Original Waveform
    if (waveCanvasOrig && state.peaks) {
      var c1 = waveCanvasOrig;
      var rect1 = c1.getBoundingClientRect();
      var dpr = window.devicePixelRatio || 1;
      var w1 = Math.max(1, Math.floor(rect1.width * dpr));
      var h1 = Math.max(1, Math.floor(rect1.height * dpr));
      if (c1.width !== w1 || c1.height !== h1) {
        c1.width = w1; c1.height = h1;
      }
      var ctx1 = c1.getContext('2d');
      ctx1.clearRect(0, 0, w1, h1);
      ctx1.fillStyle = '#08090C';
      ctx1.fillRect(0, 0, w1, h1);

      var p1 = state.peaks;
      var n1 = p1.length;
      var mid1 = h1 / 2;
      var isPlayingThis = state.playing && state.abMode === 'A';

      ctx1.strokeStyle = isPlayingThis ? '#66b3ff' : '#4a6582';
      ctx1.lineWidth = Math.max(1, dpr);
      ctx1.beginPath();
      for (var i = 0; i < n1; i++) {
        var x = (i / n1) * w1;
        var amp = p1[i] * (mid1 - 4);
        if (i === 0) ctx1.moveTo(x, mid1 - amp);
        else ctx1.lineTo(x, mid1 - amp);
      }
      for (var j = n1 - 1; j >= 0; j--) {
        var x2 = (j / n1) * w1;
        var amp2 = p1[j] * (mid1 - 4);
        ctx1.lineTo(x2, mid1 + amp2);
      }
      ctx1.closePath();
      ctx1.fillStyle = isPlayingThis ? 'rgba(102, 179, 255, 0.28)' : 'rgba(74, 101, 130, 0.18)';
      ctx1.fill();
      ctx1.stroke();

      if (curT != null && curT >= 0 && curT <= dur) {
        var px = (curT / dur) * w1;
        ctx1.strokeStyle = isPlayingThis ? '#ffd60a' : 'rgba(255, 214, 10, 0.6)';
        ctx1.lineWidth = Math.max(1.5, 1.5 * dpr);
        ctx1.beginPath();
        ctx1.moveTo(px, 0);
        ctx1.lineTo(px, h1);
        ctx1.stroke();
      }
    }

    // 2. Draw Enhanced Waveform
    if (waveCanvasEnh) {
      var c2 = waveCanvasEnh;
      var rect2 = c2.getBoundingClientRect();
      var dpr2 = window.devicePixelRatio || 1;
      var w2 = Math.max(1, Math.floor(rect2.width * dpr2));
      var h2 = Math.max(1, Math.floor(rect2.height * dpr2));
      if (c2.width !== w2 || c2.height !== h2) {
        c2.width = w2; c2.height = h2;
      }
      var ctx2 = c2.getContext('2d');
      ctx2.clearRect(0, 0, w2, h2);
      ctx2.fillStyle = '#08090C';
      ctx2.fillRect(0, 0, w2, h2);

      if (state.enhancedPeaks) {
        var p2 = state.enhancedPeaks;
        var n2 = p2.length;
        var mid2 = h2 / 2;
        var isPlayingThis2 = state.playing && state.abMode === 'B';

        ctx2.strokeStyle = isPlayingThis2 ? '#00e5ff' : '#168BFF';
        ctx2.lineWidth = Math.max(1, dpr2);
        ctx2.beginPath();
        for (var k = 0; k < n2; k++) {
          var xk = (k / n2) * w2;
          var ampk = p2[k] * (mid2 - 4);
          if (k === 0) ctx2.moveTo(xk, mid2 - ampk);
          else ctx2.lineTo(xk, mid2 - ampk);
        }
        for (var m2 = n2 - 1; m2 >= 0; m2--) {
          var xm = (m2 / n2) * w2;
          var ampm = p2[m2] * (mid2 - 4);
          ctx2.lineTo(xm, mid2 + ampm);
        }
        ctx2.closePath();
        ctx2.fillStyle = isPlayingThis2 ? 'rgba(0, 229, 255, 0.35)' : 'rgba(22, 139, 255, 0.25)';
        ctx2.fill();
        ctx2.stroke();

        if (curT != null && curT >= 0 && curT <= dur) {
          var px2 = (curT / dur) * w2;
          ctx2.strokeStyle = isPlayingThis2 ? '#ffd60a' : 'rgba(255, 214, 10, 0.6)';
          ctx2.lineWidth = Math.max(1.5, 1.5 * dpr2);
          ctx2.beginPath();
          ctx2.moveTo(px2, 0);
          ctx2.lineTo(px2, h2);
          ctx2.stroke();
        }
      } else {
        ctx2.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx2.setLineDash([4 * dpr2, 4 * dpr2]);
        ctx2.beginPath();
        ctx2.moveTo(0, h2 / 2);
        ctx2.lineTo(w2, h2 / 2);
        ctx2.stroke();
        ctx2.setLineDash([]);

        ctx2.fillStyle = '#617996';
        ctx2.font = (11 * dpr2) + 'px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx2.textAlign = 'center';
        ctx2.textBaseline = 'middle';
        ctx2.fillText('Enhanced audio waveform will appear here after clicking "Enhance Audio"', w2 / 2, h2 / 2);
      }
    }
  }

  function getOrExportSourceWav() {
    if (state.buffer) {
      var m = mods();
      var tmpDir = m.path.join(m.os.tmpdir(), 'sfx-composer-audio');
      if (!m.fs.existsSync(tmpDir)) m.fs.mkdirSync(tmpDir, { recursive: true });
      var base = (state.name || 'source').replace(/\.[^.]+$/, '').replace(/[^\w\-]+/g, '_').slice(0, 40);
      var outPath = m.path.join(tmpDir, base + '_src_' + Date.now() + '.wav');
      var wav = bufferToWav(state.buffer);
      m.fs.writeFileSync(outPath, Buffer.from(wav));
      return Promise.resolve(outPath);
    }
    if (state.path && mods().fs.existsSync(state.path)) {
      return Promise.resolve(state.path);
    }
    return Promise.reject(new Error('No audio available to enhance'));
  }

  function runEnhance() {
    if (!state.buffer) {
      state.error = 'No audio loaded to enhance. Please select a clip or open a file.';
      updateStatusUI();
      return;
    }
    if (state.isEnhancing) return;

    var s = window.__sfxAiEnhanceService;
    if (!s) {
      state.error = 'AI Audio Enhance service not loaded.';
      updateStatusUI();
      return;
    }

    state.isEnhancing = true;
    state.enhanceProgress = 5;
    state.enhanceStage = 'Preparing audio…';
    state.error = '';
    state.status = 'AI Audio Enhance running locally…';
    updateEnhanceProgressUI();
    updateStatusUI();

    getOrExportSourceWav()
      .then(function (inputWavPath) {
        state.enhanceStage = 'Analyzing audio spectrum…';
        state.enhanceProgress = 15;
        updateEnhanceProgressUI();

        return s.enhanceAudio(inputWavPath, {
          intensity: state.enhanceParams.intensity,
          noiseReduction: state.enhanceParams.noiseReduction,
          voiceClarity: state.enhanceParams.voiceClarity,
          dereverb: state.enhanceParams.dereverb,
          deess: state.enhanceParams.deess,
          targetLufs: state.enhanceParams.targetLufs,
          onProgress: function (evt) {
            state.enhanceProgress = Math.max(state.enhanceProgress, evt.progress || 0);
            state.enhanceStage = evt.stage || 'Enhancing audio…';
            updateEnhanceProgressUI();
          }
        });
      })
      .then(function (res) {
        state.enhancedPath = res.outputPath;
        state.enhancedMetrics = res.metrics;
        state.enhanceProgress = 95;
        state.enhanceStage = 'Decoding enhanced audio…';
        updateEnhanceProgressUI();

        return loadBuffer(res.outputPath).then(function (decodedBuf) {
          state.enhancedBuffer = decodedBuf;
          state.enhancedPeaks = buildPeaks(decodedBuf);
          state.isEnhancing = false;
          state.enhanceProgress = 100;
          state.enhanceStage = 'Complete';
          state.abMode = 'B';

          var origDur = state.duration;
          var enhDur = decodedBuf.duration;
          var durDiff = Math.abs(enhDur - origDur);
          state.status = '✨ Audio Enhanced Successfully (' + (res.engine || 'Local Engine') + ')';
          if (durDiff > 0.05) {
            state.status += ' [Notice: Duration ' + enhDur.toFixed(2) + 's vs orig ' + origDur.toFixed(2) + 's]';
          }

          renderEnhanceCenter();
          renderEnhanceRight();
          drawEnhanceWaveforms();
          updateStatusUI();
        });
      })
      .catch(function (err) {
        state.isEnhancing = false;
        state.error = err && err.message ? err.message : String(err);
        state.status = '';
        updateEnhanceProgressUI();
        updateStatusUI();
      });
  }

  function cancelEnhance() {
    if (window.__sfxAiEnhanceService) {
      window.__sfxAiEnhanceService.cancelEnhance();
    }
    state.isEnhancing = false;
    state.enhanceStage = 'Cancelled';
    state.status = 'Enhancement cancelled.';
    updateEnhanceProgressUI();
    updateStatusUI();
  }

  function applyEnhancedToTimeline() {
    if (!state.enhancedPath || !state.enhancedBuffer) {
      state.error = 'No enhanced audio available. Click "Enhance Audio" first.';
      updateStatusUI();
      return;
    }

    var durDiff = Math.abs(state.enhancedBuffer.duration - state.duration);
    if (durDiff > 0.1) {
      var ok = window.confirm(
        'Warning: Enhanced audio duration differs by ' + durDiff.toFixed(2) + ' seconds from the original clip.\n\n' +
        'Original: ' + formatTime(state.duration) + '\nEnhanced: ' + formatTime(state.enhancedBuffer.duration) + '\n\n' +
        'Do you still want to replace the selected timeline clip?'
      );
      if (!ok) return;
    }

    state.status = 'Applying enhanced audio to timeline…';
    state.error = '';
    updateStatusUI();

    var targetMeta = state.timelineClip ? {
      nodeId: state.timelineClip.nodeId,
      trackIndex: state.timelineClip.trackIndex,
      timelineStart: state.timelineClip.startSeconds,
      timelineEnd: state.timelineClip.endSeconds,
      duration: state.timelineClip.duration
    } : null;

    invokeTimeline('sfx.replaceSelected', {
      path: state.enhancedPath,
      gainDb: 0,
      target: targetMeta
    }).then(function (hostRes) {
      suppressSyncUntil = Date.now() + 2500;
      if (hostRes && hostRes.nodeId && state.timelineClip) {
        var oldKey = state.timelineClip.key;
        state.timelineClip.nodeId = hostRes.nodeId;
        state.timelineClip.key = clipKey(state.timelineClip);
        if (clipEdits[oldKey]) {
          clipEdits[state.timelineClip.key] = clipEdits[oldKey];
        }
      }
      var trackNum = (hostRes && hostRes.laneIndex !== undefined) ? (hostRes.laneIndex + 1) : 1;
      var durSec = (hostRes && hostRes.timelineDuration) ? formatTime(hostRes.timelineDuration) : formatTime(state.duration);
      state.status = '✨ Enhanced audio applied in place (' + durSec + ' on A' + trackNum + '). Non-destructive.';
      updateStatusUI();
    }).catch(function (err) {
      state.error = err && err.message ? err.message : String(err);
      state.status = '';
      updateStatusUI();
    });
  }

  function addEnhancedAsNewClip() {
    if (!state.enhancedPath) {
      state.error = 'No enhanced audio available. Click "Enhance Audio" first.';
      updateStatusUI();
      return;
    }
    state.status = 'Importing enhanced audio as new clip…';
    state.error = '';
    updateStatusUI();

    invoke('sfx.import', {
      path: state.enhancedPath,
      atPlayhead: true,
      snapToFrame: true,
      gainDb: 0
    }).then(function (hostRes) {
      state.status = 'Imported enhanced audio as new clip on timeline.';
      if (hostRes && hostRes.message) state.status = hostRes.message;
      updateStatusUI();
    }).catch(function (err) {
      state.error = err && err.message ? err.message : String(err);
      state.status = '';
      updateStatusUI();
    });
  }

  function exportEnhancedWav() {
    if (!state.enhancedPath) {
      state.error = 'No enhanced audio available to export.';
      updateStatusUI();
      return;
    }
    state.status = 'Enhanced WAV saved at: ' + state.enhancedPath;
    updateStatusUI();
  }

  function resetEnhance() {
    stopPlay();
    state.enhancedBuffer = null;
    state.enhancedPeaks = null;
    state.enhancedPath = '';
    state.enhancedMetrics = null;
    state.abMode = 'A';
    state.status = 'Enhancement reset to original audio.';
    renderEnhanceCenter();
    renderEnhanceRight();
    drawEnhanceWaveforms();
    updateStatusUI();
  }

  function renderEnhanceCenter() {
    if (!centerEl) return;
    centerEl.innerHTML = '';
    waveCanvasOrig = null;
    waveCanvasEnh = null;

    var container = el('div', 'sfx-au__enh-center');

    // 1. Source bar
    var sourceBar = el('div', 'sfx-au__enh-source-bar');
    var info = el('div', 'sfx-au__enh-source-info');
    var title = el('div', 'sfx-au__enh-source-title', state.name || 'No Audio Selected');
    info.appendChild(title);

    var meta = el('div', 'sfx-au__enh-source-meta');
    if (state.buffer) {
      meta.appendChild(el('span', 'sfx-au__meta-badge', formatTime(state.duration)));
      meta.appendChild(el('span', 'sfx-au__meta-badge', state.sampleRate + ' Hz'));
      meta.appendChild(el('span', 'sfx-au__meta-badge', state.channels === 1 ? 'Mono' : 'Stereo'));
      if (state.timelineClip) {
        var trk = 'A' + (state.timelineClip.trackNumber || (state.timelineClip.trackIndex >= 0 ? state.timelineClip.trackIndex + 1 : 1));
        meta.appendChild(el('span', 'sfx-au__meta-badge', 'Timeline ' + trk + ' [' + formatTime(state.timelineClip.startSeconds) + ' – ' + formatTime(state.timelineClip.endSeconds) + ']'));
      }
    } else {
      meta.appendChild(el('span', 'sfx-au__meta-badge', 'No audio loaded'));
    }
    info.appendChild(meta);
    sourceBar.appendChild(info);

    var actions = el('div', 'sfx-au__enh-source-actions');
    var openBtn = el('button', 'sfx-au__btn', 'Open file');
    openBtn.type = 'button';
    openBtn.addEventListener('click', pickFile);
    actions.appendChild(openBtn);

    var tlBtn = el('button', 'sfx-au__btn', 'Load from Timeline');
    tlBtn.type = 'button';
    tlBtn.title = 'Load active audio clip from Premiere Pro timeline';
    tlBtn.addEventListener('click', loadSelectedTimelineClip);
    actions.appendChild(tlBtn);

    var refreshBtn = el('button', 'sfx-au__btn', 'Refresh Selection');
    refreshBtn.type = 'button';
    refreshBtn.title = 'Refresh selection from timeline';
    refreshBtn.addEventListener('click', function () {
      refreshTimelineSelection().catch(function () {});
    });
    actions.appendChild(refreshBtn);

    if (state.timelineSelection && state.timelineSelection.count > 1) {
      var picker = document.createElement('select');
      picker.className = 'sfx-au__selection-picker';
      for (var s = 0; s < state.timelineSelection.clips.length; s++) {
        var option = document.createElement('option');
        var selected = state.timelineSelection.clips[s];
        option.value = String(s);
        var trkLabel = 'A' + (selected.trackNumber || (selected.trackIndex >= 0 ? selected.trackIndex + 1 : 1));
        option.textContent = trkLabel + ' [' + formatTime(selected.timelineStart) + ']: ' + (selected.name || 'Clip');
        if (s === state.activeSelectionIndex) option.selected = true;
        picker.appendChild(option);
      }
      picker.addEventListener('change', function () {
        loadTimelineClip(state.timelineSelection, Number(picker.value)).catch(function (err) {
          state.error = err.message;
          updateStatusUI();
        });
      });
      actions.appendChild(picker);
    }
    sourceBar.appendChild(actions);
    container.appendChild(sourceBar);

    if (!state.buffer) {
      var empty = el('div', 'sfx-au__empty-center');
      empty.appendChild(el('h2', '', 'AI Audio Enhance'));
      empty.appendChild(el('p', '', 'Select an audio clip on the Premiere Pro timeline or open an audio file to clean up noise, enhance vocal presence, reduce room echo, and normalize loudness locally.'));
      container.appendChild(empty);
      centerEl.appendChild(container);
      return;
    }

    // 2. Dual Waveform Area
    var dualWave = el('div', 'sfx-au__dual-wave');

    // Original Waveform Box
    var origBox = el('div', 'sfx-au__enh-wave-box' + (state.abMode === 'A' ? ' is-active-ab' : ''));
    origBox.setAttribute('data-wave', 'orig');
    var origHead = el('div', 'sfx-au__enh-wave-head');
    var origTag = el('div', 'sfx-au__enh-wave-tag orig', 'ORIGINAL (A)');
    origHead.appendChild(origTag);
    origHead.appendChild(el('div', 'sfx-au__enh-wave-metrics', 'Source Audio · Unprocessed'));
    origBox.appendChild(origHead);

    var cOrig = document.createElement('canvas');
    cOrig.className = 'sfx-au__enh-wave-canvas';
    cOrig.addEventListener('click', function (ev) {
      var rect = cOrig.getBoundingClientRect();
      var x = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      stopPlay();
      state.playOffset = x * state.duration;
      playAB(state.playOffset, 'A');
    });
    origBox.appendChild(cOrig);
    waveCanvasOrig = cOrig;
    dualWave.appendChild(origBox);

    // Enhanced Waveform Box
    var enhBox = el('div', 'sfx-au__enh-wave-box' + (state.abMode === 'B' ? ' is-active-ab' : ''));
    enhBox.setAttribute('data-wave', 'enh');
    var enhHead = el('div', 'sfx-au__enh-wave-head');
    var enhTag = el('div', 'sfx-au__enh-wave-tag enh', 'ENHANCED (B)');
    enhHead.appendChild(enhTag);
    var enhMetricText = state.enhancedMetrics
      ? 'Denoised: -' + state.enhancedMetrics.noiseReductionDb.toFixed(1) + ' dB · ' + state.enhancedMetrics.afterLufs.toFixed(1) + ' LUFS'
      : (state.isEnhancing ? 'Processing local AI enhancement…' : 'Target: ' + state.enhanceParams.targetLufs.toFixed(1) + ' LUFS');
    enhHead.appendChild(el('div', 'sfx-au__enh-wave-metrics', enhMetricText));
    enhBox.appendChild(enhHead);

    var cEnh = document.createElement('canvas');
    cEnh.className = 'sfx-au__enh-wave-canvas';
    cEnh.addEventListener('click', function (ev) {
      if (!state.enhancedBuffer) return;
      var rect = cEnh.getBoundingClientRect();
      var x = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      stopPlay();
      state.playOffset = x * state.duration;
      playAB(state.playOffset, 'B');
    });
    enhBox.appendChild(cEnh);
    waveCanvasEnh = cEnh;
    dualWave.appendChild(enhBox);

    container.appendChild(dualWave);

    // 3. Transport Controls & A/B Toggle
    var transport = el('div', 'sfx-au__enh-transport');
    var controls = el('div', 'sfx-au__enh-transport-controls');

    var playBtn = el('button', 'sfx-au__btn sfx-au__btn--icon');
    playBtn.type = 'button';
    playBtn.setAttribute('data-action', 'play');
    playBtn.innerHTML = ICON.play;
    playBtn.title = 'Play preview (' + (state.abMode === 'A' ? 'Original' : 'Enhanced') + ')';
    playBtn.addEventListener('click', function () { playAB(); });
    controls.appendChild(playBtn);

    var pauseBtn = el('button', 'sfx-au__btn sfx-au__btn--icon');
    pauseBtn.type = 'button';
    pauseBtn.setAttribute('data-action', 'pause');
    pauseBtn.innerHTML = ICON.pause;
    pauseBtn.title = 'Pause';
    pauseBtn.style.display = 'none';
    pauseBtn.addEventListener('click', function () {
      if (state.playing && audioCtx) {
        state.playOffset = Math.max(0, Math.min(state.duration, state.playOffset + (audioCtx.currentTime - state.playStartCtx)));
      }
      stopPlay();
    });
    controls.appendChild(pauseBtn);

    var stopBtn = el('button', 'sfx-au__btn sfx-au__btn--icon');
    stopBtn.type = 'button';
    stopBtn.innerHTML = ICON.stop;
    stopBtn.title = 'Stop and rewind to beginning';
    stopBtn.addEventListener('click', function () {
      stopPlay();
      state.playOffset = 0;
      drawEnhanceWaveforms();
      updateTransportUI();
    });
    controls.appendChild(stopBtn);

    // A/B Toggle Button Group
    var abGroup = el('div', 'sfx-au__ab-toggle');
    var btnA = el('button', 'sfx-au__ab-btn' + (state.abMode === 'A' ? ' is-active' : ''), 'Original (A)');
    btnA.type = 'button';
    btnA.setAttribute('data-ab', 'A');
    btnA.title = 'Listen to Original Audio';
    btnA.addEventListener('click', function () { switchAB('A'); });
    abGroup.appendChild(btnA);

    var btnB = el('button', 'sfx-au__ab-btn' + (state.abMode === 'B' ? ' is-active' : ''), 'Enhanced (B)');
    btnB.type = 'button';
    btnB.setAttribute('data-ab', 'B');
    btnB.title = 'Listen to Enhanced Audio';
    btnB.addEventListener('click', function () { switchAB('B'); });
    abGroup.appendChild(btnB);

    var btnFlip = el('button', 'sfx-au__ab-btn', '⇄ Flip A/B');
    btnFlip.type = 'button';
    btnFlip.title = 'Instant A/B Flip at Current Playhead';
    btnFlip.addEventListener('click', function () {
      switchAB(state.abMode === 'A' ? 'B' : 'A');
    });
    abGroup.appendChild(btnFlip);

    controls.appendChild(abGroup);
    transport.appendChild(controls);

    transport.appendChild(el('div', 'sfx-au__time', formatTime(0) + ' / ' + formatTime(state.duration)));
    transport.appendChild(el('div', 'sfx-au__status-line', ''));
    container.appendChild(transport);

    // 4. Progress Card (if enhancing)
    var prog = el('div', 'sfx-au__enh-progress');
    prog.style.display = (state.isEnhancing || state.enhanceProgress > 0) ? 'block' : 'none';
    var progHead = el('div', 'sfx-au__enh-progress-head');
    progHead.appendChild(el('span', 'sfx-au__enh-progress-stage', state.enhanceStage || 'Processing…'));
    progHead.appendChild(el('span', 'sfx-au__enh-progress-text', Math.round(state.enhanceProgress || 0) + '%'));
    prog.appendChild(progHead);

    var progBar = el('div', 'sfx-au__enh-progress-bar');
    var progFill = el('div', 'sfx-au__enh-progress-fill');
    progFill.style.width = Math.min(100, Math.max(0, state.enhanceProgress || 0)) + '%';
    progBar.appendChild(progFill);
    prog.appendChild(progBar);

    if (state.isEnhancing) {
      var cancelBtn = el('button', 'sfx-au__btn', 'Cancel Enhancement');
      cancelBtn.type = 'button';
      cancelBtn.style.marginTop = '6px';
      cancelBtn.addEventListener('click', cancelEnhance);
      prog.appendChild(cancelBtn);
    }
    container.appendChild(prog);

    // 5. Audio Metrics (if enhanced)
    if (state.enhancedMetrics) {
      var m = state.enhancedMetrics;
      var grid = el('div', 'sfx-au__enh-metrics');

      var c1 = el('div', 'sfx-au__enh-metric-card');
      c1.appendChild(el('div', 'sfx-au__enh-metric-label', 'Noise Floor Reduction'));
      var diffNoise = (m.afterNoiseFloorDb - m.beforeNoiseFloorDb).toFixed(1);
      c1.appendChild(el('div', 'sfx-au__enh-metric-val', m.noiseReductionDb ? '-' + m.noiseReductionDb.toFixed(1) + ' dB' : diffNoise + ' dB'));
      c1.appendChild(el('div', 'sfx-au__enh-metric-sub', m.beforeNoiseFloorDb.toFixed(1) + ' dB → ' + m.afterNoiseFloorDb.toFixed(1) + ' dB'));
      grid.appendChild(c1);

      var c2 = el('div', 'sfx-au__enh-metric-card');
      c2.appendChild(el('div', 'sfx-au__enh-metric-label', 'Integrated Loudness'));
      c2.appendChild(el('div', 'sfx-au__enh-metric-val', m.afterLufs.toFixed(1) + ' LUFS'));
      c2.appendChild(el('div', 'sfx-au__enh-metric-sub', 'Source: ' + m.beforeLufs.toFixed(1) + ' LUFS'));
      grid.appendChild(c2);

      var c3 = el('div', 'sfx-au__enh-metric-card');
      c3.appendChild(el('div', 'sfx-au__enh-metric-label', 'True-Peak Ceiling'));
      c3.appendChild(el('div', 'sfx-au__enh-metric-val', m.afterPeakDb.toFixed(1) + ' dBTP'));
      c3.appendChild(el('div', 'sfx-au__enh-metric-sub', 'Source: ' + m.beforePeakDb.toFixed(1) + ' dBTP'));
      grid.appendChild(c3);

      var c4 = el('div', 'sfx-au__enh-metric-card');
      c4.appendChild(el('div', 'sfx-au__enh-metric-label', 'Timeline Synchronization'));
      c4.appendChild(el('div', 'sfx-au__enh-metric-val', '100% Synced'));
      c4.appendChild(el('div', 'sfx-au__enh-metric-sub', 'Sample-accurate length'));
      grid.appendChild(c4);

      container.appendChild(grid);
    }

    centerEl.appendChild(container);

    requestAnimationFrame(function () {
      drawEnhanceWaveforms();
      updateStatusUI();
      updateTransportUI();
      updateAbToggleUI();
    });
  }

  function renderEnhanceRight() {
    if (!esEl) return;
    esEl.innerHTML = '';

    var panelWrap = el('div', 'sfx-au__enh-panel');

    // Header
    var head = el('div', 'sfx-au__enh-head');
    head.appendChild(el('strong', '', 'AI Audio Enhance'));
    var engineBadge = el('span', 'sfx-au__enh-engine-badge', 'Local AI / DSP Engine');
    if (window.__sfxAiEnhanceService) {
      window.__sfxAiEnhanceService.checkDependencies().then(function (deps) {
        state.depsInfo = deps;
        if (engineBadge) {
          engineBadge.textContent = deps.python ? 'Python AI + SciPy DSP' : 'Web Audio DSP Engine';
          engineBadge.title = deps.pythonPath || 'Offline Pure JS/WebAudio DSP';
        }
      }).catch(function () {});
    }
    head.appendChild(engineBadge);
    panelWrap.appendChild(head);

    var body = el('div', 'sfx-au__enh-body');

    // Presets
    var secPreset = el('div', 'sfx-au__enh-sec');
    secPreset.appendChild(el('div', 'sfx-au__enh-sec-title', 'Enhancement Preset'));
    var pSelect = document.createElement('select');
    pSelect.className = 'sfx-au__preset-select';
    var presets = [
      { id: 'podcast', label: 'Podcast Voice (Balanced Denoise & Presence)' },
      { id: 'heavyNoise', label: 'Heavy Noise Cleanup (AC, Fan, Hiss)' },
      { id: 'reverbRemoval', label: 'Echo & Reverb Removal (De-reverb)' },
      { id: 'outdoor', label: 'Outdoor Dialogue (Wind & Ambience)' },
      { id: 'gentle', label: 'Subtle Cleanup (Natural Voice Preservation)' },
      { id: 'custom', label: 'Custom Configuration' }
    ];
    presets.forEach(function (preset) {
      var opt = document.createElement('option');
      opt.value = preset.id;
      opt.textContent = preset.label;
      pSelect.appendChild(opt);
    });
    pSelect.addEventListener('change', function () {
      var sel = pSelect.value;
      if (ENHANCE_PRESETS[sel]) {
        state.enhanceParams = Object.assign({}, ENHANCE_PRESETS[sel]);
        renderEnhanceRight();
      }
    });
    secPreset.appendChild(pSelect);
    body.appendChild(secPreset);

    // Enhancement Sliders
    var ep = state.enhanceParams;
    var secParams = el('div', 'sfx-au__enh-sec');
    secParams.appendChild(el('div', 'sfx-au__enh-sec-title', 'Neural & DSP Controls'));

    secParams.appendChild(sliderRow('Master Intensity', 0, 1, 0.05, ep.intensity, function (v) {
      ep.intensity = v;
      pSelect.value = 'custom';
    }, '%'));

    secParams.appendChild(sliderRow('AI Noise Reduction', 0, 1, 0.05, ep.noiseReduction, function (v) {
      ep.noiseReduction = v;
      pSelect.value = 'custom';
    }, '%'));

    secParams.appendChild(sliderRow('Voice Clarity & EQ', 0, 1, 0.05, ep.voiceClarity, function (v) {
      ep.voiceClarity = v;
      pSelect.value = 'custom';
    }, '%'));

    secParams.appendChild(sliderRow('Echo & De-Reverb', 0, 1, 0.05, ep.dereverb, function (v) {
      ep.dereverb = v;
      pSelect.value = 'custom';
    }, '%'));

    secParams.appendChild(sliderRow('De-Essing (Sibilance)', 0, 1, 0.05, ep.deess, function (v) {
      ep.deess = v;
      pSelect.value = 'custom';
    }, '%'));

    // Target Loudness
    var rowLufs = el('div', 'sfx-au__row');
    rowLufs.appendChild(el('label', '', 'Target Loudness'));
    var selLufs = document.createElement('select');
    selLufs.className = 'sfx-au__preset-select';
    selLufs.style.width = '140px';
    var lufsOptions = [
      { val: -16.0, label: '-16 LUFS (Podcast & Web)' },
      { val: -14.0, label: '-14 LUFS (YouTube / Music)' },
      { val: -23.0, label: '-23 LUFS (EBU R128 Broadcast)' },
      { val: -24.0, label: '-24 LUFS (ATSC A/85 TV)' },
      { val: 0.0, label: '0 dB (Original Levels)' }
    ];
    lufsOptions.forEach(function (opt) {
      var o = document.createElement('option');
      o.value = String(opt.val);
      o.textContent = opt.label;
      if (Math.abs(opt.val - ep.targetLufs) < 0.2) o.selected = true;
      selLufs.appendChild(o);
    });
    selLufs.addEventListener('change', function () {
      ep.targetLufs = Number(selLufs.value);
    });
    rowLufs.appendChild(selLufs);
    secParams.appendChild(rowLufs);

    body.appendChild(secParams);
    panelWrap.appendChild(body);

    // Actions
    var actions = el('div', 'sfx-au__enh-actions');

    var enhBtn = el('button', 'sfx-au__btn sfx-au__btn--enhance', state.enhancedBuffer ? '✨ Re-Enhance Audio' : '✨ Enhance Audio');
    enhBtn.type = 'button';
    enhBtn.title = 'Process audio using local neural speech enhancement & spectral restoration';
    if (state.isEnhancing) {
      enhBtn.classList.add('is-loading');
      enhBtn.disabled = true;
      enhBtn.textContent = '⏳ Processing (' + Math.round(state.enhanceProgress || 0) + '%)…';
    }
    enhBtn.addEventListener('click', runEnhance);
    actions.appendChild(enhBtn);

    if (state.enhancedBuffer) {
      var applyBtn = el('button', 'sfx-au__btn sfx-au__btn--apply', 'Apply to Timeline (Replace Selected)');
      applyBtn.type = 'button';
      applyBtn.title = 'Replace selected clip in Premiere Pro timeline with sample-accurate enhanced audio';
      applyBtn.addEventListener('click', applyEnhancedToTimeline);
      actions.appendChild(applyBtn);

      var addBtn = el('button', 'sfx-au__btn', 'Add as New Track Clip');
      addBtn.type = 'button';
      addBtn.title = 'Import enhanced audio to a new track at current playhead';
      addBtn.addEventListener('click', addEnhancedAsNewClip);
      actions.appendChild(addBtn);

      var exportBtn = el('button', 'sfx-au__btn', 'Export Enhanced WAV…');
      exportBtn.type = 'button';
      exportBtn.addEventListener('click', exportEnhancedWav);
      actions.appendChild(exportBtn);

      var resetBtn = el('button', 'sfx-au__btn', 'Reset Enhancement');
      resetBtn.type = 'button';
      resetBtn.title = 'Discard enhancement and return to original audio';
      resetBtn.addEventListener('click', resetEnhance);
      actions.appendChild(resetBtn);
    }

    var safetyNote = el('div', 'sfx-au__enh-sec-desc', 'Sample-accurate synchronization is verified before timeline placement. Original media files are never overwritten.');
    actions.appendChild(safetyNote);

    panelWrap.appendChild(actions);
    esEl.appendChild(panelWrap);
  }

  function bridge() {
    var s = window.__sfxServices;
    return s && s.bridge ? s.bridge : null;
  }

  function invoke(cmd, params) {
    var b = bridge();
    if (!b || typeof b.invoke !== 'function') {
      return Promise.reject(new Error('Host bridge unavailable. Open SFX Composer inside Premiere Pro or After Effects.'));
    }
    return b.invoke(cmd, params || {});
  }

  // timeline.state and timeline.analysis were added after the bundled bridge's
  // timeout registry. Calling them through that registry formats an undefined
  // timeout as “NaN seconds”. Use the same CEP envelope directly, with an
  // explicit finite timeout and the host's real response.
  var timelineRequestId = 200000;
  function timelineLog(message, detail) {
    try {
      if (window.__sfxDebug && window.__sfxDebug.info) window.__sfxDebug.info('[AudioTools timeline] ' + message, detail);
    } catch (e) {}
  }

  function invokeTimeline(command, params) {
    var cep = window.__adobe_cep__;
    if (!cep || typeof cep.evalScript !== 'function') {
      return Promise.reject(new Error('Premiere scripting bridge is unavailable. Open SFX Composer from Window > Extensions inside Premiere Pro.'));
    }
    var id = timelineRequestId++;
    var payload = JSON.stringify({ id: id, command: command, params: params || {}, v: 1 });
    var script = 'SFXBox.dispatch(' + JSON.stringify(payload) + ')';
    var started = Date.now();
    timelineLog('request ' + command, { id: id });
    return new Promise(function (resolve, reject) {
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        timelineLog('timeout ' + command, { id: id, elapsedMs: Date.now() - started });
        reject(new Error(command + ' did not respond within 30 seconds. Premiere may be busy or showing a modal dialog.'));
      }, 30000);
      cep.evalScript(script, function (reply) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        var text = String(reply || '');
        var magic = '@@SFXBOX_REPLY@@';
        if (text.indexOf(magic) !== 0) {
          timelineLog('invalid reply ' + command, text.slice(0, 300));
          reject(new Error(command + ' returned an invalid Premiere bridge reply. See SFX Composer Logs/debug.log.'));
          return;
        }
        try {
          var envelope = JSON.parse(text.slice(magic.length));
          if (!envelope.ok) {
            timelineLog('host error ' + command, envelope.error || {});
            reject(new Error((envelope.error && envelope.error.message) || command + ' failed in Premiere.'));
            return;
          }
          timelineLog('response ' + command, { id: id, elapsedMs: Date.now() - started, hostMs: envelope.ms });
          resolve(envelope.result);
        } catch (e) {
          timelineLog('malformed reply ' + command, e.message);
          reject(new Error(command + ' returned malformed data from Premiere.'));
        }
      });
    });
  }

  function selectionSummary(selection) {
    if (!selection || !selection.count) return 'No selection in active sequence';
    var first = selection.clips[0] || {};
    var label = first.name || 'Untitled audio clip';
    var track = 'A' + (first.trackNumber || (first.trackIndex >= 0 ? first.trackIndex + 1 : 1));
    return selection.count === 1 ? 'Selected: ' + track + ': ' + label : 'Selected: ' + selection.count + ' audio clips (' + track + ': ' + label + ')';
  }

  function clipKey(clip) {
    if (!clip) return '';
    if (clip.nodeId) return 'node:' + clip.nodeId;
    return [
      clip.sourceMediaPath || '',
      clip.trackIndex !== undefined ? clip.trackIndex : '',
      Math.round(Number(clip.timelineStart || 0) * 100),
      Math.round(Number(clip.timelineEnd || 0) * 100),
      Math.round(Number(clip.sourceIn || 0) * 100),
      Math.round(Number(clip.sourceOut || 0) * 100)
    ].join('|');
  }

  function selectionKey(selection) {
    if (!selection || !selection.clips) return '';
    var keys = [];
    for (var i = 0; i < selection.clips.length; i++) keys.push(clipKey(selection.clips[i]));
    return (selection.sequenceName || '') + ':' + keys.join(',');
  }

  function rememberCurrentEdits() {
    var key = state.timelineClip && state.timelineClip.key;
    if (!key || !state.buffer) return;
    clipEdits[key] = {
      params: Object.assign({}, state.params),
      category: state.esCategory,
      trimStart: state.trimStart,
      trimEnd: state.trimEnd
    };
  }

  function clearTimelineEditor(reason) {
    stopPlay();
    rememberCurrentEdits();
    state.path = '';
    state.name = '';
    state.buffer = null;
    state.peaks = null;
    state.duration = 0;
    state.trimStart = 0;
    state.trimEnd = 0;
    state.playOffset = 0;
    state.timelineClip = null;
    state.status = reason || 'No audio clip selected in Premiere Pro timeline.';
    renderCenter();
    renderES();
    updateStatusUI();
  }

  function sliceTimelineSegment(source, clip) {
    var ctx = getCtx();
    var sr = source.sampleRate;
    var from = Math.max(0, Math.floor(Number(clip.sourceIn || 0) * sr));
    var to = Math.min(source.length, Math.ceil(Number(clip.sourceOut || source.duration) * sr));
    if (to <= from) {
      to = Math.min(source.length, from + Math.round((Number(clip.duration) || 1) * sr));
    }
    if (to <= from) to = Math.min(source.length, from + 1);
    var frames = Math.max(1, to - from);
    var out = ctx.createBuffer(source.numberOfChannels, frames, sr);
    for (var c = 0; c < source.numberOfChannels; c++) {
      out.getChannelData(c).set(source.getChannelData(c).subarray(from, to));
    }
    return out;
  }

  function fitTimelineDuration(buffer, duration) {
    var wanted = Number(duration) || buffer.duration;
    if (wanted <= 0 || Math.abs(buffer.duration - wanted) < 0.02) return buffer;
    var frames = Math.max(1, Math.round(wanted * buffer.sampleRate));
    var out = getCtx().createBuffer(buffer.numberOfChannels, frames, buffer.sampleRate);
    for (var c = 0; c < buffer.numberOfChannels; c++) {
      var input = buffer.getChannelData(c);
      var output = out.getChannelData(c);
      for (var i = 0; i < frames; i++) {
        var pos = i * (input.length - 1) / Math.max(1, frames - 1);
        var lo = Math.floor(pos);
        var hi = Math.min(input.length - 1, lo + 1);
        var mix = pos - lo;
        output[i] = input[lo] * (1 - mix) + input[hi] * mix;
      }
    }
    return out;
  }

  function refreshTimelineSelection(options) {
    options = options || {};
    if (!options.silent) {
      state.status = 'Reading timeline selection…';
      state.error = '';
      updateStatusUI();
    }
    return invokeTimeline('timeline.selection', {}).then(function (selection) {
      if (!selection || !selection.present) {
        throw new Error((selection && selection.reason) || 'No active sequence in Premiere Pro. Open the sequence you want to use, then refresh selection.');
      }
      state.timelineSelection = selection;
      if (!selection.count) {
        if (options.allowEmpty) return selection;
        throw new Error(selection.reason || 'No audio clips are selected in the active sequence.');
      }
      if (!options.silent) {
        state.status = selectionSummary(selection);
        updateStatusUI();
      }
      return selection;
    }).catch(function (err) {
      if (!options.silent) {
        state.timelineSelection = null;
        state.error = err && err.message ? err.message : String(err);
        state.status = '';
      }
      updateStatusUI();
      throw err;
    });
  }

  function loadSelectedTimelineClip() {
    state.status = 'Reading timeline selection…';
    state.error = '';
    updateStatusUI();
    return refreshTimelineSelection().then(function (selection) {
      return loadTimelineClip(selection, 0);
    }).catch(function (err) {
      state.error = err && err.message ? err.message : String(err);
      state.status = '';
      updateStatusUI();
    });
  }

  function loadTimelineClip(selection, index) {
    var clip = selection && selection.clips ? selection.clips[index] : null;
    if (!clip) return Promise.reject(new Error('Choose an audio clip from the current timeline selection.'));
    rememberCurrentEdits();
    state.activeSelectionIndex = index;
    state.timelineSelection = selection;
    state.timelineClip = {
      key: clipKey(clip),
      name: clip.name || '',
      mediaPath: clip.sourceMediaPath || '',
      startSeconds: Number(clip.timelineStart) || 0,
      endSeconds: Number(clip.timelineEnd) || 0,
      duration: Number(clip.duration) || 0,
      sourceIn: Number(clip.sourceIn) || 0,
      sourceOut: Number(clip.sourceOut) || 0,
      trackIndex: Number(clip.trackIndex),
      trackNumber: Number(clip.trackNumber) || (Number(clip.trackIndex) + 1),
      nodeId: clip.nodeId || '',
      playbackSpeed: Number(clip.playbackSpeed) || 1
    };
    var saved = clipEdits[state.timelineClip.key];
    return openFile(state.timelineClip.mediaPath, state.timelineClip.name, state.timelineClip, saved).then(function () {
      state.status = 'Loaded timeline clip: ' + state.timelineClip.name;
      updateStatusUI();
      renderES();
    });
  }

  function updateSelectionPickerUI() {
    var picker = panel && panel.querySelector('.sfx-au__selection-picker');
    if (!picker || !state.timelineSelection || !state.timelineSelection.clips) return;
    picker.innerHTML = '';
    for (var s = 0; s < state.timelineSelection.clips.length; s++) {
      var opt = document.createElement('option');
      var sel = state.timelineSelection.clips[s];
      opt.value = String(s);
      var trk = 'A' + (sel.trackNumber || (sel.trackIndex >= 0 ? sel.trackIndex + 1 : 1));
      opt.textContent = trk + ' [' + formatTime(sel.timelineStart) + ']: ' + (sel.name || 'Untitled audio clip');
      if (s === state.activeSelectionIndex) opt.selected = true;
      picker.appendChild(opt);
    }
  }

  function syncTimelineSelection() {
    if (!panel || !panel.classList.contains('is-open')) return;
    if (Date.now() < suppressSyncUntil) {
      if (panel && panel.classList.contains('is-open')) selectionSyncTimer = setTimeout(syncTimelineSelection, 500);
      return;
    }
    if (selectionSyncBusy) return;
    selectionSyncBusy = true;

    refreshTimelineSelection({ silent: true, allowEmpty: true }).then(function (selection) {
      if (!selection || !selection.present) return;
      var nextKey = selectionKey(selection);
      var currentKey = selectionKey(state.timelineSelection);

      // Deselection / empty state
      if (!selection.count) {
        if (state.timelineClip) {
          clearTimelineEditor(selection.reason);
        }
        return;
      }

      var activeKey = state.timelineClip ? state.timelineClip.key : '';
      var activeIndex = -1;
      for (var i = 0; i < selection.clips.length; i++) {
        if (clipKey(selection.clips[i]) === activeKey) {
          activeIndex = i;
          break;
        }
      }

      // If active clip is still selected, do not reload audio buffer
      if (activeIndex >= 0) {
        if (currentKey !== nextKey) {
          state.timelineSelection = selection;
          state.activeSelectionIndex = activeIndex;
          updateStatusUI();
          updateSelectionPickerUI();
        }
        return;
      }

      // Selection has changed to new clip(s)
      state.timelineSelection = selection;
      loadTimelineClip(selection, 0).catch(function (err) {
        state.error = err && err.message ? err.message : String(err);
        updateStatusUI();
      });
    }).catch(function () {}).then(function () {
      selectionSyncBusy = false;
      if (panel && panel.classList.contains('is-open')) {
        selectionSyncTimer = setTimeout(syncTimelineSelection, 500);
      }
    });
  }

  function startSelectionSync() {
    if (!selectionSyncTimer && !selectionSyncBusy) {
      selectionSyncTimer = setTimeout(syncTimelineSelection, 200);
    }
  }

  function stopSelectionSync() {
    if (selectionSyncTimer) {
      clearTimeout(selectionSyncTimer);
      selectionSyncTimer = 0;
    }
  }

  function exportProcessedTemp() {
    if (!state.buffer) return Promise.reject(new Error('No audio loaded'));
    var processed = processBuffer(state.buffer, state.params, state.trimStart, state.trimEnd);
    if (!processed) return Promise.reject(new Error('Processing failed'));
    var m = mods();
    var tmpDir = m.path.join(m.os.tmpdir(), 'sfx-composer-audio');
    if (!m.fs.existsSync(tmpDir)) m.fs.mkdirSync(tmpDir);
    var base = (state.name || 'processed').replace(/\.[^.]+$/, '').replace(/[^\w\-]+/g, '_').slice(0, 40);
    var outPath = m.path.join(tmpDir, base + '_es_' + Date.now() + '.wav');
    var wav = bufferToWav(processed);
    m.fs.writeFileSync(outPath, Buffer.from(wav));
    return Promise.resolve({ path: outPath, buffer: processed });
  }

  function applyToSelectedClip() {
    if (!state.buffer) {
      state.error = 'No audio loaded to apply.';
      updateStatusUI();
      return;
    }
    state.status = 'Rendering & applying to selected clip…';
    state.error = '';
    updateStatusUI();

    var targetMeta = state.timelineClip ? {
      nodeId: state.timelineClip.nodeId,
      trackIndex: state.timelineClip.trackIndex,
      timelineStart: state.timelineClip.startSeconds,
      timelineEnd: state.timelineClip.endSeconds,
      duration: state.timelineClip.duration
    } : null;

    exportProcessedTemp()
      .then(function (res) {
        return invokeTimeline('sfx.replaceSelected', {
          path: res.path,
          gainDb: 0,
          target: targetMeta
        }).then(function (hostRes) {
          suppressSyncUntil = Date.now() + 2500;
          if (hostRes && hostRes.nodeId && state.timelineClip) {
            var oldKey = state.timelineClip.key;
            state.timelineClip.nodeId = hostRes.nodeId;
            state.timelineClip.key = clipKey(state.timelineClip);
            if (clipEdits[oldKey]) {
              clipEdits[state.timelineClip.key] = clipEdits[oldKey];
            }
          }
          var trackNum = (hostRes && hostRes.laneIndex !== undefined) ? (hostRes.laneIndex + 1) : 1;
          var durSec = (hostRes && hostRes.timelineDuration) ? formatTime(hostRes.timelineDuration) : formatTime(state.duration);
          state.status = 'Applied changes in place to selected clip (' + durSec + ' on A' + trackNum + ').';
          updateStatusUI();
        });
      })
      .catch(function (err) {
        state.error = err && err.message ? err.message : String(err);
        state.status = '';
        updateStatusUI();
      });
  }

  function addAsNewClip() {
    state.status = 'Rendering & importing as new clip…';
    state.error = '';
    updateStatusUI();
    exportProcessedTemp()
      .then(function (res) {
        return invoke('sfx.import', {
          path: res.path,
          atPlayhead: true,
          snapToFrame: true,
          gainDb: 0
        }).then(function (hostRes) {
          state.status = 'Imported processed audio as new clip.';
          if (hostRes && hostRes.message) state.status = hostRes.message;
          updateStatusUI();
        });
      })
      .catch(function (err) {
        state.error = err && err.message ? err.message : String(err);
        state.status = '';
        updateStatusUI();
      });
  }

  function addLibItemToTimeline(asset) {
    if (!asset || !asset.path) return;
    state.status = 'Importing to timeline…';
    updateStatusUI();
    invoke('sfx.import', {
      path: asset.path,
      atPlayhead: true,
      snapToFrame: true,
      gainDb: 0
    })
      .then(function (res) {
        state.status = 'Added “' + asset.name + '” to timeline.';
        updateStatusUI();
      })
      .catch(function (err) {
        state.error = err && err.message ? err.message : String(err);
        state.status = '';
        updateStatusUI();
      });
  }

  // ── File open ────────────────────────────────────────────────────────

  function openFile(filePath, displayName, timelineClip, savedEdit) {
    stopPlay();
    state.path = filePath;
    state.name = displayName || (filePath.split(/[\/\\]/).pop() || 'Audio');
    state.buffer = null;
    state.peaks = null;
    state.error = '';
    state.status = 'Loading…';
    state.timelineClip = timelineClip || null;
    updateStatusUI();
    renderCenter();
    renderES();
    return loadBuffer(filePath)
      .then(function (buf) {
        // A timeline item is an instance of a source file. Decode the source,
        // then slice to retain only its actual source in/out range.
        if (timelineClip) {
          buf = sliceTimelineSegment(buf, timelineClip);
          if (timelineClip.duration > 0 && Math.abs(buf.duration - timelineClip.duration) > 0.05) {
            buf = fitTimelineDuration(buf, timelineClip.duration);
          }
        }
        state.buffer = buf;
        state.duration = buf.duration;
        state.sampleRate = buf.sampleRate;
        state.channels = buf.numberOfChannels;
        state.playOffset = 0;
        if (savedEdit) {
          state.params = Object.assign({}, savedEdit.params);
          state.esCategory = savedEdit.category;
          state.trimStart = Math.min(savedEdit.trimStart, buf.duration);
          state.trimEnd = Math.min(buf.duration, Math.max(state.trimStart + 0.01, savedEdit.trimEnd));
        } else {
          state.esCategory = guessCategory(state.name);
          state.params = Object.assign({}, ES_DEFAULTS[state.esCategory] || ES_DEFAULTS.sfx);
          state.trimStart = 0;
          state.trimEnd = buf.duration;
        }
        state.peaks = buildPeaks(buf);
        state.enhancedBuffer = null;
        state.enhancedPeaks = null;
        state.enhancedPath = '';
        state.enhancedMetrics = null;
        state.abMode = 'B';
        state.status = '';
        renderCenter();
        renderES();
        drawWaveform();
        updateTransportUI();
      })
      .catch(function (err) {
        state.error = err && err.message ? err.message : String(err);
        state.status = '';
        renderCenter();
        updateStatusUI();
      });
  }

  function pickFile() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*,.wav,.mp3,.aif,.aiff,.m4a,.ogg,.flac';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      document.body.removeChild(input);
      if (!f) return;
      var p = f.path || '';
      if (!p) {
        state.error = 'Could not resolve file path. Drag from the Library panel or use Load from Timeline.';
        updateStatusUI();
        return;
      }
      openFile(p, f.name);
    });
    input.click();
  }

  // ── UI rendering ─────────────────────────────────────────────────────

  function setOpen(open) {
    if (!panel) return;
    if (open) {
      panel.classList.add('is-open');
      loadFavorites();
      if (!state.libraryLoaded) loadLibrary();
      var live = libraryService();
      if (!libraryUnsubscribe && live && typeof live.subscribe === 'function') {
        libraryUnsubscribe = live.subscribe(function (snapshot) {
          applyLibraryAssets((snapshot && snapshot.entries) || (live.entries ? live.entries() : []));
          if (panel && panel.classList.contains('is-open')) renderLib();
        });
      }
      renderAll();
      startSelectionSync();
    } else {
      stopPlay();
      stopSelectionSync();
      panel.classList.remove('is-open');
      if (libraryUnsubscribe) {
        libraryUnsubscribe();
        libraryUnsubscribe = null;
      }
    }
    if (window.__sfxHeaderMenu && window.__sfxHeaderMenu.refresh) {
      try { window.__sfxHeaderMenu.refresh(); } catch (e) {}
    }
  }
  function updateStatusUI() {
    var line = panel && panel.querySelector('.sfx-au__status-line');
    var selectionLine = panel && panel.querySelector('.sfx-au__selection-summary');
    if (selectionLine) selectionLine.textContent = selectionSummary(state.timelineSelection);
    if (!line) return;
    line.classList.remove('is-ok', 'is-err');
    if (state.error) {
      line.textContent = state.error;
      line.classList.add('is-err');
    } else if (state.status) {
      line.textContent = state.status;
      line.classList.add('is-ok');
    } else {
      line.textContent = state.buffer
        ? formatTime(state.duration) + ' · ' + state.sampleRate + ' Hz · ' + state.channels + ' ch'
        : '';
    }
  }

  function updateTransportUI() {
    var playBtn = panel && panel.querySelector('[data-action="play"]');
    var pauseBtn = panel && panel.querySelector('[data-action="pause"]');
    if (playBtn) playBtn.style.display = state.playing ? 'none' : '';
    if (pauseBtn) pauseBtn.style.display = state.playing ? '' : 'none';
    var timeEl = panel && panel.querySelector('.sfx-au__time');
    if (timeEl) {
      if (state.buffer) {
        var t = state.playOffset || 0;
        if (state.playing && audioCtx) {
          t = state.playOffset + (audioCtx.currentTime - state.playStartCtx);
        }
        timeEl.textContent = formatTime(Math.max(0, Math.min(state.duration, t))) + ' / ' + formatTime(state.duration);
      } else {
        timeEl.textContent = '0:00.00 / 0:00.00';
      }
    }
  }
  function sliderRow(label, min, max, step, value, onChange, suffix) {
    var row = el('div', 'sfx-au__row');
    row.appendChild(el('label', '', label));
    var input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    var val = el('span', 'sfx-au__val', (step < 1 ? Number(value).toFixed(2) : String(value)) + (suffix || ''));
    input.addEventListener('input', function () {
      var v = Number(input.value);
      onChange(v);
      val.textContent = (step < 1 ? v.toFixed(2) : String(v)) + (suffix || '');
      updateLiveParams();
      drawWaveform();
    });
    row.appendChild(input);
    row.appendChild(val);
    return row;
  }

  function renderLib() {
    if (!libEl) return;
    libEl.innerHTML = '';
    libEl.className = 'sfx-au__lib' + (state.libCollapsed ? ' is-collapsed' : '');

    var head = el('div', 'sfx-au__lib-head');
    var search = document.createElement('input');
    search.className = 'sfx-au__lib-search';
    search.type = 'search';
    search.placeholder = 'Search name, keyword…';
    search.value = state.libQuery;
    search.addEventListener('input', function () {
      state.libQuery = search.value;
      filterLibrary();
      renderLibResults();
    });
    head.appendChild(search);

    var refresh = el('button', 'sfx-au__lib-cat', 'Refresh');
    refresh.type = 'button';
    refresh.title = 'Rescan configured library folders';
    refresh.addEventListener('click', function () {
      var live = libraryService();
      if (live && typeof live.rescan === 'function') {
        state.libraryError = 'Refreshing library…';
        renderLib();
        live.rescan().catch(function (err) {
          state.libraryError = err && err.message ? err.message : 'The library refresh failed.';
          renderLib();
        });
      } else {
        loadLibrary();
        renderLib();
      }
    });
    head.appendChild(refresh);

    var sort = document.createElement('select');
    sort.className = 'sfx-au__lib-search';
    sort.title = 'Sort library items';
    sort.innerHTML = '<option value="name">Name</option><option value="duration">Duration</option>';
    sort.value = state.libSort;
    sort.addEventListener('change', function () {
      state.libSort = sort.value;
      filterLibrary();
      renderLibResults();
    });
    head.appendChild(sort);

    var cats = el('div', 'sfx-au__lib-cats');
    CATEGORIES.forEach(function (c) {
      var btn = el('button', 'sfx-au__lib-cat' + (state.libCategory === c.id ? ' is-active' : ''), c.label);
      btn.type = 'button';
      btn.addEventListener('click', function () {
        state.libCategory = c.id;
        filterLibrary();
        renderLib();
      });
      cats.appendChild(btn);
    });
    head.appendChild(cats);
    libEl.appendChild(head);

    var tabs = el('div', 'sfx-au__lib-tabs');
    ;[
      { id: 'browse', label: 'Browse' },
      { id: 'favorites', label: 'Favorites' },
      { id: 'collections', label: 'Collections' }
    ].forEach(function (t) {
      var b = el('button', 'sfx-au__lib-tab' + (state.libTab === t.id ? ' is-active' : ''), t.label);
      b.type = 'button';
      b.addEventListener('click', function () {
        state.libTab = t.id;
        filterLibrary();
        renderLib();
      });
      tabs.appendChild(b);
    });
    libEl.appendChild(tabs);

    var results = el('div', 'sfx-au__lib-results');
    results.setAttribute('data-role', 'lib-results');
    libEl.appendChild(results);
    renderLibResults();

    var status = el('div', 'sfx-au__lib-status');
    if (!state.libraryLoaded) status.textContent = 'Loading library…';
    else if (state.libraryError) status.textContent = state.libraryError;
    else status.textContent = state.filtered.length + ' of ' + state.libraryAssets.length + ' sounds';
    libEl.appendChild(status);
  }

  function renderLibResults() {
    var results = libEl && libEl.querySelector('[data-role="lib-results"]');
    if (!results) return;
    results.innerHTML = '';
    if (!state.libraryLoaded) {
      results.appendChild(el('div', 'sfx-au__lib-empty', 'Loading library index…'));
      return;
    }
    if (state.libraryError && !state.libraryAssets.length) {
      results.appendChild(el('div', 'sfx-au__lib-empty', state.libraryError));
      return;
    }
    if (!state.filtered.length) {
      results.appendChild(el('div', 'sfx-au__lib-empty', 'No matching sounds. Try another search or category.'));
      return;
    }
    state.filtered.forEach(function (asset) {
      var item = el('div', 'sfx-au__lib-item' + (state.selectedLibPath === asset.path ? ' is-selected' : ''));
      item.draggable = true;
      item.addEventListener('dragstart', function (ev) {
        try {
          ev.dataTransfer.setData('text/plain', asset.path);
          ev.dataTransfer.setData('application/x-sfx-path', asset.path);
          ev.dataTransfer.effectAllowed = 'copy';
        } catch (e) {}
      });
      item.addEventListener('click', function () {
        state.selectedLibPath = asset.path;
        openFile(asset.path, asset.name);
        renderLibResults();
      });
      item.addEventListener('dblclick', function () {
        addLibItemToTimeline(asset);
      });

      var wave = el('div', 'sfx-au__lib-item-wave', asset.category.toUpperCase());
      wave.title = 'Load to view this file’s real waveform';
      item.appendChild(wave);

      var meta = el('div', 'sfx-au__lib-item-meta');
      meta.appendChild(el('div', 'sfx-au__lib-item-name', asset.name));
      var sub = asset.category;
      if (asset.duration) sub += ' · ' + formatTime(asset.duration);
      if (asset.mood) sub += ' · ' + asset.mood;
      meta.appendChild(el('div', 'sfx-au__lib-item-sub', sub));
      item.appendChild(meta);

      var actions = el('div', 'sfx-au__lib-item-actions');
      var favBtn = el('button', 'sfx-au__lib-item-btn' + ((isFav(asset.path) || asset.favourite) ? ' is-fav' : ''));
      favBtn.type = 'button';
      favBtn.title = 'Favorite';
      favBtn.innerHTML = (isFav(asset.path) || asset.favourite) ? ICON.star : ICON.starOut;
      favBtn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        toggleFav(asset.path);
        var live = libraryService();
        if (live && asset.id && typeof live.toggleFavourite === 'function') {
          live.toggleFavourite(asset.id).catch(function () {});
        }
        renderLibResults();
      });
      actions.appendChild(favBtn);

      var previewBtn = el('button', 'sfx-au__lib-item-btn');
      previewBtn.type = 'button';
      previewBtn.title = 'Preview';
      previewBtn.innerHTML = ICON.play;
      previewBtn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        openFile(asset.path, asset.name).then(function () { playOriginal(); });
      });
      actions.appendChild(previewBtn);

      var addBtn = el('button', 'sfx-au__lib-item-btn');
      addBtn.type = 'button';
      addBtn.title = 'Add to Timeline';
      addBtn.innerHTML = ICON.plus;
      addBtn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        addLibItemToTimeline(asset);
      });
      actions.appendChild(addBtn);
      item.appendChild(actions);

      results.appendChild(item);
    });
  }

  function renderCenter() {
    if (!centerEl) return;
    if (state.activeMode === 'enhance') {
      renderEnhanceCenter();
      return;
    }
    centerEl.innerHTML = '';
    waveCanvas = null;

    var toolbar = el('div', 'sfx-au__center-toolbar');
    var openBtn = el('button', 'sfx-au__btn', 'Open file');
    openBtn.type = 'button';
    openBtn.addEventListener('click', pickFile);
    toolbar.appendChild(openBtn);

    var tlBtn = el('button', 'sfx-au__btn', 'Load from Timeline');
    tlBtn.type = 'button';
    tlBtn.title = 'Load the selected audio clip from Premiere / After Effects';
    tlBtn.addEventListener('click', loadSelectedTimelineClip);
    toolbar.appendChild(tlBtn);

    var refreshBtn = el('button', 'sfx-au__btn', 'Refresh Selection');
    refreshBtn.type = 'button';
    refreshBtn.title = 'Read the current audio-clip selection from the active Premiere Pro sequence';
    refreshBtn.addEventListener('click', function () {
      refreshTimelineSelection().catch(function () {});
    });
    toolbar.appendChild(refreshBtn);

    toolbar.appendChild(el('span', 'sfx-au__selection-summary', selectionSummary(state.timelineSelection)));

    if (state.timelineSelection && state.timelineSelection.count > 1) {
      var picker = document.createElement('select');
      picker.className = 'sfx-au__selection-picker';
      for (var s = 0; s < state.timelineSelection.clips.length; s++) {
        var option = document.createElement('option');
        var selected = state.timelineSelection.clips[s];
        option.value = String(s);
        var trk = 'A' + (selected.trackNumber || (selected.trackIndex >= 0 ? selected.trackIndex + 1 : 1));
        option.textContent = trk + ' [' + formatTime(selected.timelineStart) + ']: ' + (selected.name || 'Untitled audio clip');
        if (s === state.activeSelectionIndex) option.selected = true;
        picker.appendChild(option);
      }
      picker.addEventListener('change', function () {
        loadTimelineClip(state.timelineSelection, Number(picker.value)).catch(function (err) {
          state.error = err.message;
          updateStatusUI();
        });
      });
      toolbar.appendChild(picker);
    }

    if (state.path) {
      toolbar.appendChild(el('span', 'sfx-au__filename', state.name));
      if (state.timelineClip) {
        toolbar.appendChild(el('span', 'sfx-au__meta-badge', 'Timeline'));
        var tc = state.timelineClip;
        var trackLabel = 'A' + (tc.trackNumber || (tc.trackIndex >= 0 ? tc.trackIndex + 1 : 1));
        var tlRange = trackLabel + ' · ' + formatTime(tc.startSeconds) + ' – ' + formatTime(tc.endSeconds) + ' (' + formatTime(tc.duration) + ')';
        toolbar.appendChild(el('span', 'sfx-au__meta-badge', tlRange));
        if (tc.sourceIn > 0 || tc.sourceOut > 0) {
          var srcRange = 'Source: ' + formatTime(tc.sourceIn) + ' – ' + formatTime(tc.sourceOut);
          toolbar.appendChild(el('span', 'sfx-au__meta-badge', srcRange));
        }
      }
    }
    centerEl.appendChild(toolbar);

    if (!state.buffer) {
      var empty = el('div', 'sfx-au__empty-center');
      empty.appendChild(el('h2', '', 'Essential Sound Studio'));
      empty.appendChild(el('p', '', 'Select an audio clip on the Premiere Pro timeline to automatically edit it here, or browse the sound library. Edits are non-destructive and apply directly in place.'));
      centerEl.appendChild(empty);
      var statusRow = el('div', 'sfx-au__transport');
      statusRow.appendChild(el('div', 'sfx-au__status-line', ''));
      centerEl.appendChild(statusRow);
      updateStatusUI();
      return;
    }

    var waveArea = el('div', 'sfx-au__wave-area');
    var waveWrap = el('div', 'sfx-au__wave-wrap');
    var canvas = document.createElement('canvas');
    canvas.className = 'sfx-au__wave';
    waveWrap.appendChild(canvas);
    waveArea.appendChild(waveWrap);
    waveCanvas = canvas;

    // drag trim handles
    var dragging = null;
    function timeFromEvent(ev) {
      var rect = canvas.getBoundingClientRect();
      var x = (ev.clientX - rect.left) / rect.width;
      x = Math.max(0, Math.min(1, x));
      return x * state.duration;
    }
    canvas.addEventListener('mousedown', function (ev) {
      var t = timeFromEvent(ev);
      var distStart = Math.abs(t - state.trimStart);
      var distEnd = Math.abs(t - state.trimEnd);
      if (distStart < distEnd && distStart < state.duration * 0.03) dragging = 'start';
      else if (distEnd < state.duration * 0.03) dragging = 'end';
      else {
        // seek / play from click
        stopPlay();
        state.playOffset = Math.max(state.trimStart, Math.min(state.trimEnd - 0.01, t));
        playProcessedPreview(state.playOffset);
      }
    });
    window.addEventListener('mousemove', function (ev) {
      if (!dragging) return;
      var t = timeFromEvent(ev);
      if (dragging === 'start') {
        state.trimStart = Math.max(0, Math.min(t, state.trimEnd - 0.01));
      } else {
        state.trimEnd = Math.min(state.duration, Math.max(t, state.trimStart + 0.01));
      }
      drawWaveform();
    });
    window.addEventListener('mouseup', function () {
      dragging = null;
    });

    // drop from library
    waveWrap.addEventListener('dragover', function (ev) {
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'copy';
    });
    waveWrap.addEventListener('drop', function (ev) {
      ev.preventDefault();
      var p = '';
      try {
        p = ev.dataTransfer.getData('application/x-sfx-path') || ev.dataTransfer.getData('text/plain');
      } catch (e) {}
      if (p) openFile(p);
    });

    var transport = el('div', 'sfx-au__transport');
    var btns = el('div', 'sfx-au__transport-btns');
    var playBtn = el('button', 'sfx-au__btn sfx-au__btn--icon');
    playBtn.type = 'button';
    playBtn.setAttribute('data-action', 'play');
    playBtn.innerHTML = ICON.play;
    playBtn.title = 'Play processed preview';
    playBtn.addEventListener('click', function () {
      playProcessedPreview();
    });
    btns.appendChild(playBtn);

    var pauseBtn = el('button', 'sfx-au__btn sfx-au__btn--icon');
    pauseBtn.type = 'button';
    pauseBtn.setAttribute('data-action', 'pause');
    pauseBtn.innerHTML = ICON.pause;
    pauseBtn.title = 'Pause playback';
    pauseBtn.style.display = 'none';
    pauseBtn.addEventListener('click', function () {
      if (state.playing && audioCtx) {
        state.playOffset = Math.max(state.trimStart, Math.min(state.trimEnd, state.playOffset + (audioCtx.currentTime - state.playStartCtx)));
      }
      stopPlay();
    });
    btns.appendChild(pauseBtn);

    var stopBtn = el('button', 'sfx-au__btn sfx-au__btn--icon');
    stopBtn.type = 'button';
    stopBtn.innerHTML = ICON.stop;
    stopBtn.title = 'Stop and return to start';
    stopBtn.addEventListener('click', function () {
      stopPlay();
      state.playOffset = state.trimStart;
      drawWaveform();
      updateTransportUI();
    });
    btns.appendChild(stopBtn);

    var origBtn = el('button', 'sfx-au__btn', 'Original');
    origBtn.type = 'button';
    origBtn.title = 'Preview original (no processing)';
    origBtn.addEventListener('click', function () {
      playOriginal();
    });
    btns.appendChild(origBtn);

    transport.appendChild(btns);
    transport.appendChild(el('div', 'sfx-au__time', formatTime(0) + ' / ' + formatTime(state.duration)));
    transport.appendChild(el('div', 'sfx-au__status-line', ''));
    waveArea.appendChild(transport);
    centerEl.appendChild(waveArea);

    // defer draw until layout
    requestAnimationFrame(function () {
      drawWaveform();
      updateStatusUI();
      updateTransportUI();
    });
  }

  function renderES() {
    if (!esEl) return;
    if (state.activeMode === 'enhance') {
      renderEnhanceRight();
      return;
    }
    esEl.innerHTML = '';

    var head = el('div', 'sfx-au__es-head');
    head.appendChild(el('strong', '', 'Essential Sound'));
    var cats = el('div', 'sfx-au__es-cats');
    ;['music', 'sfx', 'dialogue', 'ambience'].forEach(function (id) {
      var label = id === 'sfx' ? 'SFX' : id.charAt(0).toUpperCase() + id.slice(1);
      var b = el('button', 'sfx-au__es-cat' + (state.esCategory === id ? ' is-active' : ''), label);
      b.type = 'button';
      b.addEventListener('click', function () {
        state.esCategory = id;
        state.params = Object.assign({}, ES_DEFAULTS[id]);
        renderES();
        updateLiveParams();
        drawWaveform();
      });
      cats.appendChild(b);
    });
    head.appendChild(cats);
    esEl.appendChild(head);

    var body = el('div', 'sfx-au__es-body');
    if (!state.buffer) {
      body.appendChild(el('p', 'sfx-au__lib-empty', 'Select an audio clip in the timeline or open a file to edit with category controls.'));
      esEl.appendChild(body);
      return;
    }

    // Loudness analysis
    var peakDb = linToDb(measurePeak(state.buffer, state.trimStart, state.trimEnd));
    var rmsDb = linToDb(measureRms(state.buffer, state.trimStart, state.trimEnd));
    var loud = el('div', 'sfx-au__loudness');
    var c1 = el('div', 'sfx-au__loud-card');
    c1.appendChild(el('span', '', 'Peak'));
    c1.appendChild(el('strong', '', peakDb.toFixed(1) + ' dB'));
    loud.appendChild(c1);
    var c2 = el('div', 'sfx-au__loud-card');
    c2.appendChild(el('span', '', 'RMS'));
    c2.appendChild(el('strong', '', rmsDb.toFixed(1) + ' dB'));
    loud.appendChild(c2);
    body.appendChild(loud);

    var p = state.params;
    var cat = state.esCategory;

    // Level (all)
    var secLevel = el('div', 'sfx-au__es-sec');
    secLevel.appendChild(el('div', 'sfx-au__es-sec-title', 'Level'));
    secLevel.appendChild(sliderRow('Gain', -24, 12, 0.5, p.gainDb, function (v) { p.gainDb = v; }, ' dB'));
    var normRow = el('div', 'sfx-au__check-row');
    var norm = document.createElement('input');
    norm.type = 'checkbox';
    norm.checked = !!p.normalize;
    norm.addEventListener('change', function () {
      p.normalize = norm.checked;
      updateLiveParams();
      drawWaveform();
    });
    normRow.appendChild(norm);
    normRow.appendChild(document.createTextNode('Normalize'));
    secLevel.appendChild(normRow);
    secLevel.appendChild(sliderRow('Target', -24, 0, 0.5, p.targetDb, function (v) { p.targetDb = v; }, ' dB'));
    body.appendChild(secLevel);

    // Fades (all)
    var secFade = el('div', 'sfx-au__es-sec');
    secFade.appendChild(el('div', 'sfx-au__es-sec-title', 'Fades'));
    secFade.appendChild(sliderRow('Fade In', 0, Math.min(5, state.duration), 0.01, p.fadeIn, function (v) { p.fadeIn = v; }, ' s'));
    secFade.appendChild(sliderRow('Fade Out', 0, Math.min(5, state.duration), 0.01, p.fadeOut, function (v) { p.fadeOut = v; }, ' s'));
    body.appendChild(secFade);

    // EQ (all categories)
    var secEq = el('div', 'sfx-au__es-sec');
    secEq.appendChild(el('div', 'sfx-au__es-sec-title', 'EQ'));
    secEq.appendChild(sliderRow('Bass', -12, 12, 0.5, p.bass || 0, function (v) { p.bass = v; }, ' dB'));
    secEq.appendChild(sliderRow('High-pass', 20, 500, 1, p.highpass || 20, function (v) { p.highpass = v; }, ' Hz'));
    secEq.appendChild(sliderRow('Low-pass', 2000, 20000, 100, p.lowpass || 20000, function (v) { p.lowpass = v; }, ' Hz'));
    if (cat === 'dialogue' || cat === 'music' || cat === 'sfx') {
      secEq.appendChild(sliderRow('Presence', 0, 1, 0.01, p.presence || 0, function (v) { p.presence = v; }, ''));
    }
    body.appendChild(secEq);

    // Dynamics
    if (cat === 'music' || cat === 'dialogue' || cat === 'sfx') {
      var secDyn = el('div', 'sfx-au__es-sec');
      secDyn.appendChild(el('div', 'sfx-au__es-sec-title', 'Dynamics'));
      secDyn.appendChild(sliderRow('Compress', 0, 1, 0.01, p.compress || 0, function (v) { p.compress = v; }, ''));
      if (cat === 'dialogue') {
        secDyn.appendChild(sliderRow('De-ess', 0, 1, 0.01, p.deess || 0, function (v) { p.deess = v; }, ''));
      }
      body.appendChild(secDyn);
    }

    if (cat === 'dialogue') {
      var secEnh = el('div', 'sfx-au__es-sec');
      secEnh.appendChild(el('div', 'sfx-au__es-sec-title', 'AI Audio Enhancement'));
      var enhBanner = el('button', 'sfx-au__btn--ai-banner', '✨ Open AI Audio Enhance (Denoise & Clarify)');
      enhBanner.type = 'button';
      enhBanner.addEventListener('click', function () {
        setMode('enhance');
      });
      secEnh.appendChild(enhBanner);
      body.appendChild(secEnh);
    }

    // SFX specific
    if (cat === 'sfx') {
      var secSfx = el('div', 'sfx-au__es-sec');
      secSfx.appendChild(el('div', 'sfx-au__es-sec-title', 'Character'));
      secSfx.appendChild(sliderRow('Pitch', -12, 12, 0.1, p.pitch || 0, function (v) { p.pitch = v; }, ' st'));
      secSfx.appendChild(sliderRow('Reverb', 0, 1, 0.01, p.reverb || 0, function (v) { p.reverb = v; }, ''));
      secSfx.appendChild(sliderRow('Width', -1, 1, 0.01, p.width || 0, function (v) { p.width = v; }, ''));
      secSfx.appendChild(sliderRow('Transient', 0, 1, 0.01, p.transient || 0, function (v) { p.transient = v; }, ''));
      body.appendChild(secSfx);
    }

    // Music specific
    if (cat === 'music') {
      var secMus = el('div', 'sfx-au__es-sec');
      secMus.appendChild(el('div', 'sfx-au__es-sec-title', 'Music'));
      secMus.appendChild(sliderRow('Reverb', 0, 1, 0.01, p.reverb || 0, function (v) { p.reverb = v; }, ''));
      secMus.appendChild(sliderRow('Width', -1, 1, 0.01, p.width || 0, function (v) { p.width = v; }, ''));
      var duckRow = el('div', 'sfx-au__check-row');
      var duck = document.createElement('input');
      duck.type = 'checkbox';
      duck.checked = !!p.duck;
      duck.addEventListener('change', function () { p.duck = duck.checked; });
      duckRow.appendChild(duck);
      duckRow.appendChild(document.createTextNode('Auto Duck (tag only — host mix)'));
      secMus.appendChild(duckRow);
      body.appendChild(secMus);
    }

    // Ambience
    if (cat === 'ambience') {
      var secAmb = el('div', 'sfx-au__es-sec');
      secAmb.appendChild(el('div', 'sfx-au__es-sec-title', 'Ambience'));
      secAmb.appendChild(sliderRow('Reverb', 0, 1, 0.01, p.reverb || 0, function (v) { p.reverb = v; }, ''));
      secAmb.appendChild(sliderRow('Width', -1, 1, 0.01, p.width || 0, function (v) { p.width = v; }, ''));
      var loopRow = el('div', 'sfx-au__check-row');
      var loop = document.createElement('input');
      loop.type = 'checkbox';
      loop.checked = !!p.loop;
      loop.addEventListener('change', function () { p.loop = loop.checked; });
      loopRow.appendChild(loop);
      loopRow.appendChild(document.createTextNode('Loop-friendly fades'));
      secAmb.appendChild(loopRow);
      body.appendChild(secAmb);
    }

    esEl.appendChild(body);

    // Actions
    var actions = el('div', 'sfx-au__es-actions');
    var applyBtn = el('button', 'sfx-au__btn sfx-au__btn--primary', 'Apply Changes to Selected Clip');
    applyBtn.type = 'button';
    applyBtn.title = 'Render processed audio and replace the selected timeline clip (Premiere Pro)';
    applyBtn.addEventListener('click', applyToSelectedClip);
    actions.appendChild(applyBtn);

    var addBtn = el('button', 'sfx-au__btn', 'Add Processed Audio as New Clip');
    addBtn.type = 'button';
    addBtn.addEventListener('click', addAsNewClip);
    actions.appendChild(addBtn);

    var exportBtn = el('button', 'sfx-au__btn', 'Export WAV…');
    exportBtn.type = 'button';
    exportBtn.addEventListener('click', function () {
      exportProcessedTemp()
        .then(function (res) {
          state.status = 'Exported: ' + res.path;
          updateStatusUI();
        })
        .catch(function (err) {
          state.error = err && err.message ? err.message : String(err);
          updateStatusUI();
        });
    });
    actions.appendChild(exportBtn);

    esEl.appendChild(actions);
  }
  function renderAll() {
    renderLib();
    renderCenter();
    renderES();
  }

  function ensurePanel() {
    if (panel) return;
    panel = el('div', 'sfx-au');
    panel.id = 'sfx-audio-tools';

    var header = el('div', 'sfx-au__header');
    var back = el('button', 'sfx-au__back');
    back.type = 'button';
    back.innerHTML = ICON.back + '<span>Back</span>';
    back.addEventListener('click', function () { setOpen(false); });
    header.appendChild(back);

    var title = el('div', 'sfx-au__title');
    title.innerHTML = ICON.wave + '<span>Audio Tools</span>';
    header.appendChild(title);

    function setMode(mode) {
      if (state.activeMode === mode) return;
      state.activeMode = mode;
      stopPlay();
      if (panel) {
        var tabs = panel.querySelectorAll('.sfx-au__mode-tab');
        for (var i = 0; i < tabs.length; i++) {
          tabs[i].classList.toggle('is-active', tabs[i].getAttribute('data-mode') === mode);
        }
      }
      renderCenter();
      renderES();
    }

    var modeTabs = el('div', 'sfx-au__mode-tabs');
    var tabEs = el('button', 'sfx-au__mode-tab' + (state.activeMode === 'essential' ? ' is-active' : ''), 'Essential Sound');
    tabEs.type = 'button';
    tabEs.setAttribute('data-mode', 'essential');
    tabEs.addEventListener('click', function () { setMode('essential'); });
    modeTabs.appendChild(tabEs);

    var tabEnh = el('button', 'sfx-au__mode-tab' + (state.activeMode === 'enhance' ? ' is-active' : ''), 'AI Audio Enhance');
    tabEnh.type = 'button';
    tabEnh.setAttribute('data-mode', 'enhance');
    tabEnh.addEventListener('click', function () { setMode('enhance'); });
    modeTabs.appendChild(tabEnh);

    header.appendChild(modeTabs);

    var actions = el('div', 'sfx-au__header-actions');
    var toggleLib = el('button', 'sfx-au__toggle-lib is-active', 'Library');
    toggleLib.type = 'button';
    toggleLib.addEventListener('click', function () {
      state.libCollapsed = !state.libCollapsed;
      toggleLib.classList.toggle('is-active', !state.libCollapsed);
      if (libEl) libEl.classList.toggle('is-collapsed', state.libCollapsed);
    });
    actions.appendChild(toggleLib);
    header.appendChild(actions);
    panel.appendChild(header);

    var workspace = el('div', 'sfx-au__workspace');
    libEl = el('div', 'sfx-au__lib');
    centerEl = el('div', 'sfx-au__center');
    esEl = el('div', 'sfx-au__es');
    workspace.appendChild(libEl);
    workspace.appendChild(centerEl);
    workspace.appendChild(esEl);
    panel.appendChild(workspace);

    document.body.appendChild(panel);

    window.__sfxAudioTools = {
      isOpen: function () {
        return panel.classList.contains('is-open');
      },
      setOpen: setOpen,
      setMode: setMode,
      open: function (filePath, name) {
        setOpen(true);
        return openFile(filePath, name);
      },
      loadFromTimeline: function () {
        setOpen(true);
        return loadSelectedTimelineClip();
      },
      openAiEnhance: function (filePath, name) {
        setOpen(true);
        setMode('enhance');
        if (filePath) return openFile(filePath, name);
        return loadSelectedTimelineClip();
      },
      getState: function () {
        return state;
      },
      getEnhanceState: function () {
        return {
          activeMode: state.activeMode,
          path: state.path,
          name: state.name,
          duration: state.duration,
          isEnhancing: state.isEnhancing,
          enhanceProgress: state.enhanceProgress,
          enhanceStage: state.enhanceStage,
          enhanceParams: state.enhanceParams,
          enhancedPath: state.enhancedPath,
          enhancedMetrics: state.enhancedMetrics,
          abMode: state.abMode,
          hasBuffer: !!state.buffer,
          hasEnhancedBuffer: !!state.enhancedBuffer
        };
      },
      runEnhance: runEnhance,
      cancelEnhance: cancelEnhance,
      previewOriginal: function () { playAB(0, 'A'); },
      previewEnhanced: function () { playAB(0, 'B'); },
      toggleAbCompare: function () { switchAB(state.abMode === 'A' ? 'B' : 'A'); },
      applyToTimeline: applyEnhancedToTimeline,
      replaceSelectedClip: applyEnhancedToTimeline,
      addEnhancedAsNewClip: addEnhancedAsNewClip,
      exportEnhancedWav: exportEnhancedWav,
      resetEnhance: resetEnhance,
      enhance: {
        open: function (filePath, name) {
          setOpen(true);
          setMode('enhance');
          if (filePath) return openFile(filePath, name);
          return loadSelectedTimelineClip();
        },
        getState: function () {
          return window.__sfxAudioTools.getEnhanceState();
        },
        runEnhance: runEnhance,
        cancelEnhance: cancelEnhance,
        previewOriginal: function () { playAB(0, 'A'); },
        previewEnhanced: function () { playAB(0, 'B'); },
        toggleAbCompare: function () { switchAB(state.abMode === 'A' ? 'B' : 'A'); },
        applyToTimeline: applyEnhancedToTimeline,
        replaceSelectedClip: applyEnhancedToTimeline,
        addEnhancedAsNewClip: addEnhancedAsNewClip,
        exportEnhancedWav: exportEnhancedWav,
        resetEnhance: resetEnhance
      }
    };
    window.__sfxAiAudioEnhance = window.__sfxAudioTools.enhance;
  }

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensurePanel);
  } else {
    ensurePanel();
  }
})();
