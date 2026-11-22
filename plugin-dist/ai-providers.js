/*
  SFX Composer — Multi-provider AI manager.

  Adapters: Ollama (local), OpenAI, Anthropic, Groq, Google Gemini.
  Credentials stored encrypted via Web Crypto (AES-GCM). Keys never logged.
  Exposes window.__sfxAiProviders for the AI assistant UI.
*/
(function () {
  'use strict';

  var STORE_KEY = 'sfxAiProviders.v1';
  var META_KEY = 'sfxAiProviders.meta.v1';
  var PBKDF_ITERATIONS = 100000;

  /* ------------------------------------------------------------------ *
   * Credential vault (AES-GCM). Not OS keychain — CEP has no portable
   * keychain API — but keys are never stored in plaintext.
   * ------------------------------------------------------------------ */
  function bytesToB64(buf) {
    var bin = '';
    var bytes = new Uint8Array(buf);
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function b64ToBytes(b64) {
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function getOrCreateSalt() {
    try {
      var meta = JSON.parse(localStorage.getItem(META_KEY) || '{}');
      if (meta.salt) return b64ToBytes(meta.salt);
      var salt = crypto.getRandomValues(new Uint8Array(16));
      meta.salt = bytesToB64(salt);
      localStorage.setItem(META_KEY, JSON.stringify(meta));
      return salt;
    } catch (e) {
      return new Uint8Array(16);
    }
  }

  function deriveKey() {
    // Material is panel-local, not a user password. Good enough to keep keys
    // out of plain localStorage dumps; not a substitute for full OS vault.
    var material = 'sfx-composer-ai-vault|' + (navigator.userAgent || '') + '|v1';
    return crypto.subtle.importKey('raw', new TextEncoder().encode(material), 'PBKDF2', false, ['deriveKey'])
      .then(function (base) {
        return crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: getOrCreateSalt(), iterations: PBKDF_ITERATIONS, hash: 'SHA-256' },
          base,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt']
        );
      });
  }

  function encryptJson(obj) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var data = new TextEncoder().encode(JSON.stringify(obj));
    return deriveKey().then(function (key) {
      return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, data);
    }).then(function (cipher) {
      return { iv: bytesToB64(iv), data: bytesToB64(cipher) };
    });
  }

  function decryptJson(payload) {
    if (!payload || !payload.iv || !payload.data) return Promise.resolve(null);
    return deriveKey().then(function (key) {
      return crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: b64ToBytes(payload.iv) },
        key,
        b64ToBytes(payload.data)
      );
    }).then(function (plain) {
      return JSON.parse(new TextDecoder().decode(plain));
    }).catch(function () {
      return null;
    });
  }

  /* ------------------------------------------------------------------ *
   * Provider catalog
   * ------------------------------------------------------------------ */
  var PROVIDERS = {
    ollama: {
      id: 'ollama',
      name: 'Ollama',
      kind: 'local',
      needsKey: false,
      defaultModel: 'llama3.2',
      models: ['llama3.2', 'llama3.1', 'mistral', 'phi3', 'gemma2', 'qwen2.5'],
      docsUrl: 'https://ollama.com'
    },
    openai: {
      id: 'openai',
      name: 'OpenAI',
      kind: 'cloud',
      needsKey: true,
      keyPlaceholder: 'sk-...',
      defaultModel: 'gpt-4o-mini',
      models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1', 'o4-mini'],
      docsUrl: 'https://platform.openai.com/api-keys'
    },
    anthropic: {
      id: 'anthropic',
      name: 'Anthropic Claude',
      kind: 'cloud',
      needsKey: true,
      keyPlaceholder: 'sk-ant-...',
      defaultModel: 'claude-sonnet-4-20250514',
      models: [
        'claude-sonnet-4-20250514',
        'claude-3-5-haiku-20241022',
        'claude-3-5-sonnet-20241022',
        'claude-3-opus-20240229'
      ],
      docsUrl: 'https://console.anthropic.com/settings/keys'
    },
    groq: {
      id: 'groq',
      name: 'Groq',
      kind: 'cloud',
      needsKey: true,
      keyPlaceholder: 'gsk_...',
      defaultModel: 'llama-3.3-70b-versatile',
      models: [
        'llama-3.3-70b-versatile',
        'llama-3.1-8b-instant',
        'mixtral-8x7b-32768',
        'gemma2-9b-it'
      ],
      docsUrl: 'https://console.groq.com/keys'
    },
    gemini: {
      id: 'gemini',
      name: 'Google Gemini',
      kind: 'cloud',
      needsKey: true,
      keyPlaceholder: 'AIza...',
      defaultModel: 'gemini-2.0-flash',
      models: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro', 'gemini-1.5-flash'],
      docsUrl: 'https://aistudio.google.com/apikey'
    }
  };

  /* ------------------------------------------------------------------ *
   * HTTP helper
   * ------------------------------------------------------------------ */
  function httpJson(url, options, timeoutMs) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, timeoutMs || 45000);
    var opts = Object.assign({}, options || {}, { signal: controller.signal });
    return fetch(url, opts)
      .then(function (res) {
        return res.text().then(function (text) {
          var body = null;
          try { body = text ? JSON.parse(text) : null; } catch (e) { body = { raw: text }; }
          if (!res.ok) {
            var msg =
              (body && (body.error && (body.error.message || body.error)) ) ||
              (body && body.message) ||
              ('HTTP ' + res.status);
            var err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
            err.status = res.status;
            err.body = body;
            throw err;
          }
          return body;
        });
      })
      .finally(function () { clearTimeout(timer); });
  }

  /* ------------------------------------------------------------------ *
   * Adapters — chat({ system, messages, model, apiKey }) → { text }
   * ------------------------------------------------------------------ */
  function adaptOllama(req) {
    var base = 'http://localhost:11434';
    try {
      var lai = window.__localAIManager;
      if (lai && typeof lai.getOllamaUrl === 'function') base = lai.getOllamaUrl().replace(/\/$/, '');
    } catch (e) {}
    var prompt = '';
    if (req.system) prompt += req.system + '\n\n';
    (req.messages || []).forEach(function (m) {
      prompt += (m.role === 'assistant' ? 'Assistant: ' : 'User: ') + m.content + '\n';
    });
    prompt += 'Assistant:';
    return httpJson(base + '/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: req.model || 'llama3.2',
        prompt: prompt,
        stream: false,
        options: { temperature: 0.4 }
      })
    }, req.timeoutMs || 60000).then(function (data) {
      return { text: (data && data.response) || '' };
    });
  }

  function adaptOpenAICompatible(baseUrl, authHeader, req) {
    var messages = [];
    if (req.system) messages.push({ role: 'system', content: req.system });
    (req.messages || []).forEach(function (m) {
      messages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content });
    });
    return httpJson(baseUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader
      },
      body: JSON.stringify({
        model: req.model,
        messages: messages,
        temperature: 0.4
      })
    }, req.timeoutMs || 60000).then(function (data) {
      var choice = data && data.choices && data.choices[0];
      var text = choice && choice.message && choice.message.content;
      return { text: text || '', usage: data.usage || null };
    });
  }

  function adaptOpenAI(req) {
    return adaptOpenAICompatible('https://api.openai.com/v1', 'Bearer ' + req.apiKey, req);
  }

  function adaptGroq(req) {
    return adaptOpenAICompatible('https://api.groq.com/openai/v1', 'Bearer ' + req.apiKey, req);
  }

  function adaptAnthropic(req) {
    var messages = (req.messages || []).map(function (m) {
      return { role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content };
    });
    return httpJson('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': req.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: req.model,
        max_tokens: 2048,
        system: req.system || undefined,
        messages: messages
      })
    }, req.timeoutMs || 60000).then(function (data) {
      var parts = (data && data.content) || [];
      var text = parts.map(function (p) { return p.text || ''; }).join('');
      return { text: text, usage: data.usage || null };
    });
  }

  function adaptGemini(req) {
    var model = req.model || 'gemini-2.0-flash';
    var url =
      'https://generativelanguage.googleapis.com/v1beta/models/' +
      encodeURIComponent(model) +
      ':generateContent?key=' +
      encodeURIComponent(req.apiKey);

    var contents = [];
    (req.messages || []).forEach(function (m) {
      contents.push({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      });
    });

    var body = {
      contents: contents,
      generationConfig: { temperature: 0.4 }
    };
    if (req.system) {
      body.systemInstruction = { parts: [{ text: req.system }] };
    }

    return httpJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }, req.timeoutMs || 60000).then(function (data) {
      var cands = data && data.candidates;
      var parts = cands && cands[0] && cands[0].content && cands[0].content.parts;
      var text = (parts || []).map(function (p) { return p.text || ''; }).join('');
      return { text: text, usage: data.usageMetadata || null };
    });
  }

  var ADAPTERS = {
    ollama: adaptOllama,
    openai: adaptOpenAI,
    anthropic: adaptAnthropic,
    groq: adaptGroq,
    gemini: adaptGemini
  };

  /* ------------------------------------------------------------------ *
   * Manager
   * ------------------------------------------------------------------ */
  function AiProviders() {
    this._creds = {}; // { providerId: { apiKey, model, connected } } — in memory after decrypt
    this._ready = this._load();
    this.activeProvider = 'ollama';
    this.listeners = [];
  }

  AiProviders.prototype._load = function () {
    var self = this;
    try {
      var meta = JSON.parse(localStorage.getItem(META_KEY) || '{}');
      if (meta.activeProvider) self.activeProvider = meta.activeProvider;
    } catch (e) {}

    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) {}
    if (!raw) {
      self._creds = { ollama: { apiKey: '', model: 'llama3.2', connected: false } };
      return Promise.resolve();
    }
    // New encrypted format
    if (raw.iv && raw.data) {
      return decryptJson(raw).then(function (obj) {
        self._creds = obj && typeof obj === 'object' ? obj : {};
        if (!self._creds.ollama) self._creds.ollama = { apiKey: '', model: 'llama3.2', connected: false };
      });
    }
    // Legacy plain (migrate)
    self._creds = raw;
    return self._persist();
  };

  AiProviders.prototype._persist = function () {
    var self = this;
    // Never write secrets to console
    return encryptJson(self._creds).then(function (payload) {
      localStorage.setItem(STORE_KEY, JSON.stringify(payload));
      var meta = {};
      try { meta = JSON.parse(localStorage.getItem(META_KEY) || '{}'); } catch (e) {}
      meta.activeProvider = self.activeProvider;
      localStorage.setItem(META_KEY, JSON.stringify(meta));
    }).catch(function () {
      /* storage full / crypto unavailable — keep memory only */
    });
  };

  AiProviders.prototype.whenReady = function () {
    return this._ready || Promise.resolve();
  };

  AiProviders.prototype.listProviders = function () {
    return Object.keys(PROVIDERS).map(function (id) {
      return Object.assign({}, PROVIDERS[id]);
    });
  };

  AiProviders.prototype.getProvider = function (id) {
    return PROVIDERS[id] ? Object.assign({}, PROVIDERS[id]) : null;
  };

  AiProviders.prototype.getActiveProvider = function () {
    return this.activeProvider;
  };

  AiProviders.prototype.setActiveProvider = function (id) {
    if (!PROVIDERS[id]) return;
    this.activeProvider = id;
    var meta = {};
    try { meta = JSON.parse(localStorage.getItem(META_KEY) || '{}'); } catch (e) {}
    meta.activeProvider = id;
    localStorage.setItem(META_KEY, JSON.stringify(meta));
    this._emit();
  };

  AiProviders.prototype.getConfig = function (id) {
    var c = this._creds[id] || {};
    var def = PROVIDERS[id] || {};
    return {
      apiKeySet: !!(c.apiKey && String(c.apiKey).length > 0),
      // Never return the raw key to general UI — only masked
      apiKeyMasked: c.apiKey ? maskKey(c.apiKey) : '',
      model: c.model || def.defaultModel || '',
      connected: !!c.connected,
      lastError: c.lastError || ''
    };
  };

  /** Returns raw key only for internal adapter use — not for UI display. */
  AiProviders.prototype._getKey = function (id) {
    return (this._creds[id] && this._creds[id].apiKey) || '';
  };

  AiProviders.prototype.setApiKey = function (id, key) {
    if (!PROVIDERS[id]) return Promise.reject(new Error('unknown provider'));
    if (!this._creds[id]) this._creds[id] = {};
    this._creds[id].apiKey = String(key || '').trim();
    this._creds[id].connected = false;
    this._creds[id].lastError = '';
    return this._persist().then(function () { return true; });
  };

  AiProviders.prototype.clearCredentials = function (id) {
    if (!PROVIDERS[id]) return Promise.resolve();
    this._creds[id] = {
      apiKey: '',
      model: (PROVIDERS[id] && PROVIDERS[id].defaultModel) || '',
      connected: false,
      lastError: ''
    };
    return this._persist();
  };

  AiProviders.prototype.setModel = function (id, model) {
    if (!PROVIDERS[id]) return;
    if (!this._creds[id]) this._creds[id] = {};
    this._creds[id].model = String(model || PROVIDERS[id].defaultModel);
    return this._persist();
  };

  AiProviders.prototype.getModels = function (id) {
    var def = PROVIDERS[id];
    if (!def) return [];
    var custom = (this._creds[id] && this._creds[id].model) || def.defaultModel;
    var list = (def.models || []).slice();
    if (custom && list.indexOf(custom) === -1) list.unshift(custom);
    return list;
  };

  function maskKey(key) {
    var s = String(key);
    if (s.length <= 8) return '••••••••';
    return s.slice(0, 4) + '••••' + s.slice(-4);
  }

  AiProviders.prototype.testConnection = function (id) {
    var self = this;
    var def = PROVIDERS[id];
    if (!def) return Promise.reject(new Error('unknown provider'));

    var model = (self._creds[id] && self._creds[id].model) || def.defaultModel;
    var apiKey = self._getKey(id);

    if (def.needsKey && !apiKey) {
      return Promise.reject(new Error('API key required'));
    }

    var adapter = ADAPTERS[id];
    if (!adapter) return Promise.reject(new Error('no adapter'));

    return adapter({
      apiKey: apiKey,
      model: model,
      system: 'Reply with exactly: OK',
      messages: [{ role: 'user', content: 'ping' }],
      timeoutMs: 25000
    }).then(function (result) {
      if (!self._creds[id]) self._creds[id] = {};
      self._creds[id].connected = true;
      self._creds[id].lastError = '';
      self._creds[id].model = model;
      return self._persist().then(function () {
        return { ok: true, sample: (result.text || '').slice(0, 80) };
      });
    }).catch(function (err) {
      if (!self._creds[id]) self._creds[id] = {};
      self._creds[id].connected = false;
      self._creds[id].lastError = String(err && err.message ? err.message : err);
      return self._persist().then(function () {
        throw err;
      });
    });
  };

  /**
   * Unified chat entry point.
   * messages: [{ role: 'user'|'assistant', content: string }]
   */
  AiProviders.prototype.chat = function (opts) {
    var self = this;
    return self.whenReady().then(function () {
      var id = opts.provider || self.activeProvider || 'ollama';
      var def = PROVIDERS[id];
      if (!def) throw new Error('Unknown provider: ' + id);
      var adapter = ADAPTERS[id];
      if (!adapter) throw new Error('No adapter for ' + id);

      var model = opts.model || (self._creds[id] && self._creds[id].model) || def.defaultModel;
      var apiKey = self._getKey(id);
      if (def.needsKey && !apiKey) {
        throw new Error(def.name + ' is not connected. Add an API key in Settings.');
      }

      return adapter({
        apiKey: apiKey,
        model: model,
        system: opts.system || '',
        messages: opts.messages || [],
        timeoutMs: opts.timeoutMs || 60000
      }).then(function (result) {
        if (!self._creds[id]) self._creds[id] = {};
        self._creds[id].connected = true;
        return {
          text: result.text || '',
          provider: id,
          model: model,
          usage: result.usage || null
        };
      });
    });
  };

  AiProviders.prototype._emit = function () {
    this.listeners.forEach(function (fn) {
      try { fn(); } catch (e) {}
    });
  };

  AiProviders.prototype.subscribe = function (fn) {
    this.listeners.push(fn);
    return function () {
      this.listeners = this.listeners.filter(function (f) { return f !== fn; });
    }.bind(this);
  };

  window.__sfxAiProviders = new AiProviders();
})();
