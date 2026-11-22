/*
  SFX Composer — Scene Sound Designer (local-first)

  Workflow:
    1. Read active AE composition structure via host `comp.analysis`
    2. Segment into scenes from layer timing / cuts
    3. Search local SFX library (services.library)
    4. Ask local Ollama for a structured sound plan (JSON)
    5. User reviews, previews, edits
    6. On approve: place via sfx.import at planned timestamps

  Vision note: ExtendScript cannot sample pixels without a full render.
  Analysis is structural (layers, names, timing) + local LLM reasoning.
  No fabricated library paths — every event is matched to a real asset.
*/
(function () {
  'use strict';

  var RUN_PREFIX = 'scene-ai-';
  var MAX_CANDIDATES = 8;
  var DEFAULT_SCENE_SEC = 5;

  var ICON = {
    film:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 12h18M3 8h4M3 16h4M17 8h4M17 16h4"/></svg>',
    back:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    spark:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"/></svg>'
  };

  var panel = null;
  var bodyEl = null;
  var state = {
    busy: false,
    phase: 'idle', // idle | analyzing | planning | ready | applying | error
    message: '',
    comp: null,
    scenes: [],
    plan: null, // { scenes: [{id,start,end,description,events:[]}] }
    cancelled: false,
    /* Independent connection status — never mirror one into the other */
    host: {
      checking: true,
      bridge: false,
      hostKind: '', // premiere | aftereffects | ''
      preferredHost: '', // user preference when we only see one bridge (CEP = one host process)
      hasTimeline: false, // sequence or composition present
      timelineName: '',
      timelineKind: '', // sequence | composition
      sequences: [],
      error: '',
      detail: ''
    },
    // legacy alias fields kept in sync for canAnalyzeComposition
    ae: {
      checking: true,
      bridge: false,
      hostKind: '',
      hasComp: false,
      compName: '',
      error: '',
      detail: ''
    },
    ollama: {
      checking: true,
      installed: false,
      running: false,
      models: [],
      modelNames: [],
      version: '',
      error: '',
      detail: '',
      status: 'unknown' // not-installed | not-running | no-models | ready | error | unknown
    },
    connectionsReady: false
  };

  function logDev() {
    try {
      var args = ['[SceneAI]'].concat([].slice.call(arguments));
      if (window.__sfxDebug && typeof window.__sfxDebug.info === 'function') {
        window.__sfxDebug.info(args.join(' '));
      } else if (typeof console !== 'undefined' && console.log) {
        console.log.apply(console, args);
      }
    } catch (e) {}
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function fmtTime(sec) {
    sec = Math.max(0, Number(sec) || 0);
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec % 60);
    var f = Math.floor((sec - Math.floor(sec)) * 100);
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s + '.' + (f < 10 ? '0' : '') + f;
  }

  function services() {
    return window.__sfxServices || null;
  }

  function bridge() {
    var s = services();
    return s && s.bridge ? s.bridge : null;
  }

  // The main bundle predates comp.analysis and therefore has no timeout entry
  // for it. Route this one read-only command through CEP directly with a
  // finite timeout until the bundled bridge is rebuilt.
  var analysisRequestId = 100000;
  function invokeAnalysis(fallbackBridge) {
    var cep = window.__adobe_cep__;
    if (!cep || typeof cep.evalScript !== 'function') {
      return fallbackBridge.invoke('comp.analysis', {});
    }
    var id = analysisRequestId++;
    var request = JSON.stringify({ id: id, command: 'comp.analysis', params: {}, v: 1 });
    var script = 'SFXBox.dispatch(' + JSON.stringify(request) + ')';
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        reject(new Error('comp.analysis did not respond within 30 seconds. The sequence may be very large or Premiere may be showing a dialog.'));
      }, 30000);
      cep.evalScript(script, function (reply) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        var text = String(reply || '');
        var magic = '@@SFXBOX_REPLY@@';
        if (text.indexOf(magic) !== 0) {
          reject(new Error('comp.analysis returned an invalid host reply: ' + text.slice(0, 160)));
          return;
        }
        try {
          var envelope = JSON.parse(text.slice(magic.length));
          if (!envelope.ok) {
            reject(new Error((envelope.error && envelope.error.message) || 'comp.analysis failed.'));
            return;
          }
          resolve(envelope.result);
        } catch (e) {
          reject(new Error('comp.analysis returned malformed JSON: ' + e.message));
        }
      });
    });
  }

  function library() {
    var s = services();
    return s && s.library ? s.library : null;
  }

  function audio() {
    var s = services();
    return s && s.audio ? s.audio : null;
  }

  function localAI() {
    return window.__localAIManager || null;
  }

  /* ------------------------------------------------------------------ *
   * Library search (real assets only)
   * ------------------------------------------------------------------ */
  function tokenize(text) {
    return String(text || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(function (t) {
        return t.length >= 2 && !/^[0-9]+$/.test(t);
      });
  }

  function stripExt(name) {
    return String(name || '').replace(/\.(wav|mp3|aif|aiff|flac|ogg|m4a|aac|wma)$/i, '');
  }

  function searchLibrary(query, limit) {
    limit = limit || MAX_CANDIDATES;
    var lib = library();
    if (!lib || typeof lib.entries !== 'function') return [];
    var entries;
    try {
      entries = lib.entries();
    } catch (e) {
      return [];
    }
    if (!entries || !entries.length) return [];

    var qTokens = tokenize(query);
    if (!qTokens.length) return [];

    var scored = [];
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var name = stripExt(e.name || e.fileName || '');
      var path = e.path || e.id || '';
      var folder = '';
      try {
        folder = String(path).replace(/\\/g, '/').split('/').slice(-3, -1).join(' ');
      } catch (err) {}
      var hay = tokenize(name + ' ' + folder + ' ' + (e.tags || []).join(' '));
      var score = 0;
      for (var t = 0; t < qTokens.length; t++) {
        var qt = qTokens[t];
        for (var h = 0; h < hay.length; h++) {
          if (hay[h] === qt) score += 3;
          else if (hay[h].indexOf(qt) === 0 || qt.indexOf(hay[h]) === 0) score += 1.5;
          else if (hay[h].indexOf(qt) >= 0) score += 0.5;
        }
      }
      if (score > 0) {
        scored.push({
          score: score,
          path: path,
          name: e.name || name,
          id: e.id || path,
          duration: e.durationSeconds || e.duration || 0
        });
      }
    }
    scored.sort(function (a, b) {
      return b.score - a.score;
    });
    // de-dupe paths
    var seen = Object.create(null);
    var out = [];
    for (var j = 0; j < scored.length && out.length < limit; j++) {
      if (seen[scored[j].path]) continue;
      seen[scored[j].path] = 1;
      out.push(scored[j]);
    }
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Scene segmentation from composition structure
   * ------------------------------------------------------------------ */
  function segmentScenes(comp) {
    var duration = Math.max(0.1, Number(comp.durationSeconds) || 0);
    var layers = (comp.layers || []).filter(function (L) {
      return L && L.enabled !== false && !L.isCamera && !L.isLight;
    });

    // Collect cut points from layer in-points
    var cuts = { 0: true };
    layers.forEach(function (L) {
      var t = Number(L.inPoint);
      if (t > 0.05 && t < duration - 0.05) cuts[Math.round(t * 100) / 100] = true;
    });
    // Also split long comps into DEFAULT_SCENE_SEC windows if few cuts
    var cutList = Object.keys(cuts)
      .map(Number)
      .sort(function (a, b) {
        return a - b;
      });
    if (cutList.length < 2) {
      cutList = [];
      for (var t = 0; t < duration; t += DEFAULT_SCENE_SEC) cutList.push(t);
    }
    if (cutList[0] !== 0) cutList.unshift(0);
    cutList.push(duration);

    // Merge tiny gaps (< 0.8s)
    var merged = [0];
    for (var i = 1; i < cutList.length - 1; i++) {
      if (cutList[i] - merged[merged.length - 1] >= 0.8) merged.push(cutList[i]);
    }
    merged.push(duration);

    var scenes = [];
    for (var s = 0; s < merged.length - 1; s++) {
      var start = merged[s];
      var end = merged[s + 1];
      if (end - start < 0.25) continue;
      var active = layers.filter(function (L) {
        return Number(L.inPoint) < end && Number(L.outPoint) > start;
      });
      var names = active
        .map(function (L) {
          return L.name;
        })
        .slice(0, 12);
      var hasVideo = active.some(function (L) {
        return L.hasVideo;
      });
      var hasAudio = active.some(function (L) {
        return L.hasAudio;
      });
      scenes.push({
        id: 's' + (s + 1),
        start: start,
        end: end,
        layerNames: names,
        hasVideo: hasVideo,
        hasAudio: hasAudio,
        description: names.length ? names.slice(0, 4).join(', ') : 'Open segment'
      });
    }
    // Cap scenes for performance
    if (scenes.length > 24) {
      var step = Math.ceil(scenes.length / 24);
      scenes = scenes.filter(function (_, idx) {
        return idx % step === 0;
      });
    }
    return scenes;
  }

  /* ------------------------------------------------------------------ *
   * AI planning via Ollama
   * ------------------------------------------------------------------ */
  function buildPlannerPrompt(comp, scenes, libraryHints) {
    var sceneBlock = scenes
      .map(function (sc, i) {
        return (
          (i + 1) +
          '. [' +
          fmtTime(sc.start) +
          '–' +
          fmtTime(sc.end) +
          '] layers: ' +
          (sc.layerNames.join(' | ') || '(none)') +
          ' | hasVideo=' +
          sc.hasVideo +
          ' hasAudio=' +
          sc.hasAudio
        );
      })
      .join('\n');

    var hintBlock = libraryHints
      .map(function (h) {
        return '- query "' + h.query + '": ' + h.matches.map(function (m) {
          return m.name;
        }).join(', ');
      })
      .join('\n');

    return (
      'You are a professional sound designer working only with a LOCAL sound library.\n' +
      'Composition: "' +
      (comp.name || 'Untitled') +
      '" duration=' +
      (comp.durationSeconds || 0).toFixed(2) +
      's fps=' +
      (comp.frameRate || 24) +
      ' size=' +
      (comp.width || 0) +
      'x' +
      (comp.height || 0) +
      '.\n' +
      'Analysis mode: structural (layer names + timing). No pixel vision available.\n\n' +
      'SCENES:\n' +
      sceneBlock +
      '\n\nLIBRARY SEARCH RESULTS (only these files exist — never invent paths):\n' +
      (hintBlock || '(no matches — use empty events arrays)') +
      '\n\nReturn STRICT JSON only, no markdown:\n' +
      '{\n' +
      '  "scenes": [\n' +
      '    {\n' +
      '      "id": "s1",\n' +
      '      "description": "short scene description",\n' +
      '      "events": [\n' +
      '        {\n' +
      '          "query": "search terms used",\n' +
      '          "soundName": "exact name from library results",\n' +
      '          "reason": "why this sound",\n' +
      '          "offsetSeconds": 0,\n' +
      '          "gainDb": 0,\n' +
      '          "role": "whoosh|impact|ambience|foley|transition|ui|other"\n' +
      '        }\n' +
      '      ]\n' +
      '    }\n' +
      '  ]\n' +
      '}\n' +
      'Rules: max 3 events per scene. offsetSeconds is relative to scene start (0..scene length). ' +
      'Only use soundName values that appear in LIBRARY SEARCH RESULTS. If none fit, events=[].'
    );
  }

  function gatherHints(scenes) {
    var hints = [];
    var seedQueries = [
      'whoosh',
      'impact',
      'riser',
      'transition',
      'ambience',
      'foley',
      'click',
      'bass drop',
      'sweep'
    ];
    // Per-scene queries from layer names
    scenes.forEach(function (sc) {
      var q = sc.layerNames.join(' ') || 'cinematic transition';
      var matches = searchLibrary(q, 5);
      if (matches.length) hints.push({ query: q.slice(0, 80), matches: matches });
    });
    seedQueries.forEach(function (q) {
      var matches = searchLibrary(q, 4);
      if (matches.length) hints.push({ query: q, matches: matches });
    });
    return hints.slice(0, 20);
  }

  function resolveEventToAsset(ev, hints) {
    var name = String(ev.soundName || ev.query || '').toLowerCase();
    // Prefer exact name match from hints
    for (var i = 0; i < hints.length; i++) {
      for (var j = 0; j < hints[i].matches.length; j++) {
        var m = hints[i].matches[j];
        if (String(m.name).toLowerCase() === name || stripExt(m.name).toLowerCase() === stripExt(name).toLowerCase()) {
          return m;
        }
      }
    }
    // Fuzzy: search library again
    var found = searchLibrary(ev.soundName || ev.query || '', 3);
    return found[0] || null;
  }

  function parsePlan(raw, scenes, hints) {
    var data;
    try {
      var cleaned = String(raw || '').trim();
      var a = cleaned.indexOf('{');
      var b = cleaned.lastIndexOf('}');
      if (a >= 0 && b > a) cleaned = cleaned.slice(a, b + 1);
      data = JSON.parse(cleaned);
    } catch (e) {
      return null;
    }
    if (!data || !Array.isArray(data.scenes)) return null;

    var byId = Object.create(null);
    scenes.forEach(function (s) {
      byId[s.id] = s;
    });

    var outScenes = scenes.map(function (sc) {
      var ai = null;
      for (var i = 0; i < data.scenes.length; i++) {
        if (data.scenes[i].id === sc.id || Number(data.scenes[i].id) === Number(String(sc.id).replace(/\D/g, ''))) {
          ai = data.scenes[i];
          break;
        }
      }
      // fallback index
      if (!ai && data.scenes[scenes.indexOf(sc)]) ai = data.scenes[scenes.indexOf(sc)];

      var events = [];
      var list = (ai && ai.events) || [];
      for (var e = 0; e < list.length && events.length < 3; e++) {
        var ev = list[e] || {};
        var asset = resolveEventToAsset(ev, hints);
        if (!asset || !asset.path) continue;
        var offset = Math.max(0, Number(ev.offsetSeconds) || 0);
        var maxOff = Math.max(0, sc.end - sc.start - 0.05);
        if (offset > maxOff) offset = maxOff;
        events.push({
          id: sc.id + '-e' + (events.length + 1),
          path: asset.path,
          name: asset.name,
          reason: String(ev.reason || ''),
          role: String(ev.role || 'other'),
          offsetSeconds: offset,
          absSeconds: sc.start + offset,
          gainDb: Math.max(-24, Math.min(12, Number(ev.gainDb) || 0)),
          included: true,
          confidence: asset.score ? Math.min(1, asset.score / 12) : 0.5
        });
      }
      return {
        id: sc.id,
        start: sc.start,
        end: sc.end,
        description: (ai && ai.description) || sc.description,
        layerNames: sc.layerNames,
        events: events
      };
    });

    return { scenes: outScenes, generatedAt: Date.now() };
  }

  /* ------------------------------------------------------------------ *
   * Host + pipeline
   * ------------------------------------------------------------------ */

  /* ------------------------------------------------------------------ *
   * Independent connection checks (AE bridge ≠ Ollama)
   * ------------------------------------------------------------------ */
  function ollamaBaseUrl() {
    var ai = localAI();
    if (ai && typeof ai.getOllamaUrl === 'function') return ai.getOllamaUrl();
    return 'http://localhost:11434';
  }

  /**
   * Probe Ollama only via its HTTP API. Never infers status from AE.
   */
  function checkOllamaStatus() {
    var base = ollamaBaseUrl().replace(/\/$/, '');
    var url = base + '/api/tags';
    logDev('Ollama check →', url);

    var installedProbe = Promise.resolve(false);
    var ai = localAI();
    if (ai && typeof ai.checkExecutableViaNode === 'function') {
      installedProbe = ai.checkExecutableViaNode().catch(function () {
        return false;
      });
    }

    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () {
      try {
        if (controller) controller.abort();
      } catch (e) {}
    }, 4000);

    var fetchOpts = { method: 'GET' };
    if (controller) fetchOpts.signal = controller.signal;

    return Promise.all([
      installedProbe,
      fetch(url, fetchOpts)
        .then(function (res) {
          clearTimeout(timer);
          if (!res.ok) {
            return { running: false, models: [], version: '', httpStatus: res.status };
          }
          return res.json().then(function (data) {
            var models = (data && data.models) || [];
            return { running: true, models: models, version: '', httpStatus: res.status };
          });
        })
        .catch(function (err) {
          clearTimeout(timer);
          return { running: false, models: [], version: '', error: err && err.message ? err.message : String(err) };
        })
    ]).then(function (pair) {
      var installed = !!pair[0];
      var remote = pair[1] || {};
      var models = remote.models || [];
      var names = models
        .map(function (m) {
          return m && m.name ? String(m.name) : '';
        })
        .filter(Boolean);

      var status;
      var error = '';
      var detail = '';

      if (remote.running) {
        installed = true; // responding API implies install
        if (names.length === 0) {
          status = 'no-models';
          error = 'Ollama is running but no models are installed.';
          detail = 'Pull a model, e.g. in a terminal: ollama pull llama3.2';
        } else {
          status = 'ready';
          detail = names.length + ' model(s): ' + names.slice(0, 4).join(', ') + (names.length > 4 ? '…' : '');
        }
      } else if (installed) {
        status = 'not-running';
        error = 'Ollama is installed but the local server is not running.';
        detail = 'Start it with: ollama serve  (or open the Ollama app), then press Retry.';
      } else {
        status = 'not-installed';
        error = 'Ollama was not detected on this machine.';
        detail = 'Install from https://ollama.com/download then start the app.';
      }

      state.ollama = {
        checking: false,
        installed: installed,
        running: !!remote.running,
        models: models,
        modelNames: names,
        version: remote.version || '',
        error: error,
        detail: detail,
        status: status
      };
      logDev('Ollama status =', status, 'models=', names.length);
      return state.ollama;
    });
  }

  function hostLabel(kind) {
    if (kind === 'premiere') return 'Premiere Pro';
    if (kind === 'aftereffects') return 'After Effects';
    return 'Adobe host';
  }

  function timelineWord(kind, hostKind) {
    if (kind === 'sequence' || hostKind === 'premiere') return 'sequence';
    return 'composition';
  }

  function syncLegacyAeFromHost() {
    state.ae = {
      checking: state.host.checking,
      bridge: state.host.bridge,
      hostKind: state.host.hostKind,
      hasComp: state.host.hasTimeline,
      compName: state.host.timelineName,
      error: state.host.error,
      detail: state.host.detail
    };
  }

  /**
   * Probe the Adobe host that owns this CEP panel (Premiere OR After Effects).
   * CEP loads inside one host process — we never fake the other app as connected.
   * Ollama is checked separately and must never affect these fields.
   */
  function checkHostStatus() {
    logDev('Host bridge check…');
    var b = bridge();
    if (!b || typeof b.invoke !== 'function') {
      state.host = {
        checking: false,
        bridge: false,
        hostKind: '',
        preferredHost: state.host.preferredHost || '',
        hasTimeline: false,
        timelineName: '',
        timelineKind: '',
        sequences: [],
        error: 'Scripting bridge is not available.',
        detail: 'Open Adobe Premiere Pro or After Effects and load Window → Extensions → SFX Composer.'
      };
      syncLegacyAeFromHost();
      logDev('Host status = no-bridge');
      return Promise.resolve(state.host);
    }

    var handshake = b.invoke('system.handshake', { nonce: 'scene-ai-' + Date.now() }).catch(function (err) {
      return { __error: err };
    });

    return handshake.then(function (hs) {
      if (hs && hs.__error) {
        state.host = {
          checking: false,
          bridge: false,
          hostKind: '',
          preferredHost: state.host.preferredHost || '',
          hasTimeline: false,
          timelineName: '',
          timelineKind: '',
          sequences: [],
          error: 'Could not reach the Adobe scripting bridge.',
          detail: (hs.__error && hs.__error.message) || 'Is Premiere Pro or After Effects running with SFX Composer?'
        };
        syncLegacyAeFromHost();
        logDev('Host handshake failed', state.host.detail);
        return state.host;
      }

      var hostKind = (hs && (hs.hostKind || hs.host)) || '';
      return invokeAnalysis(b)
        .then(function (analysis) {
          var present = !!(analysis && analysis.present);
          var kind = (analysis && analysis.kind) || (hostKind === 'premiere' ? 'sequence' : 'composition');
          var word = timelineWord(kind, hostKind || (analysis && analysis.host));
          state.host = {
            checking: false,
            bridge: true,
            hostKind: hostKind || (analysis && analysis.host) || '',
            preferredHost: hostKind || (analysis && analysis.host) || state.host.preferredHost || '',
            hasTimeline: present,
            timelineName: present ? analysis.name || '' : '',
            timelineKind: kind,
            sequences: (analysis && analysis.sequences) || [],
            error: present ? '' : 'No active ' + word + '.',
            detail: present
              ? 'Connected to ' +
                hostLabel(hostKind || analysis.host) +
                ' — ' +
                word +
                ' “' +
                (analysis.name || 'Untitled') +
                '”.'
              : 'Bridge is connected to ' +
                hostLabel(hostKind) +
                ', but no active ' +
                word +
                ' is open. Open a ' +
                word +
                ' and press Retry.'
          };
          if (present) state.comp = analysis;
          syncLegacyAeFromHost();
          logDev('Host status ok', state.host.hostKind, 'timeline=', present, state.host.timelineName);
          return state.host;
        })
        .catch(function (err) {
          var msg = err && err.message ? err.message : String(err);
          var noTl =
            /no active|no-active|composition|sequence|timeline/i.test(msg) ||
            (err && err.code === 'host/no-active-timeline');
          var word = hostKind === 'premiere' ? 'sequence' : 'composition';
          state.host = {
            checking: false,
            bridge: true,
            hostKind: hostKind,
            preferredHost: hostKind || state.host.preferredHost || '',
            hasTimeline: false,
            timelineName: '',
            timelineKind: hostKind === 'premiere' ? 'sequence' : 'composition',
            sequences: [],
            error: noTl ? 'No active ' + word + '.' : 'Timeline analysis failed.',
            detail: noTl
              ? 'Open a ' + word + ' in ' + hostLabel(hostKind) + ', then press Retry.'
              : msg
          };
          syncLegacyAeFromHost();
          logDev('Host analysis error', msg);
          return state.host;
        });
    });
  }

  // Back-compat name used by refreshConnections
  function checkAfterEffectsStatus() {
    return checkHostStatus();
  }

  function refreshConnections() {
    state.ae.checking = true;
    state.ollama.checking = true;
    state.connectionsReady = false;
    render();

    return Promise.all([checkAfterEffectsStatus(), checkOllamaStatus()])
      .then(function () {
        state.connectionsReady = true;
        logDev('Connections refreshed', {
          aeBridge: state.ae.bridge,
          aeComp: state.ae.hasComp,
          ollama: state.ollama.status
        });
        render();
      })
      .catch(function (err) {
        logDev('refreshConnections error', err);
        state.connectionsReady = true;
        render();
      });
  }

  function canAnalyzeComposition() {
    // Needs host bridge + active sequence (PPro) or composition (AE).
    return !!(state.host.bridge && state.host.hasTimeline && !state.busy);
  }

  function canUseLocalAI() {
    return state.ollama.status === 'ready' && state.ollama.modelNames.length > 0;
  }

  function analyzeComposition() {

    var b = bridge();
    if (!b || typeof b.invoke !== 'function') {
      return Promise.reject(new Error('Host bridge is not available. Open Premiere Pro or After Effects with SFX Composer.'));
    }
    return invokeAnalysis(b).then(function (res) {
      if (!res || res.present === false) {
        var hk = (res && res.host) || state.host.hostKind;
        var word = hk === 'premiere' ? 'sequence' : 'composition';
        throw new Error('No active ' + word + '. Open a ' + word + ' in ' + hostLabel(hk) + ' and try again.');
      }
      return res;
    });
  }

  function runPipeline() {
    if (state.busy) return;

    // Gate on AE composition only — never blame Ollama for missing comps.
    if (!state.host.bridge) {
      state.phase = 'error';
      state.message =
        'Adobe host bridge is not connected. ' +
        (state.host.detail || 'Open Premiere Pro or After Effects with SFX Composer, then press Retry.');
      logDev('runPipeline blocked: no host bridge');
      render();
      return;
    }
    if (!state.host.hasTimeline) {
      var w = timelineWord(state.host.timelineKind, state.host.hostKind);
      state.phase = 'error';
      state.message =
        'No active ' +
        w +
        ' in ' +
        hostLabel(state.host.hostKind) +
        '. Open a ' +
        w +
        ', then press Analyze.';
      logDev('runPipeline blocked: no active timeline');
      render();
      return;
    }

    state.busy = true;
    state.cancelled = false;
    state.phase = 'analyzing';
    state.message =
      'Reading ' +
      timelineWord(state.host.timelineKind, state.host.hostKind) +
      ' from ' +
      hostLabel(state.host.hostKind) +
      '…';
    state.plan = null;
    render();

    analyzeComposition()
      .then(function (comp) {
        if (state.cancelled) throw new Error('Cancelled.');
        state.comp = comp;
        state.scenes = segmentScenes(comp);
        state.message =
          'Found ' +
          state.scenes.length +
          ' scene segment(s) in “' +
          (comp.name || 'Comp') +
          '” (' +
          fmtTime(comp.durationSeconds) +
          '). Searching library…';
        render();
        return gatherHints(state.scenes);
      })
      .then(function (hints) {
        if (state.cancelled) throw new Error('Cancelled.');
        state.phase = 'planning';
        state.message = 'Generating sound design plan with local AI…';
        render();

        var ai = localAI();
        var lib = library();
        var hasLib = lib && typeof lib.entries === 'function' && (lib.entries() || []).length > 0;

        if (!hasLib) {
          // Still allow a structural plan shell with empty events
          state.plan = {
            scenes: state.scenes.map(function (sc) {
              return {
                id: sc.id,
                start: sc.start,
                end: sc.end,
                description: sc.description,
                layerNames: sc.layerNames,
                events: []
              };
            }),
            generatedAt: Date.now(),
            warning: 'SFX library is empty or not loaded — add library folders in Settings.'
          };
          state.phase = 'ready';
          state.message = state.plan.warning;
          state.busy = false;
          render();
          return null;
        }

        function finishWithHeuristic() {
          // Deterministic fallback when Ollama is offline
          var scenes = state.scenes.map(function (sc) {
            var q = sc.layerNames.join(' ') || 'cinematic whoosh impact';
            var matches = searchLibrary(q, 3);
            var events = matches.slice(0, 2).map(function (m, idx) {
              return {
                id: sc.id + '-e' + (idx + 1),
                path: m.path,
                name: m.name,
                reason: 'Matched library search for scene layers',
                role: idx === 0 ? 'whoosh' : 'impact',
                offsetSeconds: idx === 0 ? 0 : Math.min(0.4, (sc.end - sc.start) * 0.3),
                absSeconds: sc.start + (idx === 0 ? 0 : Math.min(0.4, (sc.end - sc.start) * 0.3)),
                gainDb: idx === 0 ? -3 : 0,
                included: true,
                confidence: Math.min(1, m.score / 12)
              };
            });
            return {
              id: sc.id,
              start: sc.start,
              end: sc.end,
              description: sc.description,
              layerNames: sc.layerNames,
              events: events
            };
          });
          state.plan = {
            scenes: scenes,
            generatedAt: Date.now(),
            warning: 'Local AI unavailable — used library keyword matching only.'
          };
          state.phase = 'ready';
          state.message = state.plan.warning;
          state.busy = false;
          render();
        }

        // Ollama is independent: if not ready, use library heuristics and say so.
        // Never report this as an After Effects / composition failure.
        if (!canUseLocalAI() || !ai || typeof ai.generate !== 'function') {
          logDev('Local AI not ready (status=' + state.ollama.status + ') — heuristic plan');
          finishWithHeuristic();
          if (state.plan) {
            var oMsg =
              state.ollama.status === 'not-installed'
                ? 'Ollama is not installed — plan used library keyword matching only.'
                : state.ollama.status === 'not-running'
                  ? 'Ollama is not running — plan used library keyword matching only. Start Ollama and Regenerate for AI planning.'
                  : state.ollama.status === 'no-models'
                    ? 'Ollama has no models — plan used library keyword matching only. Run: ollama pull llama3.2'
                    : 'Local AI unavailable — plan used library keyword matching only.';
            state.plan.warning = oMsg;
            state.message = oMsg;
          }
          return null;
        }

        var readyPromise = Promise.resolve(true);

        return readyPromise.then(function (ok) {
          if (state.cancelled) throw new Error('Cancelled.');
          if (ok === false) {
            finishWithHeuristic();
            return null;
          }
          var prompt = buildPlannerPrompt(state.comp, state.scenes, hints);
          return ai
            .generate(prompt, { format: 'json', temperature: 0.2, timeoutMs: 90000 })
            .then(function (raw) {
              if (state.cancelled) throw new Error('Cancelled.');
              var plan = parsePlan(raw, state.scenes, hints);
              if (!plan) {
                finishWithHeuristic();
                return;
              }
              state.plan = plan;
              state.phase = 'ready';
              state.message = 'Plan ready — review events, then Approve & Add to After Effects.';
              state.busy = false;
              render();
            })
            .catch(function () {
              finishWithHeuristic();
            });
        });
      })
      .catch(function (err) {
        state.busy = false;
        state.phase = 'error';
        var msg = err && err.message ? err.message : String(err);
        // Keep AE vs Ollama errors distinct in the UI message.
        if (/ollama|ECONNREFUSED|fetch/i.test(msg) && !/composition/i.test(msg)) {
          msg = 'Ollama request failed (After Effects connection is separate): ' + msg;
        }
        state.message = msg;
        logDev('runPipeline error', msg);
        render();
      });
  }

  function applyPlan() {
    if (!state.plan || state.busy) return;
    var events = [];
    state.plan.scenes.forEach(function (sc) {
      (sc.events || []).forEach(function (ev) {
        if (ev.included && ev.path) events.push(ev);
      });
    });
    // A plan can contain repeated AI suggestions for the same source at the
    // same frame. Do not turn that into stacked, louder duplicate audio.
    var seenPlacements = Object.create(null);
    events = events.filter(function (ev) {
      var key = String(ev.path) + '@' + Math.round((Number(ev.absSeconds) || 0) * 1000);
      if (seenPlacements[key]) return false;
      seenPlacements[key] = true;
      return true;
    });
    if (!events.length) {
      state.message = 'No events selected to place.';
      render();
      return;
    }

    var b = bridge();
    if (!b) {
      state.message = 'Host bridge unavailable.';
      render();
      return;
    }

    state.busy = true;
    state.phase = 'applying';
    state.message = 'Placing ' + events.length + ' sound(s) into ' + hostLabel(state.host.hostKind) + '…';
    render();

    var runId = RUN_PREFIX + Date.now().toString(36);
    var chain = Promise.resolve({ ok: 0, fail: 0 });
    events.forEach(function (ev) {
      chain = chain.then(function (acc) {
        if (state.cancelled) return acc;
        return b
          .invoke('sfx.import', {
            path: ev.path,
            startSeconds: ev.absSeconds,
            atPlayhead: false,
            snapToFrame: true,
            gainDb: ev.gainDb || 0,
            runId: runId,
            preventDuplicate: true
          })
          .then(function (res) {
            if (res && res.placed) {
              acc.ok += 1;
              try {
                if (window.__sfxAnalytics && window.__sfxAnalytics.track) {
                  window.__sfxAnalytics.track('sound_imported', {
                    path: ev.path,
                    name: ev.name,
                    placed: true
                  });
                }
              } catch (e) {}
            } else if (res && res.duplicate) {
              logDev('Skipped duplicate placement', ev.path, ev.absSeconds);
            } else acc.fail += 1;
            state.message = 'Placed ' + acc.ok + ' / ' + events.length + '…';
            render();
            return acc;
          })
          .catch(function () {
            acc.fail += 1;
            return acc;
          });
      });
    });

    chain.then(function (acc) {
      state.busy = false;
      state.phase = 'ready';
      state.message =
        'Done: ' +
        acc.ok +
        ' placed' +
        (acc.fail ? ', ' + acc.fail + ' failed' : '') +
        '. Use Edit > Undo in ' + hostLabel(state.host.hostKind) + ' if needed.';
      render();
    });
  }

  /* ------------------------------------------------------------------ *
   * UI
   * ------------------------------------------------------------------ */
  function setOpen(opening) {
    if (!panel) build();
    if (opening) {
      panel.classList.add('is-open');
      render();
      refreshConnections();
    } else {
      panel.classList.remove('is-open');
    }
    if (window.__sfxHeaderMenu && window.__sfxHeaderMenu.refresh) {
      try {
        window.__sfxHeaderMenu.refresh();
      } catch (e) {}
    }
  }

  function build() {
    if (panel) return;
    panel = el('div', 'sfx-sd');
    panel.id = 'sfx-scene-designer';

    var header = el('div', 'sfx-sd__header');
    var back = el('button', 'sfx-sd__back');
    back.type = 'button';
    back.innerHTML = ICON.back + '<span>Back</span>';
    back.addEventListener('click', function () {
      setOpen(false);
    });
    header.appendChild(back);
    var title = el('div', 'sfx-sd__title');
    title.innerHTML = ICON.film + '<span>Scene Sound Designer</span>';
    header.appendChild(title);
    panel.appendChild(header);

    bodyEl = el('div', 'sfx-sd__body');
    panel.appendChild(bodyEl);
    document.body.appendChild(panel);

    window.__sfxSceneDesigner = {
      isOpen: function () {
        return panel.classList.contains('is-open');
      },
      setOpen: setOpen
    };
  }

  function previewPath(path) {
    var a = audio();
    if (a && typeof a.playNow === 'function') {
      try {
        a.playNow({ path: path, id: path });
      } catch (e) {}
    }
    try {
      if (window.__sfxAnalytics && window.__sfxAnalytics.track) {
        window.__sfxAnalytics.track('sound_played', { path: path, id: path });
      }
    } catch (e2) {}
  }

  function statusDotClass(ok, checking, warn) {
    if (checking) return 'is-checking';
    if (ok) return 'is-ok';
    if (warn) return 'is-warn';
    return 'is-bad';
  }

  function renderConnectionCard(title, opts) {
    var card = el('div', 'sfx-sd__conn');
    var head = el('div', 'sfx-sd__conn-head');
    var dot = el('span', 'sfx-sd__dot ' + statusDotClass(opts.ok, opts.checking, opts.warn));
    head.appendChild(dot);
    head.appendChild(el('strong', '', title));
    var label = el('span', 'sfx-sd__conn-state', opts.checking ? 'Checking…' : opts.stateLabel);
    head.appendChild(label);
    card.appendChild(head);
    if (opts.detail) card.appendChild(el('div', 'sfx-sd__conn-detail', opts.detail));
    if (opts.error && !opts.ok) card.appendChild(el('div', 'sfx-sd__conn-error', opts.error));
    if (opts.actions && opts.actions.length) {
      var row = el('div', 'sfx-sd__conn-actions');
      opts.actions.forEach(function (a) {
        var b = el('button', 'sfx-sd__btn sfx-sd__btn--small', a.label);
        b.type = 'button';
        b.disabled = !!a.disabled;
        b.addEventListener('click', a.onClick);
        row.appendChild(b);
      });
      card.appendChild(row);
    }
    return card;
  }

  function render() {
    if (!bodyEl) return;
    bodyEl.innerHTML = '';

    /* ---- Independent connection status ---- */
    var connWrap = el('div', 'sfx-sd__connections');

    var h = state.host;
    var hostOk = h.bridge && h.hasTimeline;
    var hostWarn = h.bridge && !h.hasTimeline;
    var word = timelineWord(h.timelineKind, h.hostKind);
    var hostTitle =
      h.hostKind === 'premiere'
        ? 'Premiere Pro'
        : h.hostKind === 'aftereffects'
          ? 'After Effects'
          : 'Adobe Host (PPro / AE)';
    var hostLabelState = h.checking
      ? 'Checking…'
      : !h.bridge
        ? 'Disconnected'
        : h.hasTimeline
          ? 'Connected'
          : 'No ' + word;
    connWrap.appendChild(
      renderConnectionCard(hostTitle, {
        checking: h.checking,
        ok: hostOk,
        warn: hostWarn,
        stateLabel: hostLabelState,
        detail: h.detail || '',
        error: h.error,
        actions: [
          {
            label: 'Retry',
            onClick: function () {
              refreshConnections();
            }
          }
        ]
      })
    );

    // Terminology strip + detected app (CEP is always one host process)
    var appStrip = el('div', 'sfx-sd__appstrip');
    appStrip.appendChild(
      el(
        'div',
        'sfx-sd__appstrip-text',
        h.bridge
          ? 'Active application: ' +
            hostLabel(h.hostKind) +
            ' · Working with: ' +
            word +
            (h.timelineName ? ' “' + h.timelineName + '”' : '')
          : 'Open SFX Composer inside Premiere Pro or After Effects. CEP panels attach to one host at a time — this panel reports the app that loaded it, never the other.'
      )
    );
    if (h.sequences && h.sequences.length > 1) {
      appStrip.appendChild(
        el(
          'div',
          'sfx-sd__appstrip-text',
          'Sequences in project: ' + h.sequences.slice(0, 8).join(', ') + (h.sequences.length > 8 ? '…' : '') +
            ' — activate the desired sequence in Premiere, then Retry.'
        )
      );
    }
    bodyEl.appendChild(appStrip);

    var o = state.ollama;
    var oOk = o.status === 'ready';
    var oWarn = o.status === 'no-models' || o.status === 'not-running';
    var oLabel =
      o.checking
        ? 'Checking…'
        : o.status === 'ready'
          ? 'Ready'
          : o.status === 'no-models'
            ? 'No models'
            : o.status === 'not-running'
              ? 'Not running'
              : o.status === 'not-installed'
                ? 'Not installed'
                : 'Unavailable';
    var oActions = [
      {
        label: 'Retry',
        onClick: function () {
          refreshConnections();
        }
      }
    ];
    if (o.status === 'not-installed') {
      oActions.push({
        label: 'Install Ollama',
        onClick: function () {
          var ai = localAI();
          if (ai && typeof ai.openDownloadPage === 'function') ai.openDownloadPage();
          else window.open('https://ollama.com/download', '_blank', 'noopener,noreferrer');
        }
      });
    }
    connWrap.appendChild(
      renderConnectionCard('Ollama (local AI)', {
        checking: o.checking,
        ok: oOk,
        warn: oWarn,
        stateLabel: oLabel,
        detail: o.detail || 'Endpoint: ' + ollamaBaseUrl() + '/api/tags',
        error: o.error,
        actions: oActions
      })
    );
    bodyEl.appendChild(connWrap);

    // Intro / actions
    var toolbar = el('div', 'sfx-sd__toolbar');
    var analyzeBtn = el('button', 'sfx-sd__btn sfx-sd__btn--primary');
    analyzeBtn.type = 'button';
    // Analyze needs AE + active composition. Ollama is optional (heuristic fallback).
    analyzeBtn.disabled = state.busy || !canAnalyzeComposition();
    analyzeBtn.title = !state.host.bridge
      ? 'Adobe host bridge is not connected'
      : !state.host.hasTimeline
        ? 'Open an active ' + timelineWord(state.host.timelineKind, state.host.hostKind) + ' in ' + hostLabel(state.host.hostKind)
        : canUseLocalAI()
          ? 'Analyze ' + timelineWord(state.host.timelineKind, state.host.hostKind) + ' and plan with local AI'
          : 'Analyze ' + timelineWord(state.host.timelineKind, state.host.hostKind) + ' (library matching only until Ollama is ready)';
    analyzeBtn.textContent = state.plan ? 'Regenerate Plan' : 'Analyze Composition';
    analyzeBtn.addEventListener('click', function () {
      runPipeline();
    });
    toolbar.appendChild(analyzeBtn);

    if (state.busy) {
      var cancel = el('button', 'sfx-sd__btn', 'Cancel');
      cancel.type = 'button';
      cancel.addEventListener('click', function () {
        state.cancelled = true;
        state.busy = false;
        state.phase = 'idle';
        state.message = 'Cancelled.';
        render();
      });
      toolbar.appendChild(cancel);
    }

    if (state.plan && !state.busy) {
      var apply = el('button', 'sfx-sd__btn sfx-sd__btn--accent', 'Approve & Add to After Effects');
      apply.type = 'button';
      apply.addEventListener('click', applyPlan);
      toolbar.appendChild(apply);
    }
    bodyEl.appendChild(toolbar);

    if (state.message) {
      var status = el('div', 'sfx-sd__status' + (state.phase === 'error' ? ' is-error' : ''));
      status.textContent = state.message;
      bodyEl.appendChild(status);
    }

    /* ---- AI Timeline Control ---- */
    (function renderAiControl() {
      var tc = window.__sfxTimelineControl;
      var box = el('div', 'sfx-sd__ai-control');
      box.appendChild(el('h3', 'sfx-sd__h', 'AI Timeline Control'));
      var hint = el(
        'div',
        'sfx-sd__note',
        'Commands run through a restricted op list (playhead, transport, library search, place audio) and are verified with the host. Write ops need approval.'
      );
      box.appendChild(hint);

      var row = el('div', 'sfx-sd__ai-row');
      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'sfx-sd__ai-input';
      input.placeholder = 'e.g. Seek to 00:05 · Play · Find whoosh · Add impact at 00:10';
      input.value = (tc && tc.getState().input) || '';
      row.appendChild(input);
      var go = el('button', 'sfx-sd__btn sfx-sd__btn--primary', 'Run');
      go.type = 'button';
      go.addEventListener('click', function () {
        if (!tc) {
          state.message = 'Timeline control module not loaded.';
          render();
          return;
        }
        var textCmd = input.value.trim();
        if (!textCmd) return;
        tc.getState().input = textCmd;
        state.message = 'Running command…';
        render();
        tc.handle(textCmd)
          .then(function (result) {
            if (result.needsApproval) {
              state.message = 'Plan ready — approve to place audio on the timeline.';
            } else {
              state.message = 'Command finished. See execution log.';
            }
            render();
          })
          .catch(function (err) {
            state.message = err && err.message ? err.message : String(err);
            render();
          });
      });
      row.appendChild(go);
      box.appendChild(row);

      var quick = el('div', 'sfx-sd__ai-quick');
      [
        ['Playhead 0', 'Seek to 00:00'],
        ['Play', 'Play'],
        ['Pause', 'Pause'],
        ['Inspect', 'What is on the timeline?']
      ].forEach(function (pair) {
        var b = el('button', 'sfx-sd__btn sfx-sd__btn--small', pair[0]);
        b.type = 'button';
        b.addEventListener('click', function () {
          input.value = pair[1];
          go.click();
        });
        quick.appendChild(b);
      });
      box.appendChild(quick);

      if (tc) {
        var st = tc.getState();
        if (st.pendingPlan && st.pendingPlan.pendingPlace) {
          var pend = st.pendingPlan.pendingPlace;
          var approveBox = el('div', 'sfx-sd__status');
          approveBox.textContent =
            'Pending: place “' +
            (pend.name || pend.path) +
            '” at ' +
            Number(pend.seconds).toFixed(2) +
            's';
          box.appendChild(approveBox);
          var ap = el('button', 'sfx-sd__btn sfx-sd__btn--accent', 'Approve & place');
          ap.type = 'button';
          ap.addEventListener('click', function () {
            tc.approve()
              .then(function (res) {
                state.message = res.message || (res.ok ? 'Placed.' : 'Failed.');
                render();
              })
              .catch(function (err) {
                state.message = err.message || String(err);
                render();
              });
          });
          box.appendChild(ap);
        }
        var logBox = el('div', 'sfx-sd__ai-log');
        (st.log || []).slice(0, 8).forEach(function (entry) {
          logBox.appendChild(
            el('div', 'sfx-sd__ai-log-line' + (entry.level === 'error' ? ' is-error' : ''), entry.line)
          );
        });
        box.appendChild(logBox);

        if (st.lastTimeline && st.lastTimeline.present) {
          box.appendChild(
            el(
              'div',
              'sfx-sd__note',
              'Host timeline: “' +
                (st.lastTimeline.name || '') +
                '” · playhead ' +
                Number(st.lastTimeline.playheadSeconds || 0).toFixed(2) +
                's / ' +
                Number(st.lastTimeline.durationSeconds || 0).toFixed(2) +
                's'
            )
          );
        }
      } else {
        box.appendChild(el('div', 'sfx-sd__muted', 'timeline-control.js not loaded'));
      }
      bodyEl.appendChild(box);
    })();


    // Comp summary
    if (state.comp && state.comp.present) {
      var sum = el('div', 'sfx-sd__summary');
      var hk = state.comp.host || state.host.hostKind;
      var kind = state.comp.kind || (hk === 'premiere' ? 'sequence' : 'composition');
      var label = kind === 'sequence' ? 'Sequence' : 'Composition';
      var layerWord = kind === 'sequence' ? 'clips' : 'layers';
      var layerN =
        state.comp.layerCount != null
          ? state.comp.layerCount
          : (state.comp.layers || []).length;
      if (kind === 'sequence' && state.comp.videoTracks) {
        layerN =
          (state.comp.videoTracks || []).reduce(function (n, t) {
            return n + ((t.clips && t.clips.length) || 0);
          }, 0) +
          ' video / ' +
          (state.comp.audioTracks || []).reduce(function (n, t) {
            return n + ((t.clips && t.clips.length) || 0);
          }, 0) +
          ' audio';
      }
      sum.appendChild(
        el(
          'div',
          '',
          hostLabel(hk) +
            ' · ' +
            label +
            ': ' +
            (state.comp.name || '—') +
            ' · ' +
            fmtTime(state.comp.durationSeconds) +
            ' · ' +
            Math.round(state.comp.frameRate || 0) +
            ' fps' +
            (state.comp.width ? ' · ' + state.comp.width + '×' + state.comp.height : '') +
            ' · ' +
            layerN +
            (typeof layerN === 'number' ? ' ' + layerWord : '')
        )
      );
      sum.appendChild(
        el(
          'div',
          'sfx-sd__note',
          kind === 'sequence'
            ? 'Premiere analysis uses sequence tracks and clip names/timing (not AE layer APIs). Pixel vision needs a frame-export pipeline. Sounds come only from your local library.'
            : 'After Effects analysis uses composition layers, names and timing. Pixel vision needs a render pipeline. Sounds come only from your local library.'
        )
      );
      bodyEl.appendChild(sum);
    }

    if (!state.plan) {
      if (!state.busy && state.phase === 'idle') {
        var empty = el('div', 'sfx-sd__empty');
        empty.appendChild(el('h2', '', 'Design sound for the active sequence or composition'));
        empty.appendChild(
          el(
            'p',
            '',
            'Open a sequence in Premiere Pro or a composition in After Effects (with this panel loaded inside that app). Scan your SFX library and optionally run Ollama, then press Analyze Composition.'
          )
        );
        bodyEl.appendChild(empty);
      }
      return;
    }

    // Plan scenes
    state.plan.scenes.forEach(function (sc) {
      var card = el('div', 'sfx-sd__scene');
      var head = el('div', 'sfx-sd__scene-head');
      head.appendChild(el('strong', '', sc.id.toUpperCase() + ' · ' + fmtTime(sc.start) + '–' + fmtTime(sc.end)));
      head.appendChild(el('span', 'sfx-sd__scene-desc', sc.description || ''));
      card.appendChild(head);
      if (sc.layerNames && sc.layerNames.length) {
        card.appendChild(el('div', 'sfx-sd__layers', 'Layers: ' + sc.layerNames.slice(0, 8).join(', ')));
      }

      if (!sc.events.length) {
        card.appendChild(el('div', 'sfx-sd__muted', 'No matching library sounds for this scene.'));
      } else {
        sc.events.forEach(function (ev) {
          var row = el('div', 'sfx-sd__event' + (ev.included ? '' : ' is-off'));
          var check = document.createElement('input');
          check.type = 'checkbox';
          check.checked = !!ev.included;
          check.addEventListener('change', function () {
            ev.included = check.checked;
            render();
          });
          row.appendChild(check);
          var meta = el('div', 'sfx-sd__event-meta');
          meta.appendChild(el('div', 'sfx-sd__event-name', ev.name));
          meta.appendChild(
            el(
              'div',
              'sfx-sd__event-sub',
              fmtTime(ev.absSeconds) +
                ' · ' +
                (ev.role || '') +
                (ev.reason ? ' — ' + ev.reason : '') +
                ' · ' +
                (ev.gainDb || 0) +
                ' dB'
            )
          );
          row.appendChild(meta);
          var prev = el('button', 'sfx-sd__icon-btn');
          prev.type = 'button';
          prev.title = 'Preview';
          prev.innerHTML = ICON.play;
          prev.addEventListener('click', function () {
            previewPath(ev.path);
          });
          row.appendChild(prev);
          var gain = document.createElement('input');
          gain.type = 'range';
          gain.min = '-18';
          gain.max = '6';
          gain.step = '1';
          gain.value = String(ev.gainDb || 0);
          gain.title = 'Gain dB';
          gain.addEventListener('input', function () {
            ev.gainDb = Number(gain.value);
          });
          row.appendChild(gain);
          card.appendChild(row);
        });
      }
      bodyEl.appendChild(card);
    });
  }

  function start() {
    build();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
