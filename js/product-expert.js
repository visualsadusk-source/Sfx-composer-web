/**
 * js/product-expert.js
 * 100% Built-In, Offline-Capable "Your Personal Product Expert" for SFX Composer.
 * - Zero external AI APIs (no OpenAI, Gemini, Groq, or backend AI dependency)
 * - Rule-based intent engine with keyword, synonym, fuzzy & context-aware follow-up matching
 * - Bilingual support (English & Hindi / Hinglish)
 * - Verified product knowledge base only (never invents features)
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'sfx_product_expert_history_v2';
  var TOPIC_KEY = 'sfx_product_expert_topic_v2';

  var WELCOME_TEXT =
    "Hey! Welcome to SFX Composer. 👋\nI'm your personal product expert. Ask me anything about SFX Composer, its features, sound library, pricing, installation, or workflow. I'll help you understand everything.";

  var SUGGESTED_QUESTIONS = [
    'What is SFX Composer?',
    'What features does it offer?',
    "What's included in the ₹199 bundle?",
    'How does the AI SFX Assistant work?',
    'How do I install the plugin?',
    'Is it compatible with Premiere Pro and After Effects?'
  ];

  var UNKNOWN_FALLBACK =
    "I don't have verified information about that yet. Please contact SFX Composer support at [sfxcomposer@gmail.com](mailto:sfxcomposer@gmail.com).";

  // ── VERIFIED KNOWLEDGE BASE & INTENTS ──
  var KNOWLEDGE_INTENTS = [
    {
      id: 'greeting',
      phrases: ['hello', 'hi', 'hey', 'namaste', 'good morning', 'good evening', 'hii', 'helo'],
      keywords: ['hi', 'hello', 'hey', 'namaste'],
      answer:
        "Hello! 👋 I'm Your Personal Product Expert for SFX Composer. Ask me about the ₹199 Ultimate Bundle, the 7GB / 17,111+ SFX Library, BGM Flow, Audio Tools, presets, installation, updates, or troubleshooting.",
      followUp:
        'You can click any suggested question above or ask about a specific feature like BGM Flow, Waveform Trimmer, or installation.'
    },
    {
      id: 'overview',
      phrases: ['what is sfx composer', 'about sfx composer', 'sfx composer kya hai', 'why should i buy', 'what does it do', 'overview'],
      keywords: ['sfx composer', 'overview', 'workflow', 'kya hai', 'extension', 'plugin'],
      answer:
        'SFX Composer (v2.2.0) is a professional sound design and audio workflow extension (.zxp) built for Adobe Premiere Pro and After Effects editors.\n\nIt lets you search, audition, trim waveforms, apply fades/EQ/normalization, and place broadcast-ready sound effects directly onto your timeline without leaving your NLE. Check out the [Live Software Demo](demo.html) or [Pricing](index.html#pricing).',
      followUp:
        'Beyond the main library, it includes BGM Flow for music transitions, Essential Sound Studio (Audio Tools), a Built-in Browser & Downloader, AI SFX Assistant, Scene AI, and local Usage Analytics.'
    },
    {
      id: 'pricing',
      phrases: ['how much', 'what is the price', 'whats included in the 199', '199 bundle', 'one-time payment', 'kitne ka hai', 'kitna price', 'pricing', 'cost', 'buy', 'subscription'],
      keywords: ['price', 'cost', '199', '₹199', 'bundle', 'buy', 'purchase', 'subscription', 'lifetime', 'kitne', 'daam', 'rupees', 'payment', 'razorpay'],
      answer:
        'The **SFX Composer Ultimate Bundle** is a **₹199 one-time payment** (no monthly or annual subscriptions).\n\nWhat is included:\n• SFX Composer Pro desktop extension (.zxp for Windows & macOS)\n• Lifetime activation license key\n• Complete 7GB Master SFX Library (20 organized folders, 4,500+ 24-bit / 48kHz WAVs)\n• Commercial Royalty-Free Audio License\n• Lifetime access to the My License & Downloads portal\n\nSee [Pricing](index.html#pricing) to purchase.',
      followUp:
        'Immediately after your ₹199 Razorpay checkout, your payment is verified server-side, your license key is generated on screen, and both the .zxp installer and 7GB SFX Library unlock in My License & Downloads.'
    },
    {
      id: 'compatibility',
      phrases: ['compatible with', 'premiere pro and after effects', 'does it support', 'which software', 'operating system', 'windows or mac', 'davinci', 'final cut'],
      keywords: ['compatible', 'compatibility', 'premiere', 'after effects', 'windows', 'macos', 'mac', 'apple silicon', 'support', 'host', 'cc 2019', 'davinci', 'final cut'],
      answer:
        'The SFX Composer `.zxp` extension officially supports **Adobe Premiere Pro (CC 2019 / 13.0 and newer)** and **Adobe After Effects (CC 2019 / 16.0 and newer)** on **Windows 10/11** and **macOS 11+ (Intel & Apple Silicon)**.\n\nNote: The standalone 24-bit WAV files in the 7GB Master SFX Library can be imported into any video editor (including DaVinci Resolve or Final Cut Pro), while the integrated `.zxp` panel runs inside Premiere Pro and After Effects.',
      followUp:
        'A single installed `.zxp` bundle (`com.sfxcomposer.panel`) automatically appears under **Window → Extensions → SFX Composer** in both Premiere Pro and After Effects.'
    },
    {
      id: 'features_list',
      phrases: ['what features does it offer', 'all features', 'feature list', 'what tools', 'kya features'],
      keywords: ['features', 'feature', 'tools', 'capabilities', 'module', 'modules'],
      answer:
        'SFX Composer includes:\n• **SFX Library**: 17,111+ indexed sounds across 20 folder categories with instant search, Favorites & Collections\n• **Waveform Trimmer**: Non-destructive In/Out trimming before placing\n• **Add to Timeline**: Direct playhead placement to your active sequence/comp\n• **BGM Flow**: Music Start, End, Change, Beat Sync & Auto EQ transitions\n• **Essential Sound Studio (Audio Tools)**: Gain, Normalize (-1 dBFS), Fades, EQ, Dynamics & WAV export\n• **Built-in Browser & Downloader**: Pixabay search, downloads tracker & multi-format importer\n• **AI SFX Assistant & Scene AI**: Local Ollama-powered sound discovery\n• **Usage Analytics**: 100% local activity tracking\n\nExplore them visually in the [Live Software Demo](demo.html).',
      followUp:
        'Ask me about any specific tool—like BGM Flow, Audio Tools, Presets, or Waveform Trimming—for a step-by-step breakdown.'
    },
    {
      id: 'library',
      phrases: ['sound library', '17k', '17,111', '7gb', '20 categories', 'folder categories', 'how does the sound library work'],
      keywords: ['library', '7gb', '17k', '17111', '4500', 'categories', 'folders', 'folder', 'wav', 'favorites', 'collections', 'search'],
      answer:
        'The **7GB Master SFX Library** includes 4,500+ broadcast-ready 24-bit / 48kHz WAV files (17,111+ indexed sounds in the production library) organized into **20 categories**:\nButton, Countdown & List, Devin SFX, Foley, General Music, Glitch & Flicker, Granular Combo, Granular, Human, Impact & Hit, Music Sounds Effect, Power Down & Up, sfx 1, SFX Monster, sound effect important 2.0, Sound Effects, Transition, Typing, UE SFX PACK, and ui sfx.\n\nBrowse all 20 folders in the [7GB SFX Library](library.html).',
      followUp:
        'Inside the plugin you can filter by category, star Favorites, build custom Collections, index your own local folders with `+ Folder`, and adjust preview Gain.'
    },
    {
      id: 'trimmer',
      phrases: ['waveform trim', 'audio preview', 'trimmer', 'in and out', 'mark in', 'audition'],
      keywords: ['trim', 'trimming', 'trimmer', 'waveform', 'preview', 'audition', 'space', 'mark', 'slice'],
      answer:
        'Clicking any sound loads it into the docked **Waveform Trimmer** at the bottom of the panel.\n\n• Press **Space** to preview/audition\n• Use **I** and **O** keys (or drag handles) to set exact In/Out points\n• View exact `In`, `Out`, and `Length` timings, or click **Reset**\n• Click **Add to timeline** to place only that trimmed slice.',
      followUp:
        'Non-destructive trimming ensures your original WAV files remain untouched while only the selected section is placed into your Premiere Pro or After Effects timeline.'
    },
    {
      id: 'timeline',
      phrases: ['add to timeline', 'timeline integration', 'place on timeline', 'insert into sequence'],
      keywords: ['timeline', 'place', 'insert', 'sequence', 'playhead', 'track', 'bin'],
      answer:
        'With **Add to timeline**, SFX Composer imports or reuses the audio asset in your project bin and places it directly at your current playhead position in Premiere Pro or After Effects—automatically locating a free audio track when needed so clips do not collide.',
      followUp:
        'You can also place downloaded or AI-recommended sounds directly onto your active timeline from the Downloads Manager and AI SFX Assistant.'
    },
    {
      id: 'presets',
      phrases: ['save preset', 'export preset', 'import preset', 'timeline preset', 'preset manager', 'save presets'],
      keywords: ['preset', 'presets', 'export', 'import', 'save', 'manager', 'template'],
      answer:
        'SFX Composer includes built-in **Preset Management** (such as in BGM Flow’s `Preset` selector + `Save Preset` control and timeline/transition preset workflows).\n\n• **Save**: Configure your transition style, fade duration, target volume, or curve and click **Save Preset** to store it for reuse.\n• **Reuse / Manage**: Switch between saved presets instantly from the Preset dropdown across projects.\n\nFor advanced preset backup/sharing questions, check the Installation Guide or email [sfxcomposer@gmail.com](mailto:sfxcomposer@gmail.com).',
      followUp:
        'Using saved presets keeps your intro swells, dialogue ducking, and outro fades consistent across every episode or client edit.'
    },
    {
      id: 'layer_labels',
      phrases: ['layer color', 'color label', 'layer labels', 'color labels'],
      keywords: ['color', 'label', 'labels', 'layer', 'layers', 'organize'],
      answer:
        'When placing sounds into your sequence or composition, SFX Composer tracks target audio tracks and keeps assets organized inside dedicated project bins so your dialogue, music, and SFX layers stay cleanly separated.',
      followUp:
        'You can also organize sounds inside the plugin using Favorites (★) and custom Collections.'
    },
    {
      id: 'fx_optimizer',
      phrases: ['fx optimizer', 'optimizer', 'optimize audio', 'clean up audio'],
      keywords: ['optimizer', 'optimize', 'fx', 'dsp', 'clean', 'enhance'],
      answer:
        'Inside **Audio Tools (Essential Sound Studio)**, you can optimize any sound effect or timeline clip before applying it:\n• **Level**: Gain slider + automatic **Normalize** (Target `-1.00 dBFS`) with Peak/RMS meters\n• **Fades**: Precision Fade In & Fade Out\n• **EQ**: Bass, High-pass, Low-pass, and Presence\n• **Dynamics & Character**: Compress, Pitch, Reverb, Width, and Transient shaping.',
      followUp:
        'Once optimized, click **Apply Changes to Selected Clip**, **Add Processed Audio as New Clip**, or **Export WAV...**.'
    },
    {
      id: 'downloader',
      phrases: ['built-in browser', 'downloader', 'pixabay', 'download sounds', 'import audio'],
      keywords: ['browser', 'downloader', 'download', 'downloads', 'pixabay', 'import', 'mp3', 'flac', 'aiff'],
      answer:
        'The **Built-in Browser** has three tabs:\n1. **Browse**: Search royalty-free sound effects (such as Pixabay) and pin your favorite sites.\n2. **Downloads**: Track completed downloads, preview files, click **Import to Project** or **Import to Active Timeline**, and open the local download folder.\n3. **Import**: Import local audio files (`WAV`, `MP3`, `AIFF`, `M4A`, `AAC`, `FLAC`) directly into your workflow.',
      followUp:
        'You can view the exact Browser, Downloads, and Import screens in the [Live Software Demo](demo.html).'
    },
    {
      id: 'bgm_flow',
      phrases: ['what is bgm flow', 'bgm flow', 'background music', 'music transitions', 'beat sync', 'auto eq', 'cinematic videos'],
      keywords: ['bgm', 'music', 'fade', 'curve', 's-curve', 'exponential', 'beat', 'sync', 'autoeq', 'cinematic'],
      answer:
        '**BGM Flow** is SFX Composer’s background music transition engine. It helps you build smooth musical entrances, exits, and track changes using 5 modes: **Music Start**, **Music End**, **Music Change**, **Beat Sync**, and **Auto EQ**.\n\nYou can choose from styles like *Smooth Fade In*, *Cinematic Rise*, *Beat Entry*, *Soft Intro*, and *Volume Ramp*, fine-tune Fade Duration & Target Volume, pick a curve (`s-curve`, `exponential`, `linear`, `logarithmic`), audition it, and apply directly to your selected clip.',
      followUp:
        'Yes—BGM Flow is great for cinematic videos! Try *Cinematic Rise* or *Smooth Fade In* with an S-curve, or use **Auto EQ** (Voiceover Clarity) to carve vocal space when dialogue enters.'
    },
    {
      id: 'ai_sfx',
      phrases: ['ai sfx', 'ai assistant', 'scene ai', 'ollama', 'llama', 'how does the ai sfx assistant work'],
      keywords: ['ai', 'ollama', 'llama', 'assistant', 'scene', 'analyze', 'prompt', 'local ai'],
      answer:
        'Inside the desktop plugin, **AI SFX Assistant** and **Scene AI (Scene Sound Designer)** connect to **local Ollama** (such as `llama3.2` running privately on your computer) or configured providers:\n• **AI SFX Assistant**: Describe the scene or mood you need and it recommends matching sounds from your local SFX library with **Preview**, **+ Place**, and **Auto-place** actions.\n• **Scene AI**: Checks your active Adobe Host and local Ollama connection to analyze sequences/compositions and run verified **AI Timeline Control** commands.\n\nNote: These desktop AI features require running Ollama locally (or configuring a provider) on your workstation.',
      followUp:
        'If Ollama shows as Offline inside the desktop plugin, start Ollama on your computer and ensure a model like `llama3.2` is pulled before clicking Retry.'
    },
    {
      id: 'audio_tools',
      phrases: ['audio tools', 'essential sound studio', 'normalize', 'equalizer', 'reverb'],
      keywords: ['audio tools', 'essential sound', 'studio', 'normalize', 'eq', 'reverb', 'pitch', 'compress', 'rms', 'peak'],
      answer:
        '**Audio Tools (Essential Sound Studio)** is a 3-column audio workstation inside the plugin:\n1. **Left**: Quick library search & category filter (`All`, `Music`, `SFX`, `Dialogue`, `Ambience`).\n2. **Center**: Full waveform view with `Open file`, `Load from Timeline`, transport playback, and Original A/B comparison.\n3. **Right**: Essential Sound DSP controls (`Gain`, `Normalize -1.00 dBFS`, `Fades`, `EQ`, `Dynamics`, `Character`) plus **Apply Changes to Selected Clip** and **Export WAV...**.',
      followUp:
        'You can preview the full Essential Sound Studio layout by clicking **Audio Tools** inside the [Live Software Demo](demo.html).'
    },
    {
      id: 'analytics',
      phrases: ['analytics', 'usage stats', 'most used sounds'],
      keywords: ['analytics', 'stats', 'statistics', 'history', 'tracking', 'most used'],
      answer:
        '**Usage Analytics** runs 100% locally in your plugin storage—no external tracking. It displays Total Sounds Played, Timeline Imports, Most Used Category, Unique Sounds Used, an Activity Overview chart, and a Most Used Sounds table with quick preview and placement buttons.',
      followUp:
        'You can filter stats by Last 7 days, Last 30 days, Last 90 days, All time, or Favorites, and clear local analytics data anytime.'
    },
    {
      id: 'installation',
      phrases: ['how do i install', 'install the plugin', 'installation', 'activate license', 'kaise install', 'setup'],
      keywords: ['install', 'installation', 'zxp', 'activate', 'activation', 'license', 'key', 'extension', 'setup', 'kaise'],
      answer:
        'To install and activate SFX Composer:\n1. Purchase the ₹199 bundle on [Pricing](index.html#pricing) to receive your license key immediately.\n2. Download the `.zxp` installer and 7GB SFX Library from **My License & Downloads**.\n3. Install the `.zxp` file using a ZXP installer (such as ZXPInstaller or Anastasiy’s Extension Manager) for Windows or macOS.\n4. Restart Premiere Pro or After Effects, open **Window → Extensions → SFX Composer**, and enter your license key.',
      followUp:
        'If you ever lose your download link or license key, open **My License & Downloads** using your purchase email and Razorpay Payment ID, or email [sfxcomposer@gmail.com](mailto:sfxcomposer@gmail.com).'
    },
    {
      id: 'updates',
      phrases: ['how do i update', 'update system', 'github update', 'new version', 'check for updates'],
      keywords: ['update', 'updates', 'github', 'version', 'upgrade', 'release', 'v2.2.0'],
      answer:
        'SFX Composer includes a built-in **Update Manager** that checks **GitHub Releases** for newer versions of the `.zxp` extension. When an update is available, you can download the latest release package and install it over your existing extension without losing your library or license.',
      followUp:
        'Your ₹199 one-time purchase includes lifetime access to your license and portal downloads.'
    },
    {
      id: 'troubleshooting',
      phrases: ['not working', 'error', 'troubleshooting', 'recover download', 'lost license', 'help', 'support', 'contact'],
      keywords: ['error', 'troubleshoot', 'troubleshooting', 'problem', 'issue', 'missing', 'recover', 'lost', 'support', 'contact', 'email', 'gmail', 'help'],
      answer:
        'Common troubleshooting tips:\n• **Plugin not visible in Extensions menu**: Ensure Premiere Pro / After Effects is CC 2019 or newer, reinstall the `.zxp`, and restart the Adobe app.\n• **Recover license or 7GB library download**: Open **My License & Downloads** with your purchase email and Razorpay Payment ID.\n• **AI SFX / Scene AI shows Offline**: Start local Ollama on your machine and verify a model (e.g. `llama3.2`) is installed.\n\nNeed human help? Email [sfxcomposer@gmail.com](mailto:sfxcomposer@gmail.com).',
      followUp:
        'When emailing [sfxcomposer@gmail.com](mailto:sfxcomposer@gmail.com), include your purchase email or Razorpay Payment ID so support can assist you quickly.'
    }
  ];

  var state = {
    isOpen: false,
    isLoading: false,
    history: [],
    lastTopic: null
  };

  function loadSession() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      state.history = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(state.history)) state.history = [];
      state.lastTopic = sessionStorage.getItem(TOPIC_KEY) || null;
    } catch (e) {
      state.history = [];
      state.lastTopic = null;
    }
  }

  function saveSession() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state.history.slice(-24)));
      if (state.lastTopic) sessionStorage.setItem(TOPIC_KEY, state.lastTopic);
      else sessionStorage.removeItem(TOPIC_KEY);
    } catch (e) {
      // Ignore storage errors
    }
  }

  // Normalize query text
  function normalize(str) {
    return String(str || '')
      .toLowerCase()
      .replace(/[₹]/g, '199 ')
      .replace(/[^\w\s\u0900-\u097F.]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Simple Levenshtein distance for light fuzzy matching on keywords >= 5 chars
  function editDistance(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 99;
    var dp = [];
    for (var i = 0; i <= a.length; i++) {
      dp[i] = [i];
    }
    for (var j = 0; j <= b.length; j++) {
      dp[0][j] = j;
    }
    for (i = 1; i <= a.length; i++) {
      for (j = 1; j <= b.length; j++) {
        var cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        );
      }
    }
    return dp[a.length][b.length];
  }

  function isFollowUpQuery(norm) {
    var followPatterns = [
      'tell me more', 'more details', 'explain more', 'how does it work',
      'can i use it', 'is it good', 'and what about', 'more about',
      'cinematic videos', 'detail', 'elaborate', 'aur batao', 'kaise kaam',
      'iska', 'isme', 'ye kya'
    ];
    for (var i = 0; i < followPatterns.length; i++) {
      if (norm.indexOf(followPatterns[i]) !== -1) return true;
    }
    var words = norm.split(' ');
    return words.length <= 5 && (words.indexOf('it') !== -1 || words.indexOf('this') !== -1 || words.indexOf('that') !== -1);
  }

  function resolveAnswer(rawQuery) {
    var norm = normalize(rawQuery);
    if (!norm) {
      return UNKNOWN_FALLBACK;
    }

    var queryTokens = norm.split(' ').filter(Boolean);
    var bestIntent = null;
    var bestScore = 0;

    for (var i = 0; i < KNOWLEDGE_INTENTS.length; i++) {
      var intent = KNOWLEDGE_INTENTS[i];
      var score = 0;

      // Exact phrase matches (highest weight)
      for (var p = 0; p < intent.phrases.length; p++) {
        if (norm.indexOf(intent.phrases[p]) !== -1) {
          score += 12 + intent.phrases[p].length * 0.2;
        }
      }

      // Keyword & fuzzy matches
      for (var k = 0; k < intent.keywords.length; k++) {
        var kw = intent.keywords[k];
        if (norm.indexOf(kw) !== -1) {
          score += kw.indexOf(' ') !== -1 ? 8 : 5;
        } else if (kw.length >= 5) {
          for (var t = 0; t < queryTokens.length; t++) {
            if (queryTokens[t].length >= 5 && editDistance(queryTokens[t], kw) <= 1) {
              score += 3.5;
              break;
            }
          }
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestIntent = intent;
      }
    }

    // Context-aware follow-up handling
    if (state.lastTopic && isFollowUpQuery(norm)) {
      var prevIntent = KNOWLEDGE_INTENTS.find(function (it) { return it.id === state.lastTopic; });
      if (prevIntent && prevIntent.followUp && (bestScore < 10 || bestIntent === prevIntent)) {
        return prevIntent.followUp;
      }
    }

    if (bestIntent && bestScore >= 4.5) {
      state.lastTopic = bestIntent.id;
      return bestIntent.answer;
    }

    return UNKNOWN_FALLBACK;
  }

  // Safely render text with clickable official links & bold **text** (XSS-safe DOM nodes)
  function appendFormattedText(container, text) {
    var tokenPattern = /(\*\*[^*]+\*\*)|(\[([^\]]+)\]\(([^)]+)\))|(sfxcomposer@gmail\.com)/g;
    var lastIndex = 0;
    var match;

    while ((match = tokenPattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        container.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }

      if (match[1]) {
        var strong = document.createElement('strong');
        strong.textContent = match[1].slice(2, -2);
        container.appendChild(strong);
      } else if (match[4]) {
        var a = document.createElement('a');
        var href = match[4];
        var isSafe = /^(https?:\/\/|mailto:|#|index\.html|demo\.html|library\.html|screenshots\.html)/i.test(href);
        a.href = isSafe ? href : '#';
        a.textContent = match[3];
        if (/^https?:\/\//i.test(href)) {
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
        }
        container.appendChild(a);
      } else if (match[5]) {
        var mail = document.createElement('a');
        mail.href = 'mailto:sfxcomposer@gmail.com';
        mail.textContent = match[5];
        container.appendChild(mail);
      }

      lastIndex = tokenPattern.lastIndex;
    }

    if (lastIndex < text.length) {
      container.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
  }

  function buildUI() {
    if (document.getElementById('sfx-pe-root')) return;

    var root = document.createElement('div');
    root.id = 'sfx-pe-root';

    root.innerHTML =
      '<button type="button" class="sfx-pe-fab" id="sfx-pe-fab" aria-label="Open Your Personal Product Expert">' +
        '<span class="sfx-pe-fab__icon" aria-hidden="true">' +
          '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>' +
        '</span>' +
        '<span>Ask Product Expert</span>' +
      '</button>' +

      '<section class="sfx-pe-panel" id="sfx-pe-panel" role="dialog" aria-label="Your Personal Product Expert" aria-hidden="true">' +
        '<header class="sfx-pe-header">' +
          '<div class="sfx-pe-title-wrap">' +
            '<h2 class="sfx-pe-title">Your Personal Product Expert</h2>' +
            '<div class="sfx-pe-subtitle">Your intelligent SFX Composer assistant.</div>' +
            '<div class="sfx-pe-status is-online" id="sfx-pe-status">' +
              '<span class="sfx-pe-status-dot" aria-hidden="true"></span>' +
              '<span id="sfx-pe-status-text">Built-in Expert · Always Available</span>' +
            '</div>' +
          '</div>' +
          '<div class="sfx-pe-header-actions">' +
            '<button type="button" class="sfx-pe-icon-btn" id="sfx-pe-clear" title="Clear conversation" aria-label="Clear conversation">' +
              '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>' +
            '</button>' +
            '<button type="button" class="sfx-pe-icon-btn" id="sfx-pe-close" title="Close assistant" aria-label="Close assistant">' +
              '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>' +
            '</button>' +
          '</div>' +
        '</header>' +

        '<div class="sfx-pe-messages" id="sfx-pe-messages" aria-live="polite"></div>' +

        '<form class="sfx-pe-form" id="sfx-pe-form">' +
          '<input type="text" class="sfx-pe-input" id="sfx-pe-input" placeholder="Ask about features, ₹199 bundle, install..." autocomplete="off" maxlength="600" />' +
          '<button type="submit" class="sfx-pe-send" id="sfx-pe-send" title="Send message" aria-label="Send message">' +
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>' +
          '</button>' +
        '</form>' +
      '</section>';

    document.body.appendChild(root);
  }

  function renderMessages() {
    var container = document.getElementById('sfx-pe-messages');
    if (!container) return;
    container.innerHTML = '';

    var welcome = document.createElement('div');
    welcome.className = 'sfx-pe-msg sfx-pe-msg--ai';
    appendFormattedText(welcome, WELCOME_TEXT);
    container.appendChild(welcome);

    if (state.history.length === 0) {
      var suggWrap = document.createElement('div');
      suggWrap.className = 'sfx-pe-suggestions';
      SUGGESTED_QUESTIONS.forEach(function (q) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sfx-pe-chip';
        btn.textContent = q;
        btn.addEventListener('click', function () {
          sendMessage(q);
        });
        suggWrap.appendChild(btn);
      });
      container.appendChild(suggWrap);
    }

    state.history.forEach(function (msg) {
      var bubble = document.createElement('div');
      bubble.className = 'sfx-pe-msg ' + (msg.role === 'user' ? 'sfx-pe-msg--user' : 'sfx-pe-msg--ai');
      if (msg.role === 'user') {
        bubble.textContent = msg.content;
      } else {
        appendFormattedText(bubble, msg.content);
      }
      container.appendChild(bubble);
    });

    if (state.isLoading) {
      var typing = document.createElement('div');
      typing.className = 'sfx-pe-typing';
      typing.setAttribute('aria-label', 'Assistant is typing');
      typing.innerHTML = '<span></span><span></span><span></span>';
      container.appendChild(typing);
    }

    container.scrollTop = container.scrollHeight;
  }

  function setOpen(open) {
    state.isOpen = open;
    var fab = document.getElementById('sfx-pe-fab');
    var panel = document.getElementById('sfx-pe-panel');
    var input = document.getElementById('sfx-pe-input');

    if (fab) fab.classList.toggle('is-hidden', open);
    if (panel) {
      panel.classList.toggle('is-open', open);
      panel.setAttribute('aria-hidden', open ? 'false' : 'true');
    }
    if (open && input) {
      setTimeout(function () { input.focus(); }, 180);
    }
  }

  function sendMessage(text) {
    var trimmed = String(text || '').trim();
    if (!trimmed || state.isLoading) return;

    state.history.push({ role: 'user', content: trimmed });
    state.isLoading = true;
    saveSession();

    var input = document.getElementById('sfx-pe-input');
    var sendBtn = document.getElementById('sfx-pe-send');
    if (input) input.value = '';
    if (sendBtn) sendBtn.disabled = true;

    renderMessages();

    setTimeout(function () {
      var reply = resolveAnswer(trimmed);
      state.history.push({ role: 'assistant', content: reply });
      state.isLoading = false;
      if (sendBtn) sendBtn.disabled = false;
      saveSession();
      renderMessages();
    }, 260);
  }

  document.addEventListener('DOMContentLoaded', function () {
    loadSession();
    buildUI();
    renderMessages();

    var fab = document.getElementById('sfx-pe-fab');
    var closeBtn = document.getElementById('sfx-pe-close');
    var clearBtn = document.getElementById('sfx-pe-clear');
    var form = document.getElementById('sfx-pe-form');
    var input = document.getElementById('sfx-pe-input');

    if (fab) fab.addEventListener('click', function () { setOpen(true); });
    if (closeBtn) closeBtn.addEventListener('click', function () { setOpen(false); });
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        state.history = [];
        state.lastTopic = null;
        saveSession();
        renderMessages();
      });
    }
    if (form && input) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        sendMessage(input.value);
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && state.isOpen) {
        setOpen(false);
      }
    });
  });
})();
