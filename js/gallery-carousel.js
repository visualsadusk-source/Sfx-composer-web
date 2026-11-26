/**
 * SFX Composer — Premium Interactive Carousel Gallery
 * Handles smooth sliding, touch swipe, keyboard controls,
 * thumbnail navigation, and high-res lightbox inspection.
 */
(function() {
  'use strict';

  const GALLERY_DATA = [
    {
      title: "Main Production Interface & Waveform Trimmer",
      desc: "Complete desktop workstation with waveform display, trimming, and instant auditioning.",
      src: "assets/images/sfx-overview-main.png"
    },
    {
      title: "Built-in Browser & Royalty-Free SFX Search",
      desc: "Instant access to indexed sounds and online sound libraries right inside your editing workstation.",
      src: "assets/images/sfx-browser-pixabay.png"
    },
    {
      title: "Downloads Manager & Timeline Placement",
      desc: "Track active downloads and send sounds directly to your active timeline sequence.",
      src: "assets/images/sfx-browser-downloads.png"
    },
    {
      title: "Multi-Format Audio Importer",
      desc: "Import personal audio libraries across WAV, MP3, AAC, AIFF, and FLAC formats.",
      src: "assets/images/sfx-browser-import.png"
    },
    {
      title: "AI SFX Assistant",
      desc: "Prompt-based sound suggestions powered by local and cloud AI models.",
      src: "assets/images/sfx-ai-assistant.png"
    },
    {
      title: "BGM Flow",
      desc: "Seamless background music transitions, volume ducks, and parameter curves.",
      src: "assets/images/sfx-bgm-flow-transitions.png"
    },
    {
      title: "Scene AI",
      desc: "Automated soundscape generation matched to your visual scene cuts.",
      src: "assets/images/sfx-scene-ai-timeline.png"
    },
    {
      title: "Essential Sound Studio",
      desc: "Broadcast-grade DSP rack with EQ, compression, limiter, and loudness normalization.",
      src: "assets/images/sfx-audio-tools-essential-sound.png"
    }
  ];

  function initCarousel(container) {
    if (!container) return;

    const track = container.querySelector('.sfx-carousel-track');
    const slides = container.querySelectorAll('.sfx-carousel-slide');
    const prevBtn = container.querySelector('.sfx-carousel-btn--prev');
    const nextBtn = container.querySelector('.sfx-carousel-btn--next');
    const counterEl = container.querySelector('.sfx-carousel-counter');
    const titleEl = container.querySelector('.sfx-carousel-title');
    const descEl = container.querySelector('.sfx-carousel-desc');
    const thumbsContainer = container.querySelector('.sfx-carousel-thumb-strip');
    const expandBtn = container.querySelector('.sfx-carousel-expand-btn');

    let currentIndex = 0;
    const total = GALLERY_DATA.length;

    // Build thumbnails
    if (thumbsContainer) {
      thumbsContainer.innerHTML = '';
      GALLERY_DATA.forEach((item, idx) => {
        const thumb = document.createElement('button');
        thumb.type = 'button';
        thumb.className = 'sfx-carousel-thumb' + (idx === 0 ? ' is-active' : '');
        thumb.setAttribute('aria-label', 'View ' + item.title);
        thumb.setAttribute('role', 'tab');
        thumb.setAttribute('aria-selected', idx === 0 ? 'true' : 'false');
        thumb.innerHTML = `
          <img src="${item.src}" alt="${item.title}" loading="lazy" class="sfx-carousel-thumb-img" />
          <span class="sfx-carousel-thumb-idx">0${idx + 1}</span>
        `;
        thumb.addEventListener('click', () => {
          goToSlide(idx);
        });
        thumbsContainer.appendChild(thumb);
      });
    }

    function updateSlide(index) {
      currentIndex = ((index % total) + total) % total;
      
      if (track) {
        track.style.transform = `translateX(-${currentIndex * 100}%)`;
      }

      const cur = GALLERY_DATA[currentIndex];
      if (counterEl) {
        counterEl.textContent = `0${currentIndex + 1} / 0${total}`;
      }
      if (titleEl) {
        titleEl.textContent = cur.title;
      }
      if (descEl) {
        descEl.textContent = cur.desc;
      }

      // Update thumbnails
      if (thumbsContainer) {
        const thumbs = thumbsContainer.querySelectorAll('.sfx-carousel-thumb');
        thumbs.forEach((th, i) => {
          const isActive = (i === currentIndex);
          th.classList.toggle('is-active', isActive);
          th.setAttribute('aria-selected', isActive ? 'true' : 'false');
          if (isActive) {
            th.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
          }
        });
      }
    }

    function goToSlide(index) {
      updateSlide(index);
    }

    function nextSlide() {
      updateSlide(currentIndex + 1);
    }

    function prevSlide() {
      updateSlide(currentIndex - 1);
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', (e) => {
        e.preventDefault();
        prevSlide();
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', (e) => {
        e.preventDefault();
        nextSlide();
      });
    }

    // Lightbox modal invocation
    function openFullscreenView(idx) {
      const modal = document.getElementById('sfx-lightbox-modal');
      if (modal) {
        const img = document.getElementById('sfx-lightbox-img');
        const t = document.getElementById('sfx-lightbox-title');
        const d = document.getElementById('sfx-lightbox-desc');
        const c = document.getElementById('sfx-lightbox-counter');
        const cur = GALLERY_DATA[idx];
        if (img) {
          img.src = cur.src;
          img.alt = cur.title;
        }
        if (t) t.textContent = cur.title;
        if (d) d.textContent = cur.desc;
        if (c) c.textContent = `Screenshot ${idx + 1} of ${total}`;
        modal.classList.add('is-open');
        document.body.style.overflow = 'hidden';
      }
    }

    slides.forEach((slide, idx) => {
      slide.addEventListener('click', () => {
        openFullscreenView(idx);
      });
    });

    if (expandBtn) {
      expandBtn.addEventListener('click', () => {
        openFullscreenView(currentIndex);
      });
    }

    // Keyboard navigation (Left / Right Arrow)
    document.addEventListener('keydown', (e) => {
      const modal = document.getElementById('sfx-lightbox-modal');
      if (modal && modal.classList.contains('is-open')) return;

      const rect = container.getBoundingClientRect();
      const inView = (rect.top < window.innerHeight && rect.bottom > 0);
      if (!inView) return;

      if (e.key === 'ArrowRight') {
        nextSlide();
      } else if (e.key === 'ArrowLeft') {
        prevSlide();
      }
    });

    // Mobile touch swipe gestures
    let touchStartX = 0;
    let touchStartY = 0;
    let touchEndX = 0;
    let touchEndY = 0;

    const viewport = container.querySelector('.sfx-carousel-viewport');
    if (viewport) {
      viewport.addEventListener('touchstart', (e) => {
        if (!e.changedTouches || e.changedTouches.length === 0) return;
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
      }, { passive: true });

      viewport.addEventListener('touchend', (e) => {
        if (!e.changedTouches || e.changedTouches.length === 0) return;
        touchEndX = e.changedTouches[0].screenX;
        touchEndY = e.changedTouches[0].screenY;
        const dx = touchEndX - touchStartX;
        const dy = touchEndY - touchStartY;
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 35) {
          if (dx < 0) {
            nextSlide();
          } else {
            prevSlide();
          }
        }
      }, { passive: true });
    }

    // Initial render
    updateSlide(0);
  }

  // Auto-initialize all .sfx-carousel-container on DOM ready
  function initAll() {
    document.querySelectorAll('.sfx-carousel-container').forEach(el => {
      initCarousel(el);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  window.initGalleryCarousel = initCarousel;
})();
