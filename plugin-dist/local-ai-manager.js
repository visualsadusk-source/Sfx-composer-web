/*
  SFX Composer — Local AI Manager.

  This is the single place that talks to Ollama. Nothing else in the panel
  should call fetch('http://localhost:11434/...') directly — ai-assistant.js
  routes its recommendation calls through window.__localAIManager.generate(),
  and local-ai-setup.js drives the whole install/start/pull flow through the
  same object. One integration, reused everywhere (per the spec's "do not
  duplicate Ollama integrations").

  Everything here is local-only:
    - No cloud AI API is ever called.
    - Only text (prompts, model names, status) crosses the wire to
      http://localhost:11434 — never project data, never audio/video files.
    - The only "install" this file performs itself is starting an *already
      installed* ollama executable (via Node's child_process, since this is
      a CEP panel with Node integration enabled) or pulling a model through
      Ollama's own official local API. It never downloads or runs an
      installer binary — see local-ai-setup.js for why.
*/
(function () {
  'use strict';

  var OLLAMA_DOWNLOAD_URL = 'https://ollama.com/download';
  var DEFAULT_OLLAMA_URL = 'http://localhost:11434';
  var DEFAULT_OLLAMA_MODEL = 'llama3.2';
  var SETTINGS_KEY = 'sfxLocalAiSettings';
  var HEALTH_TIMEOUT_MS = 3000;
  var SERVER_START_TIMEOUT_MS = 12000;

  function loadSettings() {
    var defaults = { ollamaUrl: DEFAULT_OLLAMA_URL, model: DEFAULT_OLLAMA_MODEL };
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return defaults;
      return Object.assign({}, defaults, JSON.parse(raw));
    } catch (e) {
      return defaults;
    }
  }

  function saveSettings(settings) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      /* best effort */
    }
  }

  /*
   * Node is available in this panel (manifest enables --enable-nodejs and
   * --mixed-context) but is looked up defensively — a CEP host or user
   * environment without it should degrade to "detection via HTTP only"
   * rather than throw.
   */
  function getNodeRequire() {
    try {
      if (window.cep_node && typeof window.cep_node.require === 'function') {
        return window.cep_node.require;
      }
      if (typeof window.require === 'function') {
        return window.require;
      }
    } catch (e) {
      /* fall through */
    }
    return null;
  }

  function LocalAIManager() {
    this.settings = loadSettings();
    this.listeners = new Set();
    this.state = {
      status: 'checking', // checking | not-installed | starting-server | downloading-model | testing | ready | error
      ollamaInstalled: false,
      serverRunning: false,
      version: '',
      model: this.settings.model,
      modelInstalled: false,
      progress: null, // {completedBytes, totalBytes} while downloading-model
      errorMessage: ''
    };
  }

  LocalAIManager.prototype.subscribe = function (fn) {
    this.listeners.add(fn);
    fn(this.state);
    var self = this;
    return function () {
      self.listeners.delete(fn);
    };
  };

  LocalAIManager.prototype.emit = function () {
    var self = this;
    this.listeners.forEach(function (fn) {
      try {
        fn(self.state);
      } catch (e) {
        /* a bad listener should never break the manager */
      }
    });
  };

  LocalAIManager.prototype.setState = function (patch) {
    this.state = Object.assign({}, this.state, patch);
    this.emit();
  };

  LocalAIManager.prototype.getOllamaUrl = function () {
    return this.settings.ollamaUrl || DEFAULT_OLLAMA_URL;
  };

  LocalAIManager.prototype.setModel = function (model) {
    this.settings.model = model;
    saveSettings(this.settings);
    this.setState({ model: model, modelInstalled: false });
  };

  LocalAIManager.prototype.setOllamaUrl = function (url) {
    this.settings.ollamaUrl = url;
    saveSettings(this.settings);
  };

  /* ------------------------------------------------------------------ *
   * Detection
   * ------------------------------------------------------------------ */

  LocalAIManager.prototype.fetchWithTimeout = function (path, options, timeoutMs) {
    var controller = new AbortController();
    var timer = setTimeout(function () {
      controller.abort();
    }, timeoutMs || HEALTH_TIMEOUT_MS);
    var opts = Object.assign({}, options, { signal: controller.signal });
    return fetch(this.getOllamaUrl() + path, opts).finally(function () {
      clearTimeout(timer);
    });
  };

  /** Passive, read-only: never installs or starts anything. */
  LocalAIManager.prototype.checkServer = function () {
    var self = this;
    return this.fetchWithTimeout('/api/version', {}, HEALTH_TIMEOUT_MS)
      .then(function (res) {
        if (!res.ok) return { running: false, version: '' };
        return res.json().then(function (data) {
          return { running: true, version: (data && data.version) || '' };
        });
      })
      .catch(function () {
        return { running: false, version: '' };
      });
  };

  LocalAIManager.prototype.checkExecutableViaNode = function () {
    var req = getNodeRequire();
    if (!req) return Promise.resolve(false);
    return new Promise(function (resolve) {
      try {
        var child_process = req('child_process');
        child_process.exec('ollama --version', { timeout: 5000 }, function (err) {
          resolve(!err);
        });
      } catch (e) {
        resolve(false);
      }
    });
  };

  LocalAIManager.prototype.getInstalledModels = function () {
    return this.fetchWithTimeout('/api/tags', {}, HEALTH_TIMEOUT_MS)
      .then(function (res) {
        if (!res.ok) return [];
        return res.json();
      })
      .then(function (data) {
        return (data && data.models) || [];
      })
      .catch(function () {
        return [];
      });
  };

  LocalAIManager.prototype.hasModel = function (modelName) {
    return this.getInstalledModels().then(function (models) {
      return models.some(function (m) {
        // Ollama tags include the variant, e.g. "llama3.2:latest" — match the
        // base name so a user's existing pull of the same model still counts.
        return m.name === modelName || (m.name || '').split(':')[0] === modelName.split(':')[0];
      });
    });
  };

  /**
   * Full, passive detection pass. Never downloads, installs, or starts
   * anything — safe to call on every panel open.
   */
  LocalAIManager.prototype.detect = function () {
    var self = this;
    this.setState({ status: 'checking', errorMessage: '' });

    return this.checkServer().then(function (serverInfo) {
      if (serverInfo.running) {
        return self.hasModel(self.state.model).then(function (hasModel) {
          self.setState({
            ollamaInstalled: true,
            serverRunning: true,
            version: serverInfo.version,
            modelInstalled: hasModel
          });
          if (hasModel) {
            self.setState({ status: 'ready' });
          } else {
            self.setState({ status: 'model-required' });
          }
          return self.state;
        });
      }

      // Server isn't responding — find out whether that's because Ollama
      // isn't installed at all, or just isn't running yet.
      return self.checkExecutableViaNode().then(function (installed) {
        self.setState({
          ollamaInstalled: installed,
          serverRunning: false,
          status: installed ? 'server-not-running' : 'not-installed'
        });
        return self.state;
      });
    });
  };

  /* ------------------------------------------------------------------ *
   * Starting the server (only ever starts an already-installed exe)
   * ------------------------------------------------------------------ */

  LocalAIManager.prototype.startServer = function () {
    var self = this;
    var req = getNodeRequire();
    if (!req) {
      return Promise.reject(new Error('node-unavailable'));
    }

    this.setState({ status: 'starting-server', errorMessage: '' });

    try {
      var child_process = req('child_process');
      var child = child_process.spawn('ollama', ['serve'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });
      child.unref();
    } catch (e) {
      this.setState({ status: 'error', errorMessage: 'Could not start the Ollama server.' });
      return Promise.reject(e);
    }

    // Poll the health endpoint rather than assuming the process started
    // cleanly — spawn() succeeding only means the OS accepted the request.
    var waited = 0;
    var stepMs = 500;
    return new Promise(function (resolve, reject) {
      (function poll() {
        self.checkServer().then(function (info) {
          if (info.running) {
            self.setState({ serverRunning: true, ollamaInstalled: true, version: info.version });
            resolve(info);
            return;
          }
          waited += stepMs;
          if (waited >= SERVER_START_TIMEOUT_MS) {
            self.setState({
              status: 'error',
              errorMessage: 'Ollama is installed but the local server isn\u2019t responding.'
            });
            reject(new Error('server-start-timeout'));
            return;
          }
          setTimeout(poll, stepMs);
        });
      })();
    });
  };

  /* ------------------------------------------------------------------ *
   * Model pulling — real progress, not faked
   * ------------------------------------------------------------------ */

  LocalAIManager.prototype.pullModel = function (modelName, onProgress) {
    var self = this;
    this.setState({ status: 'downloading-model', errorMessage: '', progress: null });

    return fetch(this.getOllamaUrl() + '/api/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName, stream: true })
    }).then(function (res) {
      if (!res.ok || !res.body) {
        throw new Error('pull-http-' + res.status);
      }
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '';

      function pump() {
        return reader.read().then(function (chunk) {
          if (chunk.done) return;
          buffer += decoder.decode(chunk.value, { stream: true });
          var lines = buffer.split('\n');
          buffer = lines.pop(); // last line may be incomplete
          lines.forEach(function (line) {
            if (!line.trim()) return;
            var event;
            try {
              event = JSON.parse(line);
            } catch (e) {
              return;
            }
            if (event.error) {
              throw new Error(event.error);
            }
            if (typeof event.completed === 'number' && typeof event.total === 'number') {
              var progress = { completedBytes: event.completed, totalBytes: event.total };
              self.setState({ progress: progress });
              if (onProgress) onProgress(progress);
            }
          });
          return pump();
        });
      }

      return pump();
    }).then(function () {
      self.setState({ status: 'testing', progress: null });
      return self.testConnection(modelName);
    }).then(function () {
      self.setState({ status: 'ready', modelInstalled: true, model: modelName });
    }).catch(function (err) {
      self.setState({
        status: 'error',
        errorMessage: 'Couldn\u2019t download the AI model.'
      });
      throw err;
    });
  };

  /* ------------------------------------------------------------------ *
   * Generate — the one call every feature (SFX Assistant, etc.) uses
   * ------------------------------------------------------------------ */

  LocalAIManager.prototype.generate = function (prompt, options) {
    var opts = options || {};
    var model = opts.model || this.state.model;
    var timeoutMs = opts.timeoutMs || 20000;
    var controller = new AbortController();
    var timer = setTimeout(function () {
      controller.abort();
    }, timeoutMs);

    return fetch(this.getOllamaUrl() + '/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        prompt: prompt,
        format: opts.format || 'json',
        stream: false,
        options: { temperature: opts.temperature != null ? opts.temperature : 0.2 }
      }),
      signal: controller.signal
    })
      .then(function (res) {
        clearTimeout(timer);
        if (!res.ok) throw new Error('ollama-http-' + res.status);
        return res.json();
      })
      .then(function (data) {
        return data && typeof data.response === 'string' ? data.response : '';
      })
      .catch(function (err) {
        clearTimeout(timer);
        throw err;
      });
  };

  LocalAIManager.prototype.testConnection = function (modelName) {
    return this.generate('Reply with only: {"ok":true}', {
      model: modelName || this.state.model,
      timeoutMs: 15000,
      temperature: 0
    }).then(function (raw) {
      try {
        var parsed = JSON.parse(raw);
        return parsed && parsed.ok === true;
      } catch (e) {
        // Some small models won't hit the exact shape — a non-throwing
        // response is still evidence the round trip works.
        return raw.length > 0;
      }
    });
  };

  LocalAIManager.prototype.openDownloadPage = function () {
    if (window.__sfxServices && typeof window.__sfxServices.openExternal === 'function') {
      window.__sfxServices.openExternal(OLLAMA_DOWNLOAD_URL);
      return;
    }
    // Fallback if services aren't ready yet for some reason.
    window.open(OLLAMA_DOWNLOAD_URL, '_blank', 'noopener,noreferrer');
  };

  LocalAIManager.prototype.getState = function () {
    return this.state;
  };

  window.__localAIManager = new LocalAIManager();
})();
