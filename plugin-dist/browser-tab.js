/*
  SFX Composer — Browser tab.

  A full-panel view opened from the "Browser" button. Two sub-views:

    Browse  — type a web address. Shown in an embedded frame when the site
              allows it; otherwise (or any time you prefer) opened in your
              normal system browser. The panel NEVER downloads audio from a
              website itself and does not try to get around any site's
              restrictions: you download through the site's own official
              download button/link.
    Import  — choose a local audio file, or pick one from your recent
              downloads. Preview it, then import it into the project and place
              it at the playhead (or import to the project only).

  Reuses, unchanged:
    services.bridge        existing host bridge ('sfx.import' places the clip)
    services.audio         existing preview engine (playNow / release)
    services.openExternal  existing safe URL opener (http/https only)
    services.settings      the existing "import onto track" preference

  New host commands (host/sfxbox.jsx): fs.pickAudioFile, fs.recentAudio, and
  an importOnly option on sfx.import.
*/
(function () {
  'use strict';

  var HISTORY_KEY = 'sfxBrowserHistory';
  var FOLDER_KEY = 'sfxBrowserWatchFolder';
  var SLOW_LOAD_MS = 8000;
  var AUDIO_EXTENSIONS = ['wav', 'mp3', 'aif', 'aiff', 'm4a', 'aac', 'flac'];
  var AUDIO_LINK_EXTENSIONS = AUDIO_EXTENSIONS.concat(['ogg']);

  var ICON = {
    globe:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>',
    back:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    external:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/></svg>',
    folder:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg>',
    download:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>',
    refresh:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 10-2.6 6.4M21 12V6m0 6h-6"/></svg>',
    check:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>',
    go:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
  };

  /* ------------------------------------------------------------------ *
   * Small helpers
   * ------------------------------------------------------------------ */
  function debug(level, message, data) {
    if (window.__sfxDebug && typeof window.__sfxDebug[level] === 'function') {
      window.__sfxDebug[level]('browser-tab: ' + message, data);
    }
  }

  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* best effort */
    }
  }

  function extensionOf(name) {
    var m = /\.([A-Za-z0-9]+)$/.exec(String(name || ''));
    return m ? m[1].toLowerCase() : '';
  }

  function baseName(path) {
    var clean = String(path || '').replace(/\\/g, '/');
    return clean.substring(clean.lastIndexOf('/') + 1);
  }

  function formatBytes(n) {
    var bytes = Number(n) || 0;
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
    if (bytes >= 1024) return Math.round(bytes / 1024) + ' KB';
    return bytes + ' B';
  }

  function formatTime(seconds) {
    var s = Math.max(0, Number(seconds) || 0);
    var m = Math.floor(s / 60);
    var rest = s - m * 60;
    return m + ':' + (rest < 10 ? '0' : '') + rest.toFixed(2);
  }

  function formatAge(ms) {
    if (!ms) return '';
    var diff = Math.max(0, Date.now() - ms) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + ' min ago';
    if (diff < 86400) return Math.floor(diff / 3600) + ' h ago';
    return Math.floor(diff / 86400) + ' d ago';
  }

  function errorText(err) {
    if (!err) return 'Unknown error';
    var text = err.message || String(err);
    return err.code ? text + ' [' + err.code + ']' : text;
  }

  /**
   * Turns what the user typed into a safe http(s) URL, or an error message.
   * Anything that is not plain http/https (javascript:, file:, data:, ...) is
   * refused outright.
   */
  function normalizeUrl(input) {
    var text = String(input || '').trim();
    if (text === '') return { error: 'Enter a website address.' };
    if (/\s/.test(text)) return { error: 'That doesn\u2019t look like a valid web address.' };
    if (/^(javascript|data|file|blob|about|chrome|ftp|mailto|vbscript):/i.test(text)) {
      return { error: 'Only http and https addresses are supported.' };
    }
    var candidate = /^https?:\/\//i.test(text) ? text : 'https://' + text;
    var url;
    try {
      url = new URL(candidate);
    } catch (e) {
      return { error: 'That doesn\u2019t look like a valid web address.' };
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { error: 'Only http and https addresses are supported.' };
    }
    if (url.hostname.indexOf('.') === -1 && url.hostname !== 'localhost') {
      return { error: 'That doesn\u2019t look like a valid web address.' };
    }
    return { url: url.href, hostname: url.hostname, pathname: url.pathname };
  }

  function isDirectAudioLink(pathname) {
    return AUDIO_LINK_EXTENSIONS.indexOf(extensionOf(pathname)) !== -1;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(className, iconSvg, label, onClick) {
    var b = el('button', className);
    b.type = 'button';
    b.innerHTML = (iconSvg || '') + '<span></span>';
    b.lastChild.textContent = label;
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }

  function setButtonLabel(b, iconSvg, label) {
    b.innerHTML = (iconSvg || '') + '<span></span>';
    b.lastChild.textContent = label;
  }

  /* ------------------------------------------------------------------ *
   * Main
   * ------------------------------------------------------------------ */
  function build(services) {
    var bridge = services.bridge;
    var audio = services.audio;

    var state = {
      view: 'browse', // 'browse' | 'import'
      selected: null, // {path, name, sizeBytes}
      recent: { status: 'idle', files: [], folderPath: '', message: '' },
      busy: false,
      previewId: null,
      previewState: 'idle'
    };

    var loadTimer = null;
    var focusTimer = null;
    var previewButtons = []; // {id, button}

    /* ---------------- skeleton ---------------- */
    var openBtn = el('button');
    openBtn.type = 'button';
    openBtn.id = 'sfx-browser-open';
    openBtn.innerHTML = ICON.globe + '<span>Browser</span>';
    document.body.appendChild(openBtn);

    var overlay = el('div');
    overlay.id = 'sfx-browser';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Browser');

    var header = el('div', 'sfx-br__header');
    var backBtn = button('sfx-br__btn', ICON.back, 'Back', closeOverlay);
    backBtn.title = 'Back to the library';
    header.appendChild(backBtn);
    header.appendChild(el('span', 'sfx-br__title', 'Browser'));
    var tabs = el('div', 'sfx-br__tabs');
    var tabBrowse = el('button', 'sfx-br__tab', 'Browse');
    var tabDownloads = el('button', 'sfx-br__tab', 'Downloads');
    var tabImport = el('button', 'sfx-br__tab', 'Import');
    tabBrowse.type = 'button';
    tabDownloads.type = 'button';
    tabImport.type = 'button';
    tabBrowse.addEventListener('click', function () {
      setView('browse');
    });
    tabDownloads.addEventListener('click', function () {
      setView('downloads');
    });
    tabImport.addEventListener('click', function () {
      setView('import');
    });
    tabs.appendChild(tabBrowse);
    tabs.appendChild(tabDownloads);
    tabs.appendChild(tabImport);
    header.appendChild(tabs);
    overlay.appendChild(header);

    var body = el('div', 'sfx-br__body');
    overlay.appendChild(body);

    var browseView = el('div', 'sfx-br__view');
    var downloadsView = el('div', 'sfx-br__view');
    var importView = el('div', 'sfx-br__view');
    body.appendChild(browseView);
    body.appendChild(downloadsView);
    body.appendChild(importView);

    // Extension points used by browser-downloads.js (the real-browser companion).
    var hooks = { navigate: null, onView: [] };

    var statusEl = el('div', 'sfx-br__status');
    statusEl.setAttribute('role', 'status');
    overlay.appendChild(statusEl);

    document.body.appendChild(overlay);

    /* ---------------- status bar ---------------- */
    function setStatus(tone, title, lines) {
      statusEl.innerHTML = '';
      statusEl.className = 'sfx-br__status is-visible is-' + tone;
      if (tone === 'working') {
        statusEl.appendChild(el('span', 'sfx-br__spinner'));
      }
      var bodyNode = el('div', 'sfx-br__status-body');
      bodyNode.appendChild(el('div', 'sfx-br__status-title', title));
      (lines || []).forEach(function (line) {
        bodyNode.appendChild(el('div', 'sfx-br__status-line', line));
      });
      statusEl.appendChild(bodyNode);
      if (tone !== 'working') {
        var close = el('button', 'sfx-br__status-close', '\u00D7');
        close.type = 'button';
        close.title = 'Dismiss';
        close.addEventListener('click', clearStatus);
        statusEl.appendChild(close);
      }
    }

    function clearStatus() {
      statusEl.className = 'sfx-br__status';
      statusEl.innerHTML = '';
    }

    /* ---------------- overlay open/close ---------------- */
    function openOverlay() {
      overlay.classList.add('is-open');
      setView(state.view);
    }

    function closeOverlay() {
      overlay.classList.remove('is-open');
      stopPreview();
    }

    openBtn.addEventListener('click', openOverlay);
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && overlay.classList.contains('is-open')) closeOverlay();
    });

    function setView(view) {
      state.view = view;
      tabBrowse.className = 'sfx-br__tab' + (view === 'browse' ? ' is-active' : '');
      tabDownloads.className = 'sfx-br__tab' + (view === 'downloads' ? ' is-active' : '');
      tabImport.className = 'sfx-br__tab' + (view === 'import' ? ' is-active' : '');
      browseView.className = 'sfx-br__view' + (view === 'browse' ? ' is-active' : '');
      downloadsView.className = 'sfx-br__view' + (view === 'downloads' ? ' is-active' : '');
      importView.className = 'sfx-br__view' + (view === 'import' ? ' is-active' : '');
      if (view === 'import' && state.recent.status === 'idle') loadRecent();
      hooks.onView.forEach(function (fn) {
        try {
          fn(view);
        } catch (e) {
          debug('error', 'view hook failed', e);
        }
      });
    }

    /* ================================================================ *
     * BROWSE
     * ================================================================ */
    var history = readJson(HISTORY_KEY, []);
    var currentUrl = null;

    var urlBar = el('div', 'sfx-br__urlbar');
    var urlInput = el('input', 'sfx-br__input');
    urlInput.type = 'text';
    urlInput.placeholder = 'Paste a website address\u2026';
    urlInput.setAttribute('aria-label', 'Website address');
    urlInput.setAttribute('list', 'sfx-br-history');
    urlInput.spellcheck = false;
    var datalist = document.createElement('datalist');
    datalist.id = 'sfx-br-history';
    var goBtn = button('sfx-br__btn sfx-br__btn--primary', ICON.go, 'Go', function () {
      navigate(false);
    });
    var sysBtn = button('sfx-br__btn', ICON.external, 'System browser', function () {
      navigate(true);
    });
    sysBtn.title = 'Open this address in your normal web browser';
    urlBar.appendChild(urlInput);
    urlBar.appendChild(goBtn);
    urlBar.appendChild(sysBtn);
    urlBar.appendChild(datalist);
    urlInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') navigate(false);
    });
    urlInput.addEventListener('input', function () {
      if (urlError.style.display !== 'none') showUrlError('');
    });
    browseView.appendChild(urlBar);

    var urlError = el('div', 'sfx-br__urlerror');
    urlError.style.display = 'none';
    browseView.appendChild(urlError);

    var stage = el('div', 'sfx-br__stage');
    browseView.appendChild(stage);

    var noticeEl = el('div', 'sfx-br__notice');
    noticeEl.style.display = 'none';
    browseView.appendChild(noticeEl);

    var footer = el('div', 'sfx-br__footer');
    footer.appendChild(
      el('span', '', 'Downloaded a sound through the site\u2019s own download button? Bring it in from the Import tab.')
    );
    footer.appendChild(
      button('sfx-br__btn sfx-br__btn--small', ICON.download, 'Import', function () {
        setView('import');
        loadRecent();
      })
    );
    browseView.appendChild(footer);

    function renderHistory() {
      datalist.innerHTML = '';
      history.forEach(function (u) {
        var opt = document.createElement('option');
        opt.value = u;
        datalist.appendChild(opt);
      });
    }

    function rememberUrl(url) {
      history = [url].concat(
        history.filter(function (u) {
          return u !== url;
        })
      ).slice(0, 8);
      writeJson(HISTORY_KEY, history);
      renderHistory();
    }

    function showUrlError(message) {
      urlError.textContent = message || '';
      urlError.style.display = message ? 'block' : 'none';
    }

    function showNotice(text, withSystemButton) {
      noticeEl.innerHTML = '';
      if (!text) {
        noticeEl.style.display = 'none';
        return;
      }
      noticeEl.style.display = 'flex';
      noticeEl.appendChild(el('span', '', text));
      if (withSystemButton) {
        noticeEl.appendChild(
          button('sfx-br__btn sfx-br__btn--small', ICON.external, 'Open in system browser', function () {
            openInSystemBrowser(currentUrl);
          })
        );
      }
    }

    function showStageEmpty() {
      stage.innerHTML = '';
      var empty = el('div', 'sfx-br__empty');
      empty.innerHTML = '<strong>Browse an audio library</strong>';
      empty.appendChild(
        document.createTextNode(
          'Enter the address of a sound library you are allowed to use, then press Go. ' +
            'If a site won\u2019t display here, use \u201CSystem browser\u201D. ' +
            'Download only through the site\u2019s official download option.'
        )
      );
      stage.appendChild(empty);
    }

    function openInSystemBrowser(url) {
      if (!url) return;
      var ok = false;
      try {
        ok = services.openExternal(url);
      } catch (e) {
        ok = false;
      }
      if (ok) {
        setStatus('ok', 'Opened in your system browser', [
          'Download the file there with the site\u2019s own download button, then come back to the Import tab.'
        ]);
        debug('info', 'opened in system browser', url);
      } else {
        setStatus('error', 'Couldn\u2019t open your system browser', ['Copy the address and open it manually: ' + url]);
        debug('warn', 'openExternal failed', url);
      }
    }

    function clearLoadTimer() {
      if (loadTimer) {
        clearTimeout(loadTimer);
        loadTimer = null;
      }
    }

    function navigate(useSystemBrowser) {
      var raw = String(urlInput.value || '').trim();
      // If the field is empty but we already have a page loaded, reload/use that URL
      // instead of showing a red error (common when the address bar was cleared).
      if (!raw && currentUrl) {
        raw = currentUrl;
        urlInput.value = currentUrl;
      }
      var parsed = normalizeUrl(raw);
      if (parsed.error) {
        // Only show validation error after an explicit navigation attempt
        showUrlError(parsed.error);
        debug('warn', 'invalid url', urlInput.value);
        return;
      }
      showUrlError('');
      currentUrl = parsed.url;
      urlInput.value = parsed.url;
      rememberUrl(parsed.url);
      clearStatus();
      clearLoadTimer();

      if (useSystemBrowser) {
        openInSystemBrowser(parsed.url);
        return;
      }

      // When the real companion browser is running it takes over navigation.
      if (hooks.navigate && hooks.navigate({ url: parsed.url, newTab: false }) === true) return;

      if (isDirectAudioLink(parsed.pathname)) {
        showAudioLink(parsed.url);
        return;
      }

      showFrame(parsed.url);
    }

    function showFrame(url) {
      stage.innerHTML = '';
      var frame = el('iframe', 'sfx-br__frame');
      // Sandboxed so a page can't navigate the whole panel away. Downloads,
      // forms and scripts stay allowed so a site's own download button works.
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-downloads');
      frame.setAttribute('title', 'Embedded website');

      var loading = el('div', 'sfx-br__loading');
      loading.appendChild(el('span', 'sfx-br__spinner'));
      loading.appendChild(el('span', '', 'Loading\u2026'));

      stage.appendChild(frame);
      stage.appendChild(loading);
      showNotice('', false);

      frame.addEventListener('load', function () {
        clearLoadTimer();
        if (loading.parentNode) loading.parentNode.removeChild(loading);
        // A site that refuses to be embedded still fires "load" (with a blank
        // or error page), and the panel cannot read cross-origin frames to
        // tell the difference. So the hint stays visible instead of guessing.
        showNotice(
          'Blank page or \u201Crefused to connect\u201D? This site doesn\u2019t allow embedding.',
          true
        );
        debug('info', 'frame load event', url);
      });

      loadTimer = setTimeout(function () {
        if (loading.parentNode) loading.parentNode.removeChild(loading);
        showNotice('This page is taking a long time to show here, or isn\u2019t allowed to be embedded.', true);
        debug('warn', 'frame slow/blocked', url);
      }, SLOW_LOAD_MS);

      frame.src = url;
    }

    function showAudioLink(url) {
      stage.innerHTML = '';
      showNotice('', false);
      var card = el('div', 'sfx-br__audio-card');
      card.appendChild(el('strong', '', 'Direct audio link'));
      card.appendChild(el('div', '', baseName(url.split('?')[0])));
      var player = document.createElement('audio');
      player.controls = true;
      player.preload = 'none';
      player.src = url;
      var message = el('div', 'sfx-br__hint');
      message.textContent =
        'Playing this link here is a preview only. To import it, download it with the site\u2019s official ' +
        'download option, then use the Import tab.';
      player.addEventListener('error', function () {
        message.textContent =
          'This link couldn\u2019t be played here (it may need a login, or the site blocks direct playback). ' +
          'Open it in your system browser instead.';
        debug('warn', 'audio link failed to play', url);
      });
      card.appendChild(player);
      card.appendChild(message);
      card.appendChild(
        button('sfx-br__btn sfx-br__btn--small', ICON.external, 'Open in system browser', function () {
          openInSystemBrowser(url);
        })
      );
      stage.appendChild(card);
    }

    renderHistory();
    showStageEmpty();

    /* ================================================================ *
     * IMPORT
     * ================================================================ */
    var scroll = el('div', 'sfx-br__scroll');
    importView.appendChild(scroll);

    var chooseBtn = button('sfx-br__btn sfx-br__btn--primary', ICON.folder, 'Choose audio file\u2026', chooseFile);
    scroll.appendChild(chooseBtn);
    scroll.appendChild(
      el(
        'div',
        'sfx-br__hint',
        'WAV, MP3, AIFF, M4A, AAC or FLAC. Which of these actually imports depends on your Adobe app and version.'
      )
    );

    var selectedHolder = el('div');
    scroll.appendChild(selectedHolder);

    var recentHead = el('div', 'sfx-br__section-head');
    recentHead.appendChild(el('span', '', 'Recent downloads'));
    var recentPath = el('span', 'sfx-br__path', '');
    recentHead.appendChild(recentPath);
    recentHead.appendChild(button('sfx-br__btn sfx-br__btn--small', ICON.refresh, 'Refresh', function () {
      loadRecent();
    }));
    recentHead.appendChild(button('sfx-br__btn sfx-br__btn--small', ICON.folder, 'Folder\u2026', changeFolder));
    scroll.appendChild(recentHead);

    var recentList = el('div', 'sfx-br__list');
    scroll.appendChild(recentList);

    /* ---------------- file selection ---------------- */
    function validateFile(file) {
      if (!file || typeof file.path !== 'string' || file.path.trim() === '') {
        return 'No file was selected.';
      }
      var ext = extensionOf(file.path);
      if (AUDIO_EXTENSIONS.indexOf(ext) === -1) {
        return (
          'Unsupported format' + (ext ? ' (.' + ext + ')' : '') + '. Choose one of: ' +
          AUDIO_EXTENSIONS.join(', ').toUpperCase() + '.'
        );
      }
      return '';
    }

    function selectFile(file) {
      stopPreview();
      state.selected = file;
      renderSelected();
      renderRecent();
    }

    function chooseFile() {
      if (state.busy) return;
      state.busy = true;
      renderSelected();
      setStatus('working', 'Waiting for you to choose a file\u2026', ['The file chooser opens in front of Premiere Pro / After Effects.']);

      bridge
        .invoke('fs.pickAudioFile', {
          prompt: 'Choose an audio file to import',
          startPath: readJson(FOLDER_KEY, '')
        })
        .then(function (res) {
          if (!res || res.path === null || res.path === undefined) {
            setStatus('ok', 'No file selected', ['You cancelled the file chooser. Nothing was imported.']);
            return;
          }
          clearStatus();
          selectFile({ path: res.path, name: res.name || baseName(res.path), sizeBytes: res.sizeBytes || 0 });
          debug('info', 'file chosen', res.path);
        })
        .catch(function (err) {
          debug('error', 'file chooser failed', errorText(err));
          setStatus('error', 'Couldn\u2019t choose that file', [errorText(err)]);
        })
        .then(function () {
          state.busy = false;
          renderSelected();
        });
    }

    function changeFolder() {
      if (state.busy) return;
      bridge
        .invoke('fs.pickFolder', {
          prompt: 'Choose the folder your downloads are saved to',
          startPath: readJson(FOLDER_KEY, '')
        })
        .then(function (res) {
          if (res && res.path) {
            writeJson(FOLDER_KEY, res.path);
            loadRecent();
          }
        })
        .catch(function (err) {
          debug('error', 'folder chooser failed', errorText(err));
          setStatus('error', 'Couldn\u2019t choose that folder', [errorText(err)]);
        });
    }

    function loadRecent() {
      state.recent.status = 'loading';
      renderRecent();
      bridge
        .invoke('fs.recentAudio', { folderPath: readJson(FOLDER_KEY, '') || '~/Downloads', limit: 15 })
        .then(function (res) {
          if (!res.exists) {
            state.recent = {
              status: 'missing',
              files: [],
              folderPath: res.folderPath,
              message: 'That folder doesn\u2019t exist. Use \u201CFolder\u2026\u201D to pick where your downloads are saved.'
            };
          } else {
            state.recent = { status: res.files.length ? 'ready' : 'empty', files: res.files, folderPath: res.folderPath, message: '' };
          }
          debug('info', 'recent audio loaded', { folder: res.folderPath, count: res.files ? res.files.length : 0 });
        })
        .catch(function (err) {
          debug('error', 'recent audio failed', errorText(err));
          state.recent = { status: 'error', files: [], folderPath: '', message: errorText(err) };
        })
        .then(renderRecent);
    }

    window.addEventListener('focus', function () {
      // Coming back from the system browser: pick up a fresh download.
      if (!overlay.classList.contains('is-open') || state.view !== 'import' || state.busy) return;
      if (focusTimer) clearTimeout(focusTimer);
      focusTimer = setTimeout(loadRecent, 800);
    });

    /* ---------------- preview ---------------- */
    function previewIdFor(file) {
      return 'browser:' + file.path;
    }

    function stopPreview() {
      if (state.previewId) {
        try {
          audio.release();
        } catch (e) {
          /* nothing playing */
        }
        state.previewId = null;
      }
      updatePreviewButtons();
    }

    function togglePreview(file) {
      var id = previewIdFor(file);
      if (state.previewId === id) {
        stopPreview();
        return;
      }
      var problem = validateFile(file);
      if (problem) {
        setStatus('error', 'Can\u2019t preview this file', [problem]);
        return;
      }
      state.previewId = id;
      updatePreviewButtons();
      // modifiedMs is left out on purpose so the engine doesn't persist a
      // waveform cache entry for a file outside the library.
      Promise.resolve(audio.playNow({ id: id, path: file.path, sizeBytes: file.sizeBytes || 0, name: file.name })).catch(function (err) {
        debug('error', 'preview failed', errorText(err));
        state.previewId = null;
        updatePreviewButtons();
        setStatus('error', 'Couldn\u2019t preview this file', [errorText(err)]);
      });
    }

    audio.subscribe(function (audioState) {
      if (!state.previewId) return;
      if (audioState.kind === 'failed' && audioState.id === state.previewId) {
        state.previewId = null;
        setStatus('error', 'Couldn\u2019t preview this file', [audioState.message || 'It could not be decoded for preview.']);
      } else if (audioState.kind === 'idle' || (audioState.id && audioState.id !== state.previewId)) {
        state.previewId = null;
      }
      updatePreviewButtons();
    });

    function previewButtonFor(file) {
      var b = button('sfx-br__btn sfx-br__btn--small', ICON.play, 'Preview', function (event) {
        event.stopPropagation();
        togglePreview(file);
      });
      previewButtons.push({ id: previewIdFor(file), button: b });
      return b;
    }

    /** Forget preview buttons whose rows have been removed from the page. */
    function pruneButtons() {
      previewButtons = previewButtons.filter(function (entry) {
        return document.body.contains(entry.button);
      });
    }

    function updatePreviewButtons() {
      previewButtons.forEach(function (entry) {
        var active = state.previewId === entry.id;
        setButtonLabel(entry.button, active ? ICON.stop : ICON.play, active ? 'Stop' : 'Preview');
      });
    }

    /* ---------------- rendering ---------------- */
    function renderSelected() {
      selectedHolder.innerHTML = '';
      previewButtons = previewButtons.filter(function (entry) {
        return document.body.contains(entry.button);
      });
      var file = state.selected;
      if (!file) return;

      var card = el('div', 'sfx-br__card');
      card.appendChild(el('div', 'sfx-br__card-name', file.name));
      card.appendChild(
        el('div', 'sfx-br__card-meta', extensionOf(file.name).toUpperCase() + ' \u00B7 ' + formatBytes(file.sizeBytes) + ' \u00B7 ' + file.path)
      );
      var actions = el('div', 'sfx-br__card-actions');
      actions.appendChild(previewButtonFor(file));
      var placeBtn = button('sfx-br__btn sfx-br__btn--primary', ICON.check, 'Import & place at playhead', function () {
        importFile(file, true);
      });
      var projectBtn = button('sfx-br__btn', ICON.download, 'Import to project only', function () {
        importFile(file, false);
      });
      placeBtn.disabled = state.busy;
      projectBtn.disabled = state.busy;
      actions.appendChild(placeBtn);
      actions.appendChild(projectBtn);
      card.appendChild(actions);
      selectedHolder.appendChild(card);
      // Essential Sound Studio for audio selections
      var ess = el('div', 'sfx-es-host');
      selectedHolder.appendChild(ess);
      try {
        if (window.__sfxEssentialSound && typeof window.__sfxEssentialSound.mount === 'function') {
          var ext = extensionOf(file.name || file.path);
          var audioExts = ['wav', 'mp3', 'aif', 'aiff', 'flac', 'ogg', 'm4a', 'aac'];
          if (audioExts.indexOf(ext) !== -1) {
            window.__sfxEssentialSound.mount(ess, file);
          } else {
            ess.innerHTML = '';
          }
        }
      } catch (e) {
        debug('warn', 'essential sound mount failed', errorText(e));
      }
      updatePreviewButtons();
    }

    function renderRecent() {
      var r = state.recent;
      recentPath.textContent = r.folderPath ? r.folderPath : '';
      recentPath.title = r.folderPath || '';
      recentList.innerHTML = '';
      previewButtons = previewButtons.filter(function (entry) {
        return document.body.contains(entry.button);
      });

      if (r.status === 'loading' || r.status === 'idle') {
        recentList.appendChild(el('div', 'sfx-br__list-msg', 'Looking for audio files\u2026'));
        return;
      }
      if (r.status === 'error') {
        recentList.appendChild(el('div', 'sfx-br__list-msg', 'Couldn\u2019t read the folder: ' + r.message));
        return;
      }
      if (r.status === 'missing') {
        recentList.appendChild(el('div', 'sfx-br__list-msg', r.message));
        return;
      }
      if (r.status === 'empty') {
        recentList.appendChild(
          el(
            'div',
            'sfx-br__list-msg',
            'No audio files found in this folder yet. Download a file through the site\u2019s official download option, then press Refresh.'
          )
        );
        return;
      }

      r.files.forEach(function (file) {
        var row = el('div', 'sfx-br__row' + (state.selected && state.selected.path === file.path ? ' is-selected' : ''));
        var main = el('div', 'sfx-br__row-main');
        main.appendChild(el('div', 'sfx-br__row-name', file.name));
        main.appendChild(el('div', 'sfx-br__row-meta', formatBytes(file.sizeBytes) + ' \u00B7 ' + formatAge(file.modifiedMs)));
        row.appendChild(main);
        row.appendChild(previewButtonFor(file));
        row.addEventListener('click', function () {
          selectFile(file);
        });
        recentList.appendChild(row);
      });
      updatePreviewButtons();
    }

    /* ---------------- import / place ---------------- */
    function configuredTrack() {
      try {
        var value = services.settings && services.settings.value ? services.settings.value.importTrack : null;
        return typeof value === 'number' && value >= 1 ? value : null;
      } catch (e) {
        return null;
      }
    }

    var VIDEO_EXTENSIONS = ['mp4', 'mov', 'm4v', 'avi', 'mxf', 'mkv', 'webm'];
    var IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'tif', 'tiff', 'bmp', 'psd', 'webp'];

    function kindOfFile(file) {
      var ext = extensionOf(file && file.path);
      if (AUDIO_EXTENSIONS.indexOf(ext) !== -1) return 'audio';
      if (VIDEO_EXTENSIONS.indexOf(ext) !== -1) return 'video';
      if (IMAGE_EXTENSIONS.indexOf(ext) !== -1) return 'image';
      return '';
    }

    function describePlacement(res) {
      var at = ' at ' + formatTime(res.startSeconds);
      if (res.laneKind === 'video') return 'Placed on V' + (res.laneIndex + 1) + at;
      if (res.laneKind === 'layer' || res.host === 'aftereffects') return 'Placed as layer ' + res.laneIndex + at;
      return 'Placed on A' + (res.laneIndex + 1) + at;
    }

    function importCall(file, kind, place) {
      if (kind === 'audio') {
        // Audio keeps using the existing command and the user's "import onto track" setting.
        return place
          ? bridge.invoke('sfx.import', {
              path: file.path,
              atPlayhead: true,
              snapToFrame: true,
              gainDb: 0,
              trackNumber: configuredTrack()
            })
          : bridge.invoke('sfx.import', { path: file.path, importOnly: true });
      }
      return bridge.invoke('asset.import', { path: file.path, mode: place ? 'timeline' : 'project' });
    }

    /**
     * Imports one file (audio, video or image) and optionally places it at the
     * playhead. Resolves with {ok, placed, imported, tone, title, lines} and never
     * rejects. Success is reported only when the host confirms it; if placement
     * fails but the file itself is fine, it is imported to the project and the
     * outcome says plainly that it was NOT placed.
     */
    function performImport(file, mode) {
      var place = mode === 'timeline';
      var kind = kindOfFile(file);
      var name = (file && file.name) || baseName(file && file.path);

      if (!file || typeof file.path !== 'string' || file.path.trim() === '') {
        return Promise.resolve({ ok: false, tone: 'error', title: 'Can\u2019t import this file', lines: ['No file was selected.'] });
      }
      if (kind === '') {
        var ext = extensionOf(file.path);
        return Promise.resolve({
          ok: false,
          tone: 'error',
          title: 'Can\u2019t import this file',
          lines: ['Unsupported format' + (ext ? ' (.' + ext + ')' : '') + '. Choose one of: ' + AUDIO_EXTENSIONS.concat(VIDEO_EXTENSIONS, IMAGE_EXTENSIONS).join(', ').toUpperCase() + '.']
        });
      }

      debug('info', 'import start', { path: file.path, kind: kind, place: place });

      if (!place) {
        return importCall(file, kind, false).then(
          function (res) {
            if (!res || res.imported !== true) {
              return { ok: false, tone: 'warn', title: 'Import was not confirmed', lines: ['Check the Project panel for ' + name + '.'] };
            }
            debug('info', 'imported (project only)', file.path);
            return { ok: true, imported: true, placed: false, tone: 'ok', title: 'Imported to the project', lines: [name, 'It was not placed on a timeline.'] };
          },
          function (err) {
            debug('error', 'import failed', errorText(err));
            return { ok: false, tone: 'error', title: 'Couldn\u2019t import this file', lines: [errorText(err)] };
          }
        );
      }

      return importCall(file, kind, true).then(
        function (res) {
          if (!res || res.placed !== true) {
            // The host answered, but did not confirm placement: do not claim it.
            debug('warn', 'placement not confirmed', res);
            return {
              ok: false,
              imported: true,
              tone: 'warn',
              title: 'Imported, but placement was not confirmed',
              lines: ['Check the timeline. If it isn\u2019t there, drag it in from the Project panel.']
            };
          }
          var lines = [name, describePlacement(res) + ' in \u201C' + res.timelineName + '\u201D.'];
          if (res.createdLane) lines.push('A new audio track was created for it.');
          debug('info', 'placed', res);
          try {
            if (window.__sfxAnalytics && window.__sfxAnalytics.track) {
              window.__sfxAnalytics.track('sound_imported', {
                path: file.path,
                id: file.path,
                name: name,
                placed: true
              });
            }
          } catch (e) {}
          return { ok: true, imported: true, placed: true, tone: 'ok', title: 'Imported and placed', lines: lines };
        },
        function (placeError) {
          debug('error', 'place failed', errorText(placeError));
          var hard = placeError && (placeError.code === 'host/file-not-found' || placeError.code === 'host/unsupported-media');
          if (hard) {
            return { ok: false, tone: 'error', title: 'Couldn\u2019t import this file', lines: [errorText(placeError)] };
          }
          // The host application did not answer at all. Trying an import-only
          // fallback would just wait another 30 seconds on the same busy host,
          // so stop here and say what is going on.
          if (placeError && placeError.code === 'host/timeout') {
            return {
              ok: false,
              tone: 'error',
              title: 'Premiere Pro / After Effects didn\u2019t answer',
              lines: [
                name,
                'The application did not respond within 30 seconds, so nothing was changed.',
                'Look for an open dialog box in the Adobe app, or a busy task (rendering, importing), then try again.',
                'If it keeps happening, use the debug log (if available) and send it.'
              ]
            };
          }
          // Placement failed; still bring the file into the project.
          return importCall(file, kind, false).then(
            function () {
              debug('warn', 'import-only fallback used', errorText(placeError));
              return {
                ok: false,
                imported: true,
                placed: false,
                tone: 'warn',
                title: 'Imported to the project \u2014 NOT placed on the timeline',
                lines: [
                  name,
                  'Reason: ' + (placeError && placeError.message ? placeError.message : 'placement failed').replace(/\.+$/, '') + '.',
                  'Drag it from the Project panel, or fix the cause and try again.'
                ]
              };
            },
            function (err2) {
              debug('error', 'import-only fallback failed', errorText(err2));
              return {
                ok: false,
                tone: 'error',
                title: 'Couldn\u2019t import or place this file',
                lines: ['Placement: ' + errorText(placeError), 'Import: ' + errorText(err2)]
              };
            }
          );
        }
      );
    }

    function importFile(file, placeAtPlayhead) {
      if (state.busy) return;
      var kind = kindOfFile(file);
      var quick = !file || typeof file.path !== 'string' || file.path.trim() === '' || kind === '';
      if (quick) {
        performImport(file, 'timeline').then(function (outcome) {
          setStatus(outcome.tone, outcome.title, outcome.lines);
          debug('warn', 'validation failed', { path: file && file.path });
        });
        return;
      }

      state.busy = true;
      renderSelected();
      setStatus('working', placeAtPlayhead ? 'Importing and placing\u2026' : 'Importing\u2026', [file.name]);

      performImport(file, placeAtPlayhead ? 'timeline' : 'project').then(function (outcome) {
        setStatus(outcome.tone, outcome.title, outcome.lines);
        state.busy = false;
        renderSelected();
      });
    }

    // Everything the Downloads tab (browser-downloads.js) needs from this module.
    var ctx = {
      services: services,
      el: el,
      button: button,
      setButtonLabel: setButtonLabel,
      formatBytes: formatBytes,
      formatTime: formatTime,
      formatAge: formatAge,
      errorText: errorText,
      extensionOf: extensionOf,
      baseName: baseName,
      readJson: readJson,
      writeJson: writeJson,
      debug: debug,
      setStatus: setStatus,
      clearStatus: clearStatus,
      performImport: performImport,
      previewButtonFor: previewButtonFor,
      updatePreviewButtons: updatePreviewButtons,
      pruneButtons: pruneButtons,
      stopPreview: stopPreview,
      setView: setView,
      getView: function () {
        return state.view;
      },
      isOpen: function () {
        return overlay.classList.contains('is-open');
      },
      open: openOverlay,
      close: closeOverlay,
      views: { browse: browseView, downloads: downloadsView, import: importView },
      urlBar: urlBar,
      urlInput: urlInput,
      stage: stage,
      notice: noticeEl,
      footer: footer,
      hooks: hooks,
      ICON: ICON
    };
    window.__sfxBrowserTab = ctx;
    try {
      document.dispatchEvent(new CustomEvent('sfx-browser-tab-ready'));
    } catch (e) {
      /* listeners poll as well */
    }

    renderSelected();
    renderRecent();
    setView('browse');
  }

  /* ------------------------------------------------------------------ *
   * Start once the app's services exist
   * ------------------------------------------------------------------ */
  function start() {
    var attempts = 0;
    (function poll() {
      var s = window.__sfxServices;
      if (s && s.bridge && s.audio && typeof s.openExternal === 'function') {
        try {
          build(s);
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
