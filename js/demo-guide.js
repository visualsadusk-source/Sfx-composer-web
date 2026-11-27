/**
 * js/demo-guide.js
 * Floating AI Product Guide for SFX Composer Live Demo (/demo.html)
 * - 100% local, predefined contextual guide system (no paid external AI API)
 * - Contextual spotlight, smart positioning, guided tour + explore mode
 */
(function () {
  'use strict';

  var STEPS = [
    {
      id: 'browser',
      selector: '#sfx-header-menu [data-tool="browser"]',
      title: 'Built-in Asset Browser',
      text: 'Explore and access your sound effects without leaving your editing workflow.'
    },
    {
      id: 'library',
      selector: '#sfx-vlist-container',
      title: 'Sound Effects Library',
      text: 'Discover and browse sound effects from your organized sound library.'
    },
    {
      id: 'preview',
      selector: '.sfx-row-play-btn',
      title: 'Instant Audio Preview',
      text: 'Preview sounds instantly before adding them to your project.'
    },
    {
      id: 'waveform',
      selector: '.sfx-row__wave',
      title: 'Waveform Editor',
      text: 'Visualize your audio and identify the exact moment you need.'
    },
    {
      id: 'trimmer',
      selector: '#sfx-trim-tray',
      title: 'Precision Trimming',
      text: 'Select and trim the exact audio segment you need.'
    },
    {
      id: 'downloads',
      selector: '#sfx-header-menu [data-tool="browser"]',
      title: 'Download Manager',
      text: 'Track and manage your downloaded sound assets in one place.'
    },
    {
      id: 'timeline',
      selector: '#sfx-trim-import-btn',
      title: 'One-Click Timeline Import',
      text: 'Bring your selected sound effect directly into your editing timeline.'
    }
  ];

  var state = {
    mode: 'welcome', // 'welcome' | 'tour' | 'explore' | 'closed'
    stepIndex: 0
  };

  var launcher, spotlight, bubble;

  function createEl(tag, className, html) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (html !== undefined) el.innerHTML = html;
    return el;
  }

  function getTargetEl(step) {
    if (!step) return null;
    if (step.id === 'trimmer') {
      var tray = document.getElementById('sfx-trim-tray');
      if (tray && tray.style.display === 'none') {
        tray.style.display = 'flex';
        tray.style.flexDirection = 'column';
      }
      return tray;
    }
    return document.querySelector('#live-plugin-demo ' + step.selector) || document.querySelector(step.selector);
  }

  function positionSpotlightAndBubble(target) {
    if (!target || window.innerWidth <= 680) {
      if (target) {
        var mr = target.getBoundingClientRect();
        if (mr.width > 0 && mr.height > 0) {
          spotlight.style.top = Math.max(4, mr.top - 4) + 'px';
          spotlight.style.left = Math.max(4, mr.left - 4) + 'px';
          spotlight.style.width = (mr.width + 8) + 'px';
          spotlight.style.height = (mr.height + 8) + 'px';
          spotlight.classList.add('is-visible');
        }
      } else {
        spotlight.classList.remove('is-visible');
      }
      return;
    }

    var rect = target.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      spotlight.classList.remove('is-visible');
      return;
    }

    var pad = 4;
    spotlight.style.top = (rect.top - pad) + 'px';
    spotlight.style.left = (rect.left - pad) + 'px';
    spotlight.style.width = (rect.width + pad * 2) + 'px';
    spotlight.style.height = (rect.height + pad * 2) + 'px';
    spotlight.classList.add('is-visible');

    var bw = bubble.offsetWidth || 312;
    var bh = bubble.offsetHeight || 170;
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var margin = 14;

    var top = rect.bottom + margin;
    var left = rect.left;

    // Prefer above if bottom overflows
    if (top + bh > vh - margin) {
      top = rect.top - bh - margin;
    }
    // If still out of bounds vertically, place beside target
    if (top < margin) {
      top = Math.max(margin, Math.min(vh - bh - margin, rect.top));
      if (rect.right + bw + margin < vw) {
        left = rect.right + margin;
      } else if (rect.left - bw - margin > 0) {
        left = rect.left - bw - margin;
      }
    }

    left = Math.max(margin, Math.min(vw - bw - margin, left));
    top = Math.max(margin, Math.min(vh - bh - margin, top));

    bubble.style.top = top + 'px';
    bubble.style.left = left + 'px';
    bubble.style.right = 'auto';
    bubble.style.bottom = 'auto';
  }

  function renderBubble() {
    if (state.mode === 'closed') {
      bubble.classList.remove('is-visible');
      spotlight.classList.remove('is-visible');
      return;
    }

    if (state.mode === 'welcome') {
      spotlight.classList.remove('is-visible');
      bubble.innerHTML =
        '<div class="sfx-guide-bubble__head">' +
          '<span class="sfx-guide-bubble__badge"><span class="sfx-guide-launcher__dot"></span> AI Product Guide</span>' +
          '<button type="button" class="sfx-guide-bubble__close" data-action="close" aria-label="Close guide">✕</button>' +
        '</div>' +
        '<h4 class="sfx-guide-bubble__title">SFX Composer Walkthrough</h4>' +
        '<p class="sfx-guide-bubble__text">Welcome to SFX Composer. Let me show you how your sound workflow works.</p>' +
        '<div class="sfx-guide-bubble__actions">' +
          '<button type="button" class="sfx-guide-btn sfx-guide-btn--primary" data-action="start">Start Guided Tour</button>' +
          '<button type="button" class="sfx-guide-btn" data-action="explore">Explore Myself</button>' +
        '</div>';

      bubble.style.right = '20px';
      bubble.style.left = 'auto';
      bubble.style.top = '76px';
      bubble.style.bottom = 'auto';
      bubble.classList.add('is-visible');
      return;
    }

    var step = STEPS[state.stepIndex] || STEPS[0];
    var target = getTargetEl(step);

    if (target && typeof target.scrollIntoView === 'function') {
      var r = target.getBoundingClientRect();
      if (r.top < 70 || r.bottom > window.innerHeight - 70) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }

    bubble.innerHTML =
      '<div class="sfx-guide-bubble__head">' +
        '<span class="sfx-guide-bubble__badge"><span class="sfx-guide-launcher__dot"></span> Step ' + (state.stepIndex + 1) + ' of ' + STEPS.length + '</span>' +
        '<button type="button" class="sfx-guide-bubble__close" data-action="close" aria-label="Close guide">✕</button>' +
      '</div>' +
      '<h4 class="sfx-guide-bubble__title">' + step.title + '</h4>' +
      '<p class="sfx-guide-bubble__text">' + step.text + '</p>' +
      '<div class="sfx-guide-bubble__actions">' +
        '<div style="display:flex; gap:6px;">' +
          '<button type="button" class="sfx-guide-btn" data-action="prev"' + (state.stepIndex === 0 ? ' disabled' : '') + '>Previous</button>' +
          '<button type="button" class="sfx-guide-btn sfx-guide-btn--primary" data-action="next">' +
            (state.stepIndex === STEPS.length - 1 ? 'Finish' : 'Next') +
          '</button>' +
        '</div>' +
        '<button type="button" class="sfx-guide-btn" data-action="restart">Restart Tour</button>' +
      '</div>';

    bubble.classList.add('is-visible');
    requestAnimationFrame(function () {
      positionSpotlightAndBubble(target);
    });
  }

  function handleBubbleClick(e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.getAttribute('data-action');
    if (action === 'close') {
      state.mode = 'closed';
    } else if (action === 'start' || action === 'restart') {
      state.mode = 'tour';
      state.stepIndex = 0;
    } else if (action === 'explore') {
      state.mode = 'explore';
      spotlight.classList.remove('is-visible');
      bubble.classList.remove('is-visible');
      return;
    } else if (action === 'prev' && state.stepIndex > 0) {
      state.stepIndex--;
    } else if (action === 'next') {
      if (state.stepIndex < STEPS.length - 1) {
        state.stepIndex++;
      } else {
        state.mode = 'closed';
      }
    }
    renderBubble();
  }

  function bindContextualClicks() {
    var demoRoot = document.getElementById('live-plugin-demo');
    if (!demoRoot) return;

    demoRoot.addEventListener('click', function (e) {
      if (state.mode !== 'explore' && state.mode !== 'tour') return;
      for (var i = 0; i < STEPS.length; i++) {
        var match = e.target.closest(STEPS[i].selector);
        if (match) {
          state.mode = 'tour';
          state.stepIndex = i;
          renderBubble();
          break;
        }
      }
    }, true);
  }

  function init() {
    if (!document.getElementById('live-plugin-demo')) return;

    launcher = createEl(
      'button',
      'sfx-guide-launcher',
      '<span class="sfx-guide-launcher__dot"></span><span>AI Guide</span>'
    );
    launcher.type = 'button';
    launcher.id = 'sfx-guide-launcher';
    launcher.setAttribute('aria-label', 'Open SFX Composer AI Product Guide');

    spotlight = createEl('div', 'sfx-guide-spotlight');
    spotlight.id = 'sfx-guide-spotlight';

    bubble = createEl('div', 'sfx-guide-bubble');
    bubble.id = 'sfx-guide-bubble';
    bubble.setAttribute('role', 'dialog');
    bubble.setAttribute('aria-label', 'SFX Composer Product Guide');

    document.body.appendChild(spotlight);
    document.body.appendChild(bubble);
    document.body.appendChild(launcher);

    bubble.addEventListener('click', handleBubbleClick);
    launcher.addEventListener('click', function () {
      if (state.mode === 'closed' || state.mode === 'explore') {
        state.mode = 'welcome';
      } else {
        state.mode = 'closed';
      }
      renderBubble();
    });

    window.addEventListener('resize', function () {
      if (state.mode === 'tour') {
        positionSpotlightAndBubble(getTargetEl(STEPS[state.stepIndex]));
      }
    });
    window.addEventListener('scroll', function () {
      if (state.mode === 'tour') {
        positionSpotlightAndBubble(getTargetEl(STEPS[state.stepIndex]));
      }
    }, { passive: true });

    bindContextualClicks();
    renderBubble();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
