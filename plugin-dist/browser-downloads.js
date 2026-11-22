/*
  SFX Composer — Downloads tab and real-browser controls.

  Plugs into browser-tab.js (window.__sfxBrowserTab) and browser-companion-client.js
  (window.__sfxCompanion). It adds:

    - A "Built-in browser" card on the Browse tab: one-time setup (with consent and
      real progress), open / show / quit, and it makes the address bar drive the
      real browser when that is running.
    - The Downloads tab: live rows fed by the browser's own download events, with
      Cancel / Retry / Preview / Import to Project / Import to Timeline / Show file /
      Remove, a Clear finished button and the download-folder setting.

  Imports reuse BrowserTab.performImport (the same code the Import tab uses), so
  placement at the playhead, the import-only fallback and the "never claim success
  the host did not confirm" rule are identical.
*/
(function () {
  'use strict';

  var TERMS_KEY = 'sfxBrowserSetupAccepted';

  function init(tab, companion) {
    var el = tab.el;
    var button = tab.button;
    var services = tab.services;
    var bridge = services.bridge;
    var ICON = tab.ICON;

    var snap = companion.snapshot();
    var installing = false;
    var installProgress = null; // {phase, received, total}
    var installSignal = null;
    var busyIds = {}; // download id -> true while an import/placement is running
    var rows = {}; // download id -> {el, key, bar, meta}
    var renderTimer = null;

    function termsAccepted() {
      return tab.readJson(TERMS_KEY, false) === true;
    }

    /* ================================================================ *
     * Browse tab: the built-in browser card
     * ================================================================ */
    var box = el('div', 'sfx-br__companion');
    tab.views.browse.insertBefore(box, tab.urlBar);

    var newTabBtn = tab.button('sfx-br__btn', ICON.go, 'New tab', function () {
      navigateReal(tab.urlInput.value, true);
    });
    newTabBtn.title = 'Open this address in a new tab of the built-in browser';
    newTabBtn.style.display = 'none';
    tab.urlBar.insertBefore(newTabBtn, tab.urlBar.children[2] || null);

    function navigateReal(text, newTab) {
      var input = String(text || '').trim();
      if (!input) return false;
      companion
        .request('POST', '/v1/navigate', { url: input, newTab: !!newTab })
        .then(function () {
          tab.clearStatus();
        })
        .catch(function (err) {
          tab.setStatus('error', 'The browser couldn\u2019t open that address', [tab.errorText(err)]);
        });
      return true;
    }

    // Address bar -> real browser, whenever it is running.
    tab.hooks.navigate = function (req) {
      if (!companion.isConnected()) return false;
      return navigateReal(req.url, req.newTab);
    };

    function startInstall() {
      if (installing) return;
      installing = true;
      installProgress = { phase: 'download', state: 'DOWNLOADING', received: 0, total: 0 };
      installSignal = { cancelled: false };
      renderBox();
      tab.setStatus('working', 'Setting up the built-in browser\u2026', ['This runs once. You can keep using SFX Composer.']);

      companion
        .install({
          signal: installSignal,
          onProgress: function (p) {
            installProgress = p || installProgress;
            renderBox();
          }
        })
        .then(function () {
          installProgress = { phase: 'start', state: 'INITIALIZING', received: 1, total: 1 };
          renderBox();
          return companion.launch();
        })
        .then(function () {
          companion.startWatching();
          installing = false;
          installProgress = null;
          renderBox();
          tab.setStatus('ok', 'Built-in browser is ready', [
            'Setup finished. The engine is installed and running inside this panel.'
          ]);
        })
        .catch(function (err) {
          tab.debug('error', 'browser setup failed', err);
          installing = false;
          installProgress = {
            phase: 'error',
            state: 'ERROR',
            message: tab.errorText(err)
          };
          renderBox();
          tab.setStatus('error', 'Couldn\u2019t set up the built-in browser', [
            tab.errorText(err),
            'Use Retry setup on the card above.'
          ]);
        });
    }

    function openBrowser() {
      tab.setStatus('working', 'Opening the browser\u2026', []);
      companion
        .launch()
        .then(function () {
          companion.startWatching();
          // The browser starts docked, so it appears in the Browse tab. (Asking it to
          // "show" its window would pop it out.)
          tab.clearStatus();
          tab.setView('browse');
        })
        .catch(function (err) {
          tab.debug('error', 'browser launch failed', err);
          tab.setStatus('error', 'Couldn\u2019t open the browser', [tab.errorText(err), 'You can re-run setup from this card.']);
        });
    }

    function renderBox() {
      box.innerHTML = '';
      var connected = snap.connected;
      var installed = false;
      try {
        installed = companion.isInstalled();
      } catch (e) {
        installed = false;
      }
      newTabBtn.style.display = connected ? '' : 'none';

      var head = el('div', 'sfx-br__companion-head');
      var dot = el('span', 'sfx-br__dot' + (connected ? ' is-on' : ''));
      head.appendChild(dot);
      head.appendChild(el('strong', '', 'Built-in browser'));
      var stateText = connected
        ? 'running'
        : installing
          ? (installProgress && installProgress.state) || 'DOWNLOADING'
          : installed
            ? 'ready'
            : 'not set up';
      var state = el('span', 'sfx-br__companion-state', stateText);
      head.appendChild(state);
      box.appendChild(head);

      if (!companion.supported()) {
        box.appendChild(
          el('div', 'sfx-br__hint', 'The built-in browser isn\u2019t available on this computer (' + companion.platformKey() + '). The quick view below and your system browser still work.')
        );
        return;
      }

      if (installing) {
        var p = installProgress || {};
        var label = 'Preparing\u2026';
        var pct = 0;
        if (p.phase === 'download') {
          pct = p.total > 0 ? Math.min(100, Math.round((p.received / p.total) * 100)) : 0;
          if (p.done) pct = 100;
          label =
            'Downloading the browser engine\u2026 ' +
            pct +
            '% (' +
            tab.formatBytes(p.received) +
            (p.total ? ' of ' + tab.formatBytes(p.total) : '') +
            ')';
        } else if (p.phase === 'verify') {
          pct = 100;
          label = 'Verifying download integrity\u2026';
        } else if (p.phase === 'unpack') {
          pct = 100;
          label = 'Extracting browser engine\u2026 (this can take a minute)';
        } else if (p.phase === 'finish') {
          pct = 100;
          label = 'Installing companion app\u2026';
        } else if (p.phase === 'ready') {
          pct = 100;
          label = 'Ready';
        } else if (p.phase === 'start') {
          pct = 100;
          label = 'Starting the browser\u2026';
        } else if (p.phase === 'error') {
          pct = 0;
          label = 'Setup failed' + (p.message ? ': ' + p.message : '');
        }
        var track = el('div', 'sfx-br__bar');
        var fill = el('div', 'sfx-br__bar-fill');
        fill.style.width = pct + '%';
        track.appendChild(fill);
        box.appendChild(el('div', 'sfx-br__hint', label));
        box.appendChild(track);
        if (p.phase === 'download') {
          box.appendChild(
            button('sfx-br__btn sfx-br__btn--small', ICON.stop, 'Cancel', function () {
              if (installSignal) installSignal.cancelled = true;
            })
          );
        }
        if (p.phase === 'error') {
          box.appendChild(
            button('sfx-br__btn sfx-br__btn--primary sfx-br__btn--small', ICON.refresh, 'Retry setup', function () {
              installProgress = null;
              startInstall();
            })
          );
        }
        return;
      }

      if (connected) {
        var tabs = (snap.browser && snap.browser.tabs) || [];
        var active = tabs.filter(function (t) {
          return t.active;
        })[0];
        box.appendChild(
          el('div', 'sfx-br__hint', tabs.length + (tabs.length === 1 ? ' tab' : ' tabs') + ' open' + (active && active.url ? ' \u00B7 ' + active.url : '') + '.')
        );
        var actions = el('div', 'sfx-br__card-actions');
        actions.appendChild(
          button('sfx-br__btn sfx-br__btn--small', ICON.download, 'Downloads', function () {
            tab.setView('downloads');
          })
        );
        actions.appendChild(
          button('sfx-br__btn sfx-br__btn--small', ICON.stop, 'Quit browser', function () {
            companion.request('POST', '/v1/quit', {}).catch(function () {});
          })
        );
        box.appendChild(actions);
        return;
      }

      if (installed) {
        box.appendChild(
          el(
            'div',
            'sfx-br__hint',
            'A real Chromium browser, shown right here in the panel (and it can pop out into its own window). Logins are kept between sessions, and files you download show up in the Downloads tab.'
          )
        );
        var a2 = el('div', 'sfx-br__card-actions');
        a2.appendChild(button('sfx-br__btn sfx-br__btn--primary sfx-br__btn--small', ICON.go, 'Open browser', openBrowser));
        a2.appendChild(
          button('sfx-br__btn sfx-br__btn--small', ICON.refresh, 'Re-run setup', function () {
            startInstall();
          })
        );
        box.appendChild(a2);
        return;
      }

      // Not set up yet: explain what it is, what it downloads, and ask first.
      box.appendChild(
        el(
          'div',
          'sfx-br__hint',
          'A real Chromium browser (not a preview) with saved logins and a download manager. It is shown inside this panel as a live view, and can pop out into its own window. Setup downloads about ' +
            companion.approxDownloadMb() +
            ' MB once, from github.com/electron (the official release; it is integrity-checked before use). Nothing is installed system-wide.'
        )
      );
      var consent = el('label', 'sfx-br__check');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = termsAccepted();
      var setupBtn = tab.button('sfx-br__btn sfx-br__btn--primary sfx-br__btn--small', ICON.download, 'Set up browser', function () {
        tab.writeJson(TERMS_KEY, true);
        startInstall();
      });
      setupBtn.disabled = !cb.checked;
      cb.addEventListener('change', function () {
        setupBtn.disabled = !cb.checked;
      });
      consent.appendChild(cb);
      consent.appendChild(
        el('span', '', 'I understand this downloads and runs a browser, and that I should only download files I\u2019m allowed to use.')
      );
      box.appendChild(consent);
      box.appendChild(setupBtn);
    }

    /* ================================================================ *
     * Downloads tab
     * ================================================================ */
    var view = tab.views.downloads;
    var top = el('div', 'sfx-br__dlbar');
    var statusPill = el('span', 'sfx-br__companion-state', '');
    var openBtn = tab.button('sfx-br__btn sfx-br__btn--small', ICON.external, 'Open browser', openBrowser);
    var clearBtn = tab.button('sfx-br__btn sfx-br__btn--small', ICON.refresh, 'Clear finished', function () {
      if (!companion.isConnected()) {
        tab.setStatus('warn', 'Open the browser first', ['The list can only be cleared while the browser is running.']);
        return;
      }
      companion.request('POST', '/v1/downloads/clear', {}).catch(function (err) {
        tab.setStatus('error', 'Couldn\u2019t clear the list', [tab.errorText(err)]);
      });
    });
    top.appendChild(statusPill);
    top.appendChild(openBtn);
    top.appendChild(clearBtn);
    view.appendChild(top);

    var scroll = el('div', 'sfx-br__scroll');
    view.appendChild(scroll);
    var notice = el('div', 'sfx-br__hint');
    scroll.appendChild(notice);
    var list = el('div', 'sfx-br__list');
    scroll.appendChild(list);
    var empty = el('div', 'sfx-br__list-msg', '');
    list.appendChild(empty);

    var folderRow = el('div', 'sfx-br__section-head');
    folderRow.appendChild(el('span', '', 'Saved to'));
    var folderPath = el('span', 'sfx-br__path', '');
    folderRow.appendChild(folderPath);
    var folderBtn = tab.button('sfx-br__btn sfx-br__btn--small', ICON.folder, 'Change\u2026', changeFolder);
    folderRow.appendChild(folderBtn);
    scroll.appendChild(folderRow);

    function changeFolder() {
      if (!companion.isConnected()) {
        tab.setStatus('warn', 'Open the browser first', ['The download folder can only be changed while the browser is running.']);
        return;
      }
      bridge
        .invoke('fs.pickFolder', { prompt: 'Choose where downloads are saved', startPath: snap.settings.downloadDir || '' })
        .then(function (res) {
          if (!res || !res.path) return undefined;
          return companion.request('POST', '/v1/settings', { downloadDir: res.path }).then(function () {
            tab.setStatus('ok', 'Download folder changed', [res.path, 'New downloads go here. Files already downloaded stay where they are.']);
          });
        })
        .catch(function (err) {
          tab.setStatus('error', 'Couldn\u2019t change the download folder', [tab.errorText(err)]);
        });
    }

    /* ---------------- one download row ---------------- */
    function percentOf(d) {
      return d.totalBytes > 0 ? Math.min(100, Math.floor((d.receivedBytes / d.totalBytes) * 100)) : null;
    }

    function sizeText(d) {
      if (d.state === 'progressing') {
        return tab.formatBytes(d.receivedBytes) + (d.totalBytes > 0 ? ' of ' + tab.formatBytes(d.totalBytes) : '');
      }
      return tab.formatBytes(d.totalBytes || d.receivedBytes);
    }

    function stateText(d) {
      if (d.state === 'progressing') {
        var pct = percentOf(d);
        return 'Downloading' + (pct === null ? '\u2026' : ' ' + pct + '%');
      }
      if (d.state === 'completed') return 'Completed';
      if (d.state === 'cancelled') return 'Cancelled';
      if (d.state === 'interrupted') return 'Interrupted' + (d.error ? ' \u2014 ' + d.error : '');
      return 'Failed' + (d.error ? ' \u2014 ' + d.error : '');
    }

    function importText(d) {
      if (busyIds[d.id] || d.importState === 'importing') return 'Importing\u2026';
      if (d.importState === 'imported') return 'Imported \u2713' + (d.importDetail ? ' \u2014 ' + d.importDetail : '');
      if (d.importState === 'failed') return 'Import problem' + (d.importDetail ? ': ' + d.importDetail : '');
      return '';
    }

    function importDownload(d, mode) {
      if (busyIds[d.id]) return;
      var problem = companion.checkFile(d);
      if (problem) {
        tab.setStatus('error', 'Can\u2019t import ' + d.filename, [problem]);
        return;
      }
      busyIds[d.id] = true;
      scheduleRender();
      tab.setStatus('working', mode === 'timeline' ? 'Importing and placing\u2026' : 'Importing\u2026', [d.filename]);

      var claim = companion.isConnected()
        ? companion.request('POST', '/v1/downloads/' + d.id + '/import', { phase: 'started', again: d.importState === 'imported' })
        : Promise.resolve({ ok: true });

      claim
        .then(
          function () {
            return tab.performImport({ path: d.path, name: d.filename }, mode).then(function (outcome) {
              var detail = outcome.ok
                ? outcome.lines[1] || outcome.title
                : outcome.imported
                ? 'In the project, NOT placed: ' + (outcome.lines[1] || '').replace(/^Reason: /, '')
                : outcome.lines[0] || outcome.title;
              var report = companion.isConnected()
                ? companion
                    .request('POST', '/v1/downloads/' + d.id + '/import', { phase: outcome.ok ? 'completed' : 'failed', detail: detail })
                    .catch(function () {})
                : Promise.resolve();
              return report.then(function () {
                tab.setStatus(outcome.tone, outcome.title, outcome.lines);
              });
            });
          },
          function (err) {
            if (err && err.code === 'already-importing') {
              tab.setStatus('warn', 'Already being imported', ['Wait for the current import of ' + d.filename + ' to finish.']);
            } else {
              tab.setStatus('error', 'Can\u2019t import ' + d.filename, [tab.errorText(err)]);
            }
          }
        )
        .then(function () {
          delete busyIds[d.id];
          scheduleRender();
        });
    }

    function action(d, name) {
      companion.request('POST', '/v1/downloads/' + d.id + '/' + name, {}).catch(function (err) {
        tab.setStatus('error', 'That didn\u2019t work', [tab.errorText(err)]);
      });
    }

    function buildActions(d, connected) {
      var wrap = el('div', 'sfx-br__card-actions');
      var busy = !!busyIds[d.id] || d.importState === 'importing';

      if (d.state === 'progressing') {
        var cancel = button('sfx-br__btn sfx-br__btn--small', ICON.stop, 'Cancel', function () {
          action(d, 'cancel');
        });
        cancel.disabled = !connected;
        wrap.appendChild(cancel);
        return wrap;
      }

      if (d.state === 'completed') {
        if (d.kind === 'audio') wrap.appendChild(tab.previewButtonFor({ path: d.path, name: d.filename, sizeBytes: d.totalBytes }));
        if (d.importable) {
          var toProject = button('sfx-br__btn sfx-br__btn--small', ICON.download, 'Import to Project', function () {
            importDownload(d, 'project');
          });
          toProject.disabled = busy;
          wrap.appendChild(toProject);
          var toTimeline = button(
            'sfx-br__btn sfx-br__btn--primary sfx-br__btn--small',
            ICON.check,
            d.importState === 'imported' ? 'Place again' : 'Import to Active Timeline',
            function () {
              importDownload(d, 'timeline');
            }
          );
          toTimeline.disabled = busy;
          wrap.appendChild(toTimeline);
        }
        var show = button('sfx-br__btn sfx-br__btn--small', ICON.folder, 'Show file', function () {
          action(d, 'reveal');
        });
        show.disabled = !connected;
        wrap.appendChild(show);
      } else {
        var retry = button('sfx-br__btn sfx-br__btn--small', ICON.refresh, 'Retry', function () {
          action(d, 'retry');
        });
        retry.disabled = !connected || (d.error || '').indexOf('Blocked') === 0;
        wrap.appendChild(retry);
      }

      var remove = button('sfx-br__btn sfx-br__btn--small', ICON.stop, 'Remove', function () {
        action(d, 'remove');
      });
      remove.disabled = !connected;
      wrap.appendChild(remove);
      return wrap;
    }

    function rowKey(d, connected) {
      return [d.state, d.importState, d.importDetail, d.error, d.filename, d.canResume, !!busyIds[d.id], connected, d.importable].join('|');
    }

    function buildRow(d, connected) {
      var row = el('div', 'sfx-br__dlrow');
      var nameLine = el('div', 'sfx-br__dlname');
      nameLine.appendChild(el('span', 'sfx-br__row-name', d.filename));
      nameLine.appendChild(el('span', 'sfx-br__badge', (d.ext || '?').toUpperCase() + (d.kind !== 'other' ? ' \u00B7 ' + d.kind : '')));
      row.appendChild(nameLine);

      var meta = el('div', 'sfx-br__row-meta', '');
      row.appendChild(meta);

      var bar = el('div', 'sfx-br__bar');
      var fill = el('div', 'sfx-br__bar-fill');
      bar.appendChild(fill);
      bar.style.display = d.state === 'progressing' ? '' : 'none';
      row.appendChild(bar);

      var st = el('div', 'sfx-br__dlstate is-' + d.state, stateText(d));
      row.appendChild(st);
      var imp = importText(d);
      if (imp) row.appendChild(el('div', 'sfx-br__dlimport is-' + (d.importState || 'none'), imp));
      if (d.state === 'completed' && !d.importable) {
        row.appendChild(el('div', 'sfx-br__row-meta', 'This file type can\u2019t be imported into Adobe apps.'));
      }
      row.appendChild(buildActions(d, connected));
      return { el: row, meta: meta, fill: fill, bar: bar, stateEl: st };
    }

    function updateLive(entry, d) {
      var pct = percentOf(d);
      entry.fill.style.width = (pct === null ? 0 : pct) + '%';
      var age = d.state === 'progressing' ? '' : ' \u00B7 ' + tab.formatAge(d.finishedAt || d.startedAt);
      entry.meta.textContent = sizeText(d) + (d.sourceHost ? ' \u00B7 ' + d.sourceHost : '') + age;
      entry.stateEl.textContent = stateText(d);
    }

    function renderList() {
      var connected = snap.connected;
      statusPill.textContent = connected ? '\u25CF browser running' : '\u25CB browser not running';
      statusPill.className = 'sfx-br__companion-state' + (connected ? ' is-on' : '');
      openBtn.style.display = connected || !companionInstalled() ? 'none' : '';
      notice.textContent = connected
        ? ''
        : 'The browser isn\u2019t running, so this is the saved history. Imports still work; Cancel, Retry and Show file need the browser.';
      folderPath.textContent = snap.settings.downloadDir || '';
      folderPath.title = snap.settings.downloadDir || '';
      folderBtn.disabled = !connected;

      var seen = {};
      var downloads = snap.downloads;

      downloads.forEach(function (d) {
        seen[d.id] = true;
        var key = rowKey(d, connected);
        var entry = rows[d.id];
        if (!entry || entry.key !== key) {
          var built = buildRow(d, connected);
          built.key = key;
          if (entry && entry.el.parentNode) entry.el.parentNode.replaceChild(built.el, entry.el);
          rows[d.id] = built;
          entry = built;
        }
        updateLive(entry, d);
      });

      Object.keys(rows).forEach(function (id) {
        if (!seen[id]) {
          if (rows[id].el.parentNode) rows[id].el.parentNode.removeChild(rows[id].el);
          delete rows[id];
        }
      });

      // Keep DOM order equal to list order (newest first).
      var anchor = null;
      for (var i = downloads.length - 1; i >= 0; i -= 1) {
        var node = rows[downloads[i].id].el;
        if (node.nextSibling !== anchor || node.parentNode !== list) list.insertBefore(node, anchor);
        anchor = node;
      }

      if (downloads.length === 0) {
        empty.style.display = '';
        empty.textContent = connected
          ? 'No downloads yet. In the browser, log in if the site needs it and press its normal Download button. Finished files appear here.'
          : 'No downloads yet. Open the browser, log in if the site needs it, and press a site\u2019s normal Download button.';
        if (empty.parentNode !== list) list.appendChild(empty);
      } else {
        empty.style.display = 'none';
      }
      tab.pruneButtons();
      tab.updatePreviewButtons();
    }

    function companionInstalled() {
      try {
        return companion.isInstalled();
      } catch (e) {
        return false;
      }
    }

    function scheduleRender() {
      if (renderTimer) return;
      renderTimer = setTimeout(function () {
        renderTimer = null;
        renderBox();
        renderList();
      }, 120);
    }

    companion.subscribe(function (next) {
      snap = next;
      scheduleRender();
    });

    tab.hooks.onView.push(function (name) {
      if (name === 'browse' || name === 'downloads') {
        if (companionInstalled() || companion.readOffline()) companion.startWatching();
        scheduleRender();
      }
    });

    renderBox();
    renderList();
  }

  function start() {
    var tries = 0;
    (function poll() {
      var tab = window.__sfxBrowserTab;
      if (tab && window.__sfxCompanion) {
        try {
          init(tab, window.__sfxCompanion);
          if (window.__sfxDebug) window.__sfxDebug.info('browser-downloads: ready');
        } catch (e) {
          if (window.__sfxDebug) window.__sfxDebug.error('browser-downloads: failed to start', e);
        }
        return;
      }
      tries += 1;
      if (tries < 200) setTimeout(poll, 100);
    })();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
