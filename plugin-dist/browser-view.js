/*
  SFX Composer — in-panel browser view and pinned sites.

  The real Chromium browser (browser-companion) can't live inside a CEP panel,
  so while it is "docked" the panel shows a LIVE PICTURE of the active tab and
  forwards your clicks, scrolling and typing to it. The page is still running in
  the real browser; this is a remote view. "Pop out" brings the real window
  back, and "Bring back into the panel" docks it again.

  Also here: the pinned-sites row (up to 12 sites, kept in the browser's own
  settings so the browser's toolbar shows them too, and editable even while the
  browser is closed).
*/
(function () {
  'use strict';

  var FRAME_WAIT_MS = 1500;
  var NO_PICTURE_HINT_MS = 7000;
  var NAMED_KEYS = {
    Enter: 1, Backspace: 1, Delete: 1, Tab: 1, Escape: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1,
    Home: 1, End: 1, PageUp: 1, PageDown: 1
  };

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function init(tab, companion) {
    var el = tab.el;
    var button = tab.button;
    var ICON = tab.ICON;
    var browse = tab.views.browse;
    var snap = companion.snapshot();

    var PIN_ICON =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6z"/></svg>';
    var POP_ICON = ICON.external;
    var DOCK_ICON =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/></svg>';
    var ARROW_L = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>';
    var ARROW_R = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>';
    var HOME =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11l8-7 8 7M6 10v10h12V10"/></svg>';

    /* ================================================================ *
     * Pinned sites
     * ================================================================ */
    var pinsRow = el('div', 'sfx-br__pins');
    browse.insertBefore(pinsRow, browse.firstChild);

    function activeTabInfo() {
      var tabs = (snap.browser && snap.browser.tabs) || [];
      return tabs.filter(function (t) {
        return t.active;
      })[0] || null;
    }

    function installed() {
      try {
        return companion.isInstalled();
      } catch (e) {
        return false;
      }
    }

    function openPin(pin) {
      if (companion.isConnected()) {
        companion
          .navigate(pin.url, false)
          .then(function () {
            tab.clearStatus();
          })
          .catch(function (err) {
            tab.setStatus('error', 'The browser couldn\u2019t open ' + pin.title, [tab.errorText(err)]);
          });
        return;
      }
      if (installed()) {
        tab.setStatus('working', 'Opening the browser\u2026', [pin.title]);
        companion
          .launch()
          .then(function () {
            companion.startWatching();
            return companion.navigate(pin.url, false);
          })
          .then(function () {
            tab.clearStatus();
          })
          .catch(function (err) {
            tab.setStatus('error', 'Couldn\u2019t open ' + pin.title, [tab.errorText(err)]);
          });
        return;
      }
      // Browser not set up: use the quick view / address bar as before.
      tab.urlInput.value = pin.url;
      var go = Array.prototype.filter.call(tab.urlBar.querySelectorAll('button'), function (b) {
        return b.textContent.trim() === 'Go';
      })[0];
      if (go) go.click();
    }

    function removePin(pin) {
      companion.pins.remove(pin.url).catch(function (err) {
        tab.setStatus('error', 'Couldn\u2019t unpin ' + pin.title, [tab.errorText(err)]);
      });
    }

    function pinCurrent() {
      var info = companion.isConnected() ? activeTabInfo() : null;
      var url = info && info.url ? info.url : tab.urlInput.value.trim();
      var title = info && info.title ? info.title : '';
      if (!/^https?:\/\//i.test(url)) {
        tab.setStatus('warn', 'Nothing to pin yet', ['Open a website first (or type its address above), then press Pin.']);
        return;
      }
      companion.pins
        .add(url, title)
        .then(function () {
          tab.clearStatus();
        })
        .catch(function (err) {
          tab.setStatus('warn', 'Couldn\u2019t pin this site', [tab.errorText(err)]);
        });
    }

    function renderPins() {
      var pins = companion.pins.list();
      pinsRow.innerHTML = '';
      pinsRow.appendChild(el('span', 'sfx-br__pins-label', 'Pinned'));

      if (!pins.length) {
        pinsRow.appendChild(el('span', 'sfx-br__pins-empty', 'Pin the sites you use most. They stay here every time you open the browser.'));
      }
      pins.forEach(function (pin) {
        var chip = el('span', 'sfx-br__pin');
        chip.title = pin.url;
        var open = el('button', 'sfx-br__pin-open', pin.title);
        open.type = 'button';
        open.addEventListener('click', function () {
          openPin(pin);
        });
        var close = el('button', 'sfx-br__pin-x', '\u00D7');
        close.type = 'button';
        close.title = 'Unpin ' + pin.title;
        close.setAttribute('aria-label', 'Unpin ' + pin.title);
        close.addEventListener('click', function () {
          removePin(pin);
        });
        chip.appendChild(open);
        chip.appendChild(close);
        pinsRow.appendChild(chip);
      });

      var add = button('sfx-br__btn sfx-br__btn--small', PIN_ICON, 'Pin this site', pinCurrent);
      add.disabled = pins.length >= companion.pins.max;
      add.title = pins.length >= companion.pins.max ? 'You can pin up to ' + companion.pins.max + ' sites' : 'Pin the page you are on';
      pinsRow.appendChild(add);
    }

    /* ================================================================ *
     * Navigation + tabs (visible while the browser is running)
     * ================================================================ */
    var navRow = el('div', 'sfx-br__navrow');
    browse.insertBefore(navRow, tab.stage);

    function safeCall(promise, label) {
      promise.catch(function (err) {
        tab.setStatus('error', label, [tab.errorText(err)]);
      });
    }

    function navButton(icon, title, onClick) {
      var b = button('sfx-br__iconbtn', icon, '', onClick);
      b.title = title;
      b.setAttribute('aria-label', title);
      return b;
    }

    function renderNav() {
      navRow.innerHTML = '';
      if (!snap.connected) {
        navRow.style.display = 'none';
        return;
      }
      navRow.style.display = '';
      var info = activeTabInfo();
      var back = navButton(ARROW_L, 'Back', function () {
        safeCall(companion.nav('back'), 'Back didn\u2019t work');
      });
      back.disabled = !(info && info.canGoBack);
      var fwd = navButton(ARROW_R, 'Forward', function () {
        safeCall(companion.nav('forward'), 'Forward didn\u2019t work');
      });
      fwd.disabled = !(info && info.canGoForward);
      navRow.appendChild(back);
      navRow.appendChild(fwd);
      navRow.appendChild(
        navButton(ICON.refresh, 'Reload', function () {
          safeCall(companion.nav('reload'), 'Reload didn\u2019t work');
        })
      );
      navRow.appendChild(
        navButton(HOME, 'Home page', function () {
          safeCall(companion.nav('home'), 'Home didn\u2019t work');
        })
      );

      var strip = el('div', 'sfx-br__tabstrip');
      ((snap.browser && snap.browser.tabs) || []).forEach(function (t) {
        var chip = el('span', 'sfx-br__tabchip' + (t.active ? ' is-active' : ''));
        var label = el('button', 'sfx-br__tabchip-label', (t.loading ? '\u2026 ' : '') + (t.title || 'New tab'));
        label.type = 'button';
        label.title = t.url || '';
        label.addEventListener('click', function () {
          safeCall(companion.tab('activate', t.id), 'Couldn\u2019t switch tabs');
        });
        var x = el('button', 'sfx-br__pin-x', '\u00D7');
        x.type = 'button';
        x.title = 'Close tab';
        x.setAttribute('aria-label', 'Close tab');
        x.addEventListener('click', function () {
          safeCall(companion.tab('close', t.id), 'Couldn\u2019t close the tab');
        });
        chip.appendChild(label);
        chip.appendChild(x);
        strip.appendChild(chip);
      });
      var plus = navButton(ICON.go, 'New tab', function () {
        safeCall(companion.tab('new'), 'Couldn\u2019t open a new tab');
      });
      plus.innerHTML = '<span>+</span>';
      strip.appendChild(plus);
      navRow.appendChild(strip);

      var docked = !!(snap.browser && snap.browser.dock);
      var mode = button(
        'sfx-br__btn sfx-br__btn--small',
        docked ? POP_ICON : DOCK_ICON,
        docked ? 'Pop out' : 'Dock in panel',
        function () {
          safeCall(companion.setDock(!docked), docked ? 'Couldn\u2019t pop the browser out' : 'Couldn\u2019t dock the browser');
        }
      );
      mode.title = docked ? 'Open the browser in its own window' : 'Show the browser inside this panel';
      navRow.appendChild(mode);
    }

    /* ================================================================ *
     * The live view
     * ================================================================ */
    var live = el('div', 'sfx-br__live');
    browse.insertBefore(live, tab.stage);
    live.style.display = 'none';

    var img = document.createElement('img');
    img.className = 'sfx-br__liveimg';
    img.alt = 'Live view of the browser';
    img.draggable = false;
    live.appendChild(img);

    var hint = el('div', 'sfx-br__livehint', 'Loading the page\u2026');
    live.appendChild(hint);

    var poppedCard = el('div', 'sfx-br__empty');
    poppedCard.style.display = 'none';
    live.appendChild(poppedCard);

    var kbd = document.createElement('textarea');
    kbd.className = 'sfx-br__kbd';
    kbd.setAttribute('aria-label', 'Keyboard input for the browser');
    kbd.setAttribute('autocomplete', 'off');
    kbd.setAttribute('autocorrect', 'off');
    kbd.spellcheck = false;
    live.appendChild(kbd);

    var looping = false;
    var loopId = 0;
    var lastFrameId = 0;
    var haveFrame = false;
    var hintTimer = null;
    var sizeTimer = null;
    var lastSize = '';

    function isDocked() {
      return !!(snap.connected && snap.browser && snap.browser.dock);
    }

    function wantLoop() {
      return isDocked() && tab.isOpen() && tab.getView() === 'browse';
    }

    function syncSize(force) {
      var w = Math.round(live.clientWidth);
      var h = Math.round(live.clientHeight);
      if (w < 50 || h < 50) return;
      var key = w + 'x' + h;
      if (key === lastSize && !force) return;
      lastSize = key;
      companion.setViewport(w, h).catch(function () {});
    }

    function startLoop() {
      if (looping) return;
      looping = true;
      var mine = ++loopId;
      lastFrameId = 0;
      haveFrame = false;
      hint.style.display = '';
      hint.textContent = 'Loading the page\u2026';
      syncSize(true);

      clearTimeout(hintTimer);
      hintTimer = setTimeout(function () {
        if (looping && mine === loopId && !haveFrame) {
          hint.style.display = '';
          hint.textContent = 'No picture yet. If this stays blank, press \u201CPop out\u201D to use the browser in its own window.';
        }
      }, NO_PICTURE_HINT_MS);

      (function next() {
        if (!looping || mine !== loopId) return;
        if (!wantLoop()) {
          stopLoop();
          return;
        }
        companion
          .fetchFrame(lastFrameId, FRAME_WAIT_MS)
          .then(function (frame) {
            if (frame && mine === loopId) {
              lastFrameId = frame.id;
              img.src = frame.dataUrl;
              haveFrame = true;
              hint.style.display = 'none';
            }
          })
          .catch(function () {
            return sleep(600);
          })
          .then(next);
      })();

      clearInterval(sizeTimer);
      sizeTimer = setInterval(function () {
        syncSize(false);
      }, 600);
    }

    function stopLoop() {
      looping = false;
      loopId += 1;
      clearInterval(sizeTimer);
      clearTimeout(hintTimer);
    }

    /* ---------------- input forwarding ---------------- */
    var queue = [];
    var flushTimer = null;
    var flushing = false;
    var lastMoveAt = 0;

    function flush() {
      flushTimer = null;
      if (flushing || !queue.length) return;
      var batch = queue.splice(0, 60);
      flushing = true;
      companion
        .sendInput(batch)
        .catch(function () {})
        .then(function () {
          flushing = false;
          if (queue.length && !flushTimer) flushTimer = setTimeout(flush, 10);
        });
    }

    function push(ev) {
      // Consecutive mouse moves collapse into the latest one.
      var last = queue[queue.length - 1];
      if (ev.t === 'mouse' && ev.k === 'move' && last && last.t === 'mouse' && last.k === 'move') queue[queue.length - 1] = ev;
      else queue.push(ev);
      if (!flushTimer) flushTimer = setTimeout(flush, 25);
    }

    function pos(e) {
      var r = live.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    function mods(e) {
      var m = [];
      if (e.shiftKey) m.push('shift');
      if (e.ctrlKey) m.push('control');
      if (e.altKey) m.push('alt');
      if (e.metaKey) m.push('meta');
      return m;
    }

    function buttonName(e) {
      return e.button === 2 ? 'right' : e.button === 1 ? 'middle' : 'left';
    }

    live.addEventListener('mousedown', function (e) {
      if (!isDocked() || e.target === kbd) return;
      e.preventDefault();
      kbd.focus();
      var p = pos(e);
      push({ t: 'mouse', k: 'down', x: p.x, y: p.y, b: buttonName(e), n: e.detail || 1, m: mods(e) });
      function up(ev) {
        document.removeEventListener('mouseup', up, true);
        var q = pos(ev);
        push({ t: 'mouse', k: 'up', x: q.x, y: q.y, b: buttonName(ev), n: ev.detail || 1, m: mods(ev) });
      }
      document.addEventListener('mouseup', up, true);
    });

    live.addEventListener('mousemove', function (e) {
      if (!isDocked()) return;
      var now = Date.now();
      if (now - lastMoveAt < 40) return;
      lastMoveAt = now;
      var p = pos(e);
      push({ t: 'mouse', k: 'move', x: p.x, y: p.y, b: 'left', m: mods(e) });
    });

    live.addEventListener('contextmenu', function (e) {
      e.preventDefault();
    });

    live.addEventListener(
      'wheel',
      function (e) {
        if (!isDocked()) return;
        e.preventDefault();
        var scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? live.clientHeight : 1;
        var p = pos(e);
        push({ t: 'wheel', x: p.x, y: p.y, dx: e.deltaX * scale, dy: e.deltaY * scale });
      },
      { passive: false }
    );

    kbd.addEventListener('keydown', function (e) {
      if (!isDocked() || e.isComposing) return;
      var m = mods(e);
      if (NAMED_KEYS[e.key]) {
        e.preventDefault();
        push({ t: 'key', k: 'down', key: e.key, m: m });
      } else if ((e.ctrlKey || e.metaKey) && e.key && e.key.length === 1) {
        // Shortcuts such as Ctrl+A / Ctrl+C / Ctrl+V go to the page as key presses.
        e.preventDefault();
        var key = e.key.toLowerCase();
        push({ t: 'key', k: 'down', key: key, m: m });
        push({ t: 'key', k: 'up', key: key, m: m });
      }
    });

    kbd.addEventListener('keyup', function (e) {
      if (!isDocked() || e.isComposing) return;
      if (NAMED_KEYS[e.key]) {
        e.preventDefault();
        push({ t: 'key', k: 'up', key: e.key, m: mods(e) });
      }
    });

    // Typed characters (and other languages / IME) arrive as text.
    kbd.addEventListener('input', function (e) {
      if (!isDocked() || e.isComposing || e.inputType === 'insertCompositionText') return;
      var text = kbd.value;
      kbd.value = '';
      if (text) push({ t: 'text', s: text });
    });
    kbd.addEventListener('compositionend', function (e) {
      if (!isDocked()) return;
      kbd.value = '';
      if (e.data) push({ t: 'text', s: e.data });
    });

    /* ---------------- what to show ---------------- */
    function applyLayout() {
      var connected = snap.connected;
      var docked = isDocked();
      live.style.display = connected ? '' : 'none';
      // The old quick view (a plain web frame) is only for when the real browser isn't running.
      tab.stage.style.display = connected ? 'none' : '';
      tab.notice.style.display = connected ? 'none' : tab.notice.style.display;
      tab.footer.style.display = connected ? 'none' : '';

      img.style.display = docked ? '' : 'none';
      kbd.style.display = docked ? '' : 'none';
      poppedCard.style.display = connected && !docked ? '' : 'none';
      if (connected && !docked) {
        hint.style.display = 'none';
        poppedCard.innerHTML = '';
        poppedCard.appendChild(el('strong', '', 'The browser is open in its own window'));
        poppedCard.appendChild(
          document.createTextNode('Use it there, or bring it back to work inside this panel. Your tabs, logins and downloads stay as they are.')
        );
        var back = button('sfx-br__btn sfx-br__btn--primary sfx-br__btn--small', DOCK_ICON, 'Bring back into the panel', function () {
          safeCall(companion.setDock(true), 'Couldn\u2019t dock the browser');
        });
        back.style.marginTop = '8px';
        poppedCard.appendChild(back);
      }
    }

    function syncAddress() {
      if (!snap.connected) return;
      var info = activeTabInfo();
      if (info && info.url && document.activeElement !== tab.urlInput && tab.urlInput.value !== info.url) {
        tab.urlInput.value = info.url;
      }
    }

    function updateLoop() {
      if (wantLoop()) startLoop();
      else if (looping) stopLoop();
    }

    var renderTimer = null;
    function render() {
      renderPins();
      renderNav();
      applyLayout();
      syncAddress();
      updateLoop();
    }
    function scheduleRender() {
      if (renderTimer) return;
      renderTimer = setTimeout(function () {
        renderTimer = null;
        render();
      }, 80);
    }

    companion.subscribe(function (next) {
      snap = next;
      scheduleRender();
    });
    tab.hooks.onView.push(function () {
      scheduleRender();
    });
    window.addEventListener('resize', function () {
      if (looping) syncSize(false);
    });

    render();
  }

  function start() {
    var tries = 0;
    (function poll() {
      var tab = window.__sfxBrowserTab;
      if (tab && window.__sfxCompanion) {
        try {
          init(tab, window.__sfxCompanion);
          if (window.__sfxDebug) window.__sfxDebug.info('browser-view: ready');
        } catch (e) {
          if (window.__sfxDebug) window.__sfxDebug.error('browser-view: failed to start', e);
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
