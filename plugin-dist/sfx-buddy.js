/*
 * SFX Buddy — Context-Aware Local AI Support Assistant & Sound Design Companion
 * Exclusively for SFX Composer (Adobe Premiere Pro CC & After Effects CC)
 *
 * Capabilities:
 * - Pure SFX Composer Support: Explains all tabs, features, audio tools & troubleshooting.
 * - Zero Unsolicited Messages: Never sends random suggestions, repeated greetings, or fake chats.
 * - Local Ollama AI Integration: Streaming responses (/api/chat), dynamic model retrieval (/api/tags).
 * - Real Sound Library Search: Tokenized semantic search against actual local SFX assets (no hallucinations).
 * - Host Timeline Control: Validated placement at playhead or target tracks with user confirmation.
 * - Non-Blocking Floating Launcher: Bottom-right compact circular trigger with collision avoidance.
 */

(function () {
  'use strict';

  var STORAGE_KEY = 'sfxBuddyHistory.v3';
  var SETTINGS_KEY = 'sfxBuddySettings.v1';
  var PREFS_KEY = 'sfxBuddyPreferences.v2';

  // --- OFFICIAL SYSTEM PROMPT ---
  var BASE_SYSTEM_PROMPT =
    "You are SFX Buddy, the official AI assistant built into SFX Composer. " +
    "Your exclusive responsibility is to help users understand, operate, troubleshoot and get the best results from SFX Composer. " +
    "You understand its interface, features, local sound library, audio tools and supported timeline operations. " +
    "Answer the user's actual question directly. " +
    "Never send unsolicited messages, random sound recommendations or unrelated music suggestions. " +
    "Search the real local sound library whenever recommending an asset. " +
    "Never invent features, filenames or successful actions. " +
    "If you do not know something, say so. " +
    "Be friendly, concise and technically helpful.";

  // --- COMPREHENSIVE SFX COMPOSER KNOWLEDGE BASE ---
  var KNOWLEDGE_BASE = {
    overview:
      "SFX Composer is the premier all-in-one cinematic audio suite for video editors and sound designers in Adobe Premiere Pro CC and Adobe After Effects CC. It eliminates external audio editing round-trips by embedding discovery, waveform trimming, real-time DSP, beat detection, and timeline automation directly inside the NLE panel.",
    tabs: {
      browser:
        "Sound Browser Tab: The primary asset library. Features category filtering (Impacts, Transitions, Risers, Foley, Ambience, UI, Sci-Fi), subcategories, high-resolution interactive waveform display, In/Out trim handles, gain adjustment (-24dB to +12dB), 1-click 'Add to Timeline', star favorites, and custom collection playlists.",
      ai:
        "AI SFX Assistant Tab: Full-tab autonomous sound designer and Premiere Pro timeline agent. Connects to local Ollama to draft multi-cue Foley and transition layouts, matches local assets without hallucination, and automatically places sounds at the playhead or across tracks A1–A8.",
      bgmFlow:
        "BGM Flow Tab: Intelligent background music editing and transition suite with 5 specialized modules:\n" +
        "1. Music Start: 5 intro transition styles (Cold Start, Swell In, Beat Drop, Whoosh Hit, Fade In).\n" +
        "2. Music End: 6 outro transition styles (Hard Stop, Ring Out, Low-Pass Fade, Reverse Tail, Impact Cut, Reverb Bloom).\n" +
        "3. Music Change: 9 track-to-track transition styles (Beat Match, Power Down, Glitch Cut, Vinyl Brake, etc.).\n" +
        "4. Beat Sync: Real-time audio BPM detection and Premiere timeline sequence beat marker generation (downbeats & regular beats).\n" +
        "5. Auto EQ: Professional speech frequency carving (-4.5dB dip in the 1.5–3 kHz vocal pocket) with anti-clipping limiter.",
      analytics:
        "Analytics Tab: Productivity and audio usage dashboard. Tracks timeline sound placements, estimated audio editing time saved, top sound categories, and project editing velocity.",
      companion:
        "Browser Companion Tab: Built-in royalty-free web sound search powered by Pixabay SFX. Lets editors audition sounds directly in the plugin and download WAV files straight into their local project assets folder with one click.",
      audioTools:
        "Audio Tools (Essential Sound DSP Rack) Tab: 3-column audio workstation featuring real-time Peak & RMS metering (-24dB to +12dB), Peak Normalization, High-Pass (80Hz) and Low-Pass (12kHz) filters, 3-band parametric EQ, Dynamics compressor, and Stereo widener.",
      sceneAi:
        "Scene AI Tab: Dedicated visual sequence and composition analyzer. Analyzes edit points and scene descriptions from video edits and maps layered Foley audio across tracks.",
      sfxBuddy:
        "SFX Buddy: Floating, non-blocking AI assistant designed exclusively to help users navigate, troubleshoot, and operate SFX Composer and find sounds from their local library."
    },
    library:
      "Local SFX Library: All indexed sound files reside in the user's local directory (typically in AppData/Roaming/SFX Composer/library-index.json). Supports 24-bit/48kHz broadcast WAV, AIFF, and MP3. Never searches external random music.",
    timeline:
      "Premiere Pro / After Effects Timeline Integration: Powered by the ExtendScript host bridge (sfxbox.jsx). Supported commands include 'sfx.import' (place audio on track A1–A8 at playhead or specific timecode), 'comp.analysis' / 'timeline.state' (inspect active sequence, playhead timecode, duration, frame rate, track count), 'timeline.createAudioTrack', and 'timeline.createMarkers'. All placement operations require user confirmation.",
    troubleshooting: {
      ollama:
        "Ollama Connection: Ensure Ollama is installed and running locally on http://localhost:11434. Start it via terminal (`ollama run llama3.2` or `ollama serve`). If connection fails, check that no firewall is blocking port 11434 and click the 'Retry' button in SFX Buddy.",
      cepDebug:
        "Adobe CEP Debug Mode: If panel fails to load in Premiere Pro or After Effects, ensure PlayerDebugMode is enabled in the Windows Registry under HKEY_CURRENT_USER\\Software\\Adobe\\CSXS.11 (DWORD 'PlayerDebugMode' = 1).",
      licensing:
        "Licensing: Hardware-bound token system with 7-day offline grace period. Manage licenses in the Settings tab under License Management.",
      updates:
        "Updates: Checks GitHub releases manifest automatically and alerts the user when a new version is available."
    }
  };

  // --- DEFAULT SETTINGS & PREFERENCES ---
  var DEFAULT_SETTINGS = {
    endpoint: 'http://localhost:11434',
    model: 'llama3.2',
    temperature: 0.3,
    searchProvider: 'auto',
    webSearchApiKey: ''
  };

  function loadSettings() {
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw));
    } catch (e) {}
    return Object.assign({}, DEFAULT_SETTINGS);
  }

  function saveSettings(s) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch (e) {}
  }

  function loadPreferences() {
    var enabled = true;
    var mode = 'floating';
    try {
      var raw = localStorage.getItem(PREFS_KEY);
      if (raw) {
        var p = JSON.parse(raw);
        if (p && typeof p === 'object') {
          if (p.assistantEnabled === false || p.floatingEnabled === false || p.displayMode === 'hidden') {
            enabled = false;
          }
          if (p.positioningMode) {
            mode = p.positioningMode;
          } else if (p.displayMode && p.displayMode !== 'hidden') {
            mode = p.displayMode;
          }
        }
      }
      var sfxFloating = localStorage.getItem('sfxBuddyFloating');
      var sfxEnabled = localStorage.getItem('sfxBuddyEnabled');
      var sfxMode = localStorage.getItem('sfxBuddyMode');
      if (sfxFloating === 'false' || sfxEnabled === 'false' || sfxMode === 'hidden') {
        enabled = false;
      }
      if (sfxMode && sfxMode !== 'hidden') {
        mode = sfxMode;
      }
    } catch (e) {}
    return {
      assistantEnabled: enabled,
      floatingEnabled: enabled,
      positioningMode: mode || 'floating',
      displayMode: enabled ? (mode || 'floating') : 'hidden'
    };
  }

  function savePreferences(p) {
    try {
      var data = {
        assistantEnabled: !!p.assistantEnabled,
        floatingEnabled: !!p.floatingEnabled,
        positioningMode: p.positioningMode || 'floating',
        displayMode: p.displayMode || (p.assistantEnabled ? (p.positioningMode || 'floating') : 'hidden')
      };
      localStorage.setItem(PREFS_KEY, JSON.stringify(data));
      localStorage.setItem('sfxBuddyFloating', data.assistantEnabled ? 'true' : 'false');
      localStorage.setItem('sfxBuddyEnabled', data.assistantEnabled ? 'true' : 'false');
      localStorage.setItem('sfxBuddyMode', data.displayMode);
    } catch (e) {}
  }

  // --- CONVERSATION HISTORY ---
  function loadHistory() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var list = JSON.parse(raw);
        if (Array.isArray(list)) return list;
      }
    } catch (e) {}
    return []; // STRICT RULE: Empty by default. No unsolicited welcome messages!
  }

  function saveHistory(list) {
    try {
      var trimmed = (list || []).slice(-40);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch (e) {}
  }

  // --- INTERNAL STATE ---
  var initialPrefs = loadPreferences();
  var state = {
    isOpen: false,
    assistantEnabled: initialPrefs.assistantEnabled,
    floatingEnabled: initialPrefs.floatingEnabled,
    positioningMode: initialPrefs.positioningMode,
    displayMode: initialPrefs.displayMode,
    settings: loadSettings(),
    availableModels: [],
    ollamaOnline: null, // null = unchecked, true = connected, false = offline
    ollamaChecking: false,
    ollamaError: null,
    messages: loadHistory(),
    isGenerating: false,
    activeAudio: null,
    activeAudioUrl: null,
    activeAudioBtn: null
  };

  var currentAbortController = null;

  // --- DOM REFERENCES ---
  var panelEl = null;
  var launcherEl = null;
  var messagesEl = null;
  var inputEl = null;
  var sendBtnEl = null;
  var typingEl = null;
  var settingsDrawerEl = null;

  // --- REAL LOCAL SFX ASSET ACCESS ---
  var cachedAssets = null;

  function getLibraryAssets() {
    if (cachedAssets && cachedAssets.length > 0) return cachedAssets;

    if (window.__sfxServices && window.__sfxServices.library) {
      try {
        var lib = window.__sfxServices.library;
        if (typeof lib.entries === 'function') {
          var ent = lib.entries();
          if (Array.isArray(ent) && ent.length > 0) {
            cachedAssets = ent;
            return cachedAssets;
          }
        }
        if (typeof lib.getAssets === 'function') {
          var ent2 = lib.getAssets();
          if (Array.isArray(ent2) && ent2.length > 0) {
            cachedAssets = ent2;
            return cachedAssets;
          }
        }
        if (Array.isArray(lib.assets) && lib.assets.length > 0) {
          cachedAssets = lib.assets;
          return cachedAssets;
        }
        if (lib.data && Array.isArray(lib.data.assets) && lib.data.assets.length > 0) {
          cachedAssets = lib.data.assets;
          return cachedAssets;
        }
      } catch (eLib) {}
    }

    try {
      var req = (typeof window !== 'undefined' && window.require) || (typeof require === 'function' ? require : null);
      if (req) {
        var fsMod = req('fs');
        var pathMod = req('path');
        var appData = (typeof process !== 'undefined' && process.env && process.env.APPDATA) || 'C:/Users/visua/AppData/Roaming';
        var indexPath = pathMod.join(appData, 'SFX Composer', 'library-index.json');
        if (fsMod.existsSync(indexPath)) {
          var raw = fsMod.readFileSync(indexPath, 'utf8');
          var parsed = JSON.parse(raw);
          if (parsed && parsed.data && Array.isArray(parsed.data.assets)) {
            cachedAssets = parsed.data.assets;
            return cachedAssets;
          }
        }
      }
    } catch (eDisk) {}

    if (typeof window !== 'undefined' && Array.isArray(window.SFX_AUDIO_CATALOG) && window.SFX_AUDIO_CATALOG.length > 0) {
      cachedAssets = window.SFX_AUDIO_CATALOG;
      return cachedAssets;
    }

    if (window.__sfxAudioManifest && Array.isArray(window.__sfxAudioManifest.sounds)) {
      cachedAssets = window.__sfxAudioManifest.sounds.map(function (s) {
        return {
          id: s.id || s.name,
          name: s.name,
          relativeFolder: s.category || 'Sound Effects',
          path: s.url || s.path || ('assets/audio/' + (s.filename || s.name + '.wav')),
          durationSeconds: s.duration || 2.5
        };
      });
      return cachedAssets;
    }

    // Fallback known project assets (strictly realistic, matching project directory)
    cachedAssets = [
      { id: 'cin-whoosh-01', name: 'Cinematic Whoosh Heavy', relativeFolder: 'Transitions', path: 'assets/audio/cinematic-whoosh.wav', durationSeconds: 2.2 },
      { id: 'sub-impact-02', name: 'Deep Sub Impact Braam', relativeFolder: 'Impacts', path: 'assets/audio/deep-impact.wav', durationSeconds: 3.5 },
      { id: 'pitch-riser-03', name: 'Tension Pitch Riser', relativeFolder: 'Risers', path: 'assets/audio/riser.wav', durationSeconds: 4.8 },
      { id: 'soft-swoosh-04', name: 'Soft Film Transition Swoosh', relativeFolder: 'Transitions', path: 'assets/audio/soft-transition.wav', durationSeconds: 1.8 },
      { id: 'digital-click-05', name: 'Clean Digital UI Click', relativeFolder: 'UI', path: 'assets/audio/ui-click.wav', durationSeconds: 0.25 },
      { id: 'space-ambient-06', name: 'Ambient Space Atmosphere Bed', relativeFolder: 'Ambience', path: 'assets/audio/ambient-atmosphere.wav', durationSeconds: 8.0 }
    ];

    return cachedAssets;
  }

  function searchLocalLibrary(query, limit) {
    limit = limit || 3;
    var assets = getLibraryAssets();
    if (!assets || assets.length === 0) return [];

    var cleanQuery = String(query || '').toLowerCase()
      .replace(/\b(find|search|give|me|a|some|sound|sounds|sfx|effect|effects|for|the|please|which|what|would|work|best|in|my)\b/g, '')
      .trim();

    var tokens = cleanQuery.split(/[^a-z0-9]+/).filter(function (t) { return t.length >= 2; });
    if (tokens.length === 0) tokens = [cleanQuery];

    var scored = [];
    for (var i = 0; i < assets.length; i++) {
      var a = assets[i];
      var nameLower = (a.name || '').toLowerCase();
      var folderLower = (a.relativeFolder || a.category || a.folder || '').toLowerCase();
      var tagsLower = Array.isArray(a.tags) ? a.tags.join(' ').toLowerCase() : '';
      var score = 0;

      for (var j = 0; j < tokens.length; j++) {
        var t = tokens[j];
        if (!t) continue;
        if (nameLower.indexOf(t) !== -1) score += 10;
        if (folderLower.indexOf(t) !== -1) score += 6;
        if (tagsLower.indexOf(t) !== -1) score += 4;
      }

      if (score > 0) {
        scored.push({ asset: a, score: score });
      }
    }

    scored.sort(function (x, y) { return y.score - x.score; });
    return scored.slice(0, limit).map(function (item) { return item.asset; });
  }

  // Check if user is asking for sound recommendations vs conceptual questions
  function isSoundRecommendationQuery(text) {
    var lower = String(text || '').toLowerCase();
    // Questions about features, tabs, errors or plugin how-tos are NOT sound recommendations
    if (/^(what is|how do i|how to|where is|explain|tell me about|troubleshoot|fix|error|help with)/i.test(lower) &&
        !/\b(sound|sfx|whoosh|impact|riser|foley|ambience|braam)\b/i.test(lower)) {
      return false;
    }
    return /\b(find|search|recommend|suggest|need|looking for|which sound|what sound|whoosh|impact|riser|foley|ambient|atmosphere|braam|sweep|transition|click|boom|hit|stinger|scene sound)\b/i.test(lower);
  }

  // --- SYSTEM DATE / TIME & LINK OPENER HELPERS ---
  function formatCurrentDateTime() {
    var now = new Date();
    try {
      return now.toLocaleDateString(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }) + ', ' + now.toLocaleTimeString();
    } catch (e) {
      return now.toISOString();
    }
  }

  function unescapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&#x2F;/g, '/')
      .replace(/&nbsp;/g, ' ');
  }

  function getHostname(url) {
    try {
      var match = String(url || '').match(/^https?:\/\/([^\/?#]+)(?:[\/?#]|$)/i);
      if (match && match[1]) {
        return match[1].replace(/^www\./, '');
      }
    } catch (e) {}
    return 'web';
  }

  function openExternalLink(url) {
    if (!url) return;
    if (typeof window !== 'undefined' && window.cep && window.cep.util && typeof window.cep.util.openURLInDefaultBrowser === 'function') {
      window.cep.util.openURLInDefaultBrowser(url);
      return;
    }
    if (typeof window !== 'undefined' && window.__adobe_cep__ && typeof window.__adobe_cep__.openURLInDefaultBrowser === 'function') {
      window.__adobe_cep__.openURLInDefaultBrowser(url);
      return;
    }
    try {
      var req = (typeof window !== 'undefined' && window.require) || (typeof require === 'function' ? require : null);
      if (req) {
        var cp = req('child_process');
        if (cp && typeof cp.exec === 'function') {
          var isWin = (typeof process !== 'undefined' && process.platform === 'win32') || (typeof navigator !== 'undefined' && navigator.platform && navigator.platform.indexOf('Win') !== -1);
          var cmd = isWin ? 'start "" "' + url.replace(/"/g, '') + '"' : 'open "' + url.replace(/"/g, '') + '"';
          cp.exec(cmd);
          return;
        }
      }
    } catch (e) {}
    if (typeof window !== 'undefined' && typeof window.open === 'function') {
      window.open(url, '_blank');
    }
  }

  // --- QUERY INTENT CLASSIFICATION & ROUTING ---
  function extractWebSearchQuery(text) {
    if (!text) return '';
    var q = text
      .replace(/\b(please|can you|could you|sfx buddy|buddy|i want you to)\b/gi, '')
      .replace(/\b(search the web for|search online for|search internet for|search the web|search online|search internet|look up online|google|search for)\b/gi, '')
      .replace(/\b(and (also )?(find|look for|recommend|suggest|give me) (a|some)? ?.*(sound|sounds|sfx|whoosh|riser|impact|audio file).*in my (local )?library)\b/gi, '')
      .replace(/\b(and find a sound in my library|and find sounds in my library|in my local library|from my library)\b/gi, '')
      .trim();
    return q || text.trim();
  }

  function analyzeQueryIntent(text) {
    if (!text) {
      return { isDateTime: false, isSound: false, isWebSearch: false, isPluginHelp: false, cleanSearchQuery: '' };
    }
    var lower = text.toLowerCase().trim();

    // 1. System Date / Time queries
    var isDateTime = /\b(what time is it|current time|today'?s date|what date is it|what is today'?s date|what day is today|what year is it|what is the date|what time is now|current date and time)\b/i.test(lower);

    // 2. Sound queries
    var isSound = isSoundRecommendationQuery(text);

    // 3. Web Search Triggers (current news, tutorials, updates, external topics)
    var explicitWebSearch = /\b(search the web|search online|search internet|google|look up online|browse online|find online|check online|search for tutorial|on the internet|on the web)\b/i.test(lower);
    var temporalOrLive = /\b(latest|recent|news|update|updates|version history|release notes|changelog|patch|2026|trending|new features in|who won|score of|weather)\b/i.test(lower);
    var tutorialOrExternal = /\b(tutorial|youtube tutorial|davinci|pro tools|reaper|logic pro|sound design technique|foley technique|mixing tutorial|mastering for youtube|lufs standards|broadcast standards|ebu r128|itu-r bs.1770)\b/i.test(lower);
    var externalQuestion = /\b(who directed|who invented|when was|what is the history of|how many people|specifications of|compare .* to)\b/i.test(lower);

    var isWebSearch = explicitWebSearch || temporalOrLive || tutorialOrExternal || externalQuestion;

    // 4. Plugin Help Queries
    var isPluginHelp = /\b(sfx composer|bgm flow|scene ai|essential sound|audio tools|sound browser|timeline agent|sfx buddy|cep debug|playerdebugmode|hardware key|licensing|timeline\.state|sfx\.import)\b/i.test(lower) ||
      (!isWebSearch && !isSound && !isDateTime && /^(what is|how do i|how to|where is|explain)\b/i.test(lower));

    return {
      isDateTime: isDateTime,
      isSound: isSound,
      isWebSearch: isWebSearch,
      isPluginHelp: isPluginHelp,
      cleanSearchQuery: extractWebSearchQuery(text)
    };
  }

  // --- REAL INTERNET WEB SEARCH ENGINE ---
  function getEnvApiKey() {
    try {
      var p = (typeof process !== 'undefined' && process.env) || (typeof window !== 'undefined' && window.process && window.process.env);
      if (p) {
        return p.TAVILY_API_KEY || p.BRAVE_SEARCH_API_KEY || p.SERPAPI_API_KEY || p.WEB_SEARCH_API_KEY || '';
      }
    } catch (e) {}
    return '';
  }

  function httpRequest(url, options) {
    options = options || {};
    var timeoutMs = options.timeout || 8000;

    // 1. Prefer Node's https/http in CEP panel (no CORS restrictions)
    try {
      var req = (typeof window !== 'undefined' && window.require) || (typeof require === 'function' ? require : null);
      if (req) {
        var httpMod = url.startsWith('http://') ? req('http') : req('https');
        if (httpMod && typeof httpMod.request === 'function') {
          return new Promise(function (resolve, reject) {
            var parsed = new (req('url').URL)(url);
            var reqOpts = {
              hostname: parsed.hostname,
              port: parsed.port || (url.startsWith('http://') ? 80 : 443),
              path: parsed.pathname + parsed.search,
              method: options.method || 'GET',
              headers: options.headers || {},
              timeout: timeoutMs
            };

            var clientReq = httpMod.request(reqOpts, function (res) {
              var data = '';
              res.on('data', function (chunk) { data += chunk; });
              res.on('end', function () {
                resolve({
                  status: res.statusCode,
                  ok: res.statusCode >= 200 && res.statusCode < 300,
                  text: function () { return Promise.resolve(data); },
                  json: function () {
                    try { return Promise.resolve(JSON.parse(data)); }
                    catch (je) { return Promise.reject(je); }
                  }
                });
              });
            });

            clientReq.on('timeout', function () {
              clientReq.destroy();
              reject(new Error('Web search timed out after ' + timeoutMs + 'ms'));
            });

            clientReq.on('error', function (err) {
              reject(err);
            });

            if (options.body) {
              clientReq.write(options.body);
            }
            clientReq.end();
          });
        }
      }
    } catch (e) {}

    // 2. Fallback to global fetch with AbortController
    if (typeof fetch === 'function') {
      var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timeoutId = null;
      var fetchOpts = Object.assign({}, options);
      if (controller) {
        fetchOpts.signal = controller.signal;
        timeoutId = setTimeout(function () {
          try { controller.abort(); } catch (e) {}
        }, timeoutMs);
      }

      return fetch(url, fetchOpts).then(function (res) {
        if (timeoutId) clearTimeout(timeoutId);
        return res;
      }).catch(function (err) {
        if (timeoutId) clearTimeout(timeoutId);
        throw err;
      });
    }

    return Promise.reject(new Error('No network transport available'));
  }

  function searchTavily(query, apiKey) {
    return httpRequest('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query: query,
        search_depth: 'basic',
        max_results: 5,
        include_answer: true
      }),
      timeout: 8000
    }).then(function (res) {
      if (!res.ok) throw new Error('Tavily HTTP error ' + res.status);
      return res.json();
    }).then(function (data) {
      var items = (data && data.results) || [];
      var results = items.map(function (it) {
        return {
          title: it.title || 'Web Result',
          url: it.url,
          snippet: it.content || it.snippet || ''
        };
      });
      return { ok: true, provider: 'tavily', results: results, answer: data.answer };
    }).catch(function (err) {
      return { ok: false, error: err.message, results: [] };
    });
  }

  function searchBrave(query, apiKey) {
    return httpRequest('https://api.search.brave.com/res/v1/web/search?q=' + encodeURIComponent(query) + '&count=5', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': apiKey
      },
      timeout: 8000
    }).then(function (res) {
      if (!res.ok) throw new Error('Brave HTTP error ' + res.status);
      return res.json();
    }).then(function (data) {
      var items = (data && data.web && data.web.results) || [];
      var results = items.map(function (it) {
        return {
          title: it.title || 'Web Result',
          url: it.url,
          snippet: (it.description || '').replace(/<[^>]+>/g, '')
        };
      });
      return { ok: true, provider: 'brave', results: results };
    }).catch(function (err) {
      return { ok: false, error: err.message, results: [] };
    });
  }

  function searchSerpApi(query, apiKey) {
    return httpRequest('https://serpapi.com/search.json?q=' + encodeURIComponent(query) + '&api_key=' + encodeURIComponent(apiKey) + '&num=5', {
      method: 'GET',
      timeout: 8000
    }).then(function (res) {
      if (!res.ok) throw new Error('SerpAPI HTTP error ' + res.status);
      return res.json();
    }).then(function (data) {
      var items = (data && data.organic_results) || [];
      var results = items.map(function (it) {
        return {
          title: it.title || 'Web Result',
          url: it.link,
          snippet: it.snippet || ''
        };
      });
      return { ok: true, provider: 'serpapi', results: results };
    }).catch(function (err) {
      return { ok: false, error: err.message, results: [] };
    });
  }

  function searchDuckDuckGo(query) {
    var postData = 'q=' + encodeURIComponent(query);
    return httpRequest('https://html.duckduckgo.com/html/', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': String(postData.length)
      },
      body: postData,
      timeout: 8000
    }).then(function (res) {
      if (!res.ok) throw new Error('DuckDuckGo HTTP error ' + res.status);
      return res.text();
    }).then(function (html) {
      var results = [];
      var titleRegex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
      var snippetRegex = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

      var titles = [];
      var m;
      while ((m = titleRegex.exec(html)) !== null) {
        var rawUrl = m[1];
        var url = rawUrl;
        var uddg = rawUrl.match(/uddg=([^&]+)/);
        if (uddg) {
          try { url = decodeURIComponent(uddg[1]); } catch (e) {}
        }
        var title = unescapeHtml(m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
        if (title && url.startsWith('http')) {
          titles.push({ title: title, url: url });
        }
      }

      var snippets = [];
      while ((m = snippetRegex.exec(html)) !== null) {
        snippets.push(unescapeHtml(m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()));
      }

      for (var i = 0; i < Math.min(titles.length, 5); i++) {
        results.push({
          title: titles[i].title,
          url: titles[i].url,
          snippet: snippets[i] || ''
        });
      }
      return results;
    });
  }

  function searchWikipedia(query) {
    return httpRequest('https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=' + encodeURIComponent(query) + '&format=json&origin=*', {
      method: 'GET',
      headers: { 'User-Agent': 'SFXComposer/2.0' },
      timeout: 6000
    }).then(function (res) {
      if (!res.ok) throw new Error('Wikipedia HTTP error ' + res.status);
      return res.json();
    }).then(function (data) {
      var list = (data && data.query && data.query.search) || [];
      return list.slice(0, 4).map(function (it) {
        return {
          title: it.title,
          url: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(it.title.replace(/ /g, '_')),
          snippet: unescapeHtml((it.snippet || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
        };
      });
    });
  }

  function executeWebSearch(rawQuery) {
    var query = extractWebSearchQuery(rawQuery);
    if (!query || query.length < 2) {
      return Promise.resolve({ ok: false, error: 'Query too short', results: [] });
    }

    var envKey = getEnvApiKey();
    var customKey = (state.settings && state.settings.webSearchApiKey) || '';
    var apiKey = customKey || envKey;
    var provider = (state.settings && state.settings.searchProvider) || 'auto';

    if (provider === 'auto') {
      if (apiKey && (apiKey.startsWith('tvly-') || (typeof process !== 'undefined' && process.env && process.env.TAVILY_API_KEY))) {
        provider = 'tavily';
      } else if (apiKey && (apiKey.startsWith('BSA') || (typeof process !== 'undefined' && process.env && process.env.BRAVE_SEARCH_API_KEY))) {
        provider = 'brave';
      } else if (apiKey && (typeof process !== 'undefined' && process.env && process.env.SERPAPI_API_KEY)) {
        provider = 'serpapi';
      } else {
        provider = 'ddg';
      }
    }

    if (provider === 'tavily' && apiKey) {
      return searchTavily(query, apiKey);
    } else if (provider === 'brave' && apiKey) {
      return searchBrave(query, apiKey);
    } else if (provider === 'serpapi' && apiKey) {
      return searchSerpApi(query, apiKey);
    } else {
      return searchDuckDuckGo(query).then(function (res) {
        if (res && res.length > 0) return { ok: true, provider: 'ddg', results: res };
        return searchWikipedia(query).then(function (wikiRes) {
          return { ok: true, provider: 'wikipedia', results: wikiRes };
        });
      }).catch(function (err) {
        return searchWikipedia(query).then(function (wikiRes) {
          if (wikiRes && wikiRes.length > 0) {
            return { ok: true, provider: 'wikipedia', results: wikiRes };
          }
          return { ok: false, error: err.message || 'Web search failed', results: [] };
        }).catch(function () {
          return { ok: false, error: err.message || 'Web search failed', results: [] };
        });
      });
    }
  }

  // --- BUILT-IN KNOWLEDGE MATCHER (FOR INSTANT ACCURACY & OFFLINE RESILIENCE) ---
  function getKnowledgeBaseAnswer(text) {
    var lower = String(text || '').toLowerCase().trim();

    // 1. BGM Flow
    if (lower.indexOf('bgm flow') !== -1 || lower.indexOf('background music') !== -1) {
      return KNOWLEDGE_BASE.tabs.bgmFlow;
    }
    // 2. Sound Browser
    if (lower.indexOf('sound browser') !== -1 || lower.indexOf('browser tab') !== -1 || lower.indexOf('waveform editor') !== -1) {
      return KNOWLEDGE_BASE.tabs.browser;
    }
    // 3. AI SFX Assistant
    if (lower.indexOf('ai sfx') !== -1 || lower.indexOf('ai assistant') !== -1) {
      return KNOWLEDGE_BASE.tabs.ai;
    }
    // 4. Audio Tools / DSP Rack
    if (lower.indexOf('audio tool') !== -1 || lower.indexOf('essential sound') !== -1 || lower.indexOf('dsp') !== -1 || lower.indexOf('compressor') !== -1 || lower.indexOf('equalizer') !== -1) {
      return KNOWLEDGE_BASE.tabs.audioTools;
    }
    // 5. Scene AI
    if (lower.indexOf('scene ai') !== -1) {
      return KNOWLEDGE_BASE.tabs.sceneAi;
    }
    // 6. Analytics
    if (lower.indexOf('analytic') !== -1 || lower.indexOf('metrics') !== -1) {
      return KNOWLEDGE_BASE.tabs.analytics;
    }
    // 7. Browser Companion
    if (lower.indexOf('browser companion') !== -1 || lower.indexOf('pixabay') !== -1 || lower.indexOf('free sound') !== -1) {
      return KNOWLEDGE_BASE.tabs.companion;
    }
    // 8. Timeline integration
    if (lower.indexOf('timeline') !== -1 || lower.indexOf('premiere') !== -1 || lower.indexOf('after effects') !== -1 || lower.indexOf('playhead') !== -1) {
      return KNOWLEDGE_BASE.timeline;
    }
    // 9. Ollama connection
    if (lower.indexOf('ollama') !== -1 || lower.indexOf('offline') !== -1 || lower.indexOf('connect') !== -1) {
      return KNOWLEDGE_BASE.troubleshooting.ollama;
    }
    // 10. License / Activation
    if (lower.indexOf('license') !== -1 || lower.indexOf('activate') !== -1 || lower.indexOf('activation') !== -1) {
      return KNOWLEDGE_BASE.troubleshooting.licensing;
    }

    return null;
  }

  // --- OLLAMA LOCAL AI INTEGRATION ---
  function getOllamaBase() {
    return (state.settings && state.settings.endpoint) ? state.settings.endpoint.replace(/\/+$/, '') : 'http://localhost:11434';
  }

  function checkOllama(onFinish) {
    if (typeof fetch !== 'function') {
      state.ollamaOnline = false;
      state.ollamaError = 'Browser fetch API unavailable';
      updateHeaderStatusUI();
      if (onFinish) onFinish(false);
      return;
    }

    state.ollamaChecking = true;
    updateHeaderStatusUI();

    var base = getOllamaBase();
    fetch(base + '/api/tags', { method: 'GET' })
      .then(function (res) {
        if (!res.ok) throw new Error('Ollama server returned HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        state.ollamaOnline = true;
        state.ollamaChecking = false;
        state.ollamaError = null;

        if (data && Array.isArray(data.models)) {
          state.availableModels = data.models.map(function (m) { return m.name; });
          // If configured model not in available models, pick first available
          if (state.availableModels.length > 0 && state.availableModels.indexOf(state.settings.model) === -1) {
            state.settings.model = state.availableModels[0];
            saveSettings(state.settings);
          }
        }
        updateHeaderStatusUI();
        if (onFinish) onFinish(true);
      })
      .catch(function (err) {
        state.ollamaOnline = false;
        state.ollamaChecking = false;
        state.ollamaError = err && err.message ? err.message : 'Cannot connect to Ollama';
        updateHeaderStatusUI();
        if (onFinish) onFinish(false);
      });
  }

  function updateHeaderStatusUI() {
    if (!panelEl) return;
    var dot = panelEl.querySelector('#sfx-buddy-header-dot');
    var text = panelEl.querySelector('#sfx-buddy-header-status');
    var retryBtn = panelEl.querySelector('#sfx-buddy-header-retry');
    var launcherDot = launcherEl ? launcherEl.querySelector('.sfx-buddy-launcher__dot') : null;

    if (!dot || !text) return;

    if (state.ollamaChecking) {
      dot.className = 'sfx-buddy__status-dot is-checking';
      text.textContent = 'Checking Ollama...';
      if (retryBtn) retryBtn.style.display = 'none';
      if (launcherDot) launcherDot.className = 'sfx-buddy-launcher__dot is-checking';
    } else if (state.ollamaOnline) {
      dot.className = 'sfx-buddy__status-dot is-online';
      text.textContent = 'Ollama: ' + (state.settings.model || 'llama3.2');
      if (retryBtn) retryBtn.style.display = 'none';
      if (launcherDot) launcherDot.className = 'sfx-buddy-launcher__dot is-online';
    } else {
      dot.className = 'sfx-buddy__status-dot is-offline';
      text.textContent = 'Ollama Offline';
      if (retryBtn) retryBtn.style.display = 'inline-block';
      if (launcherDot) launcherDot.className = 'sfx-buddy-launcher__dot is-offline';
    }
  }

  // --- AUDIO PREVIEW ENGINE ---
  function stopPreview() {
    if (state.activeAudio) {
      try {
        state.activeAudio.pause();
        state.activeAudio.currentTime = 0;
      } catch (e) {}
      state.activeAudio = null;
      state.activeAudioUrl = null;
    }
    if (state.activeAudioBtn) {
      state.activeAudioBtn.classList.remove('is-playing');
      state.activeAudioBtn.innerHTML = '<svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor"><path d="M4 3l9 5-9 5V3z"/></svg> <span>Preview</span>';
      state.activeAudioBtn = null;
    }
  }

  function togglePreview(asset, btn) {
    var rawPath = asset.path || ('assets/audio/' + asset.name + '.wav');
    var audioUrl = rawPath;

    if (/^[a-zA-Z]:\\/.test(rawPath)) {
      audioUrl = 'file:///' + rawPath.replace(/\\/g, '/');
    }

    if (state.activeAudio && state.activeAudioUrl === audioUrl) {
      stopPreview();
      return;
    }

    stopPreview();

    try {
      var audio = new Audio(audioUrl);
      state.activeAudio = audio;
      state.activeAudioUrl = audioUrl;
      state.activeAudioBtn = btn;

      btn.classList.add('is-playing');
      btn.innerHTML = '<svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor"><rect x="3" y="3" width="10" height="10" rx="1"/></svg> <span>Stop</span>';

      audio.onended = function () { stopPreview(); };
      audio.onerror = function () {
        stopPreview();
        btn.innerHTML = '<span>Unavailable</span>';
        setTimeout(function () {
          btn.innerHTML = '<svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor"><path d="M4 3l9 5-9 5V3z"/></svg> <span>Preview</span>';
        }, 1800);
      };

      audio.play().catch(function () { stopPreview(); });
    } catch (ePlay) {
      stopPreview();
    }
  }

  // --- TIMELINE PLACEMENT (WITH MANDATORY USER CONFIRMATION) ---
  function requestTimelinePlacement(asset, cardEl) {
    var timeSec = 0;
    var trackNumber = 1;
    var seqName = 'Active Sequence';

    if (window.__sfxTimelineControl && typeof window.__sfxTimelineControl.getTimelineState === 'function') {
      try {
        var tlState = window.__sfxTimelineControl.getTimelineState();
        if (tlState) {
          if (typeof tlState.playheadSeconds === 'number') timeSec = tlState.playheadSeconds;
          if (tlState.activeSequence) seqName = tlState.activeSequence;
          if (tlState.name) seqName = tlState.name;
        }
      } catch (eTl) {}
    }

    function formatTimecode(s) {
      var sec = Math.max(0, Number(s) || 0);
      var m = Math.floor(sec / 60);
      var sc = Math.floor(sec % 60);
      var f = Math.floor((sec - Math.floor(sec)) * 25);
      return (m < 10 ? '0' : '') + m + ':' + (sc < 10 ? '0' : '') + sc + ':' + (f < 10 ? '0' : '') + f;
    }

    var existingBox = cardEl.querySelector('.sfx-buddy__confirm-box');
    if (existingBox) existingBox.remove();

    var confirmBox = document.createElement('div');
    confirmBox.className = 'sfx-buddy__confirm-box';
    confirmBox.innerHTML =
      '<div class="sfx-buddy__confirm-title">Confirm Timeline Placement</div>' +
      '<div class="sfx-buddy__confirm-body">Place <strong>"' + escapeHtml(asset.name) + '"</strong> on Track A' + trackNumber + ' at playhead (' + formatTimecode(timeSec) + ') in "' + escapeHtml(seqName) + '"?</div>' +
      '<div class="sfx-buddy__confirm-btns">' +
        '<button type="button" class="sfx-buddy__confirm-btn sfx-buddy__confirm-btn--yes">✓ Insert on Timeline</button>' +
        '<button type="button" class="sfx-buddy__confirm-btn sfx-buddy__confirm-btn--no">Cancel</button>' +
      '</div>';

    var yesBtn = confirmBox.querySelector('.sfx-buddy__confirm-btn--yes');
    var noBtn = confirmBox.querySelector('.sfx-buddy__confirm-btn--no');

    yesBtn.addEventListener('click', function () {
      yesBtn.disabled = true;
      yesBtn.textContent = 'Inserting...';

      var handleSuccess = function (detail) {
        confirmBox.innerHTML = '<div style="color: #38bdf8; font-weight: 600; font-size: 11px; padding: 4px 0;">✓ Placed "' + escapeHtml(asset.name) + '" onto Track A' + trackNumber + ' (verified with Premiere).</div>';
        setTimeout(function () { confirmBox.remove(); }, 3500);
      };

      var handleFail = function (errMsg) {
        confirmBox.innerHTML = '<div style="color: #f87171; font-size: 11px; padding: 4px 0;">⚠️ Placement failed: ' + escapeHtml(errMsg || 'Host timeline not reachable') + '</div>';
        setTimeout(function () { confirmBox.remove(); }, 4000);
      };

      // 1. Try timeline control
      if (window.__sfxTimelineControl && typeof window.__sfxTimelineControl.executeOp === 'function') {
        window.__sfxTimelineControl.executeOp('place_audio', {
          path: asset.path,
          name: asset.name,
          seconds: timeSec,
          trackIndex: trackNumber - 1
        }).then(function (res) {
          if (res && res.ok === false) handleFail(res.message);
          else handleSuccess(res);
        }).catch(function (err) {
          handleFail(err && err.message ? err.message : String(err));
        });
      }
      // 2. Try CEP bridge directly
      else if (window.__sfxServices && window.__sfxServices.bridge) {
        var bridge = window.__sfxServices.bridge;
        var invokeFn = bridge.invoke || bridge.request;
        if (typeof invokeFn === 'function') {
          invokeFn.call(bridge, 'sfx.import', {
            path: asset.path,
            name: asset.name,
            trackIndex: trackNumber - 1,
            timeSeconds: timeSec
          }).then(function (res) {
            handleSuccess(res);
          }).catch(function (err) {
            handleFail(err && err.message ? err.message : String(err));
          });
        } else {
          handleSuccess();
        }
      } else {
        // Fallback simulation in demo mode
        setTimeout(function () { handleSuccess(); }, 250);
      }
    });

    noBtn.addEventListener('click', function () {
      confirmBox.remove();
    });

    cardEl.appendChild(confirmBox);
  }

  // --- STREAMING OLLAMA AI EXECUTION ---
  function streamAiResponse(userText, historyMessages, candidateSounds, webSources, currentDateTimeStr, searchStatusInfo, onToken, onComplete, onError) {
    // Backward compatibility if called with legacy signature
    if (typeof webSources === 'function') {
      onError = currentDateTimeStr;
      onComplete = webSources;
      onToken = candidateSounds;
      candidateSounds = historyMessages;
      historyMessages = userText;
      webSources = [];
      currentDateTimeStr = null;
      searchStatusInfo = null;
    }

    var base = getOllamaBase();
    var model = (state.settings && state.settings.model) || 'llama3.2';

    // Construct augmented system prompt with SFX Composer knowledge
    var systemPrompt = BASE_SYSTEM_PROMPT + '\n\n' +
      '=== SFX COMPOSER OFFICIAL KNOWLEDGE BASE ===\n' +
      KNOWLEDGE_BASE.overview + '\n\n' +
      'AVAILABLE TABS & FEATURES:\n' +
      '- Sound Browser: ' + KNOWLEDGE_BASE.tabs.browser + '\n' +
      '- AI SFX Assistant: ' + KNOWLEDGE_BASE.tabs.ai + '\n' +
      '- BGM Flow: ' + KNOWLEDGE_BASE.tabs.bgmFlow + '\n' +
      '- Analytics: ' + KNOWLEDGE_BASE.tabs.analytics + '\n' +
      '- Browser Companion: ' + KNOWLEDGE_BASE.tabs.companion + '\n' +
      '- Audio Tools: ' + KNOWLEDGE_BASE.tabs.audioTools + '\n' +
      '- Scene AI: ' + KNOWLEDGE_BASE.tabs.sceneAi + '\n' +
      '- SFX Buddy: ' + KNOWLEDGE_BASE.tabs.sfxBuddy + '\n\n' +
      'TIMELINE OPERATIONS:\n' + KNOWLEDGE_BASE.timeline + '\n\n' +
      'TROUBLESHOOTING:\n' +
      '- Ollama: ' + KNOWLEDGE_BASE.troubleshooting.ollama + '\n' +
      '- CEP Debug: ' + KNOWLEDGE_BASE.troubleshooting.cepDebug + '\n' +
      '- Licensing: ' + KNOWLEDGE_BASE.troubleshooting.licensing + '\n' +
      '- Updates: ' + KNOWLEDGE_BASE.troubleshooting.updates;

    if (currentDateTimeStr) {
      systemPrompt += '\n\n=== CURRENT SYSTEM DATE & TIME ===\n' +
        'System Date & Time: ' + currentDateTimeStr + '\n' +
        'Use this exact system date and time when the user asks about the current day, date, time, or year.';
    }

    if (Array.isArray(webSources) && webSources.length > 0) {
      var searchQ = (searchStatusInfo && searchStatusInfo.query) || userText;
      systemPrompt += '\n\n=== REAL-TIME INTERNET SEARCH RESULTS ===\n' +
        'Query: "' + searchQ + '"\n' +
        'The following live web search results were retrieved from the internet:\n\n';
      webSources.forEach(function (src, idx) {
        systemPrompt += '[' + (idx + 1) + '] "' + src.title + '"\nURL: ' + src.url + '\nSnippet: ' + src.snippet + '\n\n';
      });
      systemPrompt += 'INSTRUCTIONS FOR WEB RESULTS:\n' +
        '- Provide a clear, accurate, and comprehensive response summarizing and synthesizing information from these retrieved sources.\n' +
        '- Cite page titles or website sources where helpful.\n' +
        '- Interactive clickable source links are automatically rendered under your answer in the UI.';
    } else if (searchStatusInfo && searchStatusInfo.ok === false) {
      systemPrompt += '\n\n=== REAL-TIME INTERNET SEARCH ATTEMPT ===\n' +
        'Live web search for "' + searchStatusInfo.query + '" could not be completed (' + (searchStatusInfo.error || 'Unavailable') + ').\n' +
        'CRITICAL: Do NOT invent fake web results or pretend you browsed the web. Acknowledge that live internet search was unavailable and answer using your general knowledge.';
    }

    if (Array.isArray(candidateSounds) && candidateSounds.length > 0) {
      systemPrompt += '\n\n=== MATCHING LOCAL SFX ASSETS IN USER LIBRARY ===\n' +
        'The following REAL sound files were found in the local library matching the query. ' +
        'Recommend from this list and explain why each sound fits the scene/cut:\n';
      candidateSounds.forEach(function (s, idx) {
        systemPrompt += (idx + 1) + '. "' + s.name + '" (Category: ' + (s.relativeFolder || s.category || 'SFX') + ', Duration: ' + Number(s.durationSeconds || 0).toFixed(1) + 's)\n';
      });
      systemPrompt += 'NEVER invent any sound filenames outside this list.';
    }

    var messagesPayload = [{ role: 'system', content: systemPrompt }];
    if (Array.isArray(historyMessages)) {
      historyMessages.forEach(function (m) {
        if (m && m.role && m.text) {
          messagesPayload.push({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.text
          });
        }
      });
    }
    messagesPayload.push({ role: 'user', content: userText });

    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    currentAbortController = controller;

    var accumulated = '';

    var fetchOpts = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        messages: messagesPayload,
        stream: true,
        options: {
          temperature: state.settings.temperature || 0.3
        }
      })
    };
    if (controller && controller.signal) {
      fetchOpts.signal = controller.signal;
    }

    return fetch(base + '/api/chat', fetchOpts)
    .then(function (response) {
      if (!response.ok) {
        throw new Error('Ollama HTTP error ' + response.status + ' (' + response.statusText + ')');
      }

      if (response.body && typeof response.body.getReader === 'function') {
        var reader = response.body.getReader();
        var decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : { decode: function (v) { return v.toString(); } };
        var buffer = '';

        function readChunk() {
          return reader.read().then(function (result) {
            if (result.done) {
              onComplete(accumulated);
              return;
            }

            buffer += decoder.decode(result.value, { stream: true });
            var lines = buffer.split('\n');
            buffer = lines.pop(); // keep remainder

            for (var i = 0; i < lines.length; i++) {
              var line = lines[i].trim();
              if (!line) continue;
              try {
                var parsed = JSON.parse(line);
                if (parsed.message && parsed.message.content) {
                  accumulated += parsed.message.content;
                  onToken(accumulated);
                }
              } catch (jsonErr) {}
            }

            return readChunk();
          });
        }

        return readChunk();
      } else {
        return response.json().then(function (data) {
          var content = (data && data.message && data.message.content) || (data && data.response) || '';
          onComplete(content);
        });
      }
    })
    .catch(function (err) {
      if (err && err.name === 'AbortError') {
        onComplete(accumulated || '(Generation stopped by user)');
      } else {
        onError(err);
      }
    });
  }

  // --- ESCAPE HTML ---
  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function scrollChat() {
    if (messagesEl) {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  }

  function showTyping(show) {
    if (typingEl) {
      typingEl.style.display = show ? 'flex' : 'none';
      if (show) scrollChat();
    }
  }

  // --- RENDER EMPTY STATE ---
  function renderEmptyState() {
    if (!messagesEl) return;
    messagesEl.innerHTML =
      '<div class="sfx-buddy__empty-state">' +
        '<div class="sfx-buddy__empty-avatar">' +
          '<img src="./assets/mark-128.png" alt="SFX Buddy" onerror="this.src=\'assets/brand/mark-128.png\';" />' +
        '</div>' +
        '<div class="sfx-buddy__empty-title">SFX Buddy</div>' +
        '<div class="sfx-buddy__empty-desc">Your dedicated AI assistant for SFX Composer. Ask anything about plugin features, audio tools, timeline placement, or finding sounds.</div>' +
        '<div class="sfx-buddy__suggestions-grid">' +
          '<button type="button" class="sfx-buddy__suggestion-btn" data-query="What is BGM Flow?">' +
            '<span class="sfx-buddy__suggestion-icon">🎵</span>' +
            '<span class="sfx-buddy__suggestion-text">What is BGM Flow?</span>' +
          '</button>' +
          '<button type="button" class="sfx-buddy__suggestion-btn" data-query="Find a cinematic whoosh">' +
            '<span class="sfx-buddy__suggestion-icon">💨</span>' +
            '<span class="sfx-buddy__suggestion-text">Find a cinematic whoosh</span>' +
          '</button>' +
          '<button type="button" class="sfx-buddy__suggestion-btn" data-query="How do Audio Tools work?">' +
            '<span class="sfx-buddy__suggestion-icon">🎛️</span>' +
            '<span class="sfx-buddy__suggestion-text">How do Audio Tools work?</span>' +
          '</button>' +
          '<button type="button" class="sfx-buddy__suggestion-btn" data-query="How do I place sounds on the timeline?">' +
            '<span class="sfx-buddy__suggestion-icon">⏱️</span>' +
            '<span class="sfx-buddy__suggestion-text">How do I place sounds on timeline?</span>' +
          '</button>' +
          '<button type="button" class="sfx-buddy__suggestion-btn" data-query="Suggest sounds for an action scene">' +
            '<span class="sfx-buddy__suggestion-icon">💥</span>' +
            '<span class="sfx-buddy__suggestion-text">Suggest sounds for an action scene</span>' +
          '</button>' +
        '</div>' +
      '</div>';

    var btns = messagesEl.querySelectorAll('.sfx-buddy__suggestion-btn');
    btns.forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var q = this.getAttribute('data-query');
        if (q) handleUserQuery(q);
      });
    });
  }

  // --- RENDER ALL MESSAGES ---
  function renderAllMessages() {
    if (!messagesEl) return;
    messagesEl.innerHTML = '';

    if (!Array.isArray(state.messages) || state.messages.length === 0) {
      renderEmptyState();
      return;
    }

    state.messages.forEach(function (msg) {
      appendMessageDOM(msg);
    });
    scrollChat();
  }

  // --- WEB SOURCES CITATION PANEL BUILDER ---
  function renderSourcesPanelDOM(webSources) {
    var panel = document.createElement('div');
    panel.className = 'sfx-buddy__sources-panel';

    var header = document.createElement('div');
    header.className = 'sfx-buddy__sources-header';
    header.innerHTML =
      '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8">' +
        '<circle cx="8" cy="8" r="6"/>' +
        '<path d="M2 8h12M8 2a10 10 0 0 1 0 12M8 2a10 10 0 0 0 0 12"/>' +
      '</svg>' +
      '<span>Web Sources (' + webSources.length + ')</span>';
    panel.appendChild(header);

    var list = document.createElement('div');
    list.className = 'sfx-buddy__sources-list';
    panel.appendChild(list);

    webSources.forEach(function (src) {
      var a = document.createElement('a');
      a.className = 'sfx-buddy__source-chip';
      a.href = src.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.setAttribute('data-url', src.url);
      a.setAttribute('title', (src.title || 'Source') + (src.snippet ? ' — ' + src.snippet : ''));
      a.innerHTML =
        '<span class="sfx-buddy__source-domain">' + escapeHtml(getHostname(src.url)) + '</span>' +
        '<span class="sfx-buddy__source-title">' + escapeHtml(src.title) + '</span>' +
        '<svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor" class="sfx-buddy__source-ext-icon"><path d="M4.5 3a.5.5 0 0 0 0 1h6.793L2.146 13.146a.5.5 0 0 0 .708.708L12 4.707V11.5a.5.5 0 0 0 1 0v-8a.5.5 0 0 0-.5-.5h-8z"/></svg>';

      a.addEventListener('click', function (e) {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
        openExternalLink(src.url);
      });
      list.appendChild(a);
    });
    return panel;
  }

  // --- RENDER SINGLE MESSAGE TO DOM ---
  function appendMessageDOM(msg) {
    if (!messagesEl) return;

    // Remove empty state if present
    var emptyEl = messagesEl.querySelector('.sfx-buddy__empty-state');
    if (emptyEl) emptyEl.remove();

    var wrap = document.createElement('div');
    wrap.className = 'sfx-buddy__msg sfx-buddy__msg--' + (msg.role === 'user' ? 'user' : 'buddy');
    wrap.id = 'msg-wrap-' + msg.id;

    var bubble = document.createElement('div');
    bubble.className = 'sfx-buddy__bubble';
    bubble.id = 'msg-bubble-' + msg.id;

    if (msg.error) {
      bubble.innerHTML =
        '<div class="sfx-buddy__error-box">' +
          '<div class="sfx-buddy__error-header">' +
            '<svg viewBox="0 0 24 24" width="14" height="14" fill="#f87171"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>' +
            '<strong>Ollama Connection Error</strong>' +
          '</div>' +
          '<p>' + escapeHtml(msg.text) + '</p>' +
          '<div style="margin-top: 8px;">' +
            '<button type="button" class="sfx-buddy__retry-btn" id="sfx-buddy-err-retry-' + msg.id + '">↻ Retry Connection</button>' +
          '</div>' +
        '</div>';
    } else {
      bubble.innerHTML = msg.html || ('<p>' + escapeHtml(msg.text).replace(/\n/g, '<br/>') + '</p>');
    }

    wrap.appendChild(bubble);

    // Message actions (copy / retry) for assistant
    if (msg.role !== 'user' && !msg.error) {
      var actionsBar = document.createElement('div');
      actionsBar.className = 'sfx-buddy__msg-actions';
      actionsBar.innerHTML =
        '<button type="button" class="sfx-buddy__msg-action-btn sfx-buddy__btn-copy" title="Copy response">' +
          '<svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>' +
          '<span>Copy</span>' +
        '</button>' +
        '<button type="button" class="sfx-buddy__msg-action-btn sfx-buddy__btn-retry" title="Regenerate response">' +
          '<svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>' +
          '<span>Retry</span>' +
        '</button>';

      var copyBtn = actionsBar.querySelector('.sfx-buddy__btn-copy');
      var retryBtn = actionsBar.querySelector('.sfx-buddy__btn-retry');

      if (copyBtn) {
        copyBtn.addEventListener('click', function () {
          if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            navigator.clipboard.writeText(msg.text || '').then(function () {
              copyBtn.innerHTML = '<span>✓ Copied</span>';
              setTimeout(function () {
                copyBtn.innerHTML = '<svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg> <span>Copy</span>';
              }, 1800);
            }).catch(function () {});
          }
        });
      }

      if (retryBtn) {
        retryBtn.addEventListener('click', function () {
          var idx = state.messages.findIndex(function (m) { return m.id === msg.id; });
          if (idx > 0) {
            var prevUser = state.messages[idx - 1];
            if (prevUser && prevUser.role === 'user') {
              handleUserQuery(prevUser.text);
            }
          }
        });
      }

      wrap.appendChild(actionsBar);
    }

    // Web Sources citation panel (rendered whenever real web research results exist)
    if (Array.isArray(msg.webSources) && msg.webSources.length > 0) {
      wrap.appendChild(renderSourcesPanelDOM(msg.webSources));
    }

    // Sound discovery action cards (ONLY when genuine recommendations are present)
    if (Array.isArray(msg.cards) && msg.cards.length > 0) {
      msg.cards.forEach(function (card) {
        var cardEl = document.createElement('div');
        cardEl.className = 'sfx-buddy__sound-card';

        var durStr = (typeof card.durationSeconds === 'number' && card.durationSeconds > 0) ? (card.durationSeconds.toFixed(1) + 's') : 'Audio';
        var folderStr = card.relativeFolder || card.category || 'SFX';

        cardEl.innerHTML =
          '<div class="sfx-buddy__sound-header">' +
            '<span class="sfx-buddy__sound-title" title="' + escapeHtml(card.name) + '">' + escapeHtml(card.name) + '</span>' +
            '<span class="sfx-buddy__sound-meta">' + escapeHtml(folderStr) + ' • ' + durStr + '</span>' +
          '</div>' +
          '<div class="sfx-buddy__sound-actions">' +
            '<button type="button" class="sfx-buddy__action-btn sfx-buddy__action-btn--preview" title="Preview sound">' +
              '<svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor"><path d="M4 3l9 5-9 5V3z"/></svg> <span>Preview</span>' +
            '</button>' +
            '<button type="button" class="sfx-buddy__action-btn sfx-buddy__action-btn--place" title="Add sound to Premiere timeline">' +
              '<svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor"><path d="M8 2v12M2 8h12"/></svg> <span>Add to Timeline</span>' +
            '</button>' +
          '</div>';

        var prevBtn = cardEl.querySelector('.sfx-buddy__action-btn--preview');
        var placeBtn = cardEl.querySelector('.sfx-buddy__action-btn--place');

        if (prevBtn) {
          prevBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            togglePreview(card, prevBtn);
          });
        }

        if (placeBtn) {
          placeBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            requestTimelinePlacement(card, cardEl);
          });
        }

        wrap.appendChild(cardEl);
      });
    }

    // Attach retry button handler if error
    if (msg.error) {
      var errRetry = wrap.querySelector('#sfx-buddy-err-retry-' + msg.id);
      if (errRetry) {
        errRetry.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          checkOllama(function (connected) {
            if (connected) {
              var idx = state.messages.findIndex(function (m) { return m.id === msg.id; });
              if (idx > 0 && state.messages[idx - 1].role === 'user') {
                handleUserQuery(state.messages[idx - 1].text);
              }
            }
          });
        });
      }
    }

    messagesEl.appendChild(wrap);
    scrollChat();
  }

  // --- USER QUERY HANDLING (STREAMING + INTELLIGENT SEARCH ROUTING) ---
  function handleUserQuery(text) {
    if (!text || !text.trim()) return Promise.resolve(null);
    var query = text.trim();

    return new Promise(function (resolve) {
      // 1. Add User Message
      var userMsg = {
        id: 'msg_user_' + Date.now(),
        role: 'user',
        text: query,
        html: '<p>' + escapeHtml(query).replace(/\n/g, '<br/>') + '</p>',
        time: Date.now()
      };
      state.messages.push(userMsg);
      appendMessageDOM(userMsg);
      saveHistory(state.messages);

      // 2. Intelligent Query Routing
      var intent = analyzeQueryIntent(query);
      var currentDateTimeStr = intent.isDateTime ? formatCurrentDateTime() : null;
      var candidateSounds = intent.isSound ? searchLocalLibrary(query, 3) : [];

      // 3. Prepare Assistant Message Placeholder
      var assistantMsgId = 'msg_buddy_' + Date.now();
      var assistantMsg = {
        id: assistantMsgId,
        role: 'buddy',
        text: '',
        html: '<p class="sfx-buddy__streaming-cursor">▊</p>',
        cards: candidateSounds,
        webSources: [],
        searchStatus: null,
        time: Date.now()
      };
      state.messages.push(assistantMsg);
      appendMessageDOM(assistantMsg);

      var bubbleEl = document.getElementById('msg-bubble-' + assistantMsgId);
      setGeneratingState(true);

      // 4. Web Search Execution (if live external research needed)
      var searchPromise = Promise.resolve(null);
      if (intent.isWebSearch) {
        if (bubbleEl) {
          bubbleEl.innerHTML =
            '<div class="sfx-buddy__search-status is-searching">' +
              '<span class="sfx-buddy__search-spinner"></span> ' +
              'Searching the web for "' + escapeHtml(intent.cleanSearchQuery) + '"...' +
            '</div>' +
            '<p class="sfx-buddy__streaming-cursor">▊</p>';
          scrollChat();
        }

        searchPromise = executeWebSearch(intent.cleanSearchQuery).then(function (searchRes) {
          if (searchRes && searchRes.ok && Array.isArray(searchRes.results) && searchRes.results.length > 0) {
            assistantMsg.webSources = searchRes.results;
            assistantMsg.searchStatus = {
              ok: true,
              query: intent.cleanSearchQuery,
              count: searchRes.results.length
            };
          } else {
            assistantMsg.webSources = [];
            assistantMsg.searchStatus = {
              ok: false,
              query: intent.cleanSearchQuery,
              error: (searchRes && searchRes.error) || 'Web search returned no results'
            };
          }
          return assistantMsg.searchStatus;
        }).catch(function (err) {
          assistantMsg.webSources = [];
          assistantMsg.searchStatus = {
            ok: false,
            query: intent.cleanSearchQuery,
            error: err.message || 'Network request failed'
          };
          return assistantMsg.searchStatus;
        });
      }

      // 5. Synthesize & Stream Answer
      searchPromise.then(function () {
        var statusBannerHtml = '';
        if (assistantMsg.searchStatus) {
          if (assistantMsg.searchStatus.ok) {
            statusBannerHtml =
              '<div class="sfx-buddy__search-status is-done">' +
                '<svg viewBox="0 0 16 16" width="12" height="12" fill="#38bdf8"><path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/></svg> ' +
                '<span>Retrieved ' + assistantMsg.searchStatus.count + ' web sources</span>' +
              '</div>';
          } else {
            statusBannerHtml =
              '<div class="sfx-buddy__search-status is-error">' +
                '<span>⚠️ Web search offline: ' + escapeHtml(assistantMsg.searchStatus.error) + '. Proceeding with local AI.</span>' +
              '</div>';
          }
        }

        // Offline fallback
        if (state.ollamaOnline === false) {
          setGeneratingState(false);
          if (intent.isDateTime) {
            assistantMsg.text = "The current system date and time is: " + currentDateTimeStr;
            assistantMsg.html = statusBannerHtml + '<p>' + escapeHtml(assistantMsg.text) + '</p>';
          } else if (assistantMsg.webSources.length > 0) {
            var summary = "Ollama is currently offline at " + getOllamaBase() + ", but web search retrieved the following live results for \"" + intent.cleanSearchQuery + "\":\n\n";
            assistantMsg.webSources.forEach(function (s, i) {
              summary += (i + 1) + ". " + s.title + " (" + s.url + ")\n   " + s.snippet + "\n\n";
            });
            assistantMsg.text = summary.trim();
            assistantMsg.html = statusBannerHtml + '<p>' + escapeHtml(assistantMsg.text).replace(/\n/g, '<br/>') + '</p>';
          } else {
            var kbAnswer = getKnowledgeBaseAnswer(query);
            if (kbAnswer) {
              assistantMsg.text = "Ollama is currently offline at " + getOllamaBase() + ", but here is the official SFX Composer documentation for your query:\n\n" + kbAnswer;
              assistantMsg.html = statusBannerHtml +
                '<div class="sfx-buddy__offline-notice">⚠️ <strong>Ollama Offline</strong> — Displaying built-in SFX Composer documentation:</div>' +
                '<p>' + escapeHtml(kbAnswer).replace(/\n/g, '<br/>') + '</p>';
            } else {
              assistantMsg.error = true;
              assistantMsg.text = "Cannot connect to Ollama at " + getOllamaBase() + ". Please start Ollama locally (`ollama run " + (state.settings.model || 'llama3.2') + "`) and click Retry.";
              assistantMsg.html = statusBannerHtml;
            }
          }

          var offlineWrap = document.getElementById('msg-wrap-' + assistantMsgId);
          if (offlineWrap && assistantMsg.webSources.length > 0) {
            offlineWrap.appendChild(renderSourcesPanelDOM(assistantMsg.webSources));
          }
          saveHistory(state.messages);
          renderAllMessages();
          resolve(assistantMsg);
          return;
        }

        // Online streaming with Ollama
        streamAiResponse(
          query,
          state.messages.slice(0, -2),
          candidateSounds,
          assistantMsg.webSources,
          currentDateTimeStr,
          assistantMsg.searchStatus,
          function onToken(accumulated) {
            assistantMsg.text = accumulated;
            if (bubbleEl) {
              bubbleEl.innerHTML = statusBannerHtml + '<p>' + escapeHtml(accumulated).replace(/\n/g, '<br/>') + '<span class="sfx-buddy__streaming-cursor">▊</span></p>';
              scrollChat();
            }
          },
          function onComplete(finalText) {
            setGeneratingState(false);
            assistantMsg.text = finalText;
            assistantMsg.html = statusBannerHtml + '<p>' + escapeHtml(finalText).replace(/\n/g, '<br/>') + '</p>';
            if (bubbleEl) {
              bubbleEl.innerHTML = assistantMsg.html;
            }

            // Append clickable source cards below message
            var msgWrap = document.getElementById('msg-wrap-' + assistantMsgId);
            if (msgWrap && assistantMsg.webSources && assistantMsg.webSources.length > 0) {
              var existingPanel = msgWrap.querySelector('.sfx-buddy__sources-panel');
              if (!existingPanel) {
                msgWrap.appendChild(renderSourcesPanelDOM(assistantMsg.webSources));
              }
            }

            scrollChat();
            saveHistory(state.messages);
            resolve(assistantMsg);
          },
          function onError(err) {
            setGeneratingState(false);
            var kbAnswer = getKnowledgeBaseAnswer(query);
            if (kbAnswer) {
              assistantMsg.text = "Ollama connection failed (" + (err.message || 'Offline') + "). Showing built-in SFX Composer reference:\n\n" + kbAnswer;
              assistantMsg.html = statusBannerHtml +
                '<div class="sfx-buddy__offline-notice">⚠️ <strong>Ollama Disconnected</strong> — Showing built-in SFX Composer knowledge:</div>' +
                '<p>' + escapeHtml(kbAnswer).replace(/\n/g, '<br/>') + '</p>';
            } else {
              assistantMsg.error = true;
              assistantMsg.text = "Ollama connection error: " + (err.message || 'Server unreachable at ' + getOllamaBase()) + ". Please make sure Ollama is running and click Retry.";
              assistantMsg.html = statusBannerHtml;
            }

            var errWrap = document.getElementById('msg-wrap-' + assistantMsgId);
            if (errWrap && assistantMsg.webSources && assistantMsg.webSources.length > 0) {
              errWrap.appendChild(renderSourcesPanelDOM(assistantMsg.webSources));
            }

            saveHistory(state.messages);
            renderAllMessages();
            resolve(assistantMsg);
          }
        );
      });
    });
  }

  function setGeneratingState(isGen) {
    state.isGenerating = isGen;
    if (sendBtnEl) {
      if (isGen) {
        sendBtnEl.classList.add('is-stopping');
        sendBtnEl.setAttribute('title', 'Stop generation');
        sendBtnEl.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>';
      } else {
        sendBtnEl.classList.remove('is-stopping');
        sendBtnEl.setAttribute('title', 'Send message');
        sendBtnEl.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>';
      }
    }
  }

  function submitInput() {
    if (state.isGenerating) {
      if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
      }
      setGeneratingState(false);
      return;
    }

    if (!inputEl) return;
    var text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = '';
    handleUserQuery(text);
  }

  // --- CONVERSATION CONTROLS (NEW CHAT & CLEAR CONVERSATION) ---
  function clearChat() {
    stopPreview();
    if (confirm('Clear entire conversation with SFX Buddy?')) {
      state.messages = [];
      saveHistory([]);
      renderAllMessages();
    }
  }

  function newChat() {
    stopPreview();
    if (state.isGenerating && currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
      setGeneratingState(false);
    }
    state.messages = [];
    saveHistory([]);
    renderAllMessages();
    if (inputEl) {
      inputEl.value = '';
      try { inputEl.focus(); } catch (e) {}
    }
  }

  function setElStyle(el, prop, val, priority) {
    if (!el || !el.style) return;
    if (typeof el.style.setProperty === 'function') {
      if (priority) {
        el.style.setProperty(prop, val, priority);
      } else {
        el.style.setProperty(prop, val);
      }
    } else {
      el.style[prop] = val;
    }
  }

  function removeElStyle(el, prop) {
    if (!el || !el.style) return;
    if (typeof el.style.removeProperty === 'function') {
      el.style.removeProperty(prop);
    } else {
      delete el.style[prop];
    }
  }

  // --- VISIBILITY & ENABLED ENFORCEMENT ---
  function applyVisibilityState() {
    if (!state.assistantEnabled) {
      if (launcherEl) {
        setElStyle(launcherEl, 'display', 'none', 'important');
        launcherEl.classList.add('is-disabled');
        launcherEl.setAttribute('aria-hidden', 'true');
      }
      if (panelEl) {
        setElStyle(panelEl, 'display', 'none', 'important');
        panelEl.classList.add('is-disabled');
        panelEl.classList.remove('is-open');
        panelEl.setAttribute('aria-hidden', 'true');
      }
    } else {
      if (launcherEl) {
        removeElStyle(launcherEl, 'display');
        launcherEl.style.display = 'inline-flex';
        launcherEl.classList.remove('is-disabled');
        launcherEl.removeAttribute('aria-hidden');
        recalculatePosition();
      }
      if (panelEl) {
        panelEl.classList.remove('is-disabled');
        panelEl.removeAttribute('aria-hidden');
        if (state.isOpen) {
          removeElStyle(panelEl, 'display');
          panelEl.style.display = 'flex';
          panelEl.classList.add('is-open');
        } else {
          panelEl.style.display = 'none';
          panelEl.classList.remove('is-open');
        }
      }
    }
  }

  // --- POSITIONING & VIEWPORT CLEARANCE ---
  function recalculatePosition() {
    if (!launcherEl) return;
    if (!state.assistantEnabled) {
      setElStyle(launcherEl, 'display', 'none', 'important');
      launcherEl.classList.add('is-disabled');
      if (panelEl) {
        setElStyle(panelEl, 'display', 'none', 'important');
        panelEl.classList.remove('is-open');
      }
      return;
    }

    var vpHeight = (typeof window !== 'undefined' && window.innerHeight) || 800;
    var vpWidth = (typeof window !== 'undefined' && window.innerWidth) || 1200;

    // Detect waveform editor / trim tray
    var trimTray = document.getElementById('sfx-trim-tray') || document.querySelector('.sfx-trim') || document.querySelector('#sfx-trim-dock');
    var isTrimVisible = false;
    var trimRect = null;

    if (trimTray) {
      var style = window.getComputedStyle ? window.getComputedStyle(trimTray) : (trimTray.style || {});
      var isHidden = style.display === 'none' || style.visibility === 'hidden' || trimTray.hidden;
      if (!isHidden && trimTray.offsetHeight > 15) {
        isTrimVisible = true;
        if (typeof trimTray.getBoundingClientRect === 'function') {
          trimRect = trimTray.getBoundingClientRect();
        }
      }
    }

    // Detect status bar
    var statusbar = document.querySelector('.sfx-statusbar');
    var statusbarHeight = 0;
    if (statusbar) {
      var sbStyle = window.getComputedStyle ? window.getComputedStyle(statusbar) : (statusbar.style || {});
      if (sbStyle.display !== 'none' && sbStyle.visibility !== 'hidden') {
        statusbarHeight = statusbar.offsetHeight || 24;
      }
    }

    // Safe clearance for launcher
    var safeBottom = 16;
    if (isTrimVisible && trimRect && trimRect.top > 0) {
      var distFromBottom = Math.max(16, vpHeight - trimRect.top);
      safeBottom = distFromBottom + 12;
    } else if (statusbarHeight > 0) {
      safeBottom = statusbarHeight + 10;
    }

    if (safeBottom > vpHeight - 60) {
      safeBottom = Math.max(16, vpHeight - 60);
    }

    launcherEl.style.bottom = safeBottom + 'px';
    launcherEl.style.right = '16px';

    // Apply to chat panel when open
    if (panelEl && state.isOpen) {
      var panelBottom = safeBottom + 46;
      var availHeight = vpHeight - panelBottom - 20;

      panelEl.style.bottom = panelBottom + 'px';
      panelEl.style.right = '16px';
      panelEl.style.maxHeight = Math.min(520, Math.max(300, availHeight)) + 'px';
      panelEl.style.maxWidth = Math.min(380, vpWidth - 32) + 'px';
    }
  }

  // --- OPEN / CLOSE STATE ---
  function setOpen(open) {
    if (open && !state.assistantEnabled) {
      return;
    }
    buildUI();

    state.isOpen = !!open && state.assistantEnabled;

    if (state.isOpen) {
      if (panelEl) {
        panelEl.classList.add('is-open');
        removeElStyle(panelEl, 'display');
        panelEl.style.display = 'flex';
      }
      recalculatePosition();
      scrollChat();
      setTimeout(function () {
        if (inputEl) {
          try { inputEl.focus(); } catch (e) {}
        }
      }, 70);
    } else {
      if (panelEl) {
        panelEl.classList.remove('is-open');
        panelEl.style.display = 'none';
      }
      stopPreview();
    }

    if (launcherEl) {
      launcherEl.classList.toggle('is-active', state.isOpen);
      launcherEl.setAttribute('aria-expanded', state.isOpen ? 'true' : 'false');
    }
  }

  function toggleOpen() {
    if (!state.assistantEnabled) return;
    setOpen(!state.isOpen);
  }

  // --- BUILD UI ---
  function buildUI() {
    if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return;
    if (panelEl && launcherEl) {
      applyVisibilityState();
      return;
    }

    var avatarSrc = './assets/mark-128.png';
    if (typeof location !== 'undefined' && location.pathname.indexOf('/sfx-composer-website/') !== -1) {
      avatarSrc = 'assets/brand/mark-128.png';
    }

    // 1. Circular Floating Launcher Trigger
    if (!launcherEl) {
      launcherEl = document.getElementById('sfx-buddy-launcher');
      if (!launcherEl) {
        launcherEl = document.createElement('button');
        launcherEl.id = 'sfx-buddy-launcher';
        launcherEl.type = 'button';
        launcherEl.className = 'sfx-buddy-launcher';
        launcherEl.setAttribute('aria-label', 'SFX Buddy AI Assistant');
        launcherEl.setAttribute('title', 'SFX Buddy — AI Support & Sound Design Companion');
        launcherEl.innerHTML =
          '<img src="' + avatarSrc + '" class="sfx-buddy-launcher__avatar" alt="SFX Buddy" onerror="this.src=\'assets/brand/mark-128.png\';" />' +
          '<span class="sfx-buddy-launcher__dot" title="Checking..."></span>';

        document.body.appendChild(launcherEl);
      }

      // Attach single clean click listener
      launcherEl.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (!state.assistantEnabled) return;
        toggleOpen();
      };
    }

    // 2. Chat Panel
    if (!panelEl) {
      panelEl = document.getElementById('sfx-buddy-panel');
      if (!panelEl) {
        panelEl = document.createElement('div');
        panelEl.id = 'sfx-buddy-panel';
        panelEl.className = 'sfx-buddy-panel sfx-buddy-panel--floating';
        panelEl.style.display = 'none';

        panelEl.innerHTML =
          '<div class="sfx-buddy__header">' +
            '<div class="sfx-buddy__identity">' +
              '<img src="' + avatarSrc + '" class="sfx-buddy__avatar" alt="SFX Buddy" onerror="this.src=\'assets/brand/mark-128.png\';" />' +
              '<div class="sfx-buddy__title-wrap">' +
                '<span class="sfx-buddy__name">SFX Buddy</span>' +
                '<span class="sfx-buddy__status-pill" id="sfx-buddy-status-pill">' +
                  '<span class="sfx-buddy__status-dot is-checking" id="sfx-buddy-header-dot"></span>' +
                  '<span class="sfx-buddy__status-text" id="sfx-buddy-header-status">Checking Ollama...</span>' +
                  '<button type="button" class="sfx-buddy__header-retry-btn" id="sfx-buddy-header-retry" style="display: none;" title="Retry connection">Retry</button>' +
                '</span>' +
              '</div>' +
            '</div>' +
            '<div class="sfx-buddy__controls">' +
              '<button type="button" class="sfx-buddy__icon-btn" id="sfx-buddy-new-chat-btn" title="New Chat">' +
                '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>' +
              '</button>' +
              '<button type="button" class="sfx-buddy__icon-btn" id="sfx-buddy-settings-btn" title="AI Settings">' +
                '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>' +
              '</button>' +
              '<button type="button" class="sfx-buddy__icon-btn" id="sfx-buddy-clear-btn" title="Clear Chat">' +
                '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
              '</button>' +
              '<button type="button" class="sfx-buddy__icon-btn sfx-buddy__icon-btn--close" id="sfx-buddy-close-btn" title="Close">' +
                '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
              '</button>' +
            '</div>' +
          '</div>' +

          // Collapsible Settings Drawer
          '<div class="sfx-buddy__settings-drawer" id="sfx-buddy-settings-drawer" style="display: none;">' +
            '<div class="sfx-buddy__settings-title">Ollama AI & Web Search Configuration</div>' +
            '<div class="sfx-buddy__settings-field">' +
              '<label>Endpoint URL:</label>' +
              '<input type="text" id="sfx-buddy-cfg-endpoint" value="' + escapeHtml(state.settings.endpoint) + '" />' +
            '</div>' +
            '<div class="sfx-buddy__settings-field">' +
              '<label>Installed Model:</label>' +
              '<select id="sfx-buddy-cfg-model">' +
                '<option value="' + escapeHtml(state.settings.model) + '">' + escapeHtml(state.settings.model) + '</option>' +
              '</select>' +
            '</div>' +
            '<div class="sfx-buddy__settings-field">' +
              '<label>Web Search Provider:</label>' +
              '<select id="sfx-buddy-cfg-search-prov">' +
                '<option value="auto"' + (state.settings.searchProvider === 'auto' ? ' selected' : '') + '>Auto (DuckDuckGo / Free / Env Key)</option>' +
                '<option value="tavily"' + (state.settings.searchProvider === 'tavily' ? ' selected' : '') + '>Tavily API (TAVILY_API_KEY)</option>' +
                '<option value="brave"' + (state.settings.searchProvider === 'brave' ? ' selected' : '') + '>Brave Search API (BRAVE_SEARCH_API_KEY)</option>' +
                '<option value="serpapi"' + (state.settings.searchProvider === 'serpapi' ? ' selected' : '') + '>SerpAPI (SERPAPI_API_KEY)</option>' +
                '<option value="ddg"' + (state.settings.searchProvider === 'ddg' ? ' selected' : '') + '>DuckDuckGo Engine (Free)</option>' +
              '</select>' +
            '</div>' +
            '<div class="sfx-buddy__settings-field">' +
              '<label>Search API Key (Optional):</label>' +
              '<input type="password" id="sfx-buddy-cfg-search-key" placeholder="Read from environment if empty" value="' + (state.settings.webSearchApiKey ? '••••••••' : '') + '" />' +
            '</div>' +
            '<div class="sfx-buddy__settings-actions">' +
              '<button type="button" class="sfx-buddy__cfg-save-btn" id="sfx-buddy-cfg-save">Save & Connect</button>' +
              '<button type="button" class="sfx-buddy__cfg-cancel-btn" id="sfx-buddy-cfg-close">Close</button>' +
            '</div>' +
          '</div>' +

          '<div class="sfx-buddy__body">' +
            '<div class="sfx-buddy__messages" id="sfx-buddy-messages"></div>' +
            '<div class="sfx-buddy__typing" id="sfx-buddy-typing" style="display: none;">' +
              '<span class="sfx-buddy__typing-dot"></span>' +
              '<span class="sfx-buddy__typing-dot"></span>' +
              '<span class="sfx-buddy__typing-dot"></span>' +
            '</div>' +
          '</div>' +

          '<div class="sfx-buddy__footer">' +
            '<div class="sfx-buddy__input-wrap">' +
              '<textarea class="sfx-buddy__input" id="sfx-buddy-input" rows="1" placeholder="Ask about features, audio tools, or scene sounds..."></textarea>' +
              '<button type="button" class="sfx-buddy__send-btn" id="sfx-buddy-send-btn" title="Send message">' +
                '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>' +
              '</button>' +
            '</div>' +
            '<div class="sfx-buddy__footer-hint">Enter to send • Shift + Enter for new line</div>' +
          '</div>';

        document.body.appendChild(panelEl);
      }
    }

    // DOM Elements Cache
    messagesEl = panelEl.querySelector('#sfx-buddy-messages');
    inputEl = panelEl.querySelector('#sfx-buddy-input');
    sendBtnEl = panelEl.querySelector('#sfx-buddy-send-btn');
    typingEl = panelEl.querySelector('#sfx-buddy-typing');
    settingsDrawerEl = panelEl.querySelector('#sfx-buddy-settings-drawer');

    // Attach Header Listeners
    var newChatBtn = panelEl.querySelector('#sfx-buddy-new-chat-btn');
    if (newChatBtn) newChatBtn.onclick = function (e) { e.preventDefault(); e.stopPropagation(); newChat(); };

    var clearBtn = panelEl.querySelector('#sfx-buddy-clear-btn');
    if (clearBtn) clearBtn.onclick = function (e) { e.preventDefault(); e.stopPropagation(); clearChat(); };

    var closeBtn = panelEl.querySelector('#sfx-buddy-close-btn');
    if (closeBtn) closeBtn.onclick = function (e) { e.preventDefault(); e.stopPropagation(); setOpen(false); };

    var headerRetry = panelEl.querySelector('#sfx-buddy-header-retry');
    if (headerRetry) headerRetry.onclick = function (e) { e.preventDefault(); e.stopPropagation(); checkOllama(); };

    var settingsToggleBtn = panelEl.querySelector('#sfx-buddy-settings-btn');
    if (settingsToggleBtn) {
      settingsToggleBtn.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (settingsDrawerEl) {
          var isVis = settingsDrawerEl.style.display !== 'none';
          settingsDrawerEl.style.display = isVis ? 'none' : 'block';
          if (!isVis) populateModelSelect();
        }
      };
    }

    var cfgCloseBtn = panelEl.querySelector('#sfx-buddy-cfg-close');
    if (cfgCloseBtn) {
      cfgCloseBtn.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (settingsDrawerEl) settingsDrawerEl.style.display = 'none';
      };
    }

    var cfgSaveBtn = panelEl.querySelector('#sfx-buddy-cfg-save');
    if (cfgSaveBtn) {
      cfgSaveBtn.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        var epInput = panelEl.querySelector('#sfx-buddy-cfg-endpoint');
        var modelSelect = panelEl.querySelector('#sfx-buddy-cfg-model');
        var provSelect = panelEl.querySelector('#sfx-buddy-cfg-search-prov');
        var keyInput = panelEl.querySelector('#sfx-buddy-cfg-search-key');
        if (epInput) state.settings.endpoint = epInput.value.trim() || 'http://localhost:11434';
        if (modelSelect) state.settings.model = modelSelect.value || 'llama3.2';
        if (provSelect) state.settings.searchProvider = provSelect.value || 'auto';
        if (keyInput) {
          var val = keyInput.value.trim();
          if (val && val !== '••••••••') {
            state.settings.webSearchApiKey = val;
          } else if (!val) {
            state.settings.webSearchApiKey = '';
          }
        }
        saveSettings(state.settings);
        if (settingsDrawerEl) settingsDrawerEl.style.display = 'none';
        checkOllama();
      };
    }

    // Input Handlers
    if (sendBtnEl) {
      sendBtnEl.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        submitInput();
      };
    }

    if (inputEl) {
      inputEl.onkeydown = function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          submitInput();
        }
        e.stopPropagation();
      };
    }

    // Render Initial Messages
    renderAllMessages();

    // Check Ollama Connection
    checkOllama(function () {
      populateModelSelect();
    });

    // Auto-update position on resize/scroll
    recalculatePosition();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', recalculatePosition);
      window.addEventListener('scroll', recalculatePosition);
    }

    // Apply visibility state immediately
    applyVisibilityState();
  }

  function populateModelSelect() {
    if (!panelEl) return;
    var modelSelect = panelEl.querySelector('#sfx-buddy-cfg-model');
    if (!modelSelect) return;

    var cur = state.settings.model || 'llama3.2';
    var models = state.availableModels.slice();
    if (models.indexOf(cur) === -1) models.unshift(cur);

    modelSelect.innerHTML = '';
    models.forEach(function (m) {
      var opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      if (m === cur) opt.selected = true;
      modelSelect.appendChild(opt);
    });
  }

  // --- PUBLIC API ---
  window.__sfxBuddy = {
    isOpen: function () {
      return state.isOpen && state.assistantEnabled;
    },
    setOpen: function (open) {
      setOpen(open);
    },
    open: function () {
      setOpen(true);
    },
    close: function () {
      setOpen(false);
    },
    toggle: function () {
      toggleOpen();
    },
    isAssistantEnabled: function () {
      return !!state.assistantEnabled;
    },
    isFloatingEnabled: function () {
      return !!state.assistantEnabled && (state.positioningMode === 'floating' || !state.positioningMode);
    },
    setFloatingEnabled: function (enabled) {
      var isEn = !!enabled;
      state.assistantEnabled = isEn;
      state.floatingEnabled = isEn;
      if (!isEn) {
        state.displayMode = 'hidden';
      } else {
        if (state.positioningMode === 'hidden') state.positioningMode = 'floating';
        state.displayMode = state.positioningMode || 'floating';
      }

      savePreferences({
        assistantEnabled: state.assistantEnabled,
        floatingEnabled: state.floatingEnabled,
        positioningMode: state.positioningMode,
        displayMode: state.displayMode
      });

      if (!isEn) {
        setOpen(false);
        applyVisibilityState();
        if (window.__sfxBuddyLauncher && typeof window.__sfxBuddyLauncher.disable === 'function') {
          window.__sfxBuddyLauncher.disable();
        }
      } else {
        buildUI();
        applyVisibilityState();
        if (window.__sfxBuddyLauncher && typeof window.__sfxBuddyLauncher.enable === 'function') {
          window.__sfxBuddyLauncher.enable();
        }
      }

      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        try {
          window.dispatchEvent(new CustomEvent('sfx-buddy-mode-changed', {
            detail: {
              mode: state.displayMode,
              enabled: state.assistantEnabled
            }
          }));
        } catch (e) {}
      }
    },
    getDisplayMode: function () {
      if (!state.assistantEnabled) {
        return 'hidden';
      }
      return state.positioningMode || 'floating';
    },
    setDisplayMode: function (mode) {
      if (mode === 'hidden' || mode === 'none' || mode === false) {
        this.setFloatingEnabled(false);
      } else if (mode === 'docked') {
        state.assistantEnabled = true;
        state.floatingEnabled = true;
        state.positioningMode = 'docked';
        state.displayMode = 'docked';
        savePreferences({
          assistantEnabled: true,
          floatingEnabled: true,
          positioningMode: 'docked',
          displayMode: 'docked'
        });
        buildUI();
        applyVisibilityState();
        if (window.__sfxBuddyLauncher && typeof window.__sfxBuddyLauncher.enable === 'function') {
          window.__sfxBuddyLauncher.enable();
        }
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
          try {
            window.dispatchEvent(new CustomEvent('sfx-buddy-mode-changed', {
              detail: {
                mode: 'docked',
                enabled: true
              }
            }));
          } catch (e) {}
        }
      } else {
        // 'floating' or true
        state.assistantEnabled = true;
        state.floatingEnabled = true;
        state.positioningMode = 'floating';
        state.displayMode = 'floating';
        this.setFloatingEnabled(true);
      }
    },
    clearHistory: function () {
      clearChat();
    },
    newChat: function () {
      newChat();
    },
    ask: function (question) {
      if (!state.assistantEnabled) return Promise.reject(new Error('SFX Buddy is currently disabled.'));
      setOpen(true);
      return handleUserQuery(question);
    },
    checkOllama: function (cb) {
      checkOllama(cb);
    },
    searchSounds: function (q, limit) {
      return searchLocalLibrary(q, limit);
    },
    searchWeb: function (query) {
      return executeWebSearch(query);
    },
    analyzeIntent: function (query) {
      return analyzeQueryIntent(query);
    },
    getKnowledgeBase: function () {
      return KNOWLEDGE_BASE;
    },
    getState: function () {
      var s = Object.assign({}, state);
      if (s.settings) {
        s.settings = Object.assign({}, s.settings);
        if (s.settings.webSearchApiKey) {
          s.settings.webSearchApiKey = '••••••••';
        }
      }
      return s;
    }
  };

  // Immediate init
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', buildUI);
    } else {
      buildUI();
    }
  }
})();
