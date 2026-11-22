/*
  SFX Composer — Marker Mode (Phase 1).

  Workflow: put markers on the sequence/comp, type an SFX name (or a tag) in
  each marker, press Preview to see what would be placed, then Apply.

  Reuses what the app already has:
    services.bridge   — the same host bridge; placement is the existing
                        'sfx.import' command, now given an explicit start time.
    services.library  — the scanned SFX library (names, folders, tags).

  New host commands (see host/sfxbox.jsx):
    markers.list, markers.mark, markers.restore, markers.undoRun

  Marker text syntax:
      whoosh                 -> a name or tag
      whoosh | vol -6        -> volume in dB
      hit | track 3          -> force audio track A3 (Premiere)
      whoosh 2 | vol -4 | track 3   -> combine them
*/
(function () {
  'use strict';

  var SETTINGS_KEY = 'sfxMarkerModeSettings';
  var LAST_RUN_KEY = 'sfxMarkerLastRun';

  var DEFAULT_SETTINGS = {
    afterPlace: 'green', // 'green' | 'delete' | 'none'
    firstTrack: 2, // Premiere: start looking for a free track at A2
    includePlaced: false
  };

  var ICON = {
    flag:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>',
    undo:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/></svg>',
    settings:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>',
    eye:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    check:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>',
    stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg>',
    copy:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 012-2h9"/></svg>'
  };

  /* ------------------------------------------------------------------ *
   * Settings + last-run persistence
   * ------------------------------------------------------------------ */
  function loadSettings() {
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      return Object.assign({}, DEFAULT_SETTINGS, raw ? JSON.parse(raw) : {});
    } catch (e) {
      return Object.assign({}, DEFAULT_SETTINGS);
    }
  }

  function saveSettings(settings) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      /* best effort */
    }
  }

  function loadLastRun() {
    try {
      var raw = localStorage.getItem(LAST_RUN_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveLastRun(run) {
    try {
      if (run) localStorage.setItem(LAST_RUN_KEY, JSON.stringify(run));
      else localStorage.removeItem(LAST_RUN_KEY);
    } catch (e) {
      /* best effort */
    }
  }

  function debug(level, message, data) {
    if (window.__sfxDebug && typeof window.__sfxDebug[level] === 'function') {
      window.__sfxDebug[level]('marker-mode: ' + message, data);
    }
  }

  /* ------------------------------------------------------------------ *
   * Marker text parsing:  "whoosh 2 | vol -6 | track 3"
   * ------------------------------------------------------------------ */
  function parseMarkerText(raw) {
    var parts = String(raw || '').split('|');
    var result = { query: (parts[0] || '').trim(), volumeDb: null, track: null, notes: [] };
    var i;
    var part;
    var m;

    for (i = 1; i < parts.length; i += 1) {
      part = parts[i].trim();
      if (part === '') continue;

      m = /^vol(?:ume)?\s*([+-]?\d+(?:\.\d+)?)\s*(?:db)?$/i.exec(part);
      if (m) {
        result.volumeDb = Number(m[1]);
        continue;
      }
      m = /^(?:track|trk|a)\s*(\d+)$/i.exec(part);
      if (m && Number(m[1]) >= 1) {
        result.track = Number(m[1]);
        continue;
      }
      result.notes.push('ignored "' + part + '"');
    }
    return result;
  }

  /* ------------------------------------------------------------------ *
   * Matching marker text to the library
   * ------------------------------------------------------------------ */
  function stripExt(name) {
    return String(name || '').replace(/\.(wav|mp3|aif|aiff|flac|ogg|m4a|aac|wma)$/i, '');
  }

  function baseName(path) {
    var clean = String(path || '').replace(/\\/g, '/');
    return clean.substring(clean.lastIndexOf('/') + 1);
  }

  /** "Whoosh_02", "whoosh 2" and "WHOOSH-2" all become "whoosh 2". */
  function normKey(text) {
    var s = stripExt(text).toLowerCase();
    s = s.replace(/([a-z])(\d)/g, '$1 $2').replace(/(\d)([a-z])/g, '$1 $2');
    s = s.replace(/[^a-z0-9\u0080-\uffff]+/g, ' ').trim();
    s = s.replace(/\b0+(\d)/g, '$1');
    return s;
  }

  function tokensOf(key) {
    return key === '' ? [] : key.split(' ');
  }

  function buildIndex(entries) {
    return entries.map(function (asset) {
      var fileName = baseName(asset.path);
      var display = asset.name || fileName;
      var nameKey = normKey(display);
      var tagTokens = {};
      var folderTokens = {};

      ((asset.metadata && asset.metadata.tags) || []).forEach(function (tag) {
        tokensOf(normKey(tag)).forEach(function (t) {
          tagTokens[t] = true;
        });
      });
      // relativeFolder only: the absolute folder would drag in words like
      // "users" and "documents" that say nothing about the sound.
      tokensOf(normKey(asset.relativeFolder || '')).forEach(function (t) {
        folderTokens[t] = true;
      });

      return {
        asset: asset,
        rawLower: stripExt(display).toLowerCase().trim(),
        fileLower: fileName.toLowerCase(),
        nameKey: nameKey,
        nameTokens: tokensOf(nameKey),
        tagTokens: tagTokens,
        folderTokens: folderTokens
      };
    });
  }

  function similarity(a, b) {
    if (a === b) return 1;
    var longer = a.length > b.length ? a : b;
    if (longer.length === 0) return 1;
    var prev = [];
    var cur;
    var i;
    var j;
    var cost;
    for (j = 0; j <= b.length; j += 1) prev[j] = j;
    for (i = 1; i <= a.length; i += 1) {
      cur = [i];
      for (j = 1; j <= b.length; j += 1) {
        cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      }
      prev = cur;
    }
    return (longer.length - prev[b.length]) / longer.length;
  }

  function pickRandom(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function hasToken(entry, token) {
    return entry.tagTokens[token] || entry.folderTokens[token];
  }

  /** Returns {asset, kind, count} or null. */
  function matchQuery(index, rawQuery) {
    var query = String(rawQuery || '').trim();
    var qKey = normKey(query);
    if (qKey === '') return null;
    var qTokens = tokensOf(qKey);
    var lower = query.toLowerCase();
    var hits;

    // 1. Exact name.
    hits = index.filter(function (e) {
      return e.rawLower === lower || e.fileLower === lower;
    });
    if (hits.length) return { asset: hits[0].asset, kind: 'Exact', count: 1 };

    // 2. Same name once case, spaces, underscores and leading zeros are ignored.
    hits = index.filter(function (e) {
      return e.nameKey === qKey;
    });
    if (hits.length) return { asset: hits[0].asset, kind: 'Exact (ignoring case/spaces)', count: 1 };

    // 3. Tag or category folder: random pick among everything that has it.
    hits = index.filter(function (e) {
      return qTokens.every(function (t) {
        return hasToken(e, t);
      });
    });
    if (hits.length) {
      return { asset: pickRandom(hits).asset, kind: hits.length > 1 ? 'Random tag/folder' : 'Tag/folder', count: hits.length };
    }

    // 4. Fuzzy: every word of the marker appears in the name (or tags/folder).
    var best = [];
    var bestScore = -Infinity;
    index.forEach(function (e) {
      var nameHits = 0;
      var otherHits = 0;
      var ok = qTokens.every(function (t) {
        if (e.nameTokens.indexOf(t) !== -1) {
          nameHits += 1;
          return true;
        }
        if (t.length >= 3 && e.nameTokens.some(function (n) { return n.indexOf(t) === 0; })) {
          nameHits += 1;
          return true;
        }
        if (hasToken(e, t)) {
          otherHits += 1;
          return true;
        }
        return false;
      });
      if (!ok) return;
      var score = nameHits * 2 + otherHits - Math.max(0, e.nameTokens.length - qTokens.length) * 0.1;
      if (score > bestScore + 1e-9) {
        bestScore = score;
        best = [e];
      } else if (Math.abs(score - bestScore) <= 1e-9) {
        best.push(e);
      }
    });
    if (best.length) {
      return { asset: pickRandom(best).asset, kind: best.length > 1 ? 'Random fuzzy' : 'Fuzzy', count: best.length };
    }

    // 5. Typos ("wosh" -> "whoosh").
    if (qKey.length >= 4) {
      var typoBest = [];
      var typoScore = 0.8;
      index.forEach(function (e) {
        if (Math.abs(e.nameKey.length - qKey.length) > 4) return;
        var s = similarity(qKey, e.nameKey);
        if (s > typoScore + 1e-9) {
          typoScore = s;
          typoBest = [e];
        } else if (s >= 0.8 && Math.abs(s - typoScore) <= 1e-9) {
          typoBest.push(e);
        }
      });
      if (typoBest.length) {
        return { asset: pickRandom(typoBest).asset, kind: 'Fuzzy (spelling)', count: typoBest.length };
      }
    }

    return null;
  }

  /* ------------------------------------------------------------------ *
   * Helpers
   * ------------------------------------------------------------------ */
  function formatTime(seconds) {
    var s = Math.max(0, Number(seconds) || 0);
    var m = Math.floor(s / 60);
    var rest = s - m * 60;
    return m + ':' + (rest < 10 ? '0' : '') + rest.toFixed(2);
  }

  function errorText(err) {
    if (!err) return 'Unknown error';
    var text = err.message || String(err);
    return err.code ? text + ' [' + err.code + ']' : text;
  }

  function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).then(function () { return true; }).catch(function () { return legacyCopy(text); });
      }
    } catch (e) {
      /* fall through */
    }
    return Promise.resolve(legacyCopy(text));
  }

  function legacyCopy(text) {
    try {
      var area = document.createElement('textarea');
      area.value = text;
      area.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
      document.body.appendChild(area);
      area.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(area);
      return ok;
    } catch (e) {
      return false;
    }
  }

  /* ------------------------------------------------------------------ *
   * UI + run logic
   * ------------------------------------------------------------------ */
  function build(services) {
    var bridge = services.bridge;
    var library = services.library;
    var settings = loadSettings();
    var lastRun = loadLastRun();
    var lastPreview = null; // {signature, rows, host, timelineName, emptyCount}
    var busy = false;
    var cancelRequested = false;
    var showSettings = false;
    var rows = [];
    var report = null; // {lines: [], tone}

    var root = document.createElement('div');
    root.id = 'sfx-marker-mode';

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.id = 'sfx-marker-mode__toggle';
    toggle.innerHTML = ICON.flag + '<span>Markers</span>';
    root.appendChild(toggle);

    var panel = document.createElement('div');
    panel.id = 'sfx-marker-mode__panel';
    root.appendChild(panel);

    function setOpen(opening) {
      panel.classList.toggle('is-open', opening);
      if (opening) render();
    }
    toggle.addEventListener('click', function (event) {
      event.stopPropagation();
      setOpen(!panel.classList.contains('is-open'));
    });
    // Used by the header menu (header-menu.js).
    window.__sfxMarkerMode = {
      isOpen: function () {
        return panel.classList.contains('is-open');
      },
      setOpen: setOpen
    };
    document.addEventListener('click', function (event) {
      var path = event.composedPath ? event.composedPath() : [];
      var inside = path.indexOf(root) !== -1 || root.contains(event.target);
      if (!inside) panel.classList.remove('is-open');
    });
    document.body.appendChild(root);

    /* ---------------- scanning + matching ---------------- */

    function signatureOf(data) {
      return (
        data.markers
          .map(function (m) {
            return m.startSeconds + '|' + m.name + '|' + m.comments + '|' + m.placed;
          })
          .join(';') +
        '#' + settings.includePlaced + '#' + library.snapshot().totalAssets
      );
    }

    function buildRows(data) {
      var index = buildIndex(library.entries());
      var out = [];
      var emptyCount = 0;

      data.markers.forEach(function (marker) {
        var text = marker.name !== '' ? marker.name : marker.comments;
        var parsed = parseMarkerText(text);

        if (parsed.query === '') {
          emptyCount += 1;
          return;
        }

        var row = { marker: marker, text: text, parsed: parsed, match: null, kind: 'ready', status: '' };

        if (marker.placed && !settings.includePlaced) {
          row.kind = 'skip';
          row.status = 'Already placed';
          out.push(row);
          return;
        }

        row.match = matchQuery(index, parsed.query);
        if (!row.match) {
          row.kind = 'warn';
          row.status = 'No match \u2014 skipped';
        } else {
          row.status = 'Ready';
          var extras = [];
          if (row.match.count > 1) extras.push('random of ' + row.match.count);
          if (parsed.volumeDb !== null) extras.push(parsed.volumeDb + ' dB');
          if (parsed.track !== null) {
            if (data.host === 'premiere') extras.push('A' + parsed.track);
            else extras.push('track ignored in After Effects');
          }
          if (parsed.notes.length) extras.push(parsed.notes.join(', '));
          if (extras.length) row.status += ' (' + extras.join(', ') + ')';
        }
        out.push(row);
      });

      out.sort(function (a, b) {
        return a.marker.startSeconds - b.marker.startSeconds;
      });

      return { rows: out, emptyCount: emptyCount };
    }

    function scan() {
      return bridge.invoke('markers.list').then(function (data) {
        var built = buildRows(data);
        lastPreview = {
          signature: signatureOf(data),
          rows: built.rows,
          host: data.host,
          timelineName: data.timelineName,
          emptyCount: built.emptyCount
        };
        debug('info', 'scanned markers', { count: data.markers.length, rows: built.rows.length, host: data.host });
        return lastPreview;
      });
    }

    /* ---------------- actions ---------------- */

    function setReport(lines, tone) {
      report = lines && lines.length ? { lines: lines, tone: tone || 'info' } : null;
    }

    function reportFor(preview) {
      var ready = preview.rows.filter(function (r) { return r.kind === 'ready'; }).length;
      var skipped = preview.rows.filter(function (r) { return r.kind === 'warn'; });
      var placed = preview.rows.filter(function (r) { return r.kind === 'skip'; }).length;
      var lines = [
        ready + ' ready \u00B7 ' + skipped.length + ' unmatched' + (placed ? ' \u00B7 ' + placed + ' already placed' : '') +
          (preview.emptyCount ? ' \u00B7 ' + preview.emptyCount + ' markers with no text ignored' : '')
      ];
      skipped.forEach(function (r) {
        lines.push('Unmatched: "' + r.parsed.query + '" at ' + formatTime(r.marker.startSeconds));
      });
      return lines;
    }

    function onPreview() {
      if (busy) return;
      busy = true;
      setReport(['Reading markers\u2026'], 'info');
      rows = [];
      render();
      scan()
        .then(function (preview) {
          rows = preview.rows;
          if (preview.rows.length === 0 && preview.emptyCount === 0) {
            setReport(['No markers found. Add markers on the timeline, type an SFX name in each, then press Preview.'], 'warn');
          } else {
            setReport(reportFor(preview), 'info');
          }
        })
        .catch(function (err) {
          debug('error', 'preview failed', errorText(err));
          setReport([errorText(err)], 'error');
        })
        .then(function () {
          busy = false;
          render();
        });
    }

    function onApply() {
      if (busy) return;
      busy = true;
      cancelRequested = false;
      setReport(['Reading markers\u2026'], 'info');
      render();

      bridge
        .invoke('markers.list')
        .then(function (data) {
          var signature = signatureOf(data);
          var preview;
          if (lastPreview && lastPreview.signature === signature) {
            preview = lastPreview; // same markers as the last Preview: place exactly what it showed
          } else {
            var built = buildRows(data);
            preview = {
              signature: signature,
              rows: built.rows,
              host: data.host,
              timelineName: data.timelineName,
              emptyCount: built.emptyCount
            };
            lastPreview = preview;
          }
          rows = preview.rows;
          return runPlacement(preview);
        })
        .catch(function (err) {
          debug('error', 'apply failed', errorText(err));
          setReport(['Could not apply markers: ' + errorText(err)], 'error');
        })
        .then(function () {
          busy = false;
          render();
        });
    }

    function runPlacement(preview) {
      var todo = preview.rows.filter(function (r) { return r.kind === 'ready'; });
      if (todo.length === 0) {
        setReport(reportFor(preview).concat(['Nothing to place.']), 'warn');
        return Promise.resolve();
      }

      var runId = Date.now().toString(36);
      var placements = [];
      var failed = 0;
      var done = 0;
      var isPremiere = preview.host === 'premiere';
      var chain = Promise.resolve();

      todo.forEach(function (row) {
        chain = chain.then(function () {
          if (cancelRequested) {
            row.kind = 'warn';
            row.status = 'Cancelled';
            return;
          }
          row.status = 'Placing\u2026';
          setReport(['Placing ' + (done + failed + 1) + ' of ' + todo.length + '\u2026'], 'info');
          render();

          return bridge
            .invoke('sfx.import', {
              path: row.match.asset.path,
              startSeconds: row.marker.startSeconds,
              atPlayhead: false,
              snapToFrame: true,
              gainDb: row.parsed.volumeDb !== null ? row.parsed.volumeDb : 0,
              trackNumber: isPremiere && row.parsed.track !== null ? row.parsed.track : null,
              firstTrack: isPremiere ? settings.firstTrack : null,
              runId: runId
            })
            .then(function (res) {
              done += 1;
              row.kind = 'placed';
              row.status = isPremiere ? 'Placed on A' + (res.laneIndex + 1) : 'Placed (layer ' + res.laneIndex + ')';
              if (row.parsed.volumeDb !== null && !res.gainApplied) row.status += ' \u2014 volume not applied';
              placements.push({
                path: row.match.asset.path,
                startSeconds: res.startSeconds,
                laneIndex: res.laneIndex
              });
            })
            .catch(function (err) {
              failed += 1;
              row.kind = 'error';
              row.status = 'Failed: ' + errorText(err);
              debug('error', 'place failed', { text: row.parsed.query, error: errorText(err) });
            });
        });
      });

      return chain.then(function () {
        var placedRows = todo.filter(function (r) { return r.kind === 'placed'; });
        var markerStep = Promise.resolve(null);

        if (placedRows.length && settings.afterPlace !== 'none') {
          var items = placedRows.map(function (r) {
            return {
              startSeconds: r.marker.startSeconds,
              endSeconds: r.marker.endSeconds,
              name: r.marker.name,
              comments: r.marker.comments,
              action: settings.afterPlace
            };
          });
          markerStep = bridge
            .invoke('markers.mark', { items: items })
            .then(function (res) {
              debug('info', 'markers updated', res);
              return { items: items, result: res };
            })
            .catch(function (err) {
              debug('error', 'marker update failed', errorText(err));
              return { items: items, error: errorText(err) };
            });
        }

        return markerStep.then(function (marked) {
          var run = null;
          if (placements.length) {
            run = {
              runId: runId,
              host: preview.host,
              timelineName: preview.timelineName,
              placements: placements,
              deleted: [],
              flagged: [],
              at: Date.now()
            };
            if (marked && !marked.error) {
              marked.items.forEach(function (it) {
                if (it.action === 'delete') run.deleted.push(it);
                else run.flagged.push({ startSeconds: it.startSeconds, name: it.name });
              });
            }
            lastRun = run;
            saveLastRun(run);
          }

          var lines = [
            'Placed ' + done + ' \u00B7 Failed ' + failed + ' \u00B7 Unmatched ' +
              preview.rows.filter(function (r) { return r.kind === 'warn' && r.status.indexOf('No match') === 0; }).length
          ];
          preview.rows.forEach(function (r) {
            if (r.kind === 'warn' && r.status.indexOf('No match') === 0) {
              lines.push('Unmatched: "' + r.parsed.query + '" at ' + formatTime(r.marker.startSeconds));
            }
            if (r.kind === 'error') {
              lines.push('Failed: "' + r.parsed.query + '" at ' + formatTime(r.marker.startSeconds) + ' \u2014 ' + r.status.replace('Failed: ', ''));
            }
          });
          if (marked && marked.error) lines.push('Markers were not updated: ' + marked.error);
          if (marked && marked.result && marked.result.colourFailed) {
            lines.push('Marker colour could not be changed on this version; markers are still flagged as placed.');
          }
          setReport(lines, failed ? 'warn' : 'ok');
          // The markers have changed (or the run is over): the next Apply
          // must read them fresh rather than reuse this run's rows.
          lastPreview = null;
          debug('info', 'run finished', { runId: runId, placed: done, failed: failed });
        });
      });
    }

    function onUndo() {
      if (busy || !lastRun) return;
      busy = true;
      var run = lastRun;
      setReport(['Undoing last run\u2026'], 'info');
      render();

      bridge
        .invoke('markers.list')
        .then(function (data) {
          if (data.timelineName !== run.timelineName) {
            throw new Error('Open "' + run.timelineName + '" first \u2014 that is where the last run was placed.');
          }
          return bridge.invoke('markers.undoRun', { runId: run.runId, placements: run.placements });
        })
        .then(function (res) {
          return bridge
            .invoke('markers.restore', { recreate: run.deleted, unflag: run.flagged })
            .catch(function (err) {
              debug('error', 'marker restore failed', errorText(err));
              return null;
            })
            .then(function (restored) {
              var lines = ['Removed ' + res.removed + ' of ' + run.placements.length + ' placed sounds.'];
              if (res.missing) lines.push(res.missing + ' could not be found (moved, edited or already deleted) and were left alone.');
              if (restored && restored.recreated) lines.push('Restored ' + restored.recreated + ' deleted markers.');
              if (res.removed > 0 || run.placements.length === 0) {
                lastRun = null;
                saveLastRun(null);
              }
              rows = [];
              setReport(lines, res.removed > 0 ? 'ok' : 'warn');
              debug('info', 'undo finished', { removed: res.removed, missing: res.missing });
            });
        })
        .catch(function (err) {
          debug('error', 'undo failed', errorText(err));
          setReport([errorText(err)], 'error');
        })
        .then(function () {
          busy = false;
          render();
        });
    }

    /* ---------------- rendering ---------------- */

    function el(tag, className, text) {
      var node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    }

    function button(className, iconSvg, label, onClick, disabled) {
      var b = el('button', className);
      b.type = 'button';
      b.innerHTML = (iconSvg || '') + '<span></span>';
      b.lastChild.textContent = label;
      b.disabled = !!disabled;
      b.addEventListener('click', onClick);
      return b;
    }

    function select(options, value, onChange) {
      var s = document.createElement('select');
      options.forEach(function (o) {
        var opt = document.createElement('option');
        opt.value = String(o.value);
        opt.textContent = o.label;
        if (String(o.value) === String(value)) opt.selected = true;
        s.appendChild(opt);
      });
      s.addEventListener('change', function () {
        onChange(s.value);
      });
      return s;
    }

    function render() {
      panel.innerHTML = '';

      var header = el('div', 'sfx-mm__header');
      var title = el('span', 'sfx-mm__title');
      title.innerHTML = ICON.flag + '<span>Marker Mode</span>';
      header.appendChild(title);
      var gear = el('button', 'sfx-mm__icon-btn');
      gear.type = 'button';
      gear.title = 'Marker Mode settings';
      gear.innerHTML = ICON.settings;
      gear.addEventListener('click', function () {
        showSettings = !showSettings;
        render();
      });
      header.appendChild(gear);
      panel.appendChild(header);

      panel.appendChild(
        el('div', 'sfx-mm__hint', 'Type an SFX name or tag in each marker. Optional: "whoosh | vol -6 | track 3".')
      );

      if (showSettings) {
        panel.appendChild(renderSettings());
      }

      var actions = el('div', 'sfx-mm__actions');
      actions.appendChild(button('sfx-mm__btn', ICON.eye, 'Preview', onPreview, busy));
      actions.appendChild(button('sfx-mm__btn sfx-mm__btn--primary', ICON.check, 'Apply Markers', onApply, busy));
      panel.appendChild(actions);

      if (busy && lastPreview && cancelRequested === false && rows.some(function (r) { return r.status === 'Placing\u2026'; })) {
        panel.appendChild(
          button('sfx-mm__btn sfx-mm__btn--wide', ICON.stop, 'Stop after this one', function () {
            cancelRequested = true;
          }, false)
        );
      }

      panel.appendChild(
        button(
          'sfx-mm__btn sfx-mm__btn--wide',
          ICON.undo,
          lastRun ? 'Undo last run (' + lastRun.placements.length + ' sounds)' : 'Undo last run',
          onUndo,
          busy || !lastRun
        )
      );

      if (rows.length) panel.appendChild(renderTable());

      if (report) {
        var box = el('div', 'sfx-mm__report is-' + report.tone);
        report.lines.forEach(function (line, i) {
          box.appendChild(el('div', i === 0 ? 'sfx-mm__report-main' : 'sfx-mm__report-line', line));
        });
        panel.appendChild(box);
      }

      panel.appendChild(renderDebug());
    }

    function renderSettings() {
      var wrap = el('div', 'sfx-mm__settings');

      var r1 = el('div', 'sfx-mm__row');
      r1.appendChild(el('label', '', 'After placing a marker'));
      r1.appendChild(
        select(
          [
            { value: 'green', label: 'Turn it green' },
            { value: 'delete', label: 'Delete it' },
            { value: 'none', label: 'Leave it alone' }
          ],
          settings.afterPlace,
          function (v) {
            settings.afterPlace = v;
            saveSettings(settings);
          }
        )
      );
      wrap.appendChild(r1);

      var r2 = el('div', 'sfx-mm__row');
      r2.appendChild(el('label', '', 'Start on track (Premiere)'));
      r2.appendChild(
        select(
          [1, 2, 3, 4, 5].map(function (n) {
            return { value: n, label: 'A' + n };
          }),
          settings.firstTrack,
          function (v) {
            settings.firstTrack = Number(v);
            saveSettings(settings);
          }
        )
      );
      wrap.appendChild(r2);

      var r3 = el('label', 'sfx-mm__check');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = settings.includePlaced;
      cb.addEventListener('change', function () {
        settings.includePlaced = cb.checked;
        saveSettings(settings);
      });
      r3.appendChild(cb);
      r3.appendChild(el('span', '', 'Also re-apply markers already placed'));
      wrap.appendChild(r3);

      if (settings.afterPlace === 'none') {
        wrap.appendChild(
          el('div', 'sfx-mm__hint', 'With "Leave it alone", pressing Apply twice places the sounds twice.')
        );
      }
      return wrap;
    }

    function renderTable() {
      var holder = el('div', 'sfx-mm__table-wrap');
      var table = el('table', 'sfx-mm__table');
      var head = el('tr');
      ['Time', 'Marker', 'Matched SFX', 'Status'].forEach(function (h) {
        head.appendChild(el('th', '', h));
      });
      table.appendChild(head);

      rows.forEach(function (row) {
        var tr = el('tr', 'is-' + row.kind);
        tr.appendChild(el('td', '', formatTime(row.marker.startSeconds)));
        tr.appendChild(el('td', '', row.parsed.query));
        var sfx = row.match ? row.match.asset.name || baseName(row.match.asset.path) : '\u2014';
        var sfxCell = el('td', '', sfx);
        if (row.match) sfxCell.title = row.match.kind;
        tr.appendChild(sfxCell);
        tr.appendChild(el('td', 'sfx-mm__status', row.status));
        table.appendChild(tr);
      });

      holder.appendChild(table);
      return holder;
    }

    function renderDebug() {
      var wrap = el('div', 'sfx-mm__debug');
      var btn = button('sfx-mm__link-btn', ICON.copy, 'Copy debug log', function () {
        var text = window.__sfxDebug ? window.__sfxDebug.dump() : 'Debug log is not available.';
        Promise.resolve(copyText(text)).then(function (ok) {
          label.textContent = ok ? 'Copied \u2014 paste it to me' : 'Copy failed \u2014 see the log file';
        });
      }, false);
      var label = el('span', 'sfx-mm__debug-note');
      var path = window.__sfxDebug && window.__sfxDebug.getFilePath();
      label.textContent = path ? 'File: ' + path : '';
      wrap.appendChild(btn);
      wrap.appendChild(label);
      return wrap;
    }
  }

  /* ------------------------------------------------------------------ *
   * Start when the app's services exist
   * ------------------------------------------------------------------ */
  function start() {
    var attempts = 0;
    (function poll() {
      if (window.__sfxServices && window.__sfxServices.bridge && window.__sfxServices.library) {
        try {
          build(window.__sfxServices);
          debug('info', 'ready');
        } catch (e) {
          debug('error', 'failed to start', e);
        }
        return;
      }
      attempts += 1;
      if (attempts < 150) setTimeout(poll, 100);
    })();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
