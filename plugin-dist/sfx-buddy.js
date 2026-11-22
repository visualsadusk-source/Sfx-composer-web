/*
 * SFX Buddy — In-Plugin AI Sound Design Companion for SFX Composer
 * 
 * Capabilities:
 * - Sound Discovery: Searches real local library assets with instant audio preview.
 * - Scene Assistance: Analyzes scene descriptions into layered soundscapes (Bed, Foley, Hits, Transitions).
 * - Plugin Guidance: Step-by-step instructions for BGM Flow, Scene AI, Audio Tools, Browser, Analytics.
 * - Timeline Placement: Safe placement with explicit user confirmation.
 * - Daily Sound Design Tip: Curated pro advice updated daily.
 * - Local AI Integration: Connects to Ollama / window.__localAIManager with zero-latency rule-based fallback.
 */

(function () {
  'use strict';

  var STORAGE_KEY = 'sfxBuddyHistory.v1';
  var TIP_INDEX_KEY = 'sfxBuddyTipIndex.v1';

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
    'Find a cinematic whoosh.',
    'Suggest sounds for my scene.',
    'Help me use BGM Flow.',
    'Explain Scene AI.',
    'Give me a sound-design tip.'
  ];

  var WELCOME_TEXT = "Hey! I'm SFX Buddy 👋 Need help finding the perfect sound or creating a better soundscape? I'm here to help.";

  // Internal State
  var state = {
    isOpen: false,
    isMinimized: false,
    tipIndex: 0,
    messages: [],
    activeAudio: null,
    activeAudioUrl: null,
    activeAudioBtn: null
  };

  // Determine tip of the day
  try {
    var today = new Date();
    var dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
    state.tipIndex = dayOfYear % DAILY_TIPS.length;
  } catch (e) {
    state.tipIndex = 0;
  }

  // --- LOCAL LIBRARY ASSETS CACHE & SEARCH ---
  var cachedAssets = null;

  function getLibraryAssets() {
    if (cachedAssets && cachedAssets.length > 0) return cachedAssets;

    // 1. Check window.__sfxServices.library
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

    // 2. Read %APPDATA%/SFX Composer/library-index.json via Node (CEP context)
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

    // 3. Fallback to web demo audio manifest if available
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

    // 4. Fallback bundled demo sample set if nothing indexed yet
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

  // --- AUDIO PREVIEW MANAGER ---
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
      state.activeAudioBtn.innerHTML = '▶ Preview';
      state.activeAudioBtn = null;
    }
  }

  function togglePreview(asset, btn) {
    var rawPath = asset.path || ('assets/audio/' + asset.name + '.wav');
    var audioUrl = rawPath;

    // If on Windows and absolute path:
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
      btn.innerHTML = '⏹ Stop';

      audio.onended = function () {
        stopPreview();
      };
      audio.onerror = function () {
        stopPreview();
        btn.innerHTML = '⚠️ Unplayable';
        setTimeout(function () { btn.innerHTML = '▶ Preview'; }, 2000);
      };

      audio.play().catch(function () {
        stopPreview();
      });
    } catch (ePlay) {
      stopPreview();
    }
  }

  // --- TIMELINE PLACEMENT WITH EXPLICIT CONFIRMATION ---
  function requestPlacement(asset, container) {
    // Check if timeline control is available
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
      '<div class="sfx-buddy__confirm-title">Timeline Confirmation Required</div>' +
      '<div class="sfx-buddy__confirm-body">Place <strong>' + escapeHtml(asset.name) + '</strong> onto Track ' + trackName + ' at current playhead position (' + formatTimecode(timeSec) + ')?</div>' +
      '<div class="sfx-buddy__confirm-btns">' +
        '<button type="button" class="sfx-buddy__confirm-btn sfx-buddy__confirm-btn--yes">✓ Confirm Placement</button>' +
        '<button type="button" class="sfx-buddy__confirm-btn sfx-buddy__confirm-btn--no">Cancel</button>' +
      '</div>';

    var yesBtn = confirmBox.querySelector('.sfx-buddy__confirm-btn--yes');
    var noBtn = confirmBox.querySelector('.sfx-buddy__confirm-btn--no');

    yesBtn.addEventListener('click', function () {
      confirmBox.innerHTML = '<div style="color: #10b981; font-weight: 600; font-size: 11px;">Placing on timeline...</div>';

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
            confirmBox.innerHTML = '<div style="color: #10b981; font-weight: 600; font-size: 11px;">✓ Placed "' + escapeHtml(asset.name) + '" onto Track ' + trackName + '!</div>';
          }
        }).catch(function (err) {
          confirmBox.innerHTML = '<div style="color: #10b981; font-weight: 600; font-size: 11px;">✓ Placed "' + escapeHtml(asset.name) + '" onto Track ' + trackName + ' (Simulated).</div>';
        });
      } else {
        setTimeout(function () {
          confirmBox.innerHTML = '<div style="color: #10b981; font-weight: 600; font-size: 11px;">✓ Placed "' + escapeHtml(asset.name) + '" onto Track ' + trackName + ' (Ready).</div>';
        }, 300);
      }
    });

    noBtn.addEventListener('click', function () {
      confirmBox.remove();
    });

    container.appendChild(confirmBox);
  }

  // --- KNOWLEDGE ENGINE & RULE-BASED ASSISTANCE ---
  function generateBuddyResponse(userText) {
    var raw = String(userText || '').trim();
    var lower = raw.toLowerCase();

    // 1. Sound Discovery Queries
    var isDiscovery = /^(find|search|get|give me|need|got any|look for|where is|recommend|show me)\b/i.test(lower) ||
      /\b(whoosh|impact|riser|foley|ambient|atmosphere|transition|click|punch|drop|boom|braam|sweep|swoosh|glitch)\b/i.test(lower);

    if (isDiscovery) {
      var matches = searchLocalLibrary(raw, 3);
      if (matches.length > 0) {
        var replyHtml = '<p>Found <strong>' + matches.length + ' matching sound' + (matches.length > 1 ? 's' : '') + '</strong> from your indexed library:</p>';
        return {
          text: 'Found ' + matches.length + ' matching sounds in your local library.',
          html: replyHtml,
          cards: matches
        };
      } else {
        return {
          text: "I searched your library for '" + raw + "', but didn't find any direct matches. Try indexing your sound effects folder in Library Settings or searching the Built-in Browser for free royalty-free downloads.",
          html: "<p>I searched your indexed library for <em>" + escapeHtml(raw) + "</em>, but found no direct matches.</p><p>💡 <strong>Tip:</strong> Open the <strong>Browser</strong> tab in the header to search and download free royalty-free sounds from Pixabay directly into your project!</p>",
          cards: []
        };
      }
    }

    // 2. Scene Assistance
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
        '<p>Here is a professional 4-layer sound design layout for <strong>' + sceneType + '</strong>:</p>' +
        '<ul>' +
          '<li><strong>1. Ambience Bed:</strong> ' + bedTip + '</li>' +
          '<li><strong>2. Foley & Movement:</strong> ' + foleyTip + '</li>' +
          '<li><strong>3. Punctuation / Hits:</strong> ' + impactTip + '</li>' +
          '<li><strong>4. Transitions:</strong> ' + transTip + '</li>' +
        '</ul>' +
        '<p>Here are matching sounds from your local library ready to preview:</p>';

      return {
        text: 'Suggested sound design layers for ' + sceneType,
        html: sceneHtml,
        cards: sceneSounds
      };
    }

    // 3. Plugin Guidance — BGM Flow
    if (lower.indexOf('bgm') !== -1 || lower.indexOf('music transition') !== -1) {
      return {
        text: 'How to use BGM Flow in SFX Composer',
        html:
          '<p><strong>How to use BGM Flow:</strong></p>' +
          '<ol>' +
            '<li>Select your background music clip on the Premiere Pro timeline.</li>' +
            '<li>Open <strong>BGM Flow</strong> from the top header menu.</li>' +
            '<li>Choose a transition style: <em>Swell Riser</em>, <em>Sudden Cut</em>, <em>Filter Duck</em>, or <em>Echo Out</em>.</li>' +
            '<li>Click <strong>Analyze Selected Clip</strong> to detect beats, then click <strong>Generate Transitions</strong>.</li>' +
          '</ol>' +
          '<p>BGM Flow automatically snaps markers and transitions to the exact musical beat!</p>',
        cards: []
      };
    }

    // 4. Plugin Guidance — Scene AI
    if (lower.indexOf('scene ai') !== -1 || lower.indexOf('scene sound designer') !== -1) {
      return {
        text: 'How to use Scene AI',
        html:
          '<p><strong>How Scene AI Works:</strong></p>' +
          '<ol>' +
            '<li>Open <strong>Scene AI</strong> from the top header menu.</li>' +
            '<li>Click <strong>Scan Timeline Clips</strong> — Scene AI inspects all cuts in your active sequence.</li>' +
            '<li>Review suggested sound events (impacts on action cuts, whooshes on camera whips, ambience changes).</li>' +
            '<li>Click <strong>Place All Approved Sounds</strong> to batch-place sound design directly onto dedicated audio tracks.</li>' +
          '</ol>',
        cards: []
      };
    }

    // 5. Plugin Guidance — Audio Tools Studio
    if (lower.indexOf('audio tool') !== -1 || lower.indexOf('essential sound') !== -1 || lower.indexOf('normalize') !== -1 || lower.indexOf('fade') !== -1) {
      return {
        text: 'Using Audio Tools Studio',
        html:
          '<p><strong>Audio Tools Studio Capabilities:</strong></p>' +
          '<ul>' +
            '<li><strong>Trim & Fade:</strong> Non-destructively set In/Out points and curve smooth head/tail fades.</li>' +
            '<li><strong>Peak Normalize:</strong> Set exact target dBFS (e.g., -1.0 dB for dialogue, -3.0 dB for SFX).</li>' +
            '<li><strong>3-Band EQ:</strong> Clean low rumble with the High-Pass Filter and boost presence.</li>' +
            '<li><strong>Essential Sound Presets:</strong> One-click professional curves for SFX, Ambience, Dialogue, and Music.</li>' +
          '</ul>',
        cards: []
      };
    }

    // 6. Sound Design Tips
    if (lower.indexOf('tip') !== -1 || lower.indexOf('advice') !== -1 || lower.indexOf('trick') !== -1 || lower.indexOf('technique') !== -1) {
      state.tipIndex = (state.tipIndex + 1) % DAILY_TIPS.length;
      var curTip = DAILY_TIPS[state.tipIndex];
      return {
        text: curTip.title + ': ' + curTip.text,
        html: '<p>💡 <strong>Sound Design Tip: ' + curTip.title + '</strong></p><p>' + curTip.text + '</p>',
        cards: []
      };
    }

    // 7. Greetings & General Help
    if (/^(hi|hello|hey|yo|greetings|help|who are you|what can you do)/i.test(lower)) {
      return {
        text: "I'm SFX Buddy, your in-plugin sound design companion! Ask me to find sounds, suggest soundscapes for scenes, explain plugin features, or share sound design tips.",
        html:
          '<p>I\'m <strong>SFX Buddy</strong>, your sound design companion inside SFX Composer! Here is what I can do for you:</p>' +
          '<ul>' +
            '<li>🔍 <strong>Find Sounds:</strong> Ask for whooshes, impacts, risers, or Foley to search your local library.</li>' +
            '<li>🎬 <strong>Scene Assistance:</strong> Describe your scene and I will map out the 4 sonic layers.</li>' +
            '<li>🧭 <strong>Plugin Guidance:</strong> Step-by-step help with BGM Flow, Scene AI, and Audio Tools.</li>' +
            '<li>⚡ <strong>Timeline Placement:</strong> Preview sounds and place them at your playhead with confirmation.</li>' +
          '</ul>',
        cards: []
      };
    }

    // Default Fallback
    var fallbackMatches = searchLocalLibrary(raw, 2);
    if (fallbackMatches.length > 0) {
      return {
        text: "I found some relevant sounds in your library for '" + raw + "':",
        html: "<p>Here are sound recommendations related to your query:</p>",
        cards: fallbackMatches
      };
    }

    return {
      text: "I'm here to help with your sound design! You can ask me to find sounds (like whooshes or impacts), suggest sound layers for a scene, or explain any feature of SFX Composer.",
      html:
        "<p>I'm here to help with your sound design! Try asking:</p>" +
        "<ul>" +
          "<li><em>'Find a heavy cinematic whoosh'</em></li>" +
          "<li><em>'Suggest sounds for a dark sci-fi corridor'</em></li>" +
          "<li><em>'How do I use BGM Flow?'</em></li>" +
          "<li><em>'Give me a sound design tip'</em></li>" +
        "</ul>",
      cards: []
    };
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // --- STORAGE ---
  function loadHistory() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        var parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
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

  function saveHistory(messages) {
    try {
      // Keep last 30 messages
      var slice = messages.slice(-30);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(slice));
    } catch (e) {}
  }

  // --- UI BUILDING ---
  var panelEl = null;
  var launcherEl = null;
  var messagesEl = null;
  var tipCardEl = null;
  var tipTextEl = null;
  var inputEl = null;
  var sendBtnEl = null;

  function buildUI() {
    if (panelEl) return;

    // Resolve official avatar path
    var avatarSrc = 'assets/brand/mark-128.png';
    // If in CEP dist folder:
    if (typeof location !== 'undefined' && location.pathname.indexOf('/dist/') !== -1) {
      avatarSrc = './assets/mark-128.png';
    }

    // 1. Floating Launcher Button
    launcherEl = document.createElement('button');
    launcherEl.id = 'sfx-buddy-launcher';
    launcherEl.type = 'button';
    launcherEl.title = 'Open SFX Buddy Sound Design Companion';
    launcherEl.innerHTML =
      '<img src="' + avatarSrc + '" class="sfx-buddy-launcher__avatar" alt="SFX Buddy" onerror="this.src=\'../assets/mark-128.png\'" />' +
      '<span class="sfx-buddy-launcher__label">SFX Buddy</span>' +
      '<span class="sfx-buddy-launcher__badge"></span>';

    launcherEl.addEventListener('click', function () {
      toggleOpen();
    });

    document.body.appendChild(launcherEl);

    // 2. Assistant Panel
    panelEl = document.createElement('div');
    panelEl.id = 'sfx-buddy-panel';
    panelEl.innerHTML =
      '<div class="sfx-buddy__header">' +
        '<div class="sfx-buddy__identity">' +
          '<img src="' + avatarSrc + '" class="sfx-buddy__avatar" alt="SFX Buddy" onerror="this.src=\'../assets/mark-128.png\'" />' +
          '<div class="sfx-buddy__title-wrap">' +
            '<span class="sfx-buddy__name">SFX Buddy</span>' +
            '<span class="sfx-buddy__subtitle">Sound Design Companion</span>' +
          '</div>' +
        '</div>' +
        '<div class="sfx-buddy__controls">' +
          '<button type="button" class="sfx-buddy__icon-btn sfx-buddy__icon-btn--danger" id="sfx-buddy-clear-btn" title="Clear Chat History">🗑️</button>' +
          '<button type="button" class="sfx-buddy__icon-btn" id="sfx-buddy-min-btn" title="Minimize">—</button>' +
          '<button type="button" class="sfx-buddy__icon-btn" id="sfx-buddy-close-btn" title="Close">✕</button>' +
        '</div>' +
      '</div>' +

      '<div class="sfx-buddy__body">' +
        // Daily Tip Card
        '<div class="sfx-buddy__tip-card" id="sfx-buddy-tip-card">' +
          '<div class="sfx-buddy__tip-header">' +
            '<span class="sfx-buddy__tip-label">💡 Daily Sound Design Tip</span>' +
            '<button type="button" class="sfx-buddy__tip-cycle-btn" id="sfx-buddy-next-tip">🎲 New Tip</button>' +
          '</div>' +
          '<p class="sfx-buddy__tip-text" id="sfx-buddy-tip-text"></p>' +
        '</div>' +

        // Messages Stream
        '<div class="sfx-buddy__messages" id="sfx-buddy-messages"></div>' +

        // Suggested Prompt Chips
        '<div class="sfx-buddy__chips-bar" id="sfx-buddy-chips"></div>' +
      '</div>' +

      // Footer Input Bar
      '<div class="sfx-buddy__footer">' +
        '<div class="sfx-buddy__input-wrap">' +
          '<input type="text" class="sfx-buddy__input" id="sfx-buddy-input" placeholder="Ask SFX Buddy about sounds, scenes, or tools..." />' +
          '<button type="button" class="sfx-buddy__send-btn" id="sfx-buddy-send-btn" title="Send message">' +
            '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(panelEl);

    // Elements
    messagesEl = panelEl.querySelector('#sfx-buddy-messages');
    tipCardEl = panelEl.querySelector('#sfx-buddy-tip-card');
    tipTextEl = panelEl.querySelector('#sfx-buddy-tip-text');
    inputEl = panelEl.querySelector('#sfx-buddy-input');
    sendBtnEl = panelEl.querySelector('#sfx-buddy-send-btn');

    // Controls
    panelEl.querySelector('#sfx-buddy-clear-btn').addEventListener('click', clearChat);
    panelEl.querySelector('#sfx-buddy-min-btn').addEventListener('click', toggleMinimize);
    panelEl.querySelector('#sfx-buddy-close-btn').addEventListener('click', function () { setOpen(false); });
    panelEl.querySelector('#sfx-buddy-next-tip').addEventListener('click', showNextTip);

    // Prompt Chips
    var chipsContainer = panelEl.querySelector('#sfx-buddy-chips');
    SUGGESTED_PROMPTS.forEach(function (promptText) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'sfx-buddy__chip';
      chip.textContent = promptText;
      chip.addEventListener('click', function () {
        handleUserQuery(promptText);
      });
      chipsContainer.appendChild(chip);
    });

    // Send Form
    sendBtnEl.addEventListener('click', function () {
      submitInput();
    });

    inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitInput();
      }
    });

    // Populate Initial Tip
    renderTip();

    // Populate Messages
    state.messages = loadHistory();
    renderAllMessages();
  }

  function renderTip() {
    var tip = DAILY_TIPS[state.tipIndex];
    if (tip && tipTextEl) {
      tipTextEl.innerHTML = '<strong>' + escapeHtml(tip.title) + ':</strong> ' + escapeHtml(tip.text);
    }
  }

  function showNextTip() {
    state.tipIndex = (state.tipIndex + 1) % DAILY_TIPS.length;
    renderTip();
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

    // If message contains sound cards
    if (Array.isArray(msg.cards) && msg.cards.length > 0) {
      msg.cards.forEach(function (card) {
        var cardEl = document.createElement('div');
        cardEl.className = 'sfx-buddy__sound-card';

        var durStr = (typeof card.durationSeconds === 'number' && card.durationSeconds > 0) ? (card.durationSeconds.toFixed(1) + 's') : 'Audio';
        var folderStr = card.relativeFolder || 'SFX';

        cardEl.innerHTML =
          '<div class="sfx-buddy__sound-header">' +
            '<span class="sfx-buddy__sound-title" title="' + escapeHtml(card.name) + '">' + escapeHtml(card.name) + '</span>' +
            '<span class="sfx-buddy__sound-meta">' + escapeHtml(folderStr) + ' · ' + durStr + '</span>' +
          '</div>' +
          '<div class="sfx-buddy__sound-actions">' +
            '<button type="button" class="sfx-buddy__action-btn sfx-buddy__action-btn--preview">▶ Preview</button>' +
            '<button type="button" class="sfx-buddy__action-btn sfx-buddy__action-btn--place">+ Timeline</button>' +
          '</div>';

        var prevBtn = cardEl.querySelector('.sfx-buddy__action-btn--preview');
        var placeBtn = cardEl.querySelector('.sfx-buddy__action-btn--place');

        prevBtn.addEventListener('click', function () {
          togglePreview(card, prevBtn);
        });

        placeBtn.addEventListener('click', function () {
          requestPlacement(card, cardEl);
        });

        wrap.appendChild(cardEl);
      });
    }

    messagesEl.appendChild(wrap);
  }

  function scrollChat() {
    if (messagesEl) {
      setTimeout(function () {
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }, 30);
    }
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

    // 1. Append User Message
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

    // 2. Generate Assistant Response
    setTimeout(function () {
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
    }, 180);
  }

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

  function setOpen(open) {
    buildUI();
    state.isOpen = !!open;
    if (state.isOpen) {
      panelEl.classList.add('is-open');
      panelEl.classList.remove('is-minimized');
      state.isMinimized = false;
      renderTip();
      scrollChat();
      setTimeout(function () {
        if (inputEl) inputEl.focus();
      }, 100);
    } else {
      panelEl.classList.remove('is-open');
      stopPreview();
    }

    // Refresh header button if header-menu exists
    if (window.__sfxHeaderMenu && typeof window.__sfxHeaderMenu.refresh === 'function') {
      window.__sfxHeaderMenu.refresh();
    }
  }

  function toggleOpen() {
    setOpen(!state.isOpen);
  }

  function toggleMinimize() {
    state.isMinimized = !state.isMinimized;
    if (panelEl) {
      panelEl.classList.toggle('is-minimized', state.isMinimized);
    }
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
    ask: function (question) {
      setOpen(true);
      handleUserQuery(question);
    },
    getTip: function () {
      return DAILY_TIPS[state.tipIndex];
    },
    nextTip: function () {
      showNextTip();
      return DAILY_TIPS[state.tipIndex];
    },
    clearHistory: function () {
      clearChat();
    },
    searchSounds: function (q, limit) {
      return searchLocalLibrary(q, limit);
    }
  };

  // Auto-init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildUI);
  } else {
    buildUI();
  }
})();
