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
    library: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19V5a1 1 0 011-1h3v16H5a1 1 0 01-1-1zM10 4h4v16h-4zM16 4h3a1 1 0 011 1v14a1 1 0 01-1 1h-3V4z"/></svg>'
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
  var clipEdits = {};  var state = {
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
    drawWaveform();
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
    drawWaveform();
    updateTransportUI();
    raf = requestAnimationFrame(tickPlayhead);
  }

  // ── Waveform drawing ─────────────────────────────────────────────────

  function drawWaveform() {
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
    title.innerHTML = ICON.wave + '<span>Essential Sound Studio</span>';
    header.appendChild(title);

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
      open: function (filePath, name) {
        setOpen(true);
        return openFile(filePath, name);
      },
      loadFromTimeline: function () {
        setOpen(true);
        return loadSelectedTimelineClip();
      }
    };
  }

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensurePanel);
  } else {
    ensurePanel();
  }
})();
