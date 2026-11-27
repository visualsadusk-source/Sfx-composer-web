/**
 * js/swipe-gallery.js
 * Premium Animated Interactive Walkthrough for SFX Composer Gallery.
 * Synchronizes horizontal swipe/drag/arrow/dot/keyboard navigation with
 * the dynamic feature explanation panel below the carousel.
 */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    var track = document.getElementById('sfx-swipe-track');
    if (!track) return;

    var slides = Array.prototype.slice.call(track.querySelectorAll('.sfx-swipe-slide'));
    var prevBtn = document.getElementById('sfx-swipe-prev');
    var nextBtn = document.getElementById('sfx-swipe-next');
    var dots = Array.prototype.slice.call(document.querySelectorAll('.sfx-swipe-dot'));

    // Walkthrough Explanation Panel elements (below carousel)
    var panelEl = document.getElementById('sfx-walkthrough-panel');
    var numEl = document.getElementById('sfx-wt-num');
    var titleEl = document.getElementById('sfx-wt-title');
    var descEl = document.getElementById('sfx-wt-desc');
    var highlightsEl = document.getElementById('sfx-wt-highlights');

    if (!slides.length) return;

    var currentIndex = -1;
    var scrollRaf = null;
    var isProgrammaticScroll = false;
    var progScrollTimer = null;

    function pad2(n) {
      return n < 10 ? '0' + n : String(n);
    }

    function triggerPanelAnimation() {
      if (!panelEl) return;
      panelEl.classList.remove('is-animating');
      // Force reflow so keyframe animation replays cleanly on slide change
      void panelEl.offsetWidth;
      panelEl.classList.add('is-animating');
    }

    function updateMeta(idx, animatePanel) {
      var clamped = Math.max(0, Math.min(slides.length - 1, idx));
      var changed = clamped !== currentIndex;
      currentIndex = clamped;
      var activeSlide = slides[currentIndex];

      slides.forEach(function (s, i) {
        s.classList.toggle('is-active', i === currentIndex);
      });

      dots.forEach(function (d, i) {
        var active = i === currentIndex;
        d.classList.toggle('is-active', active);
        d.setAttribute('aria-selected', active ? 'true' : 'false');
      });

      if (prevBtn) prevBtn.disabled = currentIndex === 0;
      if (nextBtn) nextBtn.disabled = currentIndex === slides.length - 1;

      if (changed) {
        if (numEl) {
          numEl.textContent = pad2(currentIndex + 1) + ' / ' + pad2(slides.length);
        }
        if (titleEl) {
          titleEl.textContent = activeSlide.getAttribute('data-title') || '';
        }
        if (descEl) {
          descEl.textContent = activeSlide.getAttribute('data-desc') || '';
        }
        if (highlightsEl) {
          var raw = activeSlide.getAttribute('data-highlights') || '';
          var items = raw ? raw.split('|') : [];
          highlightsEl.innerHTML = '';
          items.forEach(function (label) {
            var span = document.createElement('span');
            span.className = 'sfx-wt-pill';
            span.textContent = label.trim();
            highlightsEl.appendChild(span);
          });
        }

        if (animatePanel !== false) {
          triggerPanelAnimation();
        }
      }
    }

    function goToSlide(idx) {
      var targetIdx = Math.max(0, Math.min(slides.length - 1, idx));
      var targetSlide = slides[targetIdx];
      if (!targetSlide) return;

      isProgrammaticScroll = true;
      if (progScrollTimer) clearTimeout(progScrollTimer);
      progScrollTimer = setTimeout(function () {
        isProgrammaticScroll = false;
      }, 650);

      var targetLeft = targetSlide.offsetLeft - (track.clientWidth - targetSlide.clientWidth) / 2;
      track.scrollTo({
        left: Math.max(0, targetLeft),
        behavior: 'smooth'
      });
      updateMeta(targetIdx, true);
    }

    function detectNearestSlide() {
      if (isProgrammaticScroll) return;
      var trackCenter = track.scrollLeft + track.clientWidth / 2;
      var bestIdx = 0;
      var bestDist = Infinity;

      slides.forEach(function (slide, i) {
        var slideCenter = slide.offsetLeft + slide.clientWidth / 2;
        var dist = Math.abs(slideCenter - trackCenter);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      });

      if (bestIdx !== currentIndex) {
        updateMeta(bestIdx, true);
      }
    }

    track.addEventListener('scroll', function () {
      if (scrollRaf) cancelAnimationFrame(scrollRaf);
      scrollRaf = requestAnimationFrame(detectNearestSlide);
    }, { passive: true });

    if (prevBtn) {
      prevBtn.addEventListener('click', function () {
        goToSlide(currentIndex - 1);
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        goToSlide(currentIndex + 1);
      });
    }

    dots.forEach(function (dot, i) {
      dot.addEventListener('click', function () {
        goToSlide(i);
      });
    });

    var lbModal = document.getElementById('sfx-lightbox-modal');
    var lbImg = document.getElementById('sfx-lightbox-img');
    var lbTitle = document.getElementById('sfx-lightbox-title');
    var lbDesc = document.getElementById('sfx-lightbox-desc');
    var lbCounter = document.getElementById('sfx-lightbox-counter');
    var lbClose = document.getElementById('sfx-lightbox-close');
    var lbPrev = document.getElementById('sfx-lightbox-prev');
    var lbNext = document.getElementById('sfx-lightbox-next');
    var lbIndex = 0;

    function renderFullscreenView(idx) {
      lbIndex = ((idx % slides.length) + slides.length) % slides.length;
      var slide = slides[lbIndex];
      var slideImg = slide ? slide.querySelector('img') : null;
      if (lbImg && slideImg) {
        lbImg.src = slideImg.getAttribute('src') || '';
        lbImg.alt = slide.getAttribute('data-title') || slideImg.alt || '';
      }
      if (lbTitle) lbTitle.textContent = (slide && slide.getAttribute('data-title')) || '';
      if (lbDesc) lbDesc.textContent = (slide && slide.getAttribute('data-desc')) || '';
      if (lbCounter) lbCounter.textContent = 'Screenshot ' + (lbIndex + 1) + ' of ' + slides.length;
    }

    function openFullscreenView(idx) {
      if (!lbModal) return;
      renderFullscreenView(typeof idx === 'number' ? idx : currentIndex);
      lbModal.classList.add('is-open');
      document.body.style.overflow = 'hidden';
    }

    function closeFullscreenView() {
      if (!lbModal) return;
      lbModal.classList.remove('is-open');
      document.body.style.overflow = '';
    }

    window.openFullscreenView = openFullscreenView;

    if (lbClose) lbClose.addEventListener('click', closeFullscreenView);
    if (lbPrev) lbPrev.addEventListener('click', function (e) { e.stopPropagation(); renderFullscreenView(lbIndex - 1); });
    if (lbNext) lbNext.addEventListener('click', function (e) { e.stopPropagation(); renderFullscreenView(lbIndex + 1); });
    if (lbModal) {
      lbModal.addEventListener('click', function (e) {
        if (e.target === lbModal || e.target.classList.contains('sfx-lightbox-stage')) {
          closeFullscreenView();
        }
      });
    }

    document.addEventListener('keydown', function (e) {
      if (lbModal && lbModal.classList.contains('is-open')) {
        if (e.key === 'Escape') {
          closeFullscreenView();
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          renderFullscreenView(lbIndex - 1);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          renderFullscreenView(lbIndex + 1);
        }
        return;
      }
      var activeTag = document.activeElement && document.activeElement.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToSlide(currentIndex - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goToSlide(currentIndex + 1);
      }
    });

    // Desktop Mouse Drag with natural snap
    var isDragging = false;
    var dragStartX = 0;
    var dragStartScroll = 0;
    var movedPx = 0;

    track.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      isDragging = true;
      movedPx = 0;
      dragStartX = e.clientX;
      dragStartScroll = track.scrollLeft;
      track.classList.add('is-dragging');
    });

    window.addEventListener('mousemove', function (e) {
      if (!isDragging) return;
      var dx = e.clientX - dragStartX;
      movedPx = Math.abs(dx);
      track.scrollLeft = dragStartScroll - dx;
    });

    function endDrag() {
      if (!isDragging) return;
      isDragging = false;
      track.classList.remove('is-dragging');
      if (movedPx > 12) {
        detectNearestSlide();
        goToSlide(currentIndex);
      }
    }

    window.addEventListener('mouseup', endDrag);
    track.addEventListener('mouseleave', endDrag);

    track.querySelectorAll('img').forEach(function (img, idx) {
      img.setAttribute('draggable', 'false');
      img.style.cursor = 'zoom-in';
      img.addEventListener('click', function () {
        if (movedPx > 6) return;
        if (typeof window.openFullscreenView === 'function') {
          window.openFullscreenView(idx);
        }
      });
    });

    updateMeta(0, false);
  });
})();
