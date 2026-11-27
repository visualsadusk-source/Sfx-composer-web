/**
 * js/universal-explain.js
 * Persistent Animated Side Guide for SFX Composer Live Demo (/demo.html).
 * - Renders ONE stationary right-side guide panel inside .sfx-plugin-viewport
 * - Detects clicks across all modules, tabs, buttons, and settings via event delegation
 * - Shows a purpose-matched SVG/CSS animation + WHAT / WHY / HOW explanation
 * - Never executes actions, modifies settings, or interferes with plugin controls
 */
(function () {
  'use strict';

  var RULES = [
    // ── Header Modules ──
    {
      selector: '#sfx-header-menu [data-tool="browser"]',
      category: 'Module',
      name: 'Browser & Downloader',
      anim: 'browser',
      what: 'Opens the built-in sound site browser, Downloads queue, and local audio importer.',
      why: 'Lets you discover royalty-free web sounds and bring them straight into your edit.',
      how: ['Click Browse to visit sound sites.', 'Check Downloads for saved files.', 'Use Import to load local WAV/MP3 assets.']
    },
    {
      selector: '#sfx-header-menu [data-tool="ai"]',
      category: 'Module',
      name: 'AI SFX Assistant',
      what: 'Finds matching sound effects from your library using natural-language prompts.',
      why: 'Eliminates manual folder hunting when you know the mood or action you need.',
      how: ['Type a scene or sound prompt.', 'Click Preview on any match.', 'Click + Place to add to your timeline.']
    },
    {
      selector: '#sfx-header-menu [data-tool="bgm"]',
      category: 'Module',
      name: 'BGM Flow',
      what: 'Automates background music entrances, endings, beat syncs, and transition curves.',
      why: 'Creates smooth musical transitions around dialogue without manual keyframes.',
      how: ['Pick a transition mode tab.', 'Adjust Fade Duration and Target Volume.', 'Click Audition Transition to preview.']
    },
    {
      selector: '#sfx-header-menu [data-tool="analytics"]',
      category: 'Module',
      name: 'Analytics',
      what: 'Tracks your sound previews, timeline imports, and most-used categories locally.',
      why: 'Helps you spot your go-to sound effects and revisit top clips quickly.',
      how: ['Filter by 7, 30, or 90 days.', 'Inspect the Activity Overview graph.', 'Replay or insert from Most Used Sounds.']
    },
    {
      selector: '#sfx-header-menu [data-tool="scene"]',
      category: 'Module',
      name: 'Scene AI',
      what: 'Plans multi-track soundscape cues matched to cuts in your active sequence.',
      why: 'Accelerates initial sound-design blocking for multi-cut scenes.',
      how: ['Enter a scene description or analyze cuts.', 'Review suggested audio placements.', 'Apply cues to your timeline tracks.']
    },
    {
      selector: '#sfx-header-menu [data-tool="audio"]',
      category: 'Module',
      name: 'Audio Tools & Essential Sound',
      what: '3-column waveform studio with Essential Sound presets and DSP controls.',
      why: 'Lets you inspect peaks, normalize loudness, and shape EQ/fades before export.',
      how: ['Select a clip on the left.', 'Inspect the large waveform in the center.', 'Tune Essential Sound controls on the right.']
    },
    {
      selector: '#sfx-btn-profile',
      category: 'Profile & Settings',
      name: 'Profile & Global Settings',
      what: 'Opens Studio Settings for your profile name, accent color, and theme.',
      why: 'Tailors the plugin interface contrast and branding to your editing setup.',
      how: ['Click your profile badge.', 'Adjust name, accent, or theme.', 'Click Done to return to your workspace.']
    },
    {
      selector: '#sfx-brand-home',
      category: 'Navigation',
      name: 'SFX Composer Home',
      what: 'Returns directly to the main SFX Library workspace.',
      why: 'Gives you an instant exit from any open tool overlay.',
      how: ['Click the SFX Composer logo anytime.', 'Continue browsing or trimming sounds.']
    },
    {
      selector: '.sfx-tool-back-btn',
      category: 'Navigation',
      name: 'Back to SFX Library',
      what: 'Closes the active tool overlay and restores the main SFX Library.',
      why: 'Keeps your current sound selection and trim tray intact.',
      how: ['Click ← Back at the top-left of any module.']
    },

    // ── BGM Flow Specific Modes & Controls ──
    {
      selector: '.sfx-bf__mode-btn[data-bgm-mode="start"]',
      category: 'BGM Flow',
      name: 'Music Start',
      anim: 'music-start',
      what: 'Configures where and how background music enters your sequence.',
      why: 'Prevents abrupt music starts by ramping cleanly up to your target level.',
      how: ['Select Music Start.', 'Choose a start style (e.g. Smooth Fade In).', 'Set Fade Duration and apply to your clip.']
    },
    {
      selector: '.sfx-bf__mode-btn[data-bgm-mode="end"]',
      category: 'BGM Flow',
      name: 'Music End',
      anim: 'music-end',
      what: 'Selects how background music resolves and fades out at the end of a scene.',
      why: 'Ensures music tails out naturally instead of cutting off mid-phrase.',
      how: ['Select Music End.', 'Choose a fade-out curve.', 'Click Apply to Selected Clip.']
    },
    {
      selector: '.sfx-bf__mode-btn[data-bgm-mode="change"]',
      category: 'BGM Flow',
      name: 'Music Change',
      anim: 'fade',
      what: 'Shapes cross-transitions between two different music cues.',
      why: 'Keeps energy shifts smooth when switching tracks between scenes.',
      how: ['Select Music Change.', 'Set crossfade duration and curve.', 'Audition before applying.']
    },
    {
      selector: '.sfx-bf__mode-btn[data-bgm-mode="beat"], .sfx-bf__mode-btn[data-bgm-mode="sync"]',
      category: 'BGM Flow',
      name: 'Beat Segment & Sync',
      anim: 'beat-sync',
      what: 'Aligns music transitions and edit points to detected beat segments.',
      why: 'Makes cuts and drops land cleanly on musical downbeats.',
      how: ['Select Beat Sync.', 'Preview detected beat segments.', 'Apply to snap your transition to the beat.']
    },
    {
      selector: '.sfx-bf__mode-btn',
      category: 'BGM Flow',
      name: 'BGM Transition Mode',
      anim: 'bgm-params',
      what: 'Switches between Music Start, End, Change, Beat Sync, and Auto EQ modes.',
      why: 'Adapts transition curves and EQ behavior to each edit point.',
      how: ['Click a mode tab.', 'Pick a style card below.', 'Tune Fade Duration and Target Volume.']
    },
    {
      selector: '#sfx-bgm-flow select, #sfx-bgm-flow input[type="range"]',
      category: 'BGM Flow',
      name: 'Fade & Transition Parameters',
      anim: 'fade',
      what: 'Adjusts fade duration, target volume (dB), and curve shape (S-curve, Exponential, Linear).',
      why: 'Gives precise control over how gradually volume rises or decays.',
      how: ['Drag Fade Duration or Target Volume.', 'Choose a fade curve button.', 'Click Audition Transition to hear it.']
    },

    // ── Browser & Downloader Controls ──
    {
      selector: '.sfx-br-tab-btn[data-tab="browse"]',
      category: 'Browser',
      name: 'Browse Audio Sites',
      anim: 'browser',
      what: 'Displays the built-in Chromium browser for royalty-free SFX sites.',
      why: 'Lets you search and audition online sound libraries inside the plugin.',
      how: ['Paste a site URL or pick a pinned site.', 'Click Go to load.', 'Download any cleared sound asset.']
    },
    {
      selector: '.sfx-br-tab-btn[data-tab="downloads"]',
      category: 'Downloader',
      name: 'Downloads Manager',
      anim: 'downloads',
      what: 'Tracks downloaded sound files and provides one-click timeline placement.',
      why: 'Keeps web downloads organized instead of buried in OS folders.',
      how: ['Click Downloads.', 'Inspect saved files.', 'Import directly to your active timeline.']
    },
    {
      selector: '.sfx-br-tab-btn[data-tab="import"]',
      category: 'Browser',
      name: 'Audio File Importer',
      anim: 'downloads',
      what: 'Imports WAV, MP3, AIFF, M4A, AAC, or FLAC files from disk.',
      why: 'Brings external recordings and downloads into your searchable SFX library.',
      how: ['Click Choose audio file.', 'Preview any recent file.', 'Import into your library or timeline.']
    },

    // ── Sidebar, Collections & Favorites ──
    {
      selector: '.sfx-cat[data-cat="favorites"], .sfx-star',
      category: 'Favorites',
      name: 'Favorites',
      anim: 'favorites',
      what: 'Stars sounds or filters the list to your saved Favorites.',
      why: 'Keeps your most-used risers, impacts, and UI clicks one click away.',
      how: ['Click ☆ on any row to star it.', 'Click Favorites in the sidebar to filter.']
    },
    {
      selector: '.sfx-cat',
      category: 'Collections',
      name: 'Folders & Collections',
      anim: 'collections',
      what: 'Filters the sound library to the selected folder or custom collection.',
      why: 'Narrows 18,000+ sounds to the exact category you are designing.',
      how: ['Click any folder in the sidebar.', 'Browse or search within that category.']
    },

    // ── Main Library & Trimmer ──
    {
      selector: '#sfx-main-search',
      category: 'SFX Library',
      name: 'Instant Sound Search',
      anim: 'search',
      what: 'Filters the sound library in real time by filename or category keyword.',
      why: 'Finds specific effects in milliseconds without expanding nested folders.',
      how: ['Click the search bar.', 'Type keywords like "whoosh" or "click".', 'Preview matching results below.']
    },
    {
      selector: '#sfx-view-list, #sfx-view-grid',
      category: 'SFX Library',
      name: 'List / Grid View Toggle',
      anim: 'collections',
      what: 'Switches between compact waveform rows and visual card previews.',
      why: 'Lets you pick high-density scanning or larger card layouts.',
      how: ['Click List or Grid to toggle the layout.']
    },
    {
      selector: '.sfx-row-play-btn',
      category: 'Playback',
      name: 'Instant Audio Preview',
      anim: 'playback',
      what: 'Auditions the sound effect immediately inside the library list.',
      why: 'Lets you compare multiple takes before trimming or importing.',
      how: ['Click ▶ to play.', 'Click again to stop playback.']
    },
    {
      selector: '.sfx-row__wave, .sfx-row-wave-canvas',
      category: 'Soundwave',
      name: 'Waveform Thumbnail',
      anim: 'waveform',
      what: 'Shows a compact electric-blue amplitude preview of the sound.',
      why: 'Reveals attack transient, body, and tail length at a glance.',
      how: ['Scan thumbnails to spot punchy hits vs long swells.', 'Click the trim icon to open in the trimmer.']
    },
    {
      selector: '.sfx-btn-row-trim',
      category: 'Audio Trim',
      name: 'Open in Waveform Trimmer',
      anim: 'trim',
      what: 'Loads the selected sound into the docked Waveform Trimmer.',
      why: 'Lets you isolate the exact segment you want before placing it.',
      how: ['Click the trim icon on a row.', 'Drag In/Out markers in the bottom tray.']
    },
    {
      selector: '.sfx-btn-row-insert',
      category: 'Timeline',
      name: 'Quick Add to Timeline',
      anim: 'timeline-import',
      what: 'Places the sound effect straight onto your active editing track.',
      why: 'Saves time when a sound does not need custom trimming.',
      how: ['Click the insert button on any row.', 'Check your active Premiere/AE track.']
    },
    {
      selector: '#sfx-trim-play-btn',
      category: 'Audio Trim',
      name: 'Play Trimmed Selection',
      anim: 'playback',
      what: 'Plays the active sound inside the trimmer and animates the playhead.',
      why: 'Verifies your In/Out trim points before importing to the timeline.',
      how: ['Click ▶ or press Space to audition the trimmed range.']
    },
    {
      selector: '#sfx-trim-canvas, #sfx-trim-track',
      category: 'Audio Trim',
      name: 'Waveform Trimmer & Seek',
      anim: 'trim',
      what: 'Interactive blue waveform stage with played/unplayed split and trim range.',
      why: 'Lets you scrub to exact transients and trim out unwanted silence.',
      how: ['Click anywhere on the waveform to seek.', 'Drag In/Out markers or press I / O.']
    },
    {
      selector: '#sfx-trim-reset-btn',
      category: 'Audio Trim',
      name: 'Reset Trim Markers',
      anim: 'trim',
      what: 'Resets In and Out markers back to the full clip duration.',
      why: 'Quickly clears custom trim points so you can start fresh.',
      how: ['Click Reset to restore the full waveform selection.']
    },
    {
      selector: '#sfx-trim-import-btn',
      category: 'Timeline',
      name: 'Add to Timeline',
      anim: 'timeline-import',
      what: 'Sends the trimmed audio clip to your active Adobe sequence track.',
      why: 'Delivers frame-accurate, pre-trimmed SFX directly at the playhead.',
      how: ['Trim your selection above.', 'Click Add to timeline to place it.']
    },
    {
      selector: '#sfx-trim-close',
      category: 'Audio Trim',
      name: 'Close Trimmer Tray',
      anim: 'trim',
      what: 'Hides the bottom Waveform Trimmer tray.',
      why: 'Frees vertical space when browsing long sound lists.',
      how: ['Click ✕ to collapse; click any row trim button to reopen.']
    },

    // ── AI SFX Controls ──
    {
      selector: '#sfx-ai-textarea, #sfx-ai-send-btn',
      category: 'AI SFX',
      name: 'AI SFX Prompt & Search',
      anim: 'ai-sfx',
      what: 'Accepts natural-language descriptions to match sounds in your library.',
      why: 'Translates creative direction into ready-to-preview sound candidates.',
      how: ['Describe the sound you want.', 'Click Send.', 'Preview or + Place any returned match.']
    },

    // ── Audio Tools & Essential Sound Controls ──
    {
      selector: '#at-center-waveform',
      category: 'Audio Tools',
      name: 'Large Studio Waveform',
      anim: 'waveform',
      what: 'High-resolution waveform display showing real audio peaks and trim range.',
      why: 'Gives clear visual feedback for gain, fades, and transient inspection.',
      how: ['Select a sound on the left.', 'Inspect peaks and trim range in the center.']
    },
    {
      selector: '#sfx-audio-tools .sfx-au__es button, #sfx-audio-tools .sfx-au__es input',
      category: 'Essential Sound',
      name: 'Essential Sound DSP Rack',
      anim: 'essential-sound',
      what: 'Applies category presets (Music, SFX, Dialogue, Ambience) and DSP processing.',
      why: 'Shapes loudness, EQ, and fades without leaving SFX Composer.',
      how: ['Choose an audio category.', 'Adjust Gain, Normalize, Fades, or EQ controls.']
    },

    // ── Analytics Controls ──
    {
      selector: '#an-chart-canvas',
      category: 'Analytics',
      name: 'Activity Overview Chart',
      anim: 'analytics',
      what: 'Plots sound previews and timeline imports across your editing sessions.',
      why: 'Visualizes usage trends and your most productive workflows.',
      how: ['Hover or switch date range pills above to compare activity.']
    },

    // ── Global Settings Controls ──
    {
      selector: '#sfx-settings-drawer input, #sfx-settings-drawer span[style*="border-radius: 50%"], #sfx-settings-drawer [style*="grid-template-columns"] > div',
      category: 'Global Settings',
      name: 'Studio Appearance & Profile',
      anim: 'settings',
      what: 'Customizes your studio profile name, accent color, and dark contrast theme.',
      why: 'Keeps the plugin visually aligned with your editing environment.',
      how: ['Update your name, accent swatch, or theme card.', 'Click Done to save and return.']
    },
    {
      selector: '#btn-close-settings',
      category: 'Global Settings',
      name: 'Done (Close Settings)',
      anim: 'settings',
      what: 'Closes Studio Settings and returns to your active workspace.',
      why: 'Preserves your open module or library state underneath.',
      how: ['Click Done after reviewing your preferences.']
    },

    // ── Status Bar ──
    {
      selector: '.sfx-statusbar',
      category: 'Host Status',
      name: 'Sequence Status Bar',
      anim: 'timeline-import',
      what: 'Displays the connected sequence name, playhead timecode, and frame rate.',
      why: 'Confirms which active timeline receives your imported sound effects.',
      how: ['Verify the green dot before clicking Add to timeline.']
    },

    // ── Module Container Fallbacks ──
    {
      selector: '#sfx-browser',
      category: 'Module',
      name: 'Browser & Downloader',
      anim: 'browser',
      what: 'Built-in web browser, Downloads manager, and audio file importer.',
      why: 'Centralizes external sound discovery and local file ingestion.',
      how: ['Use Browse, Downloads, or Import tabs at the top-right.']
    },
    {
      selector: '#sfx-ai-assistant',
      category: 'Module',
      name: 'AI SFX Assistant',
      anim: 'ai-sfx',
      what: 'Natural-language sound discovery backed by your SFX library.',
      why: 'Speeds up finding context-matched audio cues.',
      how: ['Enter a prompt below and preview or place suggested clips.']
    },
    {
      selector: '#sfx-bgm-flow',
      category: 'Module',
      name: 'BGM Flow',
      anim: 'bgm-params',
      what: 'Background music transition designer with presets, fades, and beat sync.',
      why: 'Shapes clean musical intros, exits, and transitions under dialogue.',
      how: ['Pick a mode tab and adjust transition sliders below.']
    },
    {
      selector: '#sfx-analytics',
      category: 'Module',
      name: 'Analytics',
      anim: 'analytics',
      what: 'Local usage metrics for sound previews, timeline imports, and favorites.',
      why: 'Helps you revisit your most-used sound effects.',
      how: ['Switch timeframes or replay top sounds from the table.']
    },
    {
      selector: '#sfx-audio-tools',
      category: 'Module',
      name: 'Audio Tools & Essential Sound',
      anim: 'essential-sound',
      what: '3-column waveform studio and Essential Sound DSP rack.',
      why: 'Fine-tunes clip levels, fades, and EQ before timeline placement.',
      how: ['Select a clip on the left and adjust DSP on the right.']
    },
    {
      selector: '#sfx-scene-designer',
      category: 'Module',
      name: 'Scene AI',
      anim: 'scene-ai',
      what: 'Sequence-aware soundscape planner for multi-track timeline cues.',
      why: 'Accelerates sound design across multi-cut scenes.',
      how: ['Analyze your composition or enter a scene prompt.']
    },
    {
      selector: '#sfx-settings-drawer',
      category: 'Global Settings',
      name: 'Global Settings',
      anim: 'settings',
      what: 'Workspace preferences for profile, accent color, and theme.',
      why: 'Keeps the interface tailored to your studio preferences.',
      how: ['Adjust any preference and click Done.']
    },
    {
      selector: '#sfx-vlist-container',
      category: 'SFX Library',
      name: 'Main SFX Library',
      anim: 'waveform',
      what: 'Scrollable list of categorized sound effects with waveform thumbnails.',
      why: 'Lets you audition, favorite, trim, and insert sounds from one view.',
      how: ['Click ▶ to preview.', 'Click the trim icon to open the Waveform Trimmer.']
    }
  ];

  var DEFAULT_ITEM = {
    category: 'Interactive Guide',
    name: 'Click Any Control to Learn',
    anim: 'waveform',
    what: 'This persistent side guide explains any SFX Composer module, button, or setting you click.',
    why: 'Helps you explore real workflows without leaving or interrupting your edit.',
    how: ['Click any top module tab (Browser, AI SFX, BGM Flow, Analytics, Audio Tools).', 'Or click any search bar, folder, waveform, or button.']
  };

  var NEUTRAL_UNKNOWN = {
    category: 'Unidentified Area',
    name: 'Select a Control',
    anim: 'neutral',
    what: 'No specific control was identified at that click location.',
    why: 'The guide only explains recognized SFX Composer controls to stay accurate.',
    how: ['Click a module tab, button, slider, or list control to inspect how it works.']
  };

  var panel = null;
  var contentWrap = null;
  var boundShell = null;

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function renderVisualSvg(anim) {
    switch (anim) {
      case 'music-start':
        return '<svg viewBox="0 0 240 76">' +
          '<rect x="10" y="16" width="220" height="44" rx="4" fill="#080b12" stroke="#1d2638"/>' +
          '<line x1="10" y1="38" x2="230" y2="38" stroke="#182235" stroke-width="1"/>' +
          '<path class="sfx-sg-anim-draw" d="M 38 54 Q 78 52 108 24 L 220 24" fill="none" stroke="#38bdf8" stroke-width="2.2"/>' +
          '<g class="sfx-sg-anim-slide">' +
            '<line x1="38" y1="12" x2="38" y2="64" stroke="#0a84ff" stroke-width="2"/>' +
            '<circle cx="38" cy="14" r="3.5" fill="#7ec8ff"/>' +
          '</g>' +
          '<text x="16" y="13" fill="#7ec8ff" font-size="8" font-family="sans-serif">START RAMP</text>' +
        '</svg>';

      case 'music-end':
        return '<svg viewBox="0 0 240 76">' +
          '<rect x="10" y="16" width="220" height="44" rx="4" fill="#080b12" stroke="#1d2638"/>' +
          '<path class="sfx-sg-anim-draw" d="M 20 24 L 132 24 Q 168 52 202 54" fill="none" stroke="#38bdf8" stroke-width="2.2"/>' +
          '<g class="sfx-sg-anim-slide">' +
            '<line x1="202" y1="12" x2="202" y2="64" stroke="#0a84ff" stroke-width="2"/>' +
            '<circle cx="202" cy="14" r="3.5" fill="#7ec8ff"/>' +
          '</g>' +
          '<text x="156" y="13" fill="#7ec8ff" font-size="8" font-family="sans-serif">TAIL OUT</text>' +
        '</svg>';

      case 'beat-sync':
        return '<svg viewBox="0 0 240 76">' +
          '<rect x="10" y="16" width="220" height="44" rx="4" fill="#080b12" stroke="#1d2638"/>' +
          '<rect class="sfx-sg-anim-beat" x="42" y="22" width="4" height="32" rx="2" fill="#0a84ff" style="animation-delay:0s"/>' +
          '<rect class="sfx-sg-anim-beat" x="86" y="26" width="4" height="24" rx="2" fill="#38bdf8" style="animation-delay:0.25s"/>' +
          '<rect class="sfx-sg-anim-beat" x="130" y="20" width="4" height="36" rx="2" fill="#0a84ff" style="animation-delay:0.5s"/>' +
          '<rect class="sfx-sg-anim-beat" x="174" y="26" width="4" height="24" rx="2" fill="#38bdf8" style="animation-delay:0.75s"/>' +
          '<line class="sfx-sg-anim-sweep" x1="28" y1="14" x2="28" y2="62" stroke="#7ec8ff" stroke-width="1.5"/>' +
        '</svg>';

      case 'fade':
      case 'bgm-params':
        return '<svg viewBox="0 0 240 76">' +
          '<rect x="10" y="14" width="220" height="48" rx="4" fill="#080b12" stroke="#1d2638"/>' +
          '<path class="sfx-sg-anim-draw" d="M 20 56 C 55 56, 65 22, 105 22 L 155 22 C 185 22, 195 56, 220 56" fill="none" stroke="#0a84ff" stroke-width="2.4"/>' +
          '<circle cx="105" cy="22" r="3.5" fill="#7ec8ff"/>' +
          '<circle cx="155" cy="22" r="3.5" fill="#7ec8ff"/>' +
        '</svg>';

      case 'trim':
        return '<svg viewBox="0 0 240 76">' +
          '<rect x="10" y="14" width="220" height="48" rx="4" fill="#080b12" stroke="#1d2638"/>' +
          '<rect x="64" y="14" width="112" height="48" fill="rgba(10,132,255,0.12)"/>' +
          '<rect x="34" y="30" width="4" height="16" rx="1.5" fill="#334155"/>' +
          '<rect x="48" y="26" width="4" height="24" rx="1.5" fill="#334155"/>' +
          '<rect x="74" y="20" width="4" height="36" rx="1.5" fill="#0a84ff"/>' +
          '<rect x="90" y="18" width="4" height="40" rx="1.5" fill="#38bdf8"/>' +
          '<rect x="106" y="24" width="4" height="28" rx="1.5" fill="#0a84ff"/>' +
          '<rect x="122" y="18" width="4" height="40" rx="1.5" fill="#7ec8ff"/>' +
          '<rect x="138" y="22" width="4" height="32" rx="1.5" fill="#0a84ff"/>' +
          '<rect x="154" y="26" width="4" height="24" rx="1.5" fill="#38bdf8"/>' +
          '<rect x="190" y="28" width="4" height="20" rx="1.5" fill="#334155"/>' +
          '<line class="sfx-sg-anim-trim-l" x1="56" y1="12" x2="56" y2="64" stroke="#7ec8ff" stroke-width="2"/>' +
          '<line class="sfx-sg-anim-trim-r" x1="184" y1="12" x2="184" y2="64" stroke="#7ec8ff" stroke-width="2"/>' +
        '</svg>';

      case 'timeline-import':
        return '<svg viewBox="0 0 240 76">' +
          '<rect x="12" y="42" width="216" height="22" rx="4" fill="#080b12" stroke="#1d2638"/>' +
          '<text x="18" y="56" fill="#64748b" font-size="8.5" font-family="monospace">A1</text>' +
          '<g class="sfx-sg-anim-slide">' +
            '<rect x="48" y="45" width="96" height="16" rx="3" fill="#0a84ff"/>' +
            '<text x="64" y="56" fill="#ffffff" font-size="8" font-family="sans-serif">SFX CLIP</text>' +
          '</g>' +
          '<line x1="48" y1="10" x2="48" y2="68" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="3 2"/>' +
        '</svg>';

      case 'analytics':
        return '<svg viewBox="0 0 240 76">' +
          '<rect x="10" y="12" width="220" height="52" rx="4" fill="#080b12" stroke="#1d2638"/>' +
          '<polyline class="sfx-sg-anim-draw" points="22,52 62,48 102,42 142,24 182,36 216,20" fill="none" stroke="#0a84ff" stroke-width="2.4"/>' +
          '<circle cx="142" cy="24" r="3.5" fill="#7ec8ff"/>' +
          '<circle cx="216" cy="20" r="3.5" fill="#38bdf8"/>' +
        '</svg>';

      case 'browser':
      case 'downloads':
        return '<svg viewBox="0 0 240 76">' +
          '<rect x="14" y="12" width="212" height="52" rx="5" fill="#080b12" stroke="#1d2638"/>' +
          '<rect x="22" y="18" width="148" height="12" rx="3" fill="#121622" stroke="#232a3b"/>' +
          '<rect x="176" y="18" width="40" height="12" rx="3" fill="#0a84ff"/>' +
          '<rect x="22" y="38" width="194" height="8" rx="3" fill="#141926"/>' +
          '<rect class="sfx-sg-anim-sweep" x="22" y="50" width="38" height="6" rx="3" fill="#38bdf8"/>' +
        '</svg>';

      case 'ai-sfx':
      case 'scene-ai':
        return '<svg viewBox="0 0 240 76">' +
          '<rect x="14" y="12" width="212" height="16" rx="4" fill="#101522" stroke="#0a84ff"/>' +
          '<rect class="sfx-sg-anim-beat" x="22" y="34" width="196" height="12" rx="3" fill="#0b101b" stroke="#1e293b"/>' +
          '<rect class="sfx-sg-anim-beat" x="22" y="50" width="196" height="12" rx="3" fill="#0b101b" stroke="#1e293b" style="animation-delay:0.3s"/>' +
          '<rect x="174" y="36" width="38" height="8" rx="2" fill="#0a84ff"/>' +
          '<rect x="174" y="52" width="38" height="8" rx="2" fill="#0a84ff"/>' +
        '</svg>';

      case 'essential-sound':
        return '<svg viewBox="0 0 240 76">' +
          '<rect x="14" y="12" width="46" height="14" rx="3" fill="#111520" stroke="#232838"/>' +
          '<rect x="66" y="12" width="46" height="14" rx="3" fill="#0a84ff"/>' +
          '<rect x="118" y="12" width="50" height="14" rx="3" fill="#111520" stroke="#232838"/>' +
          '<rect x="174" y="12" width="52" height="14" rx="3" fill="#111520" stroke="#232838"/>' +
          '<rect class="sfx-sg-anim-bar" x="32" y="34" width="8" height="28" rx="3" fill="#38bdf8"/>' +
          '<rect class="sfx-sg-anim-bar" x="56" y="38" width="8" height="24" rx="3" fill="#0a84ff" style="animation-delay:0.2s"/>' +
          '<rect class="sfx-sg-anim-bar" x="80" y="32" width="8" height="30" rx="3" fill="#7ec8ff" style="animation-delay:0.4s"/>' +
          '<rect class="sfx-sg-anim-bar" x="104" y="40" width="8" height="22" rx="3" fill="#0a84ff" style="animation-delay:0.6s"/>' +
          '<line x1="132" y1="42" x2="220" y2="42" stroke="#1e293b" stroke-width="3" stroke-linecap="round"/>' +
          '<circle cx="176" cy="42" r="4" fill="#0a84ff"/>' +
          '<line x1="132" y1="56" x2="220" y2="56" stroke="#1e293b" stroke-width="3" stroke-linecap="round"/>' +
          '<circle cx="194" cy="56" r="4" fill="#38bdf8"/>' +
        '</svg>';

      case 'search':
        return '<svg viewBox="0 0 240 76">' +
          '<rect x="18" y="14" width="204" height="18" rx="4" fill="#0d111a" stroke="#0a84ff"/>' +
          '<circle cx="30" cy="23" r="4" fill="none" stroke="#7ec8ff" stroke-width="1.5"/>' +
          '<rect x="18" y="38" width="204" height="10" rx="3" fill="#101828"/>' +
          '<rect class="sfx-sg-anim-beat" x="18" y="52" width="160" height="10" rx="3" fill="#0d1422"/>' +
        '</svg>';

      case 'favorites':
      case 'collections':
      case 'settings':
        return '<svg viewBox="0 0 240 76">' +
          '<rect x="14" y="14" width="66" height="48" rx="4" fill="#080b12" stroke="#1d2638"/>' +
          '<rect x="20" y="22" width="54" height="10" rx="2" fill="rgba(10,132,255,0.22)" stroke="#0a84ff"/>' +
          '<rect x="20" y="36" width="54" height="8" rx="2" fill="#131824"/>' +
          '<rect x="90" y="14" width="136" height="48" rx="4" fill="#080b12" stroke="#1d2638"/>' +
          '<circle class="sfx-sg-anim-beat" cx="112" cy="38" r="7" fill="#0a84ff"/>' +
          '<circle cx="136" cy="38" r="7" fill="#a855f7"/>' +
          '<circle cx="160" cy="38" r="7" fill="#38bdf8"/>' +
          '<circle cx="184" cy="38" r="7" fill="#22c55e"/>' +
        '</svg>';

      case 'neutral':
        return '<svg viewBox="0 0 240 76">' +
          '<rect x="14" y="14" width="212" height="48" rx="4" fill="#07090e" stroke="#1b202c"/>' +
          '<circle cx="120" cy="38" r="12" fill="none" stroke="#334155" stroke-width="1.8"/>' +
          '<text x="117" y="42" fill="#64748b" font-size="11" font-family="sans-serif">?</text>' +
        '</svg>';

      case 'playback':
      case 'waveform':
      default:
        return '<svg viewBox="0 0 240 76">' +
          '<rect x="10" y="14" width="220" height="48" rx="4" fill="#080b12" stroke="#1d2638"/>' +
          '<rect class="sfx-sg-anim-bar" x="30" y="30" width="4" height="16" rx="2" fill="#38bdf8"/>' +
          '<rect class="sfx-sg-anim-bar" x="44" y="24" width="4" height="28" rx="2" fill="#0a84ff" style="animation-delay:0.15s"/>' +
          '<rect class="sfx-sg-anim-bar" x="58" y="20" width="4" height="36" rx="2" fill="#7ec8ff" style="animation-delay:0.3s"/>' +
          '<rect class="sfx-sg-anim-bar" x="72" y="26" width="4" height="24" rx="2" fill="#0a84ff" style="animation-delay:0.45s"/>' +
          '<rect class="sfx-sg-anim-bar" x="86" y="18" width="4" height="40" rx="2" fill="#38bdf8" style="animation-delay:0.6s"/>' +
          '<rect class="sfx-sg-anim-bar" x="100" y="24" width="4" height="28" rx="2" fill="#0a84ff" style="animation-delay:0.75s"/>' +
          '<rect class="sfx-sg-anim-bar" x="114" y="28" width="4" height="20" rx="2" fill="#38bdf8" style="animation-delay:0.2s"/>' +
          '<rect class="sfx-sg-anim-bar" x="128" y="22" width="4" height="32" rx="2" fill="#7ec8ff" style="animation-delay:0.35s"/>' +
          '<rect class="sfx-sg-anim-bar" x="142" y="28" width="4" height="20" rx="2" fill="#0a84ff" style="animation-delay:0.5s"/>' +
          '<rect class="sfx-sg-anim-bar" x="156" y="24" width="4" height="28" rx="2" fill="#38bdf8" style="animation-delay:0.65s"/>' +
          '<rect class="sfx-sg-anim-bar" x="170" y="30" width="4" height="16" rx="2" fill="#0a84ff" style="animation-delay:0.4s"/>' +
          '<rect class="sfx-sg-anim-bar" x="184" y="32" width="4" height="12" rx="2" fill="#38bdf8" style="animation-delay:0.1s"/>' +
          '<line class="sfx-sg-anim-sweep" x1="24" y1="14" x2="24" y2="62" stroke="#7ec8ff" stroke-width="1.5"/>' +
        '</svg>';
    }
  }

  function resolveRule(target) {
    if (!target || !target.closest) return NEUTRAL_UNKNOWN;
    for (var i = 0; i < RULES.length; i++) {
      if (target.closest(RULES[i].selector)) {
        return RULES[i];
      }
    }
    return NEUTRAL_UNKNOWN;
  }

  function renderContent(item) {
    if (!contentWrap) return;
    var stepsHtml = (item.how || []).map(function (step) {
      return '<li>' + escapeHtml(step) + '</li>';
    }).join('');

    contentWrap.classList.remove('is-updating');
    void contentWrap.offsetWidth;
    contentWrap.innerHTML =
      '<div>' +
        '<span class="sfx-side-guide__category">' + escapeHtml(item.category) + '</span>' +
        '<h4 class="sfx-side-guide__title">' + escapeHtml(item.name) + '</h4>' +
      '</div>' +
      '<div class="sfx-sg-visual" aria-hidden="true">' + renderVisualSvg(item.anim) + '</div>' +
      '<div class="sfx-side-guide__sections">' +
        '<div class="sfx-side-guide__sec">' +
          '<div class="sfx-side-guide__sec-label">WHAT</div>' +
          '<p class="sfx-side-guide__sec-text">' + escapeHtml(item.what) + '</p>' +
        '</div>' +
        '<div class="sfx-side-guide__sec">' +
          '<div class="sfx-side-guide__sec-label">WHY</div>' +
          '<p class="sfx-side-guide__sec-text">' + escapeHtml(item.why) + '</p>' +
        '</div>' +
        '<div class="sfx-side-guide__sec">' +
          '<div class="sfx-side-guide__sec-label">HOW</div>' +
          '<ol class="sfx-side-guide__steps">' + stepsHtml + '</ol>' +
        '</div>' +
      '</div>';
    contentWrap.classList.add('is-updating');
  }

  function toggleCollapse(forceCollapsed) {
    if (!panel) return;
    var collapsed = typeof forceCollapsed === 'boolean' ? forceCollapsed : !panel.classList.contains('is-collapsed');
    panel.classList.toggle('is-collapsed', collapsed);
    var btn = panel.querySelector('.sfx-side-guide__toggle');
    if (btn) {
      btn.textContent = collapsed ? '‹' : '✕';
      btn.setAttribute('aria-label', collapsed ? 'Open Guide' : 'Minimize Guide');
      btn.setAttribute('title', collapsed ? 'Reopen Interactive Guide' : 'Minimize Guide');
    }
  }

  function init() {
    var viewport = document.querySelector('#live-plugin-demo .sfx-plugin-viewport');
    var shell = document.querySelector('#live-plugin-demo .sfx-shell');
    if (!viewport || !shell || document.getElementById('sfx-side-guide')) return;

    panel = document.createElement('aside');
    panel.id = 'sfx-side-guide';
    panel.className = 'sfx-side-guide';
    panel.setAttribute('aria-label', 'Interactive Feature Guide');

    panel.innerHTML =
      '<div class="sfx-side-guide__header">' +
        '<div class="sfx-side-guide__brand">' +
          '<span class="sfx-side-guide__dot"></span>' +
          '<span class="sfx-side-guide__brand-label">Feature Guide</span>' +
        '</div>' +
        '<button type="button" class="sfx-side-guide__toggle" aria-label="Minimize Guide" title="Minimize Guide">✕</button>' +
        '<span class="sfx-side-guide__reopen-rail">Open Guide</span>' +
      '</div>' +
      '<div class="sfx-side-guide__body">' +
        '<div class="sfx-side-guide__content" id="sfx-side-guide-content"></div>' +
      '</div>' +
      '<div class="sfx-side-guide__footer">Click any control in the workspace to inspect it.</div>';

    viewport.appendChild(panel);
    contentWrap = document.getElementById('sfx-side-guide-content');

    var toggleBtn = panel.querySelector('.sfx-side-guide__toggle');
    var rail = panel.querySelector('.sfx-side-guide__reopen-rail');
    if (toggleBtn) toggleBtn.addEventListener('click', function () { toggleCollapse(); });
    if (rail) rail.addEventListener('click', function () { toggleCollapse(false); });

    renderContent(DEFAULT_ITEM);

    if (boundShell !== shell) {
      boundShell = shell;
      shell.addEventListener('click', function (e) {
        var item = resolveRule(e.target);
        renderContent(item);
      }, true);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
