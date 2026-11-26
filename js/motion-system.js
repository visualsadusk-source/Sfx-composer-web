/**
 * SFX Composer — Audio-Production Motion & Navigation System
 * GPU-friendly (transform/opacity), pauses off-screen, respects prefers-reduced-motion.
 */
(function () {
  'use strict';

  var prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.addEventListener('DOMContentLoaded', function () {
    initAmbientAtmosphere();
    initNavigationTransitionEngine();
    initHeroSoundAwakening();
    initDemoAudioAtmosphere();
    initPluginEntrance();
    initStaggeredReveals();
    initActiveNavSync();
    initGalleryTilt();
  });

  // ── 1. OVERVIEW: SOUND AWAKENING WAVEFORM CANVAS ──
  function initHeroSoundAwakening() {
    var canvas = document.getElementById('ew-hero-waves');
    if (!canvas || prefersReduced) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var hero = canvas.closest('.ew-hero') || canvas.parentElement;
    var isRunning = false;
    var rafId = null;
    var startTime = performance.now();

    var particles = [];
    for (var i = 0; i < 28; i++) {
      particles.push({
        x: Math.random(),
        y: Math.random(),
        r: 1 + Math.random() * 1.6,
        vx: (Math.random() - 0.5) * 0.012,
        vy: -0.008 - Math.random() * 0.015,
        a: 0.16 + Math.random() * 0.28,
        phase: Math.random() * Math.PI * 2
      });
    }

    function resize() {
      if (!hero) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = hero.clientWidth || window.innerWidth;
      var h = hero.clientHeight || 680;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw(now) {
      if (!isRunning) return;
      var t = (now - startTime) / 1000;
      var w = hero.clientWidth || window.innerWidth;
      var h = hero.clientHeight || 680;
      var baseY = Math.min(h * 0.42, 340);

      ctx.clearRect(0, 0, w, h);

      var waves = [
        { amp: 28, freq: 0.0055, spd: 1.5, color: 'rgba(10, 132, 255, 0.34)', lw: 2.0, dy: 0 },
        { amp: 18, freq: 0.0085, spd: 2.1, color: 'rgba(56, 189, 248, 0.24)', lw: 1.4, dy: 6 },
        { amp: 12, freq: 0.012, spd: 1.2, color: 'rgba(53, 234, 134, 0.14)', lw: 1.0, dy: -6 }
      ];

      for (var k = 0; k < waves.length; k++) {
        var wv = waves[k];
        ctx.beginPath();
        ctx.strokeStyle = wv.color;
        ctx.lineWidth = wv.lw;
        for (var x = 0; x <= w; x += 14) {
          var env = Math.sin((x / w) * Math.PI);
          var y = baseY + wv.dy + Math.sin(x * wv.freq + t * wv.spd) * wv.amp * env;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      for (var j = 0; j < particles.length; j++) {
        var p = particles[j];
        var px = ((p.x + p.vx * t) % 1 + 1) % 1 * w;
        var py = ((p.y + p.vy * t) % 1 + 1) % 1 * h;
        var pulse = 0.65 + 0.35 * Math.sin(t * 2 + p.phase);
        ctx.fillStyle = 'rgba(126, 200, 255, ' + (p.a * pulse).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(px, py, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      rafId = requestAnimationFrame(draw);
    }

    function start() {
      if (isRunning) return;
      isRunning = true;
      resize();
      rafId = requestAnimationFrame(draw);
    }

    function stop() {
      isRunning = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
    }

    window.addEventListener('resize', resize, { passive: true });
    if ('IntersectionObserver' in window && hero) {
      var obs = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) start();
        else stop();
      }, { threshold: 0.02 });
      obs.observe(hero);
    } else {
      start();
    }
  }

  // ── 2. STAGGERED SECTION & CARD REVEALS (Never gets stuck) ──
  function initStaggeredReveals() {
    var targets = document.querySelectorAll(
      '.ew-reveal, .ew-feature-card, .sfx-folder-card, .sfx-screenshot-card, .sfx-demo-showcase-shell, .sfx-carousel-wrap, .sfx-carousel-thumb, .sfx-thumb-btn'
    );
    if (!targets.length) return;

    if (prefersReduced || !('IntersectionObserver' in window)) {
      targets.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }

    targets.forEach(function (el, idx) {
      if (!el.classList.contains('ew-reveal')) {
        el.classList.add('ew-motion-item');
      }
      var delay = (idx % 6) * 45;
      el.style.transitionDelay = delay + 'ms';
    });

    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          obs.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -24px 0px', threshold: 0.04 });

    targets.forEach(function (el) { obs.observe(el); });

    function revealAllVisibleOrTargeted(targetEl) {
      var vh = window.innerHeight || 900;
      if (targetEl) {
        if (targetEl.classList.contains('ew-reveal') || targetEl.classList.contains('ew-motion-item')) {
          targetEl.classList.add('is-visible');
        }
        targetEl.querySelectorAll('.ew-reveal, .ew-motion-item').forEach(function (child) {
          child.classList.add('is-visible');
        });
      }
      targets.forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.top < vh + 120) {
          el.classList.add('is-visible');
        }
      });
    }

    document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
      anchor.addEventListener('click', function () {
        var id = (anchor.getAttribute('href') || '').slice(1);
        var targetEl = id ? document.getElementById(id) : null;
        revealAllVisibleOrTargeted(targetEl);
      });
    });

    window.addEventListener('scroll', function () { revealAllVisibleOrTargeted(null); }, { passive: true });
    window.addEventListener('hashchange', function () {
      var id = (window.location.hash || '').slice(1);
      setTimeout(function () { revealAllVisibleOrTargeted(id ? document.getElementById(id) : null); }, 100);
    });
    window.addEventListener('popstate', function () {
      setTimeout(function () { revealAllVisibleOrTargeted(null); }, 100);
    });

    // Safety net: ensure nothing stays hidden after initial load
    setTimeout(function () { revealAllVisibleOrTargeted(null); }, 150);
  }

  // ── 3. ACTIVE NAVIGATION SYNC ON SCROLL ──
  function initActiveNavSync() {
    var links = Array.from(document.querySelectorAll('.ew-nav-links .ew-nav-link[href^="#"]'));
    if (!links.length) return;

    var pairs = links.map(function (link) {
      var id = link.getAttribute('href').slice(1);
      return { link: link, el: document.getElementById(id) };
    }).filter(function (p) { return !!p.el; });

    if (!pairs.length) return;

    function updateActive() {
      var scrollY = window.scrollY + 140;
      var current = null;
      for (var i = 0; i < pairs.length; i++) {
        if (pairs[i].el.offsetTop <= scrollY) current = pairs[i];
      }
      links.forEach(function (l) { l.classList.remove('is-active'); });
      if (current) current.link.classList.add('is-active');
    }

    window.addEventListener('scroll', updateActive, { passive: true });
    updateActive();
  }

  // ── 4. GLOBAL NAVIGATION TRANSITION ENGINE ──
  function initNavigationTransitionEngine() {
    var isTransitioning = false;
    var routeLabels = {
      overview: 'Overview \u2022 Sound Awakening',
      demo: 'Live Demo \u2022 Studio in Action',
      library: '7GB Library \u2022 Infinite Sound',
      gallery: 'Studio Gallery \u2022 Visual Exploration'
    };

    function getPageKey(pathname) {
      var clean = (pathname || '/').split('?')[0].split('#')[0].toLowerCase();
      if (clean === '/' || clean === '' || clean.endsWith('/index.html') || clean === 'index.html') return 'overview';
      if (clean.endsWith('/demo.html') || clean === 'demo.html') return 'demo';
      if (clean.endsWith('/library.html') || clean === 'library.html') return 'library';
      if (clean.endsWith('/screenshots.html') || clean === 'screenshots.html') return 'gallery';
      return null;
    }

    var currentKey = getPageKey(window.location.pathname);

    function clearTransitionState() {
      isTransitioning = false;
      document.body.classList.remove('ew-is-exiting');
      var overlay = document.getElementById('ew-transition-overlay');
      if (overlay) overlay.classList.remove('is-active');
    }

    function ensureOverlay() {
      var existing = document.getElementById('ew-transition-overlay');
      if (existing) return existing;

      var overlay = document.createElement('div');
      overlay.id = 'ew-transition-overlay';
      overlay.setAttribute('aria-hidden', 'true');
      overlay.innerHTML =
        '<div class="ew-trans-stage">' +
          '<div class="ew-trans-ring"></div>' +
          '<div class="ew-trans-ring ew-trans-ring-inner"></div>' +
          '<div class="ew-trans-logo-wrap">' +
            '<img src="assets/brand/sfx-brand-mark-squircle.png" alt="SFX Composer">' +
          '</div>' +
        '</div>' +
        '<div class="ew-trans-meta">' +
          '<div class="ew-trans-label"></div>' +
          '<div class="ew-trans-bars"><span></span><span></span><span></span><span></span><span></span></div>' +
        '</div>';
      document.body.appendChild(overlay);
      return overlay;
    }

    function applyArrivalAnimation() {
      clearTransitionState();
      if (prefersReduced || !currentKey) return;
      try {
        var raw = sessionStorage.getItem('sfx_nav_transition');
        if (!raw) return;
        sessionStorage.removeItem('sfx_nav_transition');
        var data = JSON.parse(raw);
        if (!data || data.to !== currentKey) return;
        if (typeof data.ts === 'number' && Date.now() - data.ts > 4500) return;

        var enterClass = 'ew-enter-' + currentKey;
        document.body.classList.add(enterClass);
        setTimeout(function () {
          document.body.classList.remove(enterClass);
        }, 760);
      } catch (e) {
        // Ignore storage errors
      }
    }

    applyArrivalAnimation();
    window.addEventListener('pageshow', clearTransitionState);

    if (prefersReduced) return;

    document.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      var anchor = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!anchor) return;
      if (anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return;

      var rawHref = anchor.getAttribute('href') || '';
      if (!rawHref || rawHref.charAt(0) === '#' || rawHref.indexOf('mailto:') === 0 || rawHref.indexOf('tel:') === 0 || rawHref.indexOf('javascript:') === 0) return;

      var url;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch (err) {
        return;
      }
      if (url.origin !== window.location.origin) return;

      var destKey = getPageKey(url.pathname);
      if (!destKey || destKey === currentKey) return;

      e.preventDefault();
      if (isTransitioning) return;
      isTransitioning = true;

      var pills = document.querySelectorAll('.ew-page-switcher .ew-switch-pill');
      pills.forEach(function (pill) {
        var pillKey = getPageKey(new URL(pill.href, window.location.href).pathname);
        pill.classList.toggle('is-active', pillKey === destKey);
      });

      try {
        sessionStorage.setItem('sfx_nav_transition', JSON.stringify({
          from: currentKey || 'unknown',
          to: destKey,
          ts: Date.now()
        }));
      } catch (err2) {
        // Ignore storage errors
      }

      var overlay = ensureOverlay();
      overlay.setAttribute('data-from', currentKey || 'unknown');
      overlay.setAttribute('data-dest', destKey);
      var labelEl = overlay.querySelector('.ew-trans-label');
      if (labelEl) labelEl.textContent = routeLabels[destKey] || 'Loading';

      document.body.classList.add('ew-is-exiting');
      overlay.classList.add('is-active');

      setTimeout(function () {
        window.location.href = anchor.href;
      }, 420);

      setTimeout(clearTransitionState, 1800);
    });
  }

  // ── 5. STUDIO GALLERY: SUBTLE 3D TILT MICRO-INTERACTION ──
  function initGalleryTilt() {
    if (prefersReduced) return;
    if (!window.matchMedia || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    var cards = document.querySelectorAll('.sfx-screenshot-card');
    if (!cards.length) return;

    cards.forEach(function (card) {
      card.addEventListener('mousemove', function (e) {
        var rect = card.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        var x = (e.clientX - rect.left) / rect.width - 0.5;
        var y = (e.clientY - rect.top) / rect.height - 0.5;
        var rotateY = (x * 6).toFixed(2);
        var rotateX = (-y * 5).toFixed(2);
        card.classList.add('is-tilting');
        card.style.transform = 'perspective(1000px) rotateX(' + rotateX + 'deg) rotateY(' + rotateY + 'deg) translate3d(0, -4px, 0) scale(1.008)';
      });

      card.addEventListener('mouseleave', function () {
        card.classList.remove('is-tilting');
        card.style.transform = '';
      });
    });
  }

  // ── 6. UNIFIED AMBIENT GRADIENT ORBS & ATMOSPHERE STAGE ──
  function initAmbientAtmosphere() {
    if (document.getElementById('ew-ambient-stage')) return;
    var stage = document.createElement('div');
    stage.id = 'ew-ambient-stage';
    stage.setAttribute('aria-hidden', 'true');

    var isGallery = /screenshots\.html/i.test(window.location.pathname) || !!document.querySelector('.sfx-carousel-wrap');
    stage.innerHTML =
      '<div class="ew-orb ew-orb--1"></div>' +
      '<div class="ew-orb ew-orb--2"></div>' +
      '<div class="ew-orb ew-orb--3"></div>' +
      '<div class="ew-orb ew-orb--4"></div>' +
      (isGallery ? '<div class="ew-ambient-trail"></div>' : '');

    document.body.insertBefore(stage, document.body.firstChild);
  }

  // ── 7. LIVE DEMO: AUDIO-INSPIRED WAVEFORM, PULSE RINGS & PARTICLES ──
  function initDemoAudioAtmosphere() {
    var viewport = document.querySelector('.sfx-plugin-viewport');
    if (!viewport || prefersReduced) return;
    if (document.getElementById('ew-demo-waves')) return;

    var canvas = document.createElement('canvas');
    canvas.id = 'ew-demo-waves';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(canvas, document.body.firstChild);

    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var isRunning = false;
    var rafId = null;
    var startTime = performance.now();

    var particles = [];
    for (var i = 0; i < 24; i++) {
      particles.push({
        x: Math.random(),
        y: Math.random(),
        r: 0.9 + Math.random() * 1.5,
        vx: (Math.random() - 0.5) * 0.008,
        vy: -0.005 - Math.random() * 0.01,
        a: 0.14 + Math.random() * 0.22,
        phase: Math.random() * Math.PI * 2
      });
    }

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = window.innerWidth || 1280;
      var h = window.innerHeight || 800;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw(now) {
      if (!isRunning) return;
      var t = (now - startTime) / 1000;
      var w = window.innerWidth || 1280;
      var h = window.innerHeight || 800;
      var centerY = h * 0.52;

      ctx.clearRect(0, 0, w, h);

      // Subtle concentric audio pulse rings
      for (var rIdx = 0; rIdx < 3; rIdx++) {
        var cycle = ((t * 0.14 + rIdx * 0.33) % 1);
        var radius = 120 + cycle * Math.min(w, h) * 0.45;
        var alpha = (1 - cycle) * 0.075;
        ctx.strokeStyle = 'rgba(56, 189, 248, ' + alpha.toFixed(3) + ')';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(w * 0.5, centerY, radius, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Dual ambient audio waveform trails
      var lines = [
        { amp: 22, freq: 0.0045, spd: 1.1, color: 'rgba(10, 132, 255, 0.22)', lw: 1.6, dy: -18 },
        { amp: 15, freq: 0.0072, spd: 1.55, color: 'rgba(56, 189, 248, 0.16)', lw: 1.1, dy: 18 }
      ];
      for (var k = 0; k < lines.length; k++) {
        var ln = lines[k];
        ctx.beginPath();
        ctx.strokeStyle = ln.color;
        ctx.lineWidth = ln.lw;
        for (var x = 0; x <= w; x += 18) {
          var env = Math.sin((x / w) * Math.PI);
          var y = centerY + ln.dy + Math.sin(x * ln.freq + t * ln.spd) * ln.amp * env;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Floating audio particles
      for (var j = 0; j < particles.length; j++) {
        var p = particles[j];
        var px = ((p.x + p.vx * t) % 1 + 1) % 1 * w;
        var py = ((p.y + p.vy * t) % 1 + 1) % 1 * h;
        var pulse = 0.65 + 0.35 * Math.sin(t * 1.8 + p.phase);
        ctx.fillStyle = 'rgba(126, 200, 255, ' + (p.a * pulse).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(px, py, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      rafId = requestAnimationFrame(draw);
    }

    function start() {
      if (isRunning) return;
      isRunning = true;
      resize();
      rafId = requestAnimationFrame(draw);
    }

    function stop() {
      isRunning = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
    }

    window.addEventListener('resize', resize, { passive: true });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop();
      else start();
    });
    start();
  }

  // ── 8. PLUGIN INTERFACE STAGGERED ENTRANCE CHOREOGRAPHY ──
  function initPluginEntrance() {
    var viewport = document.querySelector('.sfx-plugin-viewport');
    if (!viewport || prefersReduced) return;

    viewport.classList.add('ew-plugin-pending');

    var revealed = false;
    function revealPlugin() {
      if (revealed) return;
      revealed = true;
      requestAnimationFrame(function () {
        viewport.classList.remove('ew-plugin-pending');
      });
    }

    if ('IntersectionObserver' in window) {
      var obs = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) {
          revealPlugin();
          obs.unobserve(viewport);
        }
      }, { threshold: 0.05 });
      obs.observe(viewport);
    }

    // Guarantee reveal if already near top or after short fallback so UI is never blocked
    setTimeout(revealPlugin, 180);
  }

})();
