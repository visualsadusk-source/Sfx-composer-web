/*
  SFX Composer — AI SFX Assistant (integrated panel section)

  Lives inside the CEP panel like Browser. Full content-area overlay
  with Back button. Reuses __sfxServices and __localAIManager.
*/
(function () {
  'use strict';

  var SETTINGS_KEY = 'sfxAiAssistantSettings';
  var HISTORY_KEY = 'sfxAiChatHistory';
  var MAX_CANDIDATES = 20;
  var REQUEST_TIMEOUT_MS = 60000;
  var MAX_HISTORY = 30;

  var ICON = {
    sparkle:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"/><path d="M19 3l.6 1.7L21 5.3l-1.4.6L19 7.6l-.6-1.7L17 5.3l1.4-.6L19 3z"/></svg>',
    back:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    plus:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    settings:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>',
    send:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    place:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>'
  };

  var DEFAULT_SETTINGS = { mode: 'suggest', minConfidence: 0.55, contextWindowSeconds: 2 };
  var EXAMPLE_PROMPTS = [
    'Find the perfect cinematic impact sound',
    'Suggest SFX for a car commercial',
    'Help me organize my SFX library',
    'Sound design ideas for a trailer'
  ];

  function loadSettings() {
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return Object.assign({}, DEFAULT_SETTINGS);
      return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw));
    } catch (e) {
      return Object.assign({}, DEFAULT_SETTINGS);
    }
  }
  function saveSettings(s) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) {}
  }
  function loadHistory() {
    try {
      var raw = localStorage.getItem(HISTORY_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.slice(0, MAX_HISTORY) : [];
    } catch (e) { return []; }
  }
  function saveHistory(list) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, MAX_HISTORY))); } catch (e) {}
  }

  function waitForServices(cb) {
    var n = 0;
    (function poll() {
      if (window.__sfxServices) return cb(window.__sfxServices);
      if (++n > 150) return;
      setTimeout(poll, 100);
    })();
  }

  function tokenize(text) {
    if (!text) return [];
    return String(text).toLowerCase().split(/[^a-z0-9]+/).filter(function (t) {
      return t.length >= 3 && !/^[0-9]+$/.test(t);
    });
  }

  function scoreAsset(asset, queryTokens) {
    var nameTokens = tokenize(asset.name);
    var folderTokens = tokenize(asset.relativeFolder || asset.folder || '');
    var tagTokens = (asset.metadata && asset.metadata.tags) || [];
    var score = 0;
    queryTokens.forEach(function (qt) {
      if (folderTokens.indexOf(qt) !== -1) score += 3;
      if (tagTokens.indexOf(qt) !== -1) score += 3;
      if (nameTokens.indexOf(qt) !== -1) score += 2;
    });
    if (asset.metadata && asset.metadata.favourite) score += 0.5;
    return score;
  }

  function selectCandidates(library, queryText) {
    var tokens = tokenize(queryText);
    if (!tokens.length) tokens = ['impact', 'whoosh', 'hit'];
    var entries = [];
    try {
      entries = library.entries ? library.entries() : (library.snapshot ? library.snapshot() : []);
    } catch (e) { entries = []; }
    if (!Array.isArray(entries)) entries = [];
    return entries
      .map(function (a) { return { asset: a, score: scoreAsset(a, tokens) }; })
      .filter(function (x) { return x.score > 0; })
      .sort(function (a, b) { return b.score - a.score; })
      .slice(0, MAX_CANDIDATES)
      .map(function (x) { return x.asset; });
  }

  function getLocalAI() { return window.__localAIManager || null; }

  function getOllamaBase() {
    var lai = getLocalAI();
    if (lai && typeof lai.getOllamaUrl === 'function') return lai.getOllamaUrl().replace(/\/$/, '');
    try {
      var s = JSON.parse(localStorage.getItem('sfxLocalAiSettings') || '{}');
      if (s.ollamaUrl) return String(s.ollamaUrl).replace(/\/$/, '');
    } catch (e) {}
    return 'http://localhost:11434';
  }

  function getModelName() {
    var lai = getLocalAI();
    if (lai && lai.state && lai.state.model) return lai.state.model;
    try {
      var s = JSON.parse(localStorage.getItem('sfxLocalAiSettings') || '{}');
      if (s.model) return s.model;
    } catch (e) {}
    return 'llama3.2';
  }

  function getProviders() {
    return window.__sfxAiProviders || null;
  }

  function sfxSystemPrompt(candidates) {
    var lines = [
      'You are the AI SFX Assistant inside SFX Composer (Premiere Pro / After Effects sound-effects panel).',
      'Help the user find, organize, and place sound effects. Be concise and practical.',
      'Prefer concrete file names from the library candidates when relevant.'
    ];
    if (candidates && candidates.length) {
      lines.push('Library candidates (name | folder):');
      candidates.slice(0, 12).forEach(function (a) {
        lines.push('- ' + a.name + (a.relativeFolder || a.folder ? ' | ' + (a.relativeFolder || a.folder) : ''));
      });
    }
    return lines.join('\n');
  }

  /** Unified multi-provider chat. Falls back to direct Ollama if providers not loaded. */
  function callAiChat(userMessage, candidates, historyMessages) {
    var providers = getProviders();
    var system = sfxSystemPrompt(candidates);
    var messages = [];
    (historyMessages || []).forEach(function (m) {
      if (m.role === 'user' || m.role === 'assistant') {
        messages.push({ role: m.role, content: m.text || m.content || '' });
      }
    });
    messages.push({ role: 'user', content: userMessage });

    if (providers && typeof providers.chat === 'function') {
      return providers.whenReady().then(function () {
        return providers.chat({ system: system, messages: messages });
      }).then(function (result) {
        return result.text || '';
      });
    }

    // Fallback: Ollama only
    var prompt = system + '\n\n';
    messages.forEach(function (m) {
      prompt += (m.role === 'assistant' ? 'Assistant: ' : 'User: ') + m.content + '\n';
    });
    prompt += 'Assistant:';
    var base = getOllamaBase();
    var model = getModelName();
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS);
    return fetch(base + '/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model, prompt: prompt, stream: false, options: { temperature: 0.4 } }),
      signal: controller.signal
    }).then(function (res) {
      clearTimeout(timer);
      if (!res.ok) throw new Error('Ollama HTTP ' + res.status);
      return res.json();
    }).then(function (data) {
      return (data && data.response) || '';
    }).finally(function () { clearTimeout(timer); });
  }

  function buildChatPrompt(userMessage, candidates) {
    var lines = [
      'You are the AI SFX Assistant in SFX Composer (Premiere Pro / After Effects sound library).',
      'Help find, organize, and place sound effects. Be concise.',
      ''
    ];
    if (candidates && candidates.length) {
      lines.push('Library candidates (name | folder):');
      candidates.slice(0, 12).forEach(function (a) {
        lines.push('- ' + a.name + (a.relativeFolder || a.folder ? ' | ' + (a.relativeFolder || a.folder) : ''));
      });
      lines.push('');
    }
    lines.push('User: ' + userMessage);
    lines.push('Assistant:');
    return lines.join('\n');
  }

  function buildUI(services) {
    var settings = loadSettings();
    var library = services.library;
    var bridge = services.bridge;
    var audio = services.audio;

    var history = loadHistory();
    var activeChatId = history.length ? history[0].id : null;
    var messages = activeChatId
      ? ((history.find(function (h) { return h.id === activeChatId; }) || {}).messages || []).slice()
      : [];
    var showSettings = false;
    var isGenerating = false;
    var ollamaOnline = false;

    var root = document.createElement('div');
    root.id = 'sfx-ai-assistant';

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.id = 'sfx-ai-assistant__toggle';
    toggle.innerHTML = ICON.sparkle + '<span>AI SFX</span>';
    root.appendChild(toggle);

    var panel = document.createElement('div');
    panel.id = 'sfx-ai-assistant__panel';
    root.appendChild(panel);

    function setOpen(opening) {
      panel.classList.toggle('is-open', !!opening);
      if (opening) {
        refreshOllamaStatus();
        render();
      }
    }

    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      setOpen(!panel.classList.contains('is-open'));
    });

    window.__sfxAiAssistant = {
      isOpen: function () { return panel.classList.contains('is-open'); },
      setOpen: setOpen
    };

    document.body.appendChild(root);

    function uid() {
      return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    function persistActiveChat() {
      if (!activeChatId) return;
      var entry = history.find(function (h) { return h.id === activeChatId; });
      if (entry) {
        entry.messages = messages.slice();
        entry.updatedAt = Date.now();
        if (messages.length && (!entry.title || entry.title === 'New chat')) {
          var u = messages.find(function (m) { return m.role === 'user'; });
          if (u) entry.title = u.text.slice(0, 40);
        }
      }
      saveHistory(history);
    }

    function newChat() {
      activeChatId = uid();
      messages = [];
      history.unshift({ id: activeChatId, title: 'New chat', messages: [], updatedAt: Date.now() });
      if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY);
      saveHistory(history);
      showSettings = false;
      render();
    }

    function loadChat(id) {
      var entry = history.find(function (h) { return h.id === id; });
      if (!entry) return;
      activeChatId = id;
      messages = (entry.messages || []).slice();
      showSettings = false;
      render();
    }

    function refreshOllamaStatus() {
      var providers = getProviders();
      var active = providers ? providers.getActiveProvider() : 'ollama';
      if (active === 'ollama') {
        var lai = getLocalAI();
        if (lai && typeof lai.checkServer === 'function') {
          lai.checkServer()
            .then(function (ok) { ollamaOnline = !!ok; updateStatusUI(); })
            .catch(function () { ollamaOnline = false; updateStatusUI(); });
          return;
        }
        fetch(getOllamaBase() + '/api/version', { method: 'GET' })
          .then(function (r) { ollamaOnline = r.ok; updateStatusUI(); })
          .catch(function () { ollamaOnline = false; updateStatusUI(); });
        return;
      }
      // Cloud: connected if key saved and last test succeeded
      if (providers) {
        providers.whenReady().then(function () {
          var cfg = providers.getConfig(active);
          ollamaOnline = !!cfg.connected;
          updateStatusUI();
        });
      }
    }

    function updateStatusUI() {
      var dot = panel.querySelector('.sfx-ai-ws__status-dot');
      var label = panel.querySelector('.sfx-ai-ws__status-label');
      var providers = getProviders();
      var active = providers ? providers.getActiveProvider() : 'ollama';
      var pname = active;
      if (providers) {
        var p = providers.getProvider(active);
        if (p) pname = p.name;
      }
      if (dot) {
        dot.classList.toggle('is-online', ollamaOnline);
        dot.classList.toggle('is-offline', !ollamaOnline);
      }
      if (label) {
        label.textContent = ollamaOnline ? (pname + ' ready') : (pname + ' offline');
      }
    }

    function scrollChat() {
      var chat = panel.querySelector('.sfx-ai-ws__chat');
      if (chat) chat.scrollTop = chat.scrollHeight;
    }

    function simpleMarkdown(text) {
      var escaped = String(text || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      escaped = escaped.replace(/```([\s\S]*?)```/g, function (_, code) {
        return '<pre><code>' + code.trim() + '</code><button type="button" class="sfx-ai-ws__copy-btn">Copy</button></pre>';
      });
      escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
      return escaped.split(/\n{2,}/).map(function (p) {
        return '<p>' + p.replace(/\n/g, '<br>') + '</p>';
      }).join('');
    }

    function render() {
      panel.innerHTML = '';

      /* Top bar with Back */
      var top = document.createElement('div');
      top.className = 'sfx-ai-ws__top';

      var back = document.createElement('button');
      back.type = 'button';
      back.className = 'sfx-ai-ws__back';
      back.innerHTML = ICON.back + '<span>Back</span>';
      back.addEventListener('click', function () { setOpen(false); });
      top.appendChild(back);

      var title = document.createElement('div');
      title.className = 'sfx-ai-ws__title';
      title.innerHTML = ICON.sparkle + '<span>AI SFX Assistant</span>';
      top.appendChild(title);

      var actions = document.createElement('div');
      actions.className = 'sfx-ai-ws__top-actions';

      var status = document.createElement('div');
      status.className = 'sfx-ai-ws__status-pill';
      status.innerHTML =
        '<span class="sfx-ai-ws__status-dot' + (ollamaOnline ? ' is-online' : ' is-offline') + '"></span>' +
        '<span class="sfx-ai-ws__status-label">' + (ollamaOnline ? 'Local AI connected' : 'Local AI offline') + '</span>';
      actions.appendChild(status);

      var settingsBtn = document.createElement('button');
      settingsBtn.type = 'button';
      settingsBtn.className = 'sfx-ai-ws__icon-btn';
      settingsBtn.title = 'Settings';
      settingsBtn.innerHTML = ICON.settings;
      settingsBtn.addEventListener('click', function () {
        showSettings = !showSettings;
        render();
      });
      actions.appendChild(settingsBtn);

      top.appendChild(actions);
      panel.appendChild(top);

      if (showSettings) {
        panel.appendChild(renderSettings());
        return;
      }

      var body = document.createElement('div');
      body.className = 'sfx-ai-ws__body';

      /* History column */
      var histCol = document.createElement('div');
      histCol.className = 'sfx-ai-ws__history-col';

      var newBtn = document.createElement('button');
      newBtn.type = 'button';
      newBtn.className = 'sfx-ai-ws__new-chat';
      newBtn.innerHTML = ICON.plus + '<span>New Chat</span>';
      newBtn.addEventListener('click', newChat);
      histCol.appendChild(newBtn);

      var histLabel = document.createElement('div');
      histLabel.className = 'sfx-ai-ws__history-label';
      histLabel.textContent = 'Recent';
      histCol.appendChild(histLabel);

      var hist = document.createElement('div');
      hist.className = 'sfx-ai-ws__history';
      if (!history.length) {
        hist.innerHTML = '<div class="sfx-ai-ws__history-empty">No chats yet</div>';
      } else {
        history.forEach(function (h) {
          var item = document.createElement('button');
          item.type = 'button';
          item.className = 'sfx-ai-ws__history-item' + (h.id === activeChatId ? ' is-active' : '');
          item.textContent = h.title || 'Chat';
          item.addEventListener('click', function () { loadChat(h.id); });
          hist.appendChild(item);
        });
      }
      histCol.appendChild(hist);
      body.appendChild(histCol);

      /* Main chat */
      var main = document.createElement('div');
      main.className = 'sfx-ai-ws__main';

      var chat = document.createElement('div');
      chat.className = 'sfx-ai-ws__chat';
      if (!messages.length) {
        chat.appendChild(renderWelcome());
      } else {
        messages.forEach(function (m) { chat.appendChild(renderMessage(m)); });
        if (isGenerating) chat.appendChild(renderTyping());
      }
      main.appendChild(chat);
      main.appendChild(renderInput());
      body.appendChild(main);
      panel.appendChild(body);

      panel.querySelectorAll('.sfx-ai-ws__copy-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var code = btn.parentElement && btn.parentElement.querySelector('code');
          if (code) {
            navigator.clipboard.writeText(code.textContent || '').then(function () {
              btn.textContent = 'Copied';
              setTimeout(function () { btn.textContent = 'Copy'; }, 1000);
            });
          }
        });
      });

      scrollChat();
      updateStatusUI();
    }

    function renderWelcome() {
      var wrap = document.createElement('div');
      wrap.className = 'sfx-ai-ws__welcome';
      wrap.innerHTML =
        '<h2>AI SFX Assistant</h2>' +
        '<p>Find SFX, plan sound design, and work with your library — powered by local Ollama.</p>';
      var prompts = document.createElement('div');
      prompts.className = 'sfx-ai-ws__prompts';
      EXAMPLE_PROMPTS.forEach(function (text) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sfx-ai-ws__prompt';
        btn.textContent = text;
        btn.addEventListener('click', function () { sendMessage(text); });
        prompts.appendChild(btn);
      });
      wrap.appendChild(prompts);
      return wrap;
    }

    function renderMessage(m) {
      var row = document.createElement('div');
      row.className = 'sfx-ai-ws__msg is-' + (m.role === 'user' ? 'user' : 'assistant');
      var avatar = document.createElement('div');
      avatar.className = 'sfx-ai-ws__avatar';
      avatar.innerHTML = m.role === 'user' ? 'You' : ICON.sparkle;
      row.appendChild(avatar);
      var bubble = document.createElement('div');
      bubble.className = 'sfx-ai-ws__bubble';
      if (m.role === 'assistant') {
        bubble.innerHTML = simpleMarkdown(m.text);
        if (m.cards && m.cards.length) bubble.appendChild(renderCards(m.cards));
      } else {
        bubble.textContent = m.text;
      }
      row.appendChild(bubble);
      return row;
    }

    function renderTyping() {
      var row = document.createElement('div');
      row.className = 'sfx-ai-ws__msg is-assistant';
      row.innerHTML =
        '<div class="sfx-ai-ws__avatar">' + ICON.sparkle + '</div>' +
        '<div class="sfx-ai-ws__bubble"><div class="sfx-ai-ws__typing"><span></span><span></span><span></span></div></div>';
      return row;
    }

    function renderCards(cards) {
      var wrap = document.createElement('div');
      wrap.className = 'sfx-ai-ws__cards';
      cards.forEach(function (c) {
        var card = document.createElement('div');
        card.className = 'sfx-ai-ws__card';
        var info = document.createElement('div');
        info.className = 'sfx-ai-ws__card-info';
        info.innerHTML =
          '<div class="sfx-ai-ws__card-name">' + (c.name || 'SFX') + '</div>' +
          '<div class="sfx-ai-ws__card-meta">' + (c.reason || c.folder || '') + '</div>';
        card.appendChild(info);
        var actions = document.createElement('div');
        actions.className = 'sfx-ai-ws__card-actions';
        if (c.path || c.id) {
          var prev = document.createElement('button');
          prev.type = 'button';
          prev.className = 'sfx-ai-ws__card-btn';
          prev.innerHTML = ICON.play + ' Preview';
          prev.addEventListener('click', function () {
            try {
              if (audio && audio.playNow) audio.playNow(c.path || c.id);
              if (window.__sfxAnalytics && window.__sfxAnalytics.track) {
                window.__sfxAnalytics.track('sound_played', { path: c.path || c.id, id: c.path || c.id, name: c.name, category: c.category });
              }
            } catch (e) {}
          });
          actions.appendChild(prev);
          var place = document.createElement('button');
          place.type = 'button';
          place.className = 'sfx-ai-ws__card-btn primary';
          place.innerHTML = ICON.place + ' Place';
          place.addEventListener('click', function () {
            try {
              if (bridge && bridge.request) {
                bridge.request('sfx.import', { path: c.path || c.id }).then(function (res) {
                  try {
                    if (window.__sfxAnalytics && window.__sfxAnalytics.track && res && (res.placed === true || res.ok === true)) {
                      window.__sfxAnalytics.track('sound_imported', {
                        path: c.path || c.id,
                        id: c.path || c.id,
                        name: c.name,
                        category: c.category,
                        placed: res.placed === true || res.ok === true
                      });
                    }
                  } catch (e) {}
                }).catch(function () {});
              }
            } catch (e) {}
          });
          actions.appendChild(place);
        }
        card.appendChild(actions);
        wrap.appendChild(card);
      });
      return wrap;
    }

    function renderInput() {
      var area = document.createElement('div');
      area.className = 'sfx-ai-ws__input-area';

      var row = document.createElement('div');
      row.className = 'sfx-ai-ws__input-row';

      var ta = document.createElement('textarea');
      ta.className = 'sfx-ai-ws__textarea';
      ta.rows = 1;
      ta.placeholder = 'Ask about SFX or your library…';
      ta.addEventListener('input', function () {
        ta.style.height = 'auto';
        ta.style.height = Math.min(ta.scrollHeight, 80) + 'px';
      });
      ta.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          var v = ta.value.trim();
          if (v && !isGenerating) sendMessage(v);
        }
      });
      row.appendChild(ta);

      var send = document.createElement('button');
      send.type = 'button';
      send.className = 'sfx-ai-ws__send';
      send.innerHTML = ICON.send;
      send.disabled = isGenerating;
      send.addEventListener('click', function () {
        var v = ta.value.trim();
        if (v && !isGenerating) sendMessage(v);
      });
      row.appendChild(send);
      area.appendChild(row);

      var meta = document.createElement('div');
      meta.className = 'sfx-ai-ws__input-meta';

      var pills = document.createElement('div');
      pills.className = 'sfx-ai-ws__mode-pills';
      ;['suggest', 'auto'].forEach(function (mode) {
        var pill = document.createElement('button');
        pill.type = 'button';
        pill.className = 'sfx-ai-ws__mode-pill' + (settings.mode === mode ? ' is-active' : '');
        pill.textContent = mode === 'auto' ? 'Auto-place' : 'Suggest';
        pill.addEventListener('click', function () {
          settings.mode = mode;
          saveSettings(settings);
          render();
        });
        pills.appendChild(pill);
      });
      meta.appendChild(pills);

      var provSelect = document.createElement('select');
      provSelect.className = 'sfx-ai-ws__model-select';
      provSelect.title = 'AI provider';
      var providers = getProviders();
      var plist = providers ? providers.listProviders() : [{ id: 'ollama', name: 'Ollama' }];
      var activeP = providers ? providers.getActiveProvider() : 'ollama';
      plist.forEach(function (p) {
        var opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        if (p.id === activeP) opt.selected = true;
        provSelect.appendChild(opt);
      });
      provSelect.addEventListener('change', function () {
        if (providers) {
          providers.setActiveProvider(provSelect.value);
          refreshOllamaStatus();
          render();
        }
      });
      meta.appendChild(provSelect);

      var modelSelect = document.createElement('select');
      modelSelect.className = 'sfx-ai-ws__model-select';
      modelSelect.title = 'Model';
      var models = providers ? providers.getModels(activeP) : [getModelName()];
      var cfgModel = providers ? providers.getConfig(activeP).model : getModelName();
      models.forEach(function (m) {
        var opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        if (m === cfgModel) opt.selected = true;
        modelSelect.appendChild(opt);
      });
      modelSelect.addEventListener('change', function () {
        if (providers) providers.setModel(activeP, modelSelect.value);
        var lai = getLocalAI();
        if (activeP === 'ollama' && lai && typeof lai.setModel === 'function') lai.setModel(modelSelect.value);
      });
      meta.appendChild(modelSelect);
      area.appendChild(meta);
      return area;
    }

    function renderSettings() {
      var view = document.createElement('div');
      view.className = 'sfx-ai-ws__settings-view';
      view.innerHTML = '<h3>AI Providers</h3><p class="sfx-ai-ws__settings-hint">Connect cloud providers with API keys, or use local Ollama. Keys are encrypted in local storage and never logged.</p>';

      var providers = getProviders();
      var list = providers ? providers.listProviders() : [{ id: 'ollama', name: 'Ollama', needsKey: false, defaultModel: 'llama3.2', models: ['llama3.2'] }];
      var active = providers ? providers.getActiveProvider() : 'ollama';

      list.forEach(function (p) {
        var card = document.createElement('div');
        card.className = 'sfx-ai-prov' + (p.id === active ? ' is-active' : '');

        var head = document.createElement('div');
        head.className = 'sfx-ai-prov__head';
        var name = document.createElement('div');
        name.className = 'sfx-ai-prov__name';
        name.textContent = p.name + (p.kind === 'local' ? ' (Local)' : '');
        head.appendChild(name);

        var useBtn = document.createElement('button');
        useBtn.type = 'button';
        useBtn.className = 'sfx-ai-ws__card-btn' + (p.id === active ? ' primary' : '');
        useBtn.textContent = p.id === active ? 'Active' : 'Use';
        useBtn.addEventListener('click', function () {
          if (providers) providers.setActiveProvider(p.id);
          render();
        });
        head.appendChild(useBtn);
        card.appendChild(head);

        var cfg = providers ? providers.getConfig(p.id) : { apiKeySet: false, model: p.defaultModel, connected: false };

        var status = document.createElement('div');
        status.className = 'sfx-ai-prov__status';
        status.innerHTML =
          '<span class="sfx-ai-ws__status-dot ' + (cfg.connected ? 'is-online' : 'is-offline') + '"></span> ' +
          (cfg.connected ? 'Connected' : (cfg.apiKeySet || !p.needsKey ? 'Not tested' : 'No API key'));
        card.appendChild(status);

        if (p.needsKey) {
          var keyRow = document.createElement('div');
          keyRow.className = 'sfx-ai-prov__keyrow';
          var keyInput = document.createElement('input');
          keyInput.type = 'password';
          keyInput.className = 'sfx-ai-prov__key';
          keyInput.placeholder = p.keyPlaceholder || 'API key';
          keyInput.autocomplete = 'off';
          keyInput.spellcheck = false;
          if (cfg.apiKeySet) keyInput.placeholder = cfg.apiKeyMasked + ' (saved)';
          keyRow.appendChild(keyInput);

          var showBtn = document.createElement('button');
          showBtn.type = 'button';
          showBtn.className = 'sfx-ai-ws__card-btn';
          showBtn.textContent = 'Show';
          showBtn.addEventListener('click', function () {
            if (keyInput.type === 'password') {
              keyInput.type = 'text';
              showBtn.textContent = 'Hide';
            } else {
              keyInput.type = 'password';
              showBtn.textContent = 'Show';
            }
          });
          keyRow.appendChild(showBtn);
          card.appendChild(keyRow);

          var keyActions = document.createElement('div');
          keyActions.className = 'sfx-ai-prov__actions';
          var saveBtn = document.createElement('button');
          saveBtn.type = 'button';
          saveBtn.className = 'sfx-ai-ws__card-btn primary';
          saveBtn.textContent = 'Save key';
          saveBtn.addEventListener('click', function () {
            var val = keyInput.value.trim();
            if (!val) return;
            saveBtn.disabled = true;
            providers.setApiKey(p.id, val).then(function () {
              keyInput.value = '';
              saveBtn.textContent = 'Saved';
              setTimeout(function () { render(); }, 400);
            });
          });
          keyActions.appendChild(saveBtn);

          var clearBtn = document.createElement('button');
          clearBtn.type = 'button';
          clearBtn.className = 'sfx-ai-ws__card-btn';
          clearBtn.textContent = 'Delete key';
          clearBtn.addEventListener('click', function () {
            providers.clearCredentials(p.id).then(function () { render(); });
          });
          keyActions.appendChild(clearBtn);
          card.appendChild(keyActions);
        }

        var modelRow = document.createElement('div');
        modelRow.className = 'sfx-ai-prov__modelrow';
        var modelSel = document.createElement('select');
        modelSel.className = 'sfx-ai-ws__model-select';
        var models = providers ? providers.getModels(p.id) : (p.models || [p.defaultModel]);
        models.forEach(function (m) {
          var o = document.createElement('option');
          o.value = m;
          o.textContent = m;
          if (m === cfg.model) o.selected = true;
          modelSel.appendChild(o);
        });
        modelSel.addEventListener('change', function () {
          if (providers) providers.setModel(p.id, modelSel.value);
        });
        modelRow.appendChild(modelSel);

        var testBtn = document.createElement('button');
        testBtn.type = 'button';
        testBtn.className = 'sfx-ai-ws__card-btn';
        testBtn.textContent = 'Test connection';
        testBtn.addEventListener('click', function () {
          testBtn.disabled = true;
          testBtn.textContent = 'Testing…';
          if (!providers) {
            testBtn.textContent = 'Unavailable';
            return;
          }
          providers.setModel(p.id, modelSel.value);
          providers.testConnection(p.id).then(function () {
            testBtn.textContent = 'OK';
            setTimeout(function () { render(); }, 500);
          }).catch(function (err) {
            testBtn.disabled = false;
            testBtn.textContent = 'Failed';
            status.innerHTML =
              '<span class="sfx-ai-ws__status-dot is-offline"></span> ' +
              String(err && err.message ? err.message : err).slice(0, 120);
          });
        });
        modelRow.appendChild(testBtn);
        card.appendChild(modelRow);

        view.appendChild(card);
      });

      // Assistant behaviour
      var confLabel = document.createElement('h3');
      confLabel.textContent = 'Assistant';
      confLabel.style.marginTop = '18px';
      view.appendChild(confLabel);

      var conf = document.createElement('select');
      [0.4, 0.55, 0.7, 0.85].forEach(function (v) {
        var o = document.createElement('option');
        o.value = String(v);
        o.textContent = Math.round(v * 100) + '% min confidence';
        if (settings.minConfidence === v) o.selected = true;
        conf.appendChild(o);
      });
      conf.addEventListener('change', function () {
        settings.minConfidence = Number(conf.value);
        saveSettings(settings);
      });
      conf.className = 'sfx-ai-ws__model-select';
      conf.style.maxWidth = '100%';
      conf.style.marginBottom = '12px';
      view.appendChild(conf);

      var back = document.createElement('button');
      back.type = 'button';
      back.className = 'sfx-ai-ws__settings-back';
      back.textContent = '← Back to chat';
      back.addEventListener('click', function () { showSettings = false; render(); });
      view.appendChild(back);
      return view;
    }

    function appendAssistant(text, cards) {
      messages.push({ role: 'assistant', text: text, cards: cards || null, at: Date.now() });
      persistActiveChat();
      render();
    }

    function sendMessage(text) {
      text = String(text || '').trim();
      if (!text || isGenerating) return;
      if (!activeChatId) {
        activeChatId = uid();
        history.unshift({ id: activeChatId, title: text.slice(0, 40), messages: [], updatedAt: Date.now() });
      }
      messages.push({ role: 'user', text: text, at: Date.now() });
      persistActiveChat();
      isGenerating = true;
      render();

      var candidates = [];
      try { candidates = selectCandidates(library, text); } catch (e) {}

      // Prior messages in this chat (exclude the one we just pushed)
      var prior = messages.slice(0, -1).map(function (m) {
        return { role: m.role, text: m.text };
      });

      callAiChat(text, candidates, prior)
        .then(function (raw) {
          isGenerating = false;
          var reply = String(raw || '').trim() || 'Empty response from the model.';
          var cards = null;
          if (candidates.length) {
            var lower = reply.toLowerCase();
            var matched = candidates.filter(function (a) {
              return lower.indexOf(String(a.name || '').toLowerCase()) !== -1;
            }).slice(0, 5);
            if (!matched.length) matched = candidates.slice(0, 3);
            cards = matched.map(function (a) {
              return {
                id: a.id || a.path,
                path: a.path || a.id,
                name: a.name,
                folder: a.relativeFolder || a.folder || '',
                reason: a.relativeFolder || a.folder || 'From your library'
              };
            });
          }
          appendAssistant(reply, cards);
        })
        .catch(function (err) {
          isGenerating = false;
          appendAssistant(String(err && err.message ? err.message : err));
        });
    }

    refreshOllamaStatus();
    setInterval(refreshOllamaStatus, 15000);
  }

  waitForServices(function (services) { buildUI(services); });
})();
