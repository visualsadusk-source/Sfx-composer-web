/*
  SFX Composer — Local AI Setup card.

  A self-updating component: call window.__sfxLocalAiSetup.mount(container)
  once, and it keeps itself in sync with window.__localAIManager's state via
  subscribe(). ai-assistant.js uses window.__sfxLocalAiSetup.subscribeReady()
  to know when to reveal its own "What fits here?" button.
*/
(function () {
  'use strict';

  var TERMS_KEY = 'sfxLocalAiTermsAccepted';

  var ICON = {
    sparkle:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"/></svg>',
    download:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>',
    check:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>',
    warning:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l10 18H2L12 3z"/><path d="M12 10v4M12 17h.01"/></svg>',
    refresh:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 10-2.6 6.4M21 12V6m0 6h-6"/></svg>',
    server:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="6" rx="1"/><rect x="3" y="14" width="18" height="6" rx="1"/><circle cx="7" cy="7" r="0.6" fill="currentColor"/><circle cx="7" cy="17" r="0.6" fill="currentColor"/></svg>',
    settings:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.6 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9V9c.2.6.7 1 1.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>'
  };

  function termsAccepted() {
    try {
      return localStorage.getItem(TERMS_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function acceptTerms() {
    try {
      localStorage.setItem(TERMS_KEY, '1');
    } catch (e) {
      /* best effort */
    }
  }

  function bytesToText(n) {
    if (!n) return '0 MB';
    var gb = n / (1024 * 1024 * 1024);
    if (gb >= 1) return gb.toFixed(1) + ' GB';
    var mb = n / (1024 * 1024);
    return mb.toFixed(0) + ' MB';
  }

  function formatModelLabel(model) {
    return model.charAt(0).toUpperCase() + model.slice(1).replace(/[:._-]/g, ' ');
  }

  function LocalAiSetup() {
    this.readyListeners = new Set();
    this.container = null;
    this.showSettings = false;
    this._subscribed = false;
  }

  LocalAiSetup.prototype.subscribeReady = function (fn) {
    this.readyListeners.add(fn);
    var manager = window.__localAIManager;
    if (manager) fn(manager.getState().status === 'ready');
    var self = this;
    return function () {
      self.readyListeners.delete(fn);
    };
  };

  LocalAiSetup.prototype.notifyReady = function (isReady) {
    this.readyListeners.forEach(function (fn) {
      try {
        fn(isReady);
      } catch (e) {
        /* ignore */
      }
    });
  };

  LocalAiSetup.prototype.mount = function (container) {
    this.container = container;
    var manager = window.__localAIManager;

    if (!this._subscribed) {
      this._subscribed = true;
      var self = this;
      manager.subscribe(function (state) {
        self.render(state);
        self.notifyReady(state.status === 'ready');
      });
      // Kick off passive detection immediately — read-only, no consent needed.
      manager.detect();
    } else {
      // Re-mounted into a fresh container (the panel rebuilds its DOM on
      // every open) — paint the current state right away rather than
      // waiting for the next state change.
      this.render(manager.getState());
    }
  };

  LocalAiSetup.prototype.render = function (state) {
    if (!this.container) return;
    this.container.innerHTML = '';
    this.container.appendChild(this.buildCard(state));
  };

  LocalAiSetup.prototype.buildCard = function (state) {
    var self = this;
    var card = document.createElement('div');
    card.id = 'sfx-local-ai-setup';

    var header = document.createElement('div');
    header.className = 'sfx-lai__header';
    header.innerHTML = ICON.sparkle + '<span>LOCAL AI</span>';
    if (state.status === 'ready') {
      var badge = document.createElement('span');
      badge.className = 'sfx-lai__badge';
      badge.textContent = 'FREE \u00B7 0 COST';
      header.appendChild(badge);

      var settingsBtn = document.createElement('button');
      settingsBtn.type = 'button';
      settingsBtn.title = 'Local AI settings';
      settingsBtn.style.cssText =
        'margin-left:6px;background:none;border:none;color:var(--sfx-text-muted,#999);cursor:pointer;width:18px;height:18px;';
      settingsBtn.innerHTML = ICON.settings;
      settingsBtn.addEventListener('click', function () {
        self.showSettings = !self.showSettings;
        self.render(state);
      });
      header.appendChild(settingsBtn);
    }
    card.appendChild(header);

    if (this.showSettings && state.status === 'ready') {
      card.appendChild(this.buildSettingsPanel(state));
      return card;
    }

    switch (state.status) {
      case 'checking':
        card.appendChild(this.buildChecking());
        break;
      case 'not-installed':
        card.appendChild(this.buildNotInstalled());
        break;
      case 'server-not-running':
        card.appendChild(this.buildServerNotRunning());
        break;
      case 'starting-server':
        card.appendChild(this.buildProgressSteps(['Checking system', 'Checking Ollama', 'Starting local server'], 2));
        break;
      case 'model-required':
        card.appendChild(this.buildModelRequired(state));
        break;
      case 'downloading-model':
        card.appendChild(this.buildDownloadingModel(state));
        break;
      case 'testing':
        card.appendChild(this.buildProgressSteps(['Downloading AI model', 'Testing connection'], 1));
        break;
      case 'ready':
        card.appendChild(this.buildReady(state));
        break;
      case 'error':
        card.appendChild(this.buildError(state));
        break;
      default:
        card.appendChild(this.buildChecking());
    }

    return card;
  };

  LocalAiSetup.prototype.buildChecking = function () {
    var wrap = document.createElement('div');
    wrap.className = 'sfx-lai__body';
    wrap.textContent = 'Checking local AI\u2026';
    return wrap;
  };

  LocalAiSetup.prototype.buildTermsGate = function (onAgree) {
    var wrap = document.createElement('div');
    var terms = document.createElement('div');
    terms.className = 'sfx-lai__terms';
    terms.textContent =
      'This installs Ollama, a free, open-source tool (ollama.com), which runs AI models on ' +
      'your own computer. Nothing about your project or media is uploaded anywhere. Models can ' +
      'be several GB and use your disk space, CPU/GPU and electricity while running. You are ' +
      'installing and running Ollama at your own discretion; SFX Composer only talks to it locally.';
    wrap.appendChild(terms);

    var label = document.createElement('label');
    label.className = 'sfx-lai__terms-check';
    var checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    var span = document.createElement('span');
    span.textContent = 'I understand and want to set up Local AI.';
    label.appendChild(checkbox);
    label.appendChild(span);
    wrap.appendChild(label);

    var agreeBtn = document.createElement('button');
    agreeBtn.type = 'button';
    agreeBtn.className = 'sfx-lai__primary-btn';
    agreeBtn.disabled = true;
    agreeBtn.innerHTML = ICON.check + '<span>Agree &amp; Continue</span>';
    checkbox.addEventListener('change', function () {
      agreeBtn.disabled = !checkbox.checked;
    });
    agreeBtn.addEventListener('click', function () {
      acceptTerms();
      onAgree();
    });
    wrap.appendChild(agreeBtn);

    return wrap;
  };

  LocalAiSetup.prototype.buildNotInstalled = function () {
    var manager = window.__localAIManager;
    var wrap = document.createElement('div');
    var body = document.createElement('div');
    body.className = 'sfx-lai__body';
    body.textContent =
      'Your local AI assistant needs Ollama. It runs AI models directly on your computer \u2014 no cloud AI API required.';
    wrap.appendChild(body);

    if (!termsAccepted()) {
      wrap.appendChild(
        this.buildTermsGate(function () {
          manager.openDownloadPage();
        })
      );
      return wrap;
    }

    var installBtn = document.createElement('button');
    installBtn.type = 'button';
    installBtn.className = 'sfx-lai__primary-btn';
    installBtn.innerHTML = ICON.download + '<span>Set Up Local AI</span>';
    installBtn.addEventListener('click', function () {
      manager.openDownloadPage();
    });
    wrap.appendChild(installBtn);

    var hint = document.createElement('div');
    hint.className = 'sfx-lai__body';
    hint.style.marginTop = '6px';
    hint.textContent = 'This opens the official Ollama download page. Once it\u2019s installed, come back here.';
    wrap.appendChild(hint);

    var recheckBtn = document.createElement('button');
    recheckBtn.type = 'button';
    recheckBtn.className = 'sfx-lai__secondary-btn';
    recheckBtn.innerHTML = ICON.refresh + '<span>I\u2019ve installed it \u2014 check again</span>';
    recheckBtn.addEventListener('click', function () {
      manager.detect();
    });
    wrap.appendChild(recheckBtn);

    return wrap;
  };

  LocalAiSetup.prototype.buildServerNotRunning = function () {
    var manager = window.__localAIManager;
    var wrap = document.createElement('div');
    var err = document.createElement('div');
    err.className = 'sfx-lai__error';
    err.innerHTML = ICON.warning + '<span>Ollama is installed but the local server isn\u2019t responding.</span>';
    wrap.appendChild(err);

    var startBtn = document.createElement('button');
    startBtn.type = 'button';
    startBtn.className = 'sfx-lai__primary-btn';
    startBtn.innerHTML = ICON.server + '<span>Start Ollama</span>';
    startBtn.addEventListener('click', function () {
      manager
        .startServer()
        .then(function () {
          manager.detect();
        })
        .catch(function () {
          /* state already reflects the error */
        });
    });
    wrap.appendChild(startBtn);

    var retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.className = 'sfx-lai__secondary-btn';
    retryBtn.innerHTML = ICON.refresh + '<span>Retry</span>';
    retryBtn.addEventListener('click', function () {
      manager.detect();
    });
    wrap.appendChild(retryBtn);

    return wrap;
  };

  LocalAiSetup.prototype.buildModelRequired = function (state) {
    var manager = window.__localAIManager;
    var wrap = document.createElement('div');
    var body = document.createElement('div');
    body.className = 'sfx-lai__body';
    body.innerHTML =
      '<strong>AI MODEL REQUIRED</strong><br/>Model: ' +
      formatModelLabel(state.model) +
      '<br/>This model runs locally on your computer.';
    wrap.appendChild(body);

    if (!termsAccepted()) {
      wrap.appendChild(
        this.buildTermsGate(function () {
          manager.pullModel(state.model);
        })
      );
      return wrap;
    }

    var downloadBtn = document.createElement('button');
    downloadBtn.type = 'button';
    downloadBtn.className = 'sfx-lai__primary-btn';
    downloadBtn.innerHTML = ICON.download + '<span>Download Model</span>';
    downloadBtn.addEventListener('click', function () {
      manager.pullModel(state.model);
    });
    wrap.appendChild(downloadBtn);

    return wrap;
  };

  LocalAiSetup.prototype.buildDownloadingModel = function (state) {
    var wrap = document.createElement('div');
    var body = document.createElement('div');
    body.className = 'sfx-lai__body';
    body.textContent = 'Downloading Local AI Model\u2026';
    wrap.appendChild(body);

    var track = document.createElement('div');
    track.className = 'sfx-lai__progress-track';
    var fill = document.createElement('div');
    fill.className = 'sfx-lai__progress-fill';
    var pct = 0;
    var label = document.createElement('div');
    label.className = 'sfx-lai__progress-label';

    if (state.progress && state.progress.totalBytes) {
      pct = Math.min(100, Math.round((state.progress.completedBytes / state.progress.totalBytes) * 100));
      label.textContent =
        pct + '% \u2014 ' + bytesToText(state.progress.completedBytes) + ' / ' + bytesToText(state.progress.totalBytes);
    } else {
      label.textContent = 'Downloading model\u2026';
    }
    fill.style.width = pct + '%';
    track.appendChild(fill);
    wrap.appendChild(track);
    wrap.appendChild(label);

    return wrap;
  };

  LocalAiSetup.prototype.buildProgressSteps = function (labels, activeIndex) {
    var wrap = document.createElement('div');
    var steps = document.createElement('div');
    steps.className = 'sfx-lai__steps';
    labels.forEach(function (text, i) {
      var row = document.createElement('div');
      var done = i < activeIndex;
      var active = i === activeIndex;
      row.className = 'sfx-lai__step' + (done ? ' is-done' : '') + (active ? ' is-active' : '');
      var marker = active
        ? '<span class="sfx-lai__spinner"></span>'
        : done
        ? ICON.check
        : '<span style="width:12px;display:inline-block;"></span>';
      row.innerHTML = marker + '<span>' + text + '</span>';
      steps.appendChild(row);
    });
    wrap.appendChild(steps);
    return wrap;
  };

  LocalAiSetup.prototype.buildReady = function (state) {
    var wrap = document.createElement('div');

    var ollamaRow = document.createElement('div');
    ollamaRow.className = 'sfx-lai__status-row';
    ollamaRow.innerHTML = '<span><span class="sfx-lai__dot is-ready"></span>Ollama</span><strong>Connected</strong>';
    wrap.appendChild(ollamaRow);

    var modelRow = document.createElement('div');
    modelRow.className = 'sfx-lai__status-row';
    modelRow.innerHTML = '<span>Model</span><strong>' + formatModelLabel(state.model) + '</strong>';
    wrap.appendChild(modelRow);

    return wrap;
  };

  LocalAiSetup.prototype.buildError = function (state) {
    var manager = window.__localAIManager;
    var wrap = document.createElement('div');
    var err = document.createElement('div');
    err.className = 'sfx-lai__error';
    err.innerHTML = ICON.warning + '<span>' + (state.errorMessage || 'Something went wrong.') + '</span>';
    wrap.appendChild(err);

    var retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.className = 'sfx-lai__primary-btn';
    retryBtn.innerHTML = ICON.refresh + '<span>Retry</span>';
    retryBtn.addEventListener('click', function () {
      manager.detect();
    });
    wrap.appendChild(retryBtn);

    var openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'sfx-lai__secondary-btn';
    openBtn.innerHTML = ICON.download + '<span>Open Official Ollama Download</span>';
    openBtn.addEventListener('click', function () {
      manager.openDownloadPage();
    });
    wrap.appendChild(openBtn);

    return wrap;
  };

  LocalAiSetup.prototype.buildSettingsPanel = function (state) {
    var manager = window.__localAIManager;
    var self = this;
    var wrap = document.createElement('div');

    var ollamaRow = document.createElement('div');
    ollamaRow.className = 'sfx-lai__status-row';
    ollamaRow.innerHTML =
      '<span><span class="sfx-lai__dot is-ready"></span>Ollama</span><strong>Connected' +
      (state.version ? ' (v' + state.version + ')' : '') +
      '</strong>';
    wrap.appendChild(ollamaRow);

    var inputStyle =
      'background:var(--sfx-surface-sunken,rgba(0,0,0,.3));color:var(--sfx-text,#fff);border:1px solid var(--sfx-border,rgba(255,255,255,.15));border-radius:4px;font-size:10px;padding:3px 5px;width:110px;';

    var modelRow = document.createElement('div');
    modelRow.className = 'sfx-lai__status-row';
    modelRow.innerHTML = '<span>Model</span>';
    var modelInput = document.createElement('input');
    modelInput.type = 'text';
    modelInput.value = state.model;
    modelInput.style.cssText = inputStyle;
    modelRow.appendChild(modelInput);
    wrap.appendChild(modelRow);

    var changeBtn = document.createElement('button');
    changeBtn.type = 'button';
    changeBtn.className = 'sfx-lai__secondary-btn';
    changeBtn.innerHTML = ICON.download + '<span>Change Model</span>';
    changeBtn.addEventListener('click', function () {
      var name = modelInput.value.trim();
      if (!name) return;
      manager.setModel(name);
      manager.pullModel(name);
    });
    wrap.appendChild(changeBtn);

    var testBtn = document.createElement('button');
    testBtn.type = 'button';
    testBtn.className = 'sfx-lai__secondary-btn';
    testBtn.innerHTML = ICON.check + '<span>Test Connection</span>';
    testBtn.addEventListener('click', function () {
      testBtn.disabled = true;
      testBtn.innerHTML = '<span>Testing\u2026</span>';
      manager.testConnection(state.model).then(function (ok) {
        testBtn.disabled = false;
        testBtn.innerHTML = ok ? ICON.check + '<span>Working</span>' : ICON.warning + '<span>No response</span>';
        setTimeout(function () {
          self.render(state);
        }, 1500);
      });
    });
    wrap.appendChild(testBtn);

    var rerunBtn = document.createElement('button');
    rerunBtn.type = 'button';
    rerunBtn.className = 'sfx-lai__secondary-btn';
    rerunBtn.innerHTML = ICON.refresh + '<span>Re-run Setup</span>';
    rerunBtn.addEventListener('click', function () {
      self.showSettings = false;
      manager.detect();
    });
    wrap.appendChild(rerunBtn);

    var advancedToggle = document.createElement('div');
    advancedToggle.className = 'sfx-lai__settings-toggle';
    var advancedBtn = document.createElement('button');
    advancedBtn.type = 'button';
    advancedBtn.className = 'sfx-lai__link-btn';
    advancedBtn.textContent = 'Advanced';
    var advancedOpen = false;
    var advancedBody = document.createElement('div');
    advancedBody.style.display = 'none';
    var urlRow = document.createElement('div');
    urlRow.className = 'sfx-lai__status-row';
    urlRow.innerHTML = '<span>Ollama URL</span>';
    var urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.value = manager.getOllamaUrl();
    urlInput.style.cssText = inputStyle;
    urlInput.addEventListener('change', function () {
      manager.setOllamaUrl(urlInput.value.trim());
    });
    urlRow.appendChild(urlInput);
    advancedBody.appendChild(urlRow);
    advancedBtn.addEventListener('click', function () {
      advancedOpen = !advancedOpen;
      advancedBody.style.display = advancedOpen ? 'block' : 'none';
    });
    advancedToggle.appendChild(advancedBtn);
    wrap.appendChild(advancedToggle);
    wrap.appendChild(advancedBody);

    var backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'sfx-lai__secondary-btn';
    backBtn.textContent = 'Back';
    backBtn.style.marginTop = '4px';
    backBtn.addEventListener('click', function () {
      self.showSettings = false;
      self.render(state);
    });
    wrap.appendChild(backBtn);

    return wrap;
  };

  window.__sfxLocalAiSetup = new LocalAiSetup();
})();
