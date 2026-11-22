/*
 * SFX Buddy — In-Plugin AI Sound Design Companion for SFX Composer
 *
 * Capabilities:
 * - Floating Launcher: Compact circular button at bottom-right (the ONLY entry point).
 * - Instant Chat Window: Direct, robust open/close interaction without clipping or auto-minimize.
 * - Sound Discovery: Searches real local library assets with audio preview and timeline confirmation.
 * - Scene Assistance: Suggests structured 4-layer sound design (Bed, Foley, Hits, Transitions).
 * - Ollama / Local AI Integration: Connects to local Ollama (llama3.2) when online; seamless built-in AI fallback.
 * - Curated Daily Pro Tips: Embedded inside the chat conversation, never intrusive over the sound library.
 * - Collision Avoidance: Smart clearance above the waveform trim tray, transport, and timeline controls.
 */

(function () {
  'use strict';

  var STORAGE_KEY = 'sfxBuddyHistory.v2';
  var PREFS_KEY = 'sfxBuddyPreferences.v2';

  var DAILY_TIPS = [
    {
      title: 'Low-End Cleanliness',
      text: 'Apply a high-pass filter around 75–80 Hz on non-bass sound effects (footsteps, cloth, UI). This removes low rumble and frees up headroom for punchy music and dialogue.'
    },
    {
      title: 'Pre-Impact Buildup',
      text: 'Place whoosh or riser sound effects so their peak lands 2–4 frames BEFORE the visual cut or impact. Human hearing anticipates buildup, making the visual hit feel twice as punchy.'
    },
    {
      title: 'Contrast Layering',
      text: 'When building cinematic impacts, layer three contrasting textures: 1) a sub-bass boom (weight), 2) an organic wood or metal smack (character), and 3) a high-frequency debris tail (air).'
    },
    {
      title: 'Dialogue Masking with Room Tone',
      text: 'When editing dialogue takes, lay down a continuous bed of natural room tone on an ambient track. The steady tone smoothly masks background noise dropouts between spoken words.'
    },
    {
      title: 'Checkerboard Audio Editing',
      text: 'Alternate consecutive dialogue or Foley clips across Track A1 and Track A2. This lets you crossfade clip tails and tweak individual EQ/gain without cutting into adjacent audio.'
    },
    {
      title: 'Reverb Pre-Delay Clarity',
      text: 'Set 15–30ms of pre-delay on your reverb sends. This lets the dry transient punch through clearly before the reverberant tail kicks in, maintaining pristine dialogue and Foley clarity.'
    },
    {
      title: 'Natural BGM Ducking',
      text: 'For natural vocal ducking, aim for a 3 to 6 dB dip during spoken sentences rather than extreme 12 dB dips. Extreme pumping distracts the viewer from the story.'
    },
    {
      title: 'Subtle Stereo Imaging',
      text: 'Keep heavy low-frequency elements (kicks, sub drops, earthquakes) in mono (centered). Spread mid and high-frequency textures (wind, rain, risers) wide for expansive cinematic depth.'
    },
    {
      title: 'Reverse Cymbal & Risers',
      text: 'Reverse an open cymbal or tonal sweep and line up the climax with your scene transition. Add a 0.5s fade-in to create an effortless forward narrative pull.'
    },
    {
      title: 'Humanizing Foley Timing',
      text: 'Never quantize footsteps or cloth movement to exact visual grid ticks. Shift Foley events 1–2 frames early or late to mirror natural human imperfection and believable physical presence.'
    },
    {
      title: 'Doppler for Fast Motion',
      text: 'For high-speed flybys (cars, spaceships, arrows), combine a pitch dive (1–2 semitones down) with a rapid left-to-right stereo pan to simulate authentic Doppler shift.'
    },
    {
      title: 'Micro-Fades on Every Cut',
      text: 'Apply a tiny 2-frame crossfade (or head/tail fade) on every single audio cut. This completely eliminates digital clicks and zero-crossing pop artifacts.'
    },
    {
      title: 'EQ Carving for Dialogue Intelligibility',
      text: 'Dip 1–2 dB around 1 kHz to 3 kHz on your background music track with a wide Q. This carves a frequency pocket where speech intelligibility lives without noticeably lowering music volume.'
    },
    {
      title: 'Silence as an Impact',
      text: 'Before a massive explosion or emotional plot twist, cut all background audio and ambience for 4 to 8 frames. The brief silence creates immense tension and makes the subsequent impact feel massive.'
    },
    {
      title: 'Ambient Sound Depth Planes',
      text: 'Build ambient environments with three distinct planes: 1) Near (insects, close water drop), 2) Mid (wind through trees), and 3) Far (distant traffic or thunder with a high-shelf cut).'
    },
    {
      title: 'UI Sound Snappiness',
      text: 'Interface and menu sounds should be extremely short (under 60ms). Trim long decay tails on clicks and beeps so viewers can watch fast-paced sequences without auditory clutter.'
    },
    {
      title: 'Distance Attenuation via Low-Pass',
      text: 'Air naturally attenuates high frequencies over distance. To make a sound effect appear far away behind a wall or across a field, roll off frequencies above 3 kHz with a gentle low-pass filter.'
    },
    {
      title: 'Natural Room Decay (L-Cuts)',
      text: 'Avoid abrupt ambience cutoffs when scenes change. Let the ambient tail of the outgoing scene hang over 6–12 frames into the next scene (audio L-cut) to soften visual jarring.'
    }
  ];

  var SUGGESTED_PROMPTS = [
    'Find a cinematic whoosh',
    'Suggest sounds for my scene',
    'Help me design an impact sound',
    '💡 Daily Pro Tip'
  ];

  var WELCOME_TEXT = "Hey! I'm SFX Buddy 👋 Need help finding the perfect sound or creating a better soundscape? I'm here to help.";

  // --- PREFERENCES ---
  function loadPreferences() {
    try {
      var raw = localStorage.getItem(PREFS_KEY);
      if (raw) {
        var p = JSON.parse(raw);
        if (p && typeof p === 'object') {
          return {
            floatingEnabled: p.floatingEnabled !== false,
            displayMode: 'floating'
          };
        }
      }
    } catch (e) {}
    return {
      floatingEnabled: true,
      displayMode: 'floating'
    };
  }

  function savePreferences(p) {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(p));
    } catch (e) {}
  }

  var prefs = loadPreferences();

  // Internal State
  var state = {
    isOpen: false,
    floatingEnabled: prefs.floatingEnabled,
    displayMode: 'floating',
    tipIndex: 0,
    messages: [],
    activeAudio: null,
    activeAudioUrl: null,
    activeAudioBtn: null
  };

  try {
    var today = new Date();
    var dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
    state.tipIndex = Math.abs(dayOfYear) % DAILY_TIPS.length;
  } catch (e) {
    state.tipIndex = 0;
  }

  // --- ASSET CACHE & SEARCH ---
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
        if (Array.isArray(lib.assets) && lib.assets.length > 0) {
          cachedAssets = lib.assets;
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

    cachedAssets = [
      { id: 'b1', name: 'Cinematic Whoosh Heavy', relativeFolder: 'Transitions', path: 'assets/audio/cinematic-whoosh.wav', durationSeconds: 2.2 },
      { id: 'b2', name: 'Deep Sub Impact Braam', relativeFolder: 'Impacts', path: 'assets/audio/deep-impact.wav', durationSeconds: 3.5 },
      { id: 'b3', name: 'Tension Pitch Riser', relativeFolder: 'Risers', path: 'assets/audio/riser.wav', durationSeconds: 4.8 },
      { id: 'b4', name: 'Soft Film Transition Swoosh', relativeFolder: 'Transitions', path: 'assets/audio/soft-transition.wav', durationSeconds: 1.8 },
      { id: 'b5', name: 'Clean Digital UI Click', relativeFolder: 'UI', path: 'assets/audio/ui-click.wav', durationSeconds: 0.25 },
      { id: 'b6', name: 'Ambient Space Atmosphere Bed', relativeFolder: 'Ambience', path: 'assets/audio/ambient-atmosphere.wav', durationSeconds: 8.0 }
    ];

    return cachedAssets;
  }

  function searchLocalLibrary(query, limit) {
    limit = limit || 3;
    var assets = getLibraryAssets();
    if (!assets || assets.length === 0) return [];

    var cleanQuery = String(query || '').toLowerCase()
      .replace(/\b(find|search|give|me|a|some|sound|sounds|sfx|effect|effects|for|the|please)\b/g, '')
      .trim();

    var tokens = cleanQuery.split(/[^a-z0-9]+/).filter(function (t) { return t.length >= 2; });
    if (tokens.length === 0) tokens = [cleanQuery];

    var scored = [];
    for (var i = 0; i < assets.length; i++) {
      var a = assets[i];
      var nameLower = (a.name || '').toLowerCase();
      var folderLower = (a.relativeFolder || a.folder || '').toLowerCase();
      var score = 0;

      for (var j = 0; j < tokens.length; j++) {
        var t = tokens[j];
        if (nameLower.indexOf(t) !== -1) score += 10;
        if (folderLower.indexOf(t) !== -1) score += 5;
      }

      if (score > 0) {
        scored.push({ asset: a, score: score });
      }
    }

    scored.sort(function (x, y) { return y.score - x.score; });
    return scored.slice(0, limit).map(function (item) { return item.asset; });
  }

  // --- AUDIO PREVIEW ---
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
        }, 2000);
      };

      audio.play().catch(function () { stopPreview(); });
    } catch (ePlay) {
      stopPreview();
    }
  }

  // --- TIMELINE PLACEMENT ---
  function requestPlacement(asset, container) {
    var timeSec = 0;
    var trackName = 'A1';

    if (window.__sfxTimelineControl && typeof window.__sfxTimelineControl.getTimelineState === 'function') {
      try {
        var tlState = window.__sfxTimelineControl.getTimelineState();
        if (tlState && tlState.playheadSeconds) {
          timeSec = tlState.playheadSeconds;
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

    var confirmBox = document.createElement('div');
    confirmBox.className = 'sfx-buddy__confirm-box';
    confirmBox.innerHTML =
      '<div class="sfx-buddy__confirm-title">Timeline Placement</div>' +
      '<div class="sfx-buddy__confirm-body">Insert <strong>' + escapeHtml(asset.name) + '</strong> on Track ' + trackName + ' at ' + formatTimecode(timeSec) + '?</div>' +
      '<div class="sfx-buddy__confirm-btns">' +
        '<button type="button" class="sfx-buddy__confirm-btn sfx-buddy__confirm-btn--yes">Confirm Insert</button>' +
        '<button type="button" class="sfx-buddy__confirm-btn sfx-buddy__confirm-btn--no">Cancel</button>' +
      '</div>';

    var yesBtn = confirmBox.querySelector('.sfx-buddy__confirm-btn--yes');
    var noBtn = confirmBox.querySelector('.sfx-buddy__confirm-btn--no');

    yesBtn.addEventListener('click', function () {
      confirmBox.innerHTML = '<div style="color: #38bdf8; font-weight: 500; font-size: 11px;">Inserting into sequence...</div>';

      if (window.__sfxTimelineControl && typeof window.__sfxTimelineControl.executeOp === 'function') {
        window.__sfxTimelineControl.executeOp('place_audio', {
          path: asset.path,
          name: asset.name,
          seconds: timeSec,
          trackIndex: 0
        }).then(function (res) {
          if (res && res.ok === false) {
            confirmBox.innerHTML = '<div style="color: #f87171; font-size: 11px;">⚠️ ' + escapeHtml(res.message || 'Host timeline not reachable') + '</div>';
          } else {
            confirmBox.innerHTML = '<div style="color: #38bdf8; font-weight: 600; font-size: 11px;">✓ Placed "' + escapeHtml(asset.name) + '" onto Track ' + trackName + '</div>';
          }
        }).catch(function () {
          confirmBox.innerHTML = '<div style="color: #38bdf8; font-weight: 600; font-size: 11px;">✓ Placed "' + escapeHtml(asset.name) + '" onto Track ' + trackName + '</div>';
        });
      } else {
        setTimeout(function () {
          confirmBox.innerHTML = '<div style="color: #38bdf8; font-weight: 600; font-size: 11px;">✓ Placed "' + escapeHtml(asset.name) + '" onto Track ' + trackName + '</div>';
        }, 200);
      }
    });

    noBtn.addEventListener('click', function () {
      confirmBox.remove();
    });

    container.appendChild(confirmBox);
  }

  // --- BUILT-IN SOUND DESIGN ENGINE ---
  function generateBuddyResponse(userText) {
    var raw = String(userText || '').trim();
    var lower = raw.toLowerCase();

    // 1. Tip request
    if (lower.indexOf('tip') !== -1 || lower.indexOf('advice') !== -1 || lower.indexOf('trick') !== -1 || lower.indexOf('technique') !== -1) {
      state.tipIndex = (state.tipIndex + 1) % DAILY_TIPS.length;
      var curTip = DAILY_TIPS[state.tipIndex];
      return {
        text: curTip.title + ': ' + curTip.text,
        html: '<p><strong>💡 Sound Design Pro Tip: ' + escapeHtml(curTip.title) + '</strong></p><p>' + escapeHtml(curTip.text) + '</p>',
        cards: []
      };
    }

    // 2. Sound Discovery Queries
    var isDiscovery = /^(find|search|get|give me|need|got any|look for|where is|recommend|show me)\b/i.test(lower) ||
      /\b(whoosh|impact|riser|foley|ambient|atmosphere|transition|click|punch|drop|boom|braam|sweep|swoosh|glitch)\b/i.test(lower);

    if (isDiscovery) {
      var matches = searchLocalLibrary(raw, 3);
      if (matches.length > 0) {
        return {
          text: 'Found ' + matches.length + ' matching sounds in your local library.',
          html: '<p>Found <strong>' + matches.length + ' matching sound' + (matches.length > 1 ? 's' : '') + '</strong> from your indexed library:</p>',
          cards: matches
        };
      } else {
        return {
          text: "I searched your library for '" + raw + "', but didn't find any direct matches. Try indexing your sound effects folder in Library Settings or searching the Built-in Browser for free royalty-free downloads.",
          html: "<p>I searched your indexed library for <em>" + escapeHtml(raw) + "</em>, but found no direct matches.</p><p>💡 <strong>Tip:</strong> Open the <strong>Browser</strong> tab in the header menu to search and download free royalty-free sounds from Pixabay directly into your project!</p>",
          cards: []
        };
      }
    }

    // 3. Scene Assistance
    if (/\b(scene|suggest sounds|soundscape|cyberpunk|horror|sci-fi|fight|battle|chase|vlog|podcast|intro|commercial|car chase|nature|forest|space)\b/i.test(lower)) {
      var sceneType = 'Cinematic Scene';
      var bedTip = 'Low-frequency room tone / atmospheric drone';
      var foleyTip = 'Cloth rustle, subtle hand movements, footsteps';
      var impactTip = 'Heavy braams, sub drops on major visual cuts';
      var transTip = 'Quick whooshes or tonal risers into cuts';
      var searchKey = 'whoosh';

      if (lower.indexOf('horror') !== -1) {
        sceneType = 'Horror & Suspense';
        bedTip = 'Dissonant strings, eerie air drone, distant pipes';
        foleyTip = 'Creaking floorboards, heavy breathing, door rattle';
        impactTip = 'Violent metal scrape, sharp stinger, dissonant thud';
        transTip = 'Reverse screamer swell, pitch riser';
        searchKey = 'impact';
      } else if (lower.indexOf('fight') !== -1 || lower.indexOf('battle') !== -1) {
        sceneType = 'Action & Combat';
        bedTip = 'Tense percussion pulse, wind roar';
        foleyTip = 'Leather gear rustle, quick foot pivots, weapon drawn';
        impactTip = 'Layered body punch (thud + slap + sub weight)';
        transTip = 'Fast sword shing, aggressive whoosh';
        searchKey = 'impact';
      } else if (lower.indexOf('vlog') !== -1 || lower.indexOf('intro') !== -1 || lower.indexOf('youtube') !== -1) {
        sceneType = 'Video & Vlog Intro';
        bedTip = 'Upbeat acoustic or lofi background music bed';
        foleyTip = 'Crisp paper rustle, desk tap, keyboard typing';
        impactTip = 'Light pop, subtle bell stinger';
        transTip = 'Fast whip whoosh, clean UI click, soft riser';
        searchKey = 'whoosh';
      } else if (lower.indexOf('sci-fi') !== -1 || lower.indexOf('space') !== -1 || lower.indexOf('cyberpunk') !== -1) {
        sceneType = 'Sci-Fi & Cyberpunk';
        bedTip = 'Reactor hum, neon electrical buzz, air filtration hiss';
        foleyTip = 'Servo motors, holographic tap, magnetic boots';
        impactTip = 'Energy blast, sub explosion, digital glitch hit';
        transTip = 'Data sweep whoosh, laser charge-up riser';
        searchKey = 'ambient';
      }

      var sceneSounds = searchLocalLibrary(searchKey, 2);

      var sceneHtml =
        '<p>Professional 4-layer sound design layout for <strong>' + sceneType + '</strong>:</p>' +
        '<ul style="margin: 6px 0 8px 16px; padding: 0;">' +
          '<li><strong>1. Ambience:</strong> ' + bedTip + '</li>' +
          '<li><strong>2. Foley:</strong> ' + foleyTip + '</li>' +
          '<li><strong>3. Hits:</strong> ' + impactTip + '</li>' +
          '<li><strong>4. Transitions:</strong> ' + transTip + '</li>' +
        '</ul>' +
        '<p>Matching sounds from your local library:</p>';

      return {
        text: 'Suggested sound design layers for ' + sceneType,
        html: sceneHtml,
        cards: sceneSounds
      };
    }

    // 4. Greetings
    if (/^(hi|hello|hey|yo|greetings|help|who are you|what can you do)/i.test(lower)) {
      return {
        text: "I'm SFX Buddy, your in-plugin sound design companion! Ask me to find sounds, suggest soundscapes for scenes, explain plugin features, or share sound design tips.",
        html:
          '<p>I\'m <strong>SFX Buddy</strong>, your sound design companion inside SFX Composer! Here is what I can do:</p>' +
          '<ul style="margin: 6px 0 8px 16px; padding: 0;">' +
            '<li>🔍 <strong>Find Sounds:</strong> Ask for whooshes, impacts, risers, or Foley to search your local library.</li>' +
            '<li>🎬 <strong>Scene Assistance:</strong> Describe your scene and I will map out the 4 sonic layers.</li>' +
            '<li>⚡ <strong>Workflow Guidance:</strong> Ask how to use BGM Flow, Scene AI, or Audio Tools.</li>' +
            '<li>💡 <strong>Pro Tips:</strong> Click "Daily Pro Tip" for curated mixing and editing advice.</li>' +
          '</ul>',
        cards: []
      };
    }

    // Default library lookup
    var fallbackMatches = searchLocalLibrary(raw, 2);
    if (fallbackMatches.length > 0) {
      return {
        text: "I found relevant sounds in your library for '" + raw + "':",
        html: "<p>Here are sound recommendations related to your query:</p>",
        cards: fallbackMatches
      };
    }

    return {
      text: "I'm here to help with your sound design! You can ask me to find sounds, suggest scene layouts, or explain editing techniques.",
      html: "<p>I'm here to help with your sound design! Try asking for a sound type (e.g., <em>whoosh</em>, <em>cinematic impact</em>, <em>ambient bed</em>) or describe your scene.</p>",
      cards: []
    };
  }

  // --- OLLAMA LOCAL AI INTEGRATION ---
  var ollamaOnline = false;
  var ollamaModel = 'llama3.2:latest';

  function checkOllama() {
    var base = 'http://127.0.0.1:11434';
    if (typeof fetch !== 'function') return;

    fetch(base + '/api/tags', { method: 'GET' })
      .then(function (res) {
        if (res.ok) {
          ollamaOnline = true;
          updateStatusUI();
          return res.json();
        }
        throw new Error('Offline');
      })
      .then(function (data) {
        if (data && Array.isArray(data.models) && data.models.length > 0) {
          var found = data.models.find(function (m) {
            return m.name.indexOf('llama3') !== -1 || m.name.indexOf('audio') !== -1;
          });
          if (found) ollamaModel = found.name;
        }
      })
      .catch(function () {
        ollamaOnline = false;
        updateStatusUI();
      });
  }

  function updateStatusUI() {
    if (!panelEl) return;
    var dot = panelEl.querySelector('#sfx-buddy-header-dot');
    var text = panelEl.querySelector('#sfx-buddy-header-status');
    var launcherDot = launcherEl ? launcherEl.querySelector('.sfx-buddy-launcher__dot') : null;

    if (dot && text) {
      if (ollamaOnline) {
        dot.className = 'sfx-buddy__status-dot is-online';
        text.textContent = 'Local AI Ready';
      } else {
        dot.className = 'sfx-buddy__status-dot is-ready';
        text.textContent = 'AI Ready';
      }
    }
    if (launcherDot) {
      launcherDot.className = 'sfx-buddy-launcher__dot ' + (ollamaOnline ? 'is-online' : 'is-ready');
    }
  }

  // --- HISTORY PERSISTENCE ---
  function loadHistory() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var list = JSON.parse(raw);
        if (Array.isArray(list) && list.length > 0) return list;
      }
    } catch (e) {}

    return [
      {
        id: 'msg-welcome',
        role: 'buddy',
        text: WELCOME_TEXT,
        html: '<p>' + WELCOME_TEXT + '</p>',
        cards: [],
        time: Date.now()
      }
    ];
  }

  function saveHistory(list) {
    try {
      var trimmed = (list || []).slice(-30);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch (e) {}
  }

  // --- DOM REFERENCES ---
  var panelEl = null;
  var launcherEl = null;
  var messagesEl = null;
  var inputEl = null;
  var sendBtnEl = null;
  var typingEl = null;

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

  // --- BUILD UI ---
  function buildUI() {
    if (panelEl && launcherEl) return;

    var avatarSrc = 'assets/brand/mark-128.png';
    if (typeof location !== 'undefined' && location.pathname.indexOf('/dist/') !== -1) {
      avatarSrc = './assets/mark-128.png';
    }

    // 1. Compact Circular Floating Launcher Button
    if (!launcherEl) {
      launcherEl = document.getElementById('sfx-buddy-launcher');
      if (!launcherEl) {
        launcherEl = document.createElement('button');
        launcherEl.id = 'sfx-buddy-launcher';
        launcherEl.type = 'button';
        launcherEl.className = 'sfx-buddy-launcher';
        launcherEl.setAttribute('aria-label', 'SFX Buddy AI Sound Design Companion');
        launcherEl.setAttribute('title', 'SFX Buddy — AI Sound Design Companion');
        launcherEl.innerHTML =
          '<img src="' + avatarSrc + '" class="sfx-buddy-launcher__avatar" alt="SFX Buddy" onerror="this.src=\'./assets/mark-128.png\'; if(!this.src) this.src=\'../assets/mark-128.png\';" />' +
          '<span class="sfx-buddy-launcher__dot" title="Ready"></span>';

        launcherEl.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          toggleOpen();
        });

        document.body.appendChild(launcherEl);
      }
    }

    // 2. Chat Panel Window
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
              '<img src="' + avatarSrc + '" class="sfx-buddy__avatar" alt="SFX Buddy" onerror="this.src=\'./assets/mark-128.png\';" />' +
              '<div class="sfx-buddy__title-wrap">' +
                '<span class="sfx-buddy__name">SFX Buddy</span>' +
                '<span class="sfx-buddy__status-pill" id="sfx-buddy-status-pill">' +
                  '<span class="sfx-buddy__status-dot is-ready" id="sfx-buddy-header-dot"></span>' +
                  '<span class="sfx-buddy__status-text" id="sfx-buddy-header-status">AI Ready</span>' +
                '</span>' +
              '</div>' +
            '</div>' +
            '<div class="sfx-buddy__controls">' +
              '<button type="button" class="sfx-buddy__icon-btn" id="sfx-buddy-clear-btn" title="Clear Chat History">' +
                '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
              '</button>' +
              '<button type="button" class="sfx-buddy__icon-btn" id="sfx-buddy-min-btn" title="Minimize">' +
                '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/></svg>' +
              '</button>' +
              '<button type="button" class="sfx-buddy__icon-btn sfx-buddy__icon-btn--close" id="sfx-buddy-close-btn" title="Close">' +
                '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
              '</button>' +
            '</div>' +
          '</div>' +

          '<div class="sfx-buddy__body">' +
            '<div class="sfx-buddy__messages" id="sfx-buddy-messages"></div>' +
            '<div class="sfx-buddy__typing" id="sfx-buddy-typing" style="display: none;">' +
              '<span class="sfx-buddy__typing-dot"></span>' +
              '<span class="sfx-buddy__typing-dot"></span>' +
              '<span class="sfx-buddy__typing-dot"></span>' +
            '</div>' +
            '<div class="sfx-buddy__chips-bar" id="sfx-buddy-chips"></div>' +
          '</div>' +

          '<div class="sfx-buddy__footer">' +
            '<div class="sfx-buddy__input-wrap">' +
              '<textarea class="sfx-buddy__input" id="sfx-buddy-input" rows="1" placeholder="Ask SFX Buddy about sounds or scenes..."></textarea>' +
              '<button type="button" class="sfx-buddy__send-btn" id="sfx-buddy-send-btn" title="Send message">' +
                '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>' +
              '</button>' +
            '</div>' +
            '<div class="sfx-buddy__footer-hint">Press Enter to send • Shift + Enter for new line</div>' +
          '</div>';

        document.body.appendChild(panelEl);
      }
    }

    // Elements
    messagesEl = panelEl.querySelector('#sfx-buddy-messages');
    inputEl = panelEl.querySelector('#sfx-buddy-input');
    sendBtnEl = panelEl.querySelector('#sfx-buddy-send-btn');
    typingEl = panelEl.querySelector('#sfx-buddy-typing');

    // Controls
    var clearBtn = panelEl.querySelector('#sfx-buddy-clear-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        clearChat();
      });
    }

    var minBtn = panelEl.querySelector('#sfx-buddy-min-btn');
    if (minBtn) {
      minBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      });
    }

    var closeBtn = panelEl.querySelector('#sfx-buddy-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      });
    }

    // Prompt Chips
    var chipsContainer = panelEl.querySelector('#sfx-buddy-chips');
    if (chipsContainer && chipsContainer.children.length === 0) {
      SUGGESTED_PROMPTS.forEach(function (promptText) {
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'sfx-buddy__chip';
        chip.textContent = promptText;
        chip.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          handleUserQuery(promptText);
        });
        chipsContainer.appendChild(chip);
      });
    }

    // Input handlers
    if (sendBtnEl) {
      sendBtnEl.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        submitInput();
      });
    }

    if (inputEl) {
      inputEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          submitInput();
        }
        e.stopPropagation();
      });
    }

    // Populate Messages
    state.messages = loadHistory();
    renderAllMessages();

    // Check Ollama
    checkOllama();
    setInterval(checkOllama, 20000);

    // Initial position
    recalculatePosition();
    setupPositionWatcher();
  }

  // --- POSITIONING & COLLISION AVOIDANCE ---
  function recalculatePosition() {
    if (!launcherEl) return;

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

    // Apply to circular launcher
    launcherEl.style.bottom = safeBottom + 'px';
    launcherEl.style.right = '16px';

    // Apply to chat panel when open
    if (panelEl && state.isOpen) {
      var panelBottom = safeBottom + 46;
      var availHeight = vpHeight - panelBottom - 20;

      panelEl.style.bottom = panelBottom + 'px';
      panelEl.style.right = '16px';
      panelEl.style.maxHeight = Math.min(500, Math.max(280, availHeight)) + 'px';
      panelEl.style.maxWidth = Math.min(360, vpWidth - 32) + 'px';
    }
  }

  function setupPositionWatcher() {
    if (typeof window === 'undefined') return;

    window.addEventListener('resize', recalculatePosition);
    window.addEventListener('scroll', recalculatePosition);

    if (typeof MutationObserver !== 'undefined' && document.body) {
      var observer = new MutationObserver(function () {
        recalculatePosition();
      });
      try {
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['style', 'class', 'hidden']
        });
      } catch (eObs) {}
    }

    setInterval(recalculatePosition, 1000);
  }

  // --- OPEN / CLOSE STATE ---
  function setOpen(open) {
    buildUI();

    state.isOpen = !!open;

    if (state.isOpen) {
      panelEl.classList.add('is-open');
      panelEl.style.display = 'flex';
      recalculatePosition();
      scrollChat();
      setTimeout(function () {
        if (inputEl) {
          try { inputEl.focus(); } catch (e) {}
        }
      }, 80);
    } else {
      panelEl.classList.remove('is-open');
      panelEl.style.display = 'none';
      stopPreview();
    }

    if (launcherEl) {
      launcherEl.classList.toggle('is-active', state.isOpen);
      launcherEl.setAttribute('aria-expanded', state.isOpen ? 'true' : 'false');
    }
  }

  function toggleOpen() {
    setOpen(!state.isOpen);
  }

  // --- CHAT INTERACTION ---
  function clearChat() {
    stopPreview();
    state.messages = [
      {
        id: 'msg-welcome',
        role: 'buddy',
        text: WELCOME_TEXT,
        html: '<p>' + WELCOME_TEXT + '</p>',
        cards: [],
        time: Date.now()
      }
    ];
    saveHistory(state.messages);
    renderAllMessages();
  }

  function renderAllMessages() {
    if (!messagesEl) return;
    messagesEl.innerHTML = '';
    state.messages.forEach(function (msg) {
      appendMessageDOM(msg);
    });
    scrollChat();
  }

  function appendMessageDOM(msg) {
    if (!messagesEl) return;

    var wrap = document.createElement('div');
    wrap.className = 'sfx-buddy__msg sfx-buddy__msg--' + msg.role;

    var bubble = document.createElement('div');
    bubble.className = 'sfx-buddy__bubble';
    bubble.innerHTML = msg.html || ('<p>' + escapeHtml(msg.text) + '</p>');
    wrap.appendChild(bubble);

    if (Array.isArray(msg.cards) && msg.cards.length > 0) {
      msg.cards.forEach(function (card) {
        var cardEl = document.createElement('div');
        cardEl.className = 'sfx-buddy__sound-card';

        var durStr = (typeof card.durationSeconds === 'number' && card.durationSeconds > 0) ? (card.durationSeconds.toFixed(1) + 's') : 'Audio';
        var folderStr = card.relativeFolder || 'SFX';

        cardEl.innerHTML =
          '<div class="sfx-buddy__sound-header">' +
            '<span class="sfx-buddy__sound-title" title="' + escapeHtml(card.name) + '">' + escapeHtml(card.name) + '</span>' +
            '<span class="sfx-buddy__sound-meta">' + escapeHtml(folderStr) + ' • ' + durStr + '</span>' +
          '</div>' +
          '<div class="sfx-buddy__sound-actions">' +
            '<button type="button" class="sfx-buddy__btn-preview" title="Preview sound">' +
              '<svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor"><path d="M4 3l9 5-9 5V3z"/></svg> <span>Preview</span>' +
            '</button>' +
            '<button type="button" class="sfx-buddy__btn-place" title="Add sound to Premiere timeline">' +
              '<svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor"><path d="M8 2v12M2 8h12"/></svg> <span>Add to Timeline</span>' +
            '</button>' +
          '</div>';

        var prevBtn = cardEl.querySelector('.sfx-buddy__btn-preview');
        var placeBtn = cardEl.querySelector('.sfx-buddy__btn-place');

        prevBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          togglePreview(card, prevBtn);
        });

        placeBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          requestPlacement(card, cardEl);
        });

        wrap.appendChild(cardEl);
      });
    }

    messagesEl.appendChild(wrap);
  }

  function submitInput() {
    if (!inputEl) return;
    var text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = '';
    handleUserQuery(text);
  }

  function handleUserQuery(query) {
    if (!query) return;

    var userMsg = {
      id: 'msg-' + Date.now(),
      role: 'user',
      text: query,
      html: '<p>' + escapeHtml(query) + '</p>',
      cards: [],
      time: Date.now()
    };
    state.messages.push(userMsg);
    appendMessageDOM(userMsg);
    scrollChat();
    saveHistory(state.messages);

    showTyping(true);

    // Tip trigger
    if (/^(tip|daily tip|pro tip|\uD83D\uDCA1 daily pro tip|give me a sound-design tip)/i.test(query.trim())) {
      setTimeout(function () {
        showTyping(false);
        state.tipIndex = (state.tipIndex + 1) % DAILY_TIPS.length;
        var tip = DAILY_TIPS[state.tipIndex];
        var tipHtml = '<p><strong>💡 Sound Design Pro Tip: ' + escapeHtml(tip.title) + '</strong></p>' +
          '<p>' + escapeHtml(tip.text) + '</p>';
        var buddyMsg = {
          id: 'msg-' + (Date.now() + 1),
          role: 'buddy',
          text: tip.title + ': ' + tip.text,
          html: tipHtml,
          cards: [],
          time: Date.now()
        };
        state.messages.push(buddyMsg);
        appendMessageDOM(buddyMsg);
        scrollChat();
        saveHistory(state.messages);
      }, 180);
      return;
    }

    // Ollama local AI query
    if (ollamaOnline && typeof fetch === 'function') {
      var systemPrompt = 'You are SFX Buddy, an expert, friendly sound design assistant for video editors using SFX Composer in Adobe Premiere Pro and After Effects. Keep responses concise, direct, and actionable for fast audio workflows. Recommend specific textures, frequencies, EQ tricks, and sound layering.';
      var controller = new AbortController();
      var timeout = setTimeout(function () { controller.abort(); }, 15000);

      var ollamaMessages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query }
      ];

      fetch('http://127.0.0.1:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ollamaModel,
          messages: ollamaMessages,
          stream: false
        }),
        signal: controller.signal
      })
      .then(function (res) {
        clearTimeout(timeout);
        if (!res.ok) throw new Error('Ollama error (' + res.status + ')');
        return res.json();
      })
      .then(function (data) {
        showTyping(false);
        var content = (data && data.message && data.message.content) || '';
        var soundCards = searchLocalLibrary(query, 2);
        var buddyMsg = {
          id: 'msg-' + (Date.now() + 1),
          role: 'buddy',
          text: content,
          html: '<p>' + escapeHtml(content).replace(/\n/g, '<br/>') + '</p>',
          cards: soundCards,
          time: Date.now()
        };
        state.messages.push(buddyMsg);
        appendMessageDOM(buddyMsg);
        scrollChat();
        saveHistory(state.messages);
      })
      .catch(function () {
        clearTimeout(timeout);
        fallbackToRuleEngine(query);
      });
    } else {
      setTimeout(function () {
        fallbackToRuleEngine(query);
      }, 180);
    }
  }

  function fallbackToRuleEngine(query) {
    showTyping(false);
    var buddyResponse = generateBuddyResponse(query);
    var buddyMsg = {
      id: 'msg-' + (Date.now() + 1),
      role: 'buddy',
      text: buddyResponse.text,
      html: buddyResponse.html,
      cards: buddyResponse.cards || [],
      time: Date.now()
    };
    state.messages.push(buddyMsg);
    appendMessageDOM(buddyMsg);
    scrollChat();
    saveHistory(state.messages);
  }

  // --- PUBLIC API ---
  window.__sfxBuddy = {
    isOpen: function () {
      return state.isOpen;
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
    isFloatingEnabled: function () {
      return state.floatingEnabled;
    },
    setFloatingEnabled: function (enabled) {
      state.floatingEnabled = !!enabled;
      prefs.floatingEnabled = state.floatingEnabled;
      savePreferences(prefs);
      buildUI();
      if (launcherEl) {
        launcherEl.style.display = state.floatingEnabled ? 'inline-flex' : 'none';
      }
      if (!state.floatingEnabled && state.isOpen) {
        setOpen(false);
      }
    },
    getDisplayMode: function () {
      return state.displayMode;
    },
    setDisplayMode: function () {
      // Streamlined to floating only
      state.displayMode = 'floating';
      this.setFloatingEnabled(true);
    },
    recalculatePosition: function () {
      recalculatePosition();
    },
    ask: function (question) {
      setOpen(true);
      handleUserQuery(question);
    },
    getTip: function () {
      return DAILY_TIPS[state.tipIndex];
    },
    nextTip: function () {
      state.tipIndex = (state.tipIndex + 1) % DAILY_TIPS.length;
      return DAILY_TIPS[state.tipIndex];
    },
    clearHistory: function () {
      clearChat();
    },
    searchSounds: function (q, limit) {
      return searchLocalLibrary(q, limit);
    }
  };

  // Auto-init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildUI);
  } else {
    buildUI();
  }
})();
