/*
  SFX Composer — AI Timeline Control Engine

  Restricted command bus. The LLM may only propose ops from ALLOWED_OPS.
  Each op is validated, executed via host adapters (sfxbox.jsx), then verified.
*/
(function () {
  'use strict';

  var ALLOWED_OPS = {
    get_timeline_state: { risk: 'read', immediate: true },
    set_playhead: { risk: 'safe', immediate: true },
    play: { risk: 'safe', immediate: true },
    pause: { risk: 'safe', immediate: true },
    stop: { risk: 'safe', immediate: true },
    place_audio: { risk: 'write', immediate: false },
    search_library: { risk: 'read', immediate: true }
  };

  function bridge() {
    var s = window.__sfxServices;
    return s && s.bridge ? s.bridge : null;
  }

  function log(line, level) {
    var entry = { t: Date.now(), level: level || 'info', line: String(line) };
    state.log.unshift(entry);
    if (state.log.length > 80) state.log.length = 80;
    if (window.__sfxDebug && window.__sfxDebug[level || 'info']) {
      try {
        window.__sfxDebug[level || 'info']('timeline-control: ' + line);
      } catch (e) {}
    }
    return entry;
  }

  var state = {
    busy: false,
    lastTimeline: null,
    pendingPlan: null,
    log: [],
    input: ''
  };

  function invoke(cmd, params) {
    var b = bridge();
    if (!b || typeof b.invoke !== 'function') {
      return Promise.reject(new Error('Host bridge unavailable. Open SFX Composer inside Premiere Pro or After Effects.'));
    }
    return b.invoke(cmd, params || {});
  }

  function getTimelineState() {
    return invoke('timeline.state', {}).then(function (res) {
      state.lastTimeline = res;
      return res;
    });
  }

  function verifyPlayhead(expected, tolerance) {
    tolerance = tolerance == null ? 0.15 : tolerance;
    return getTimelineState().then(function (tl) {
      var now = Number(tl && tl.playheadSeconds);
      if (!isFinite(now)) {
        return { ok: false, message: 'Could not read playhead after command.' };
      }
      if (expected != null && Math.abs(now - expected) > tolerance) {
        return {
          ok: false,
          message: 'Playhead is at ' + now.toFixed(2) + 's (expected ~' + expected.toFixed(2) + 's).'
        };
      }
      return { ok: true, playheadSeconds: now, timeline: tl };
    });
  }

  function executeOp(op) {
    var type = op && op.op;
    if (!type || !ALLOWED_OPS[type]) {
      return Promise.resolve({ ok: false, message: 'Unsupported or disallowed operation: ' + type });
    }

    if (type === 'get_timeline_state') {
      return getTimelineState().then(function (tl) {
        var present = !!(tl && tl.present);
        return {
          ok: present,
          message: present
            ? 'Active ' +
              (tl.kind || 'timeline') +
              ': “' +
              (tl.name || '') +
              '” @ ' +
              Number(tl.playheadSeconds || 0).toFixed(2) +
              's'
            : 'No active sequence/composition.',
          result: tl
        };
      });
    }

    if (type === 'set_playhead') {
      var sec = Number(op.seconds);
      if (!isFinite(sec) || sec < 0) {
        return Promise.resolve({ ok: false, message: 'Invalid timestamp for set_playhead.' });
      }
      return invoke('playhead.set', { seconds: sec })
        .then(function (res) {
          return verifyPlayhead(sec).then(function (v) {
            if (!v.ok) return v;
            return {
              ok: true,
              message: 'Playhead set to ' + v.playheadSeconds.toFixed(2) + 's (verified).',
              result: res
            };
          });
        })
        .catch(function (err) {
          return { ok: false, message: err && err.message ? err.message : String(err) };
        });
    }

    if (type === 'play' || type === 'pause' || type === 'stop') {
      return invoke('transport.control', { action: type })
        .then(function (res) {
          return { ok: true, message: 'Transport “' + type + '” accepted by host.', result: res };
        })
        .catch(function (err) {
          return {
            ok: false,
            message: (err && err.message) || 'Transport not supported on this host/build.'
          };
        });
    }

    if (type === 'search_library') {
      var q = String(op.query || '');
      var matches = [];
      try {
        if (window.__sfxSceneDesigner && false) {
          /* reserved */
        }
        // Use Essential Sound / Scene search if available via library
        var lib = window.__sfxServices && window.__sfxServices.library;
        if (lib && typeof lib.entries === 'function') {
          var tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
          var entries = lib.entries() || [];
          for (var i = 0; i < entries.length && matches.length < 8; i++) {
            var e = entries[i];
            var hay = String(e.name || e.path || '').toLowerCase();
            var ok = tokens.every(function (t) {
              return hay.indexOf(t) >= 0;
            });
            if (ok) matches.push({ name: e.name, path: e.path || e.id });
          }
        }
      } catch (e) {}
      return Promise.resolve({
        ok: matches.length > 0,
        message: matches.length ? 'Found ' + matches.length + ' library match(es).' : 'No library matches for “' + q + '”.',
        result: { matches: matches }
      });
    }

    if (type === 'place_audio') {
      var path = String(op.path || '');
      var at = Number(op.seconds);
      var gainDb = Number(op.gainDb) || 0;
      if (!path) return Promise.resolve({ ok: false, message: 'place_audio requires a real file path.' });
      if (!isFinite(at) || at < 0) at = 0;
      return invoke('sfx.import', {
        path: path,
        startSeconds: at,
        atPlayhead: false,
        snapToFrame: true,
        gainDb: gainDb
      })
        .then(function (res) {
          if (!res || res.placed !== true) {
            return {
              ok: false,
              message: 'Host did not confirm placement.',
              result: res
            };
          }
          // Verify playhead optional; verify placement fields from host
          return {
            ok: true,
            message:
              'Placed “' +
              (op.name || path) +
              '” at ' +
              Number(res.startSeconds).toFixed(2) +
              's on “' +
              (res.timelineName || 'timeline') +
              '” (host confirmed).',
            result: res
          };
        })
        .catch(function (err) {
          return { ok: false, message: err && err.message ? err.message : String(err) };
        });
    }

    return Promise.resolve({ ok: false, message: 'Unhandled op ' + type });
  }

  function parseTimeToken(str) {
    // 00:05 / 00:05.5 / 5s / 5.2
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

  /** Deterministic NL → ops (no LLM required). LLM optional enrichment later. */
  function planFromText(text) {
    var t = String(text || '').trim();
    var lower = t.toLowerCase();
    var ops = [];
    var needsApproval = false;

    if (/^(play|resume)\b/.test(lower)) ops.push({ op: 'play' });
    else if (/^(pause)\b/.test(lower)) ops.push({ op: 'pause' });
    else if (/^(stop)\b/.test(lower)) ops.push({ op: 'stop' });

    var seek = lower.match(/(?:seek|go to|jump to|playhead(?:\s+to)?|from)\s+(\d{1,2}:\d{2}(?:\.\d+)?|\d+(?:\.\d+)?s?)/i);
    if (seek) {
      var sec = parseTimeToken(seek[1]);
      if (sec != null) ops.push({ op: 'set_playhead', seconds: sec });
    }
    if (/beginning|start of (the )?(sequence|comp|timeline)/i.test(lower)) {
      ops.push({ op: 'set_playhead', seconds: 0 });
    }
    if (/end of (the )?(sequence|comp)/i.test(lower) && state.lastTimeline) {
      ops.push({ op: 'set_playhead', seconds: Number(state.lastTimeline.durationSeconds) || 0 });
    }

    if (/what('s| is) (on )?(the )?(timeline|sequence|composition)|inspect|status|where is the playhead/i.test(lower)) {
      ops.push({ op: 'get_timeline_state' });
    }

    var find = lower.match(/(?:find|search for|look for)\s+(.+)$/i);
    if (find) {
      ops.push({ op: 'search_library', query: find[1].replace(/["']/g, '').trim() });
    }

    var place = lower.match(
      /(?:add|place|put)\s+(?:a\s+)?(.+?)\s+(?:at|@)\s+(\d{1,2}:\d{2}(?:\.\d+)?|\d+(?:\.\d+)?s?)/i
    );
    if (place) {
      needsApproval = true;
      ops.push({
        op: 'search_library',
        query: place[1].replace(/["']/g, '').trim(),
        _placeAt: parseTimeToken(place[2])
      });
      // place_audio filled after search resolves
    }

    var vol = lower.match(/(?:volume|gain).*?(-?\d+(?:\.\d+)?)\s*db/i);
    // volume on existing clips not fully supported — note in plan

    if (!ops.length) {
      // fallback: try library search for whole phrase
      if (t.length >= 3) {
        ops.push({ op: 'search_library', query: t });
        ops.push({ op: 'get_timeline_state' });
      }
    }

    return { ops: ops, needsApproval: needsApproval, source: t, volumeDb: vol ? parseFloat(vol[1]) : null };
  }

  function runPlan(plan, opts) {
    opts = opts || {};
    if (state.busy) return Promise.reject(new Error('Busy'));
    state.busy = true;
    log('Executing plan (' + plan.ops.length + ' step(s))…');

    var chain = Promise.resolve({ results: [] });
    var placeAt = null;
    var gainDb = plan.volumeDb;

    plan.ops.forEach(function (op) {
      chain = chain.then(function (acc) {
        if (op._placeAt != null) placeAt = op._placeAt;
        return executeOp(op).then(function (res) {
          log((res.ok ? 'OK: ' : 'FAIL: ') + res.message, res.ok ? 'info' : 'error');
          acc.results.push({ op: op, res: res });
          // Auto-chain place after search when requested
          if (op.op === 'search_library' && placeAt != null && res.ok && res.result && res.result.matches && res.result.matches[0]) {
            var m = res.result.matches[0];
            var placeOp = {
              op: 'place_audio',
              path: m.path,
              name: m.name,
              seconds: placeAt,
              gainDb: gainDb || 0
            };
            if (opts.skipWrite && ALLOWED_OPS.place_audio.risk === 'write') {
              log('Skipped write op pending approval: place_audio ' + m.name + ' @ ' + placeAt + 's');
              acc.results.push({
                op: placeOp,
                res: { ok: false, message: 'Awaiting approval', pending: true }
              });
              acc.pendingPlace = placeOp;
              return acc;
            }
            return executeOp(placeOp).then(function (pr) {
              log((pr.ok ? 'OK: ' : 'FAIL: ') + pr.message, pr.ok ? 'info' : 'error');
              acc.results.push({ op: placeOp, res: pr });
              return acc;
            });
          }
          return acc;
        });
      });
    });

    return chain
      .then(function (acc) {
        state.busy = false;
        return acc;
      })
      .catch(function (err) {
        state.busy = false;
        log(err && err.message ? err.message : String(err), 'error');
        throw err;
      });
  }

  function handleUserCommand(text) {
    var plan = planFromText(text);
    state.pendingPlan = plan;
    log('Planned from: “' + text + '” → ' + plan.ops.map(function (o) {
      return o.op;
    }).join(', '));

    // Immediate ops only if no write risk
    var hasWrite = plan.ops.some(function (o) {
      return o._placeAt != null || (ALLOWED_OPS[o.op] && ALLOWED_OPS[o.op].risk === 'write');
    });

    if (hasWrite) {
      // Run read parts; keep place pending
      return runPlan(plan, { skipWrite: true }).then(function (acc) {
        if (acc.pendingPlace) {
          state.pendingPlan.pendingPlace = acc.pendingPlace;
          log('Approval required to place audio on the timeline.', 'warn');
        }
        return { plan: plan, acc: acc, needsApproval: true };
      });
    }

    return runPlan(plan, { skipWrite: false }).then(function (acc) {
      return { plan: plan, acc: acc, needsApproval: false };
    });
  }

  function approvePendingPlace() {
    var placeOp = state.pendingPlan && state.pendingPlan.pendingPlace;
    if (!placeOp) return Promise.reject(new Error('Nothing pending approval.'));
    state.busy = true;
    return executeOp(placeOp).then(function (res) {
      state.busy = false;
      log((res.ok ? 'OK: ' : 'FAIL: ') + res.message, res.ok ? 'info' : 'error');
      if (res.ok) state.pendingPlan.pendingPlace = null;
      return res;
    });
  }

  window.__sfxTimelineControl = {
    handle: handleUserCommand,
    approve: approvePendingPlace,
    getState: function () {
      return state;
    },
    getTimelineState: getTimelineState,
    executeOp: executeOp,
    ALLOWED_OPS: ALLOWED_OPS
  };
})();
