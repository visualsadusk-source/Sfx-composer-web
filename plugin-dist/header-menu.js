/*
  SFX Composer — header menu.

  Puts tool buttons (Browser, AI SFX, Analytics, Scene AI) in the panel's top bar,
  right beside the "SFX Composer" title, instead of floating at the bottom.
  The tools themselves are unchanged; this only decides where their buttons are
  and where their panels open (below the top bar).

  The top bar belongs to the main app, which may re-render it. A
  MutationObserver puts the menu back if that happens. If the top bar can't be
  found at all, nothing here activates and the original floating buttons stay.
*/
(function () {
  'use strict';

  var ICON = {
    globe:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>',
    sparkle:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"/><path d="M19 3l.6 1.7L21 5.3l-1.4.6L19 7.6l-.6-1.7L17 5.3l1.4-.6L19 3z"/></svg>',
    chart:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5M4 19h16M8 17V9M12 17v-6M16 17v-3"/></svg>',
    film:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 12h18"/></svg>',
    wave:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 12h2l2-6 3 12 3-9 2 3h6"/></svg>'
  };

  var TOOLS = [
    { id: 'browser', label: 'Browser', icon: ICON.globe, title: 'Built-in browser, downloads and import', api: function () { return window.__sfxBrowserTab ? { isOpen: window.__sfxBrowserTab.isOpen, setOpen: function (v) { v ? window.__sfxBrowserTab.open() : window.__sfxBrowserTab.close(); } } : null; } },
    { id: 'ai', label: 'AI SFX', icon: ICON.sparkle, title: 'AI SFX Assistant (local AI)', api: function () { return window.__sfxAiAssistant || null; } },
    { id: 'analytics', label: 'Analytics', icon: ICON.chart, title: 'Usage analytics (local only)', api: function () { return window.__sfxAnalytics || null; } },
    { id: 'scene', label: 'Scene AI', icon: ICON.film, title: 'Local Scene Sound Designer', api: function () { return window.__sfxSceneDesigner || null; } },
    { id: 'audio', label: 'Audio Tools', icon: ICON.wave, title: 'Trim, fade, normalize, volume (non-destructive)', api: function () { return window.__sfxAudioTools || null; } }
  ];

  var menu = null;
  var buttons = {};

  function build() {
    menu = document.createElement('div');
    menu.id = 'sfx-header-menu';
    menu.setAttribute('role', 'toolbar');
    menu.setAttribute('aria-label', 'SFX Composer tools');

    TOOLS.forEach(function (tool) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'sfx-hm__btn';
      b.title = tool.title;
      b.setAttribute('aria-pressed', 'false');
      b.innerHTML = tool.icon + '<span></span>';
      b.lastChild.textContent = tool.label;
      b.addEventListener('click', function (event) {
        event.stopPropagation();
        activate(tool.id);
      });
      buttons[tool.id] = b;
      menu.appendChild(b);
    });
  }

  function activate(id) {
    var target = null;
    TOOLS.forEach(function (tool) {
      if (tool.id === id) target = tool.api();
    });
    if (!target) return; // that tool's script isn't ready (yet)
    var opening = !target.isOpen();
    // One tool at a time: close the others first.
    TOOLS.forEach(function (tool) {
      if (tool.id === id) return;
      var other = tool.api();
      if (other && other.isOpen()) other.setOpen(false);
    });
    target.setOpen(opening);
    refresh();
  }

  function refresh() {
    TOOLS.forEach(function (tool) {
      var api = tool.api();
      var open = !!(api && api.isOpen());
      var btn = buttons[tool.id];
      if (!btn) return;
      btn.setAttribute('aria-pressed', open ? 'true' : 'false');
      btn.disabled = !api;
    });
  }

  function measure(header) {
    var r = header.getBoundingClientRect();
    var root = document.documentElement.style;
    root.setProperty('--sfx-hm-bottom', Math.round(r.bottom) + 'px');
    root.setProperty('--sfx-hm-top', Math.round(r.bottom + 6) + 'px');
  }

  function attach() {
    var header = document.querySelector('.sfx-shell__header');
    var title = header && header.querySelector('.sfx-shell__title');
    if (!header || !title) {
      document.documentElement.classList.remove('sfx-has-header-menu');
      return false;
    }
    if (!menu) build();
    if (menu.previousElementSibling !== title || menu.parentNode !== header) {
      title.insertAdjacentElement('afterend', menu);
    }
    document.documentElement.classList.add('sfx-has-header-menu');
    measure(header);
    refresh();
    return true;
  }

  function start() {
    var tries = 0;
    (function wait() {
      if (attach()) {
        // The app can re-render its header; keep the menu in place.
        var pending = false;
        new MutationObserver(function () {
          if (pending) return;
          pending = true;
          setTimeout(function () {
            pending = false;
            attach();
          }, 50);
        }).observe(document.body, { childList: true, subtree: true });
        window.addEventListener('resize', attach);
        window.addEventListener('sfx-license-changed', refresh);
        document.addEventListener('click', function () {
          setTimeout(refresh, 0);
        });
        return;
      }
      tries += 1;
      if (tries < 100) setTimeout(wait, 150); // ~15 s, then leave the floating buttons alone
    })();
  }

  window.__sfxHeaderMenu = { refresh: refresh, activate: activate };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
