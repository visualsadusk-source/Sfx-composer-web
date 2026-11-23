/**
 * SFX Composer — Main Website Controller
 * Scrollspy Left Nav, Hero Animated Waveform, Interactive Modals,
 * Pricing License Toggle, Checkout Preview, Video Gallery, and FAQ Accordion.
 */

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    setupLeftNav();
    setupHeroWaveform();
    setupVideoGallery();
    setupPricingAndCheckout();
    setupCustomerDashboard();
    setupFaqAccordion();
    setupSmoothScrollButtons();
    setupFolderExplorer();
    setupLibraryDownloadForm();
  });

  // ── 1. FIXED LEFT VERTICAL NAVIGATION & MOBILE DRAWER ──
  function setupLeftNav() {
    var navLinks = document.querySelectorAll('.sfx-site-nav-link, .sfx-nav-link');
    var sections = document.querySelectorAll('section[id]');
    var mobileToggle = document.getElementById('mobile-nav-toggle') || document.getElementById('sfx-site-hamburger');
    var navSidebar = document.getElementById('sfx-left-nav');
    var navOverlay = document.getElementById('sfx-nav-overlay');

    // Mobile drawer toggle
    if (mobileToggle && navSidebar && navOverlay) {
      function toggleMobileNav() {
        navSidebar.classList.toggle('is-open');
        navOverlay.classList.toggle('is-open');
        mobileToggle.setAttribute('aria-expanded', navSidebar.classList.contains('is-open'));
      }

      mobileToggle.addEventListener('click', toggleMobileNav);
      navOverlay.addEventListener('click', toggleMobileNav);

      // Close on nav link click in mobile
      navLinks.forEach(function (link) {
        link.addEventListener('click', function () {
          if (window.innerWidth <= 1024) {
            navSidebar.classList.remove('is-open');
            navOverlay.classList.remove('is-open');
          }
        });
      });
    }

    // Scrollspy using IntersectionObserver
    if ('IntersectionObserver' in window) {
      var observerOptions = {
        root: null,
        rootMargin: '-20% 0px -60% 0px',
        threshold: 0
      };

      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var id = entry.target.getAttribute('id');
            navLinks.forEach(function (link) {
              var href = link.getAttribute('href');
              if (href === '#' + id || href === 'index.html#' + id) {
                link.classList.add('is-active');
              } else if (href && (href.startsWith('#') || href.startsWith('index.html#'))) {
                link.classList.remove('is-active');
              }
            });
          }
        });
      }, observerOptions);

      sections.forEach(function (sec) {
        observer.observe(sec);
      });
    }
  }

  // ── 2. HERO ANIMATED NEON WAVEFORM ──
  function setupHeroWaveform() {
    var canvas = document.getElementById('hero-waveform-canvas');
    if (!canvas) return;

    var ctx = canvas.getContext('2d');
    var width = 0;
    var height = 0;
    var mouseX = -1;
    var mouseY = -1;

    function resize() {
      var rect = canvas.getBoundingClientRect();
      width = canvas.width = rect.width * (window.devicePixelRatio || 1);
      height = canvas.height = rect.height * (window.devicePixelRatio || 1);
    }
    resize();
    window.addEventListener('resize', resize);

    canvas.addEventListener('mousemove', function (e) {
      var rect = canvas.getBoundingClientRect();
      mouseX = (e.clientX - rect.left) * (window.devicePixelRatio || 1);
      mouseY = (e.clientY - rect.top) * (window.devicePixelRatio || 1);
    });

    canvas.addEventListener('mouseleave', function () {
      mouseX = -1;
      mouseY = -1;
    });

    var time = 0;
    function renderWave() {
      time += 0.025;
      ctx.clearRect(0, 0, width, height);

      var lines = 3;
      var numPoints = 80;
      var step = width / numPoints;

      for (var l = 0; l < lines; l++) {
        ctx.beginPath();
        var baseAlpha = l === 0 ? 1.0 : (l === 1 ? 0.35 : 0.18);

        // Horizontal gradient across width providing wide, soft feathered edges
        // Left fade: 0% -> 20%
        // Center: 20% -> 58% pure/strong
        // Right fade: 58% -> 100% wide gradual dissolve into black background
        var grad = ctx.createLinearGradient(0, 0, width, 0);
        grad.addColorStop(0.0, 'rgba(255, 255, 255, 0)');
        grad.addColorStop(0.10, 'rgba(255, 255, 255, ' + (baseAlpha * 0.5) + ')');
        grad.addColorStop(0.20, 'rgba(255, 255, 255, ' + baseAlpha + ')');
        grad.addColorStop(0.58, 'rgba(255, 255, 255, ' + baseAlpha + ')');
        grad.addColorStop(0.75, 'rgba(255, 255, 255, ' + (baseAlpha * 0.55) + ')');
        grad.addColorStop(0.88, 'rgba(255, 255, 255, ' + (baseAlpha * 0.2) + ')');
        grad.addColorStop(1.0, 'rgba(255, 255, 255, 0)');

        ctx.strokeStyle = grad;
        ctx.lineWidth = l === 0 ? 2.2 : 1.2;

        if (l === 0) {
          ctx.shadowColor = 'rgba(255, 255, 255, 0.4)';
          ctx.shadowBlur = 4;
        } else {
          ctx.shadowBlur = 0;
        }

        var speed = (l + 1) * 0.8;
        var baseAmp = (height * 0.22) / (l * 0.5 + 1);

        for (var i = 0; i <= numPoints; i++) {
          var x = i * step;
          var normX = x / width;

          // Spatial envelope (pin ends to center)
          var env = Math.sin(normX * Math.PI);

          // Harmonic waves
          var y1 = Math.sin(normX * 12 + time * speed) * baseAmp;
          var y2 = Math.cos(normX * 24 - time * 1.2) * (baseAmp * 0.4);
          var y3 = Math.sin(normX * 6 + time * 0.5) * (baseAmp * 0.25);

          // Mouse ripple attraction
          var mouseBump = 0;
          if (mouseX >= 0) {
            var dist = Math.abs(x - mouseX);
            if (dist < 180) {
              mouseBump = Math.cos((dist / 180) * (Math.PI / 2)) * 30 * Math.sin(time * 6);
            }
          }

          var y = (height / 2) + (y1 + y2 + y3 + mouseBump) * env;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }

      ctx.shadowBlur = 0;
      requestAnimationFrame(renderWave);
    }
    requestAnimationFrame(renderWave);
  }

  // ── 3. VIDEO TUTORIAL GALLERY & MODAL ──
  async function setupVideoGallery() {
    var modal = document.getElementById('tutorial-video-modal');
    var modalTitle = document.getElementById('tvm-title');
    var modalDesc = document.getElementById('tvm-desc');
    var modalClose = document.getElementById('tvm-close');
    var modalBackdrop = document.getElementById('tvm-backdrop');
    var playerWrapper = document.getElementById('tvm-player-wrapper');
    var gridContainer = document.getElementById('tutorials-grid-container');

    var secKicker = document.getElementById('tutorials-sec-kicker');
    var secTitle = document.getElementById('tutorials-sec-title');
    var secDesc = document.getElementById('tutorials-sec-desc');

    function openVideoModal(video) {
      if (!video) return;
      if (modalTitle) modalTitle.textContent = video.title || 'SFX Composer Tutorial';
      if (modalDesc) modalDesc.textContent = video.description || '';

      if (playerWrapper) {
        var ytId = video.youtube_id || (window.SFX_CONTENT_SERVICE ? window.SFX_CONTENT_SERVICE.extractYouTubeId(video.youtube_url) : '');
        if (ytId) {
          playerWrapper.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(ytId) + '?autoplay=1&rel=0" style="width: 100%; height: 100%; border: none;" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>';
        } else {
          playerWrapper.innerHTML = '<div style="color: var(--sfx-text-muted); font-size: 13px;">Video link unavailable.</div>';
        }
      }

      if (modal) modal.classList.add('is-open');
      document.body.classList.add('sfx-modal-open');
      document.body.style.overflow = 'hidden';
    }

    function closeVideoModal() {
      if (modal) modal.classList.remove('is-open');
      document.body.classList.remove('sfx-modal-open');
      document.body.style.overflow = '';
      if (playerWrapper) {
        playerWrapper.innerHTML = '';
      }
    }

    if (modalClose) modalClose.addEventListener('click', closeVideoModal);
    if (modalBackdrop) modalBackdrop.addEventListener('click', closeVideoModal);

    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal && modal.classList.contains('is-open')) {
        closeVideoModal();
      }
    });

    // Dynamically load videos & section headings from Supabase
    if (window.SFX_CONTENT_SERVICE) {
      try {
        var secData = await window.SFX_CONTENT_SERVICE.getSectionContent('tutorials');
        if (secData) {
          if (secKicker && secData.kicker) secKicker.textContent = secData.kicker;
          if (secTitle && secData.title) secTitle.textContent = secData.title;
          if (secDesc && secData.description) secDesc.textContent = secData.description;
        }
      } catch (e) {}

      try {
        var videos = await window.SFX_CONTENT_SERVICE.getPublishedVideos('tutorials');
        if (gridContainer && videos && videos.length > 0) {
          gridContainer.innerHTML = '';
          videos.forEach(function (video) {
            var card = document.createElement('div');
            card.className = 'tutorial-card';
            card.style.cursor = 'pointer';

            var thumb = video.custom_thumbnail_url || video.thumbnail_url || ('https://img.youtube.com/vi/' + video.youtube_id + '/hqdefault.jpg');
            var durationTag = video.duration ? '<span class="tutorial-tag" style="background: rgba(0,0,0,0.85); color: #fff;">' + video.duration + '</span>' : '';
            var categoryTag = video.category ? '<span style="font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--sfx-accent); font-weight: 700; display: block; margin-bottom: 4px;">' + video.category + '</span>' : '';

            card.innerHTML = 
              '<div class="tutorial-thumb" style="background-image: url(\'' + thumb + '\'); background-size: cover; background-position: center; position: relative;">' +
                '<div style="position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.6) 100%);"></div>' +
                '<div class="tutorial-play-icon"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></div>' +
                durationTag +
              '</div>' +
              '<div class="tutorial-info">' +
                categoryTag +
                '<h4 class="tutorial-title">' + (video.title || '') + '</h4>' +
                '<p class="tutorial-desc">' + (video.description || '') + '</p>' +
              '</div>';

            card.addEventListener('click', function () {
              openVideoModal(video);
            });

            gridContainer.appendChild(card);
          });
        }
      } catch (err) {
        console.error('Failed to load dynamic tutorials:', err);
      }
    }
  }

  // ── 4. PRICING SECTION & RAZORPAY CHECKOUT ──
  function setupPricingAndCheckout() {
    var modal = document.getElementById('checkout-modal');
    var modalClose = document.getElementById('checkout-close');
    var modalBackdrop = document.getElementById('checkout-backdrop');
    var buyButtons = document.querySelectorAll('.sfx-buy-trigger');
    var checkoutForm = document.getElementById('checkout-form');
    var emailInput = document.getElementById('checkout-email');
    var submitBtn = document.getElementById('checkout-submit-btn');
    var errorMsg = document.getElementById('checkout-error-msg');
    var successView = document.getElementById('checkout-success');
    var issuedKeyVal = document.getElementById('issued-license-key-val');
    var copyKeyBtn = document.getElementById('btn-copy-license-key');
    var successEmailDisp = document.getElementById('success-email-display');
    var successPayIdDisp = document.getElementById('success-payment-id-display');
    var successEmailStatusDisp = document.getElementById('success-email-status-display');
    var goToDashboardBtn = document.getElementById('btn-go-to-dashboard');

    function openCheckout(prefillEmail) {
      if (modal) {
        modal.classList.add('is-open');
        document.body.classList.add('sfx-modal-open');
        document.body.style.overflow = 'hidden';
        var tierName = document.getElementById('checkout-tier-name');
        if (tierName) {
          tierName.textContent = 'SFX Composer Ultimate Bundle';
        }
        if (emailInput && prefillEmail && typeof prefillEmail === 'string') {
          emailInput.value = prefillEmail.trim();
        }
        if (checkoutForm) checkoutForm.style.display = 'flex';
        if (successView) successView.style.display = 'none';
        if (errorMsg) errorMsg.style.display = 'none';
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg> Pay ₹199 via Razorpay';
        }
      }
    }
    window.openSFXCheckout = openCheckout;

    function closeCheckout() {
      if (modal) {
        modal.classList.remove('is-open');
        document.body.classList.remove('sfx-modal-open');
        document.body.style.overflow = '';
      }
    }

    buyButtons.forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        openCheckout();
      });
    });

    if (modalClose) modalClose.addEventListener('click', closeCheckout);
    if (modalBackdrop) modalBackdrop.addEventListener('click', closeCheckout);

    // Form submit: Call Supabase create-razorpay-order and launch Razorpay Standard Checkout
    if (checkoutForm) {
      checkoutForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        var email = emailInput.value.trim().toLowerCase();
        if (!email || !email.includes('@')) {
          if (errorMsg) {
            errorMsg.textContent = 'Please enter a valid email address.';
            errorMsg.style.display = 'block';
          }
          return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating secure Razorpay order…';
        if (errorMsg) errorMsg.style.display = 'none';

        try {
          var orderData = await window.SFX_PAYMENT_SERVICE.createOrder(email);

          if (typeof window.Razorpay !== 'function') {
            throw new Error('Razorpay Checkout SDK failed to load. Please check your internet connection.');
          }

          if (!orderData.key_id || orderData.key_id === 'rzp_test_placeholder') {
            throw new Error(orderData.message || 'Razorpay Key ID is not configured on the backend. Please configure RAZORPAY_KEY_ID in Supabase secrets.');
          }

          submitBtn.textContent = 'Opening Razorpay Checkout…';

          var options = {
            key: orderData.key_id,
            amount: orderData.amount,
            currency: orderData.currency || 'INR',
            name: 'SFX Composer',
            description: 'SFX Composer Ultimate Bundle (Software + 7GB SFX Library)',
            image: 'assets/brand/mark-128.png',
            order_id: orderData.order_id,
            prefill: {
              email: email
            },
            theme: {
              color: '#0a84ff'
            },
            handler: async function (response) {
              submitBtn.textContent = 'Verifying cryptographic signature…';
              try {
                await verifyAndDisplayPayment({
                  razorpay_order_id: response.razorpay_order_id || orderData.order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                  email: email
                });
              } catch (verErr) {
                if (errorMsg) {
                  errorMsg.textContent = 'Verification Failed: ' + verErr.message;
                  errorMsg.style.display = 'block';
                }
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg> Pay ₹199 via Razorpay';
              }
            },
            modal: {
              ondismiss: function () {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg> Pay ₹199 via Razorpay';
                if (errorMsg) {
                  errorMsg.textContent = 'Payment cancelled or dismissed. You can retry whenever you are ready.';
                  errorMsg.style.display = 'block';
                }
              }
            }
          };

          var rzp = new window.Razorpay(options);
          rzp.on('payment.failed', function (resp) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg> Pay ₹199 via Razorpay';
            if (errorMsg) {
              errorMsg.textContent = 'Payment Failed: ' + (resp.error.description || resp.error.reason || 'Transaction could not be completed.');
              errorMsg.style.display = 'block';
            }
          });
          rzp.open();
        } catch (err) {
          if (errorMsg) {
            errorMsg.textContent = 'Checkout Error: ' + err.message;
            errorMsg.style.display = 'block';
          }
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg> Pay ₹199 via Razorpay';
        }
      });
    }

    // Common payment verification & UI update
    async function verifyAndDisplayPayment(payload) {
      var result = await window.SFX_PAYMENT_SERVICE.verifyPayment(payload);

      if (checkoutForm) checkoutForm.style.display = 'none';
      if (successView) successView.style.display = 'block';

      if (issuedKeyVal) issuedKeyVal.textContent = result.license_key;
      if (successEmailDisp) successEmailDisp.textContent = result.email;
      if (successPayIdDisp) successPayIdDisp.textContent = result.payment_id;
      if (successEmailStatusDisp) {
        successEmailStatusDisp.textContent = 'Instant Website Access Active';
        successEmailStatusDisp.style.color = 'var(--sfx-positive)';
      }

      // Deliver verified download links securely post-verification
      var successZxpBtn = document.getElementById('success-download-zxp-btn');
      var successZipBtn = document.getElementById('success-download-zip-btn');
      var successDriveBtn = document.getElementById('success-sfx-library-btn');

      if (successZxpBtn && result.downloads && result.downloads.zxp_url) {
        successZxpBtn.href = result.downloads.zxp_url;
      }
      if (successZipBtn && result.downloads && result.downloads.zip_url) {
        successZipBtn.href = result.downloads.zip_url;
      }
      if (successDriveBtn && result.downloads && result.downloads.sfx_library_url) {
        successDriveBtn.href = result.downloads.sfx_library_url;
      }
    }

    // 1-Click Copy Key
    if (copyKeyBtn) {
      copyKeyBtn.addEventListener('click', function () {
        var key = issuedKeyVal.textContent;
        navigator.clipboard.writeText(key).then(function () {
          copyKeyBtn.textContent = 'Copied!';
          copyKeyBtn.style.color = 'var(--sfx-positive)';
          setTimeout(function () {
            copyKeyBtn.textContent = 'Copy Key';
            copyKeyBtn.style.color = '#fff';
          }, 2000);
        });
      });
    }

    // Navigate to Customer Dashboard
    if (goToDashboardBtn) {
      goToDashboardBtn.addEventListener('click', function () {
        closeCheckout();
        var openDashboardLink = document.getElementById('open-customer-dashboard-btn');
        if (openDashboardLink) {
          openDashboardLink.click();
        }
      });
    }

    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal && modal.classList.contains('is-open')) {
        closeCheckout();
      }
    });
  }

  // ── 5. SIMPLIFIED CUSTOMER LICENSE RETRIEVAL & MY LICENSES ──
  function setupCustomerDashboard() {
    var modal = document.getElementById('customer-dashboard-modal');
    var modalClose = document.getElementById('cdm-close');
    var modalBackdrop = document.getElementById('cdm-backdrop');
    var openBtn = document.getElementById('open-customer-dashboard-btn');

    // Views
    var authView = document.getElementById('cdm-auth-view');
    var dashboardView = document.getElementById('cdm-dashboard-view');
    var authStatus = document.getElementById('cdm-auth-status');

    // Recent session quick access banner
    var recentSessionBanner = document.getElementById('cdm-recent-session-banner');
    var recentSessionEmail = document.getElementById('cdm-recent-session-email');
    var btnInstantUnlock = document.getElementById('cdm-btn-instant-unlock');

    // Minimal Lookup Form Elements
    var lookupForm = document.getElementById('cdm-lookup-form');
    var emailInput = document.getElementById('cdm-email-input');
    var paymentInput = document.getElementById('cdm-payment-id-input');
    var proofContainer = document.getElementById('cdm-proof-container');
    var proofInput = document.getElementById('cdm-proof-input');
    var btnLookup = document.getElementById('cdm-btn-lookup');

    // Dashboard View Elements
    var authEmailDisplay = document.getElementById('cdm-auth-email-display');
    var btnSignout = document.getElementById('cdm-btn-signout');
    var statusBanner = document.getElementById('cdm-account-status-banner');
    var licensesContainer = document.getElementById('cdm-licenses-container');
    var downloadsContainer = document.getElementById('cdm-downloads-container');
    var ordersTbody = document.getElementById('cdm-orders-tbody');
    var setupGuide = document.getElementById('cdm-setup-guide');

    var currentAuthEmail = '';
    var activeCustomerSession = null;

    // ── EMAIL DELIVERABILITY & VALIDATION ENGINE ──
    function validateEmailDeliverability(rawEmail) {
      if (!rawEmail || typeof rawEmail !== 'string') {
        return { valid: false, error: 'Please enter your registered purchase email address.' };
      }

      var email = rawEmail.trim().toLowerCase();

      // 1. Minimum & Maximum Length
      if (email.length < 5 || email.length > 254) {
        return { valid: false, error: 'Email address must be between 5 and 254 characters.' };
      }

      // 2. Strict RFC 5322 regex validation
      var emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_\x60{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
      if (!emailRegex.test(email)) {
        return { valid: false, error: 'Please enter a valid email address (e.g., editor@studio.com).' };
      }

      var parts = email.split('@');
      if (parts.length !== 2) {
        return { valid: false, error: 'Email address must contain exactly one "@" symbol.' };
      }

      var user = parts[0];
      var domain = parts[1];

      // 3. Domain validation
      if (!domain.includes('.')) {
        return { valid: false, error: 'Domain must include a valid extension (e.g. .com, .org, .net).' };
      }

      if (domain.startsWith('.') || domain.endsWith('.') || domain.startsWith('-') || domain.endsWith('-')) {
        return { valid: false, error: 'Domain name contains invalid leading or trailing characters.' };
      }

      if (domain.includes('..')) {
        return { valid: false, error: 'Domain name cannot contain consecutive dots.' };
      }

      var domainParts = domain.split('.');
      var tld = domainParts[domainParts.length - 1];
      if (tld.length < 2 || !/^[a-z]+$/.test(tld)) {
        return { valid: false, error: 'Email has an invalid domain extension (.' + tld + ').' };
      }

      // 4. Common Typo Detection (prevents high-frequency accidental bounces)
      var typoMap = {
        'gnail.com': 'gmail.com',
        'gmai.com': 'gmail.com',
        'gamil.com': 'gmail.com',
        'gmial.com': 'gmail.com',
        'hotmial.com': 'hotmail.com',
        'hotmai.com': 'hotmail.com',
        'yaho.com': 'yahoo.com',
        'yahooo.com': 'yahoo.com',
        'outlok.com': 'outlook.com',
        'outloo.com': 'outlook.com',
        'icld.com': 'icloud.com'
      };
      if (typoMap[domain]) {
        return {
          valid: false,
          error: 'Did you mean ' + user + '@' + typoMap[domain] + '? Please verify your email spelling.'
        };
      }

      // 5. Block known disposable, dummy, and fabricated test domains
      var blockedDomains = [
        'example.com',
        'example.org',
        'example.net',
        'test.com',
        'tempmail.com',
        '10minutemail.com',
        'mailinator.com',
        'guerrillamail.com',
        'throwawaymail.com',
        'fake.com',
        'fakemail.com'
      ];
      if (blockedDomains.includes(domain)) {
        return {
          valid: false,
          error: 'Disposable and placeholder email domains are not allowed. Please enter your real purchase email address.'
        };
      }

      return { valid: true, email: email };
    }

    // ── RESEND COOLDOWNS & RATE LIMITING ENGINE ──
    var COOLDOWN_SECONDS = 60;
    var cooldownTimers = {};

    function getCooldownKey(action, email) {
      return 'sfx_cooldown_' + action + '_' + (email ? encodeURIComponent(email) : 'global');
    }

    function getRemainingCooldown(action, email) {
      try {
        var key = getCooldownKey(action, email);
        var lastSent = parseInt(localStorage.getItem(key) || '0', 10);
        if (!lastSent) return 0;
        var elapsed = Math.floor((Date.now() - lastSent) / 1000);
        return elapsed < COOLDOWN_SECONDS ? (COOLDOWN_SECONDS - elapsed) : 0;
      } catch (e) {
        return 0;
      }
    }

    function recordEmailSend(action, email) {
      try {
        var key = getCooldownKey(action, email);
        localStorage.setItem(key, String(Date.now()));
      } catch (e) {}
    }

    function startButtonCooldown(btnEl, defaultText, remainingSeconds, onComplete) {
      if (!btnEl) return;
      if (cooldownTimers[btnEl.id]) {
        clearInterval(cooldownTimers[btnEl.id]);
      }

      var secs = remainingSeconds;
      btnEl.disabled = true;
      btnEl.textContent = 'Retry available in ' + secs + 's';

      cooldownTimers[btnEl.id] = setInterval(function () {
        secs--;
        if (secs <= 0) {
          clearInterval(cooldownTimers[btnEl.id]);
          delete cooldownTimers[btnEl.id];
          btnEl.disabled = false;
          btnEl.textContent = defaultText;
          if (typeof onComplete === 'function') onComplete();
        } else {
          btnEl.textContent = 'Retry available in ' + secs + 's';
        }
      }, 1000);
    }

    // ── SUPABASE AUTH ERROR FORMATTER ──
    function formatAuthError(err) {
      if (!err) return 'No verified purchase was found matching these details.';
      var raw = (typeof err === 'string' ? err : err.message || err.error_description || err.msg || '');
      var msg = raw.toLowerCase();

      if (msg.includes('refunded') || msg.includes('revoked')) {
        return 'This purchase has been refunded or revoked. Access to licenses and downloads is disabled.';
      }
      if (msg.includes('failed') || msg.includes('cancelled')) {
        return 'Payment for this order was not completed. No active license found.';
      }
      if (msg.includes('pending')) {
        return 'Payment for this order is pending confirmation. Please check back shortly.';
      }
      if (msg.includes('rate limit') || msg.includes('too many requests') || (err && err.error_code === 'over_email_send_rate_limit')) {
        return 'Too many requests. Service is temporarily rate-limited. Please wait a minute before searching again.';
      }
      if (msg.includes('invalid login credentials') || msg.includes('invalid credentials')) {
        return 'Invalid email or password. If you have not created an account yet, please use Create Account.';
      }
      if (msg.includes('user already registered') || msg.includes('already exists')) {
        return 'An account already exists for this email. Please sign in or use Forgot Password.';
      }
      if (msg.includes('network') || msg.includes('fetch') || msg.includes('failed to fetch')) {
        return 'Could not connect to verification server. Please check your internet connection.';
      }
      if (msg.includes('not_paid') || msg.includes('no verified purchase') || msg.includes('forbidden') || msg.includes('access denied')) {
        return raw || 'No verified purchase was found matching these details. Please check your purchase email and Razorpay Payment ID.';
      }
      return raw || 'No verified purchase was found matching these details.';
    }

    // Expose deliverability validator globally for unit testing
    window.SFX_VALIDATE_EMAIL = validateEmailDeliverability;
    window.SFX_COOLDOWN_CHECK = getRemainingCooldown;
    window.SFX_FORMAT_AUTH_ERROR = formatAuthError;

    function setAuthStatus(msg, isSuccess) {
      if (!authStatus) return;
      if (!msg) {
        authStatus.style.display = 'none';
        return;
      }
      authStatus.style.display = 'block';
      authStatus.textContent = msg;
      authStatus.style.background = isSuccess ? 'rgba(48, 209, 88, 0.15)' : 'rgba(255, 69, 58, 0.15)';
      authStatus.style.color = isSuccess ? 'var(--sfx-positive)' : 'var(--sfx-critical)';
      authStatus.style.border = isSuccess ? '1px solid rgba(48, 209, 88, 0.3)' : '1px solid rgba(255, 69, 58, 0.3)';
    }

    function showAuthView() {
      if (authView) authView.style.display = 'block';
      if (dashboardView) dashboardView.style.display = 'none';
    }

    function showDashboardView() {
      if (authView) authView.style.display = 'none';
      if (dashboardView) dashboardView.style.display = 'flex';
    }

    async function checkCurrentSession() {
      try {
        var rawSess = localStorage.getItem('sfx_customer_session');
        if (rawSess) {
          var cached = JSON.parse(rawSess);
          if (cached && cached.email && (cached.token || cached.order_id || cached.payment_id)) {
            activeCustomerSession = cached;
            if (recentSessionBanner && recentSessionEmail) {
              recentSessionEmail.textContent = cached.email;
              recentSessionBanner.style.display = 'block';
            }
            if (emailInput && !emailInput.value) {
              emailInput.value = cached.email;
            }
            var bestPaymentRef = cached.payment_id || cached.order_id || '';
            if (paymentInput && !paymentInput.value && bestPaymentRef) {
              paymentInput.value = bestPaymentRef;
              paymentInput.dataset.autofilled = 'true';
            }
          }
        }
      } catch (e) {}

      showAuthView();
      return false;
    }

    async function openDashboard() {
      if (modal) {
        modal.classList.add('is-open');
        document.body.style.overflow = 'hidden';
        await checkCurrentSession();
      }
    }

    function closeDashboard() {
      if (modal) {
        modal.classList.remove('is-open');
        document.body.style.overflow = '';
      }
    }

    // Attach click listeners to all dashboard triggers
    var dashboardTriggers = document.querySelectorAll('.open-customer-dashboard-link, .open-customer-dashboard-trigger, #open-customer-dashboard-btn, [id^="open-customer-dashboard-footer-btn"], a[href="#customer-dashboard"]');
    dashboardTriggers.forEach(function (trigger) {
      trigger.addEventListener('click', function (e) {
        e.preventDefault();
        openDashboard();
      });
    });

    window.addEventListener('hashchange', function () {
      if (window.location.hash === '#customer-dashboard') {
        openDashboard();
      }
    });

    if (window.location.hash === '#customer-dashboard') {
      openDashboard();
    }

    if (modalClose) modalClose.addEventListener('click', closeDashboard);
    if (modalBackdrop) modalBackdrop.addEventListener('click', closeDashboard);

    // Instant unlock via recent purchase session
    if (btnInstantUnlock) {
      btnInstantUnlock.addEventListener('click', async function () {
        if (!activeCustomerSession) return;
        this.disabled = true;
        this.textContent = 'Verifying…';
        try {
          var paymentRef = activeCustomerSession.payment_id || activeCustomerSession.order_id || (paymentInput ? paymentInput.value.trim() : '');
          var portal = await window.SFX_PAYMENT_SERVICE.getCustomerPortal({
            email: activeCustomerSession.email,
            order_id: activeCustomerSession.order_id,
            payment_id: paymentRef,
            token: activeCustomerSession.token
          });
          await loadVerifiedPortalData(portal, activeCustomerSession.email);
        } catch (err) {
          setAuthStatus('Could not verify recent session: ' + err.message, false);
        } finally {
          this.disabled = false;
          this.textContent = 'Open My Dashboard';
        }
      });
    }

    // Invalidate cached session if customer types a different email address
    if (emailInput) {
      emailInput.addEventListener('input', function () {
        var cleanVal = (this.value || '').trim().toLowerCase();
        if (activeCustomerSession && activeCustomerSession.email && activeCustomerSession.email.toLowerCase() !== cleanVal) {
          activeCustomerSession = null;
          localStorage.removeItem('sfx_customer_session');
          if (recentSessionBanner) recentSessionBanner.style.display = 'none';
          if (paymentInput && paymentInput.dataset.autofilled === 'true') {
            paymentInput.value = '';
            delete paymentInput.dataset.autofilled;
          }
        }
      });
    }

    // In-flight submission lock to prevent duplicate requests
    var isSubmittingLookup = false;

    // ── SUBMIT: FIND MY LICENSE (EMAIL + PAYMENT ID) ──
    if (lookupForm) {
      lookupForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        if (isSubmittingLookup) return;

        var emailCheck = validateEmailDeliverability(emailInput?.value);
        if (!emailCheck.valid) {
          setAuthStatus(emailCheck.error, false);
          return;
        }

        var email = emailCheck.email;
        var paymentId = (paymentInput?.value || proofInput?.value || '').trim();

        if (!paymentId) {
          setAuthStatus('Please enter your Razorpay Payment ID from your email receipt.', false);
          if (paymentInput) paymentInput.focus();
          return;
        }

        // Reset previous dashboard DOM elements to prevent stale/cross-customer view
        if (licensesContainer) licensesContainer.innerHTML = '';
        if (statusBanner) statusBanner.innerHTML = '';
        if (authEmailDisplay) authEmailDisplay.textContent = '';

        isSubmittingLookup = true;
        btnLookup.disabled = true;
        var origBtnText = btnLookup.textContent;
        btnLookup.textContent = 'Verifying Purchase…';
        setAuthStatus('', true);

        try {
          var payload = { email: email, payment_id: paymentId };
          var portal = await window.SFX_PAYMENT_SERVICE.getCustomerPortal(payload);

          if (portal && portal.ok && portal.is_paid) {
            currentAuthEmail = portal.email || email;
            if (portal.token) {
              localStorage.setItem('sfx_customer_session', JSON.stringify({
                email: currentAuthEmail,
                payment_id: paymentId,
                token: portal.token
              }));
            }
            setAuthStatus('', true);
            await loadVerifiedPortalData(portal, currentAuthEmail);
          } else {
            if (licensesContainer) licensesContainer.innerHTML = '';
            if (statusBanner) statusBanner.innerHTML = '';
            if (authEmailDisplay) authEmailDisplay.textContent = '';
            setAuthStatus(portal?.message || 'No verified purchase was found matching these details.', false);
          }
        } catch (err) {
          if (licensesContainer) licensesContainer.innerHTML = '';
          if (statusBanner) statusBanner.innerHTML = '';
          if (authEmailDisplay) authEmailDisplay.textContent = '';
          setAuthStatus(formatAuthError(err), false);
        } finally {
          isSubmittingLookup = false;
          btnLookup.disabled = false;
          btnLookup.textContent = origBtnText;
        }
      });
    }

    // ── SIGN OUT / SWITCH EMAIL ──
    if (btnSignout) {
      btnSignout.addEventListener('click', function () {
        localStorage.removeItem('sfx_customer_session');
        activeCustomerSession = null;
        currentAuthEmail = '';
        if (recentSessionBanner) recentSessionBanner.style.display = 'none';
        if (emailInput) emailInput.value = '';
        if (paymentInput) {
          paymentInput.value = '';
          delete paymentInput.dataset.autofilled;
        }
        if (proofInput) proofInput.value = '';
        if (proofContainer) proofContainer.style.display = 'none';
        if (btnLookup) btnLookup.textContent = 'FIND MY LICENSE';
        if (licensesContainer) licensesContainer.innerHTML = '';
        if (statusBanner) statusBanner.innerHTML = '';
        if (authEmailDisplay) authEmailDisplay.textContent = '';
        setAuthStatus('', true);
        showAuthView();
      });
    }

    // ── RENDER VERIFIED PORTAL DATA ──
    async function loadVerifiedPortalData(portalData, emailHint) {
      if (licensesContainer) licensesContainer.innerHTML = '';
      if (statusBanner) statusBanner.innerHTML = '';

      var portal = portalData;
      if (typeof portalData === 'string') {
        portal = await window.SFX_PAYMENT_SERVICE.getCustomerPortal(portalData);
      }
      var email = portal.email || emailHint || 'Customer';
      var isPaid = !!(portal.is_paid || (portal.licenses && portal.licenses.length > 0) || (portal.orders && portal.orders.length > 0));
      var authToken = portal.token || (activeCustomerSession && activeCustomerSession.token) || '';

      if (authEmailDisplay) {
        authEmailDisplay.textContent = email;
      }

      // ── Entitlements: Plugin vs Library vs Bundle ──
      var hasPlugin = false;
      var hasLibrary = false;

      if (portal.entitlements) {
        hasPlugin = !!portal.entitlements.has_plugin;
        hasLibrary = !!portal.entitlements.has_library;
      } else {
        hasPlugin = Array.isArray(portal.licenses) && portal.licenses.length > 0;
        hasLibrary = !!(portal.downloads && portal.downloads.sfx_library_url);
      }

      var productName = portal.entitlements?.product_name || 
        ((hasPlugin && hasLibrary) ? 'SFX Composer Complete Bundle' : (hasPlugin ? 'SFX Composer Pro Software' : '7GB Master SFX Library'));

      // ── 1. Render Account Entitlement Status Banner ──
      if (statusBanner) {
        statusBanner.style.display = 'block';
        if (!isPaid) {
          statusBanner.innerHTML = 
            '<div class="sfx-dashboard-card" style="border: 1px solid rgba(255, 69, 58, 0.4); background: rgba(255, 69, 58, 0.05); padding: 16px; margin-bottom: 4px;">' +
              '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">' +
                '<span class="sfx-badge-status revoked" style="color: #ff453a; border-color: rgba(255, 69, 58, 0.5); background: rgba(255, 69, 58, 0.1);">No Verified Purchase</span>' +
              '</div>' +
              '<p style="font-size: 12.5px; color: var(--sfx-text-muted); line-height: 1.5; margin: 0 0 14px 0;">' +
                'No verified purchase was found for this email address. Please make sure to enter the exact email used during checkout.' +
              '</p>' +
              '<button type="button" id="cdm-btn-upgrade-checkout" class="sfx-site-btn-primary" style="width: 100%; justify-content: center; height: 38px; font-size: 13px; font-weight: 700;">' +
                'Purchase SFX Composer (₹199)' +
              '</button>' +
            '</div>';

          var upgradeBtn = statusBanner.querySelector('#cdm-btn-upgrade-checkout');
          if (upgradeBtn) {
            upgradeBtn.addEventListener('click', function () {
              closeDashboard();
              if (typeof window.openSFXCheckout === 'function') {
                window.openSFXCheckout(email);
              } else {
                var buyBtn = document.querySelector('a[href="#buy-now"], .sfx-buy-trigger');
                if (buyBtn) buyBtn.click();
              }
            });
          }
        } else {
          statusBanner.innerHTML = 
            '<div class="sfx-dashboard-card" style="border: 1px solid rgba(16, 185, 129, 0.35); background: rgba(16, 185, 129, 0.05); padding: 14px; margin-bottom: 4px;">' +
              '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">' +
                '<div>' +
                  '<div style="font-size: 14px; font-weight: 700; color: #fff;">' + productName + '</div>' +
                  '<div style="font-size: 11.5px; color: var(--sfx-text-muted);">Verified Purchase • Lifetime Access • Official Order Granted</div>' +
                '</div>' +
                '<span class="sfx-badge-status active">Active Lifetime Entitlement</span>' +
              '</div>' +
            '</div>';
        }
      }

      // ── 2. Render Plugin License (Only if customer purchased plugin) ──
      // Requirement: If customer purchased only library, do not show plugin license.
      if (licensesContainer) {
        var licenses = portal.licenses || [];
        if (!isPaid || !hasPlugin || !licenses.length) {
          licensesContainer.innerHTML = '';
        } else {
          licensesContainer.innerHTML = licenses.map(function (lic) {
            var activeDevs = lic.active_devices || [];
            var devCount = activeDevs.length;
            var maxDevs = lic.max_devices || 1;
            var isExpired = lic.expires_at && new Date(lic.expires_at) < new Date();

            var statusBadge = '';
            if (lic.status === 'revoked') {
              statusBadge = '<span class="sfx-badge-status revoked">Revoked</span>';
            } else if (isExpired) {
              statusBadge = '<span class="sfx-badge-status revoked">Expired</span>';
            } else {
              statusBadge = '<span class="sfx-badge-status active">Active Lifetime</span>';
            }

            var workstationStatus = '';
            if (devCount > 0) {
              var devNames = activeDevs.map(function (d) { return d.device_name || 'Workstation'; }).join(', ');
              workstationStatus = '<span style="color: var(--sfx-positive); font-weight: 600;">Bound to: ' + devNames + '</span> (' + devCount + '/' + maxDevs + ' Slots)';
            } else {
              workstationStatus = '<span style="color: var(--sfx-accent);">Available for Activation (0/' + maxDevs + ' Slots Bound)</span>';
            }

            var purchaseDateStr = lic.purchase_date || lic.created_at 
              ? new Date(lic.purchase_date || lic.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
              : 'Verified Purchase';

            var paymentStatusStr = lic.payment_status === 'completed'
              ? '<span style="color: var(--sfx-positive); font-weight: 600;">Paid (₹' + (lic.payment_amount || 199) + ')</span>'
              : (lic.payment_status ? '<span style="color: var(--sfx-caution);">' + lic.payment_status + '</span>' : '<span style="color: var(--sfx-positive);">Verified Purchase</span>');

            var expiryStr = lic.expires_at 
              ? new Date(lic.expires_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) 
              : 'Lifetime Access (Never Expires)';

            // Key Box with Reveal/Hide & Copy Buttons
            var keyBoxHtml = '';
            if (lic.license_key) {
              keyBoxHtml = 
                '<div style="background: #000; border: 1px solid var(--sfx-accent); border-radius: 8px; padding: 14px; margin: 12px 0;">' +
                  '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">' +
                    '<span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--sfx-accent); font-weight: 700;">Official License Key</span>' +
                    '<span style="font-size: 11px; color: var(--sfx-positive); font-weight: 600;">Verified & Active</span>' +
                  '</div>' +
                  '<div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;">' +
                    '<code class="portal-lic-key-val" data-raw="' + lic.license_key + '" style="font-family: var(--sfx-font-mono); font-size: 17px; font-weight: 800; color: #ffffff; letter-spacing: 0.08em; user-select: all;">' + lic.license_key + '</code>' +
                    '<div style="display: flex; gap: 6px;">' +
                      '<button type="button" class="btn-toggle-portal-key sfx-button sfx-button--quiet" style="height: 30px; font-size: 11px; padding: 0 12px; border: 1px solid var(--sfx-border); color: var(--sfx-accent);">' +
                        'Hide' +
                      '</button>' +
                      '<button type="button" class="btn-copy-portal-key sfx-button sfx-button--quiet" data-key="' + lic.license_key + '" style="height: 30px; font-size: 11px; padding: 0 12px; border: 1px solid var(--sfx-border); color: #fff;">' +
                        'Copy' +
                      '</button>' +
                    '</div>' +
                  '</div>' +
                '</div>';
            } else {
              keyBoxHtml = 
                '<div style="background: rgba(255, 69, 58, 0.08); border: 1px solid rgba(255, 69, 58, 0.35); border-radius: 8px; padding: 14px; margin: 12px 0;">' +
                  '<div style="color: #ff453a; font-weight: 700; font-size: 12.5px; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">' +
                    '<span>⚠️</span> Administrative Action Required: License Key Missing' +
                  '</div>' +
                  '<p style="font-size: 12px; color: var(--sfx-text-muted); line-height: 1.6; margin: 0 0 10px 0;">' +
                    'A valid purchase record exists for this order, but no encrypted license key was generated in the database.<br>' +
                    'Please contact support at <a href="mailto:sfxcomposer@gmail.com" style="color: var(--sfx-accent);">sfxcomposer@gmail.com</a> with your Payment ID (<code>' + (lic.provider_payment_id || 'receipt') + '</code>) to receive your official key.' +
                  '</p>' +
                  '<a href="mailto:sfxcomposer@gmail.com?subject=License%20Key%20Issue%20Request%20-%20Payment%20' + encodeURIComponent(lic.provider_payment_id || '') + '&body=Hello%20SFX%20Composer%20Support%2C%0A%0AMy%20verified%20purchase%20email%20is%3A%20' + encodeURIComponent(lic.customer_email || currentAuthEmail) + '%0APayment%20ID%3A%20' + encodeURIComponent(lic.provider_payment_id || '') + '%0AOrder%20ID%3A%20' + encodeURIComponent(lic.provider_order_id || '') + '%0ALicense%20ID%3A%20' + encodeURIComponent(lic.id || '') + '%0A%0APlease%20issue%20my%20license%20key.%20Thank%20you!" ' +
                  'style="display: inline-block; height: 32px; line-height: 32px; padding: 0 16px; background: rgba(255,69,58,0.15); border: 1px solid rgba(255,69,58,0.5); border-radius: 6px; color: #ff453a; font-size: 12px; font-weight: 700; text-decoration: none;">' +
                    'Request License Key from Support' +
                  '</a>' +
                '</div>';
            }

            return '<div class="sfx-dashboard-card" style="margin-bottom: 12px;">' +
              '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">' +
                '<div>' +
                  '<div style="font-weight: 700; font-size: 15px; color: #fff;">SFX Composer Pro</div>' +
                  '<div style="font-size: 11.5px; color: var(--sfx-text-muted);">License ID: <code style="color:var(--sfx-accent); font-size:11px;">' + (lic.license_id || lic.id) + '</code></div>' +
                '</div>' +
                statusBadge +
              '</div>' +
              keyBoxHtml +
              '<!-- License Metadata Grid -->' +
              '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; margin: 10px 0; background: rgba(0,0,0,0.25); border: 1px solid var(--sfx-border); border-radius: 6px; padding: 10px 12px; font-size: 11.5px;">' +
                '<div><span style="color: var(--sfx-text-muted); font-size: 10.5px; display: block;">Purchase Date</span><strong>' + purchaseDateStr + '</strong></div>' +
                '<div><span style="color: var(--sfx-text-muted); font-size: 10.5px; display: block;">Payment Status</span>' + paymentStatusStr + '</div>' +
                '<div><span style="color: var(--sfx-text-muted); font-size: 10.5px; display: block;">Activation Status</span>' + workstationStatus + '</div>' +
                '<div><span style="color: var(--sfx-text-muted); font-size: 10.5px; display: block;">Product Name</span><span style="font-size: 11.5px; color: #fff; font-weight: 600;">SFX Composer Pro</span></div>' +
                '<div><span style="color: var(--sfx-text-muted); font-size: 10.5px; display: block;">Product ID</span><code style="font-size: 10.5px; color: var(--sfx-accent);">' + (lic.product_id || 'sfx-composer-pro') + '</code></div>' +
                (lic.provider_payment_id ? '<div><span style="color: var(--sfx-text-muted); font-size: 10.5px; display: block;">Payment ID</span><code style="font-size: 10.5px; color: var(--sfx-accent);">' + lic.provider_payment_id + '</code></div>' : '') +
              '</div>' +
            '</div>';
          }).join('');

          // Reveal/Hide Key listener
          licensesContainer.querySelectorAll('.btn-toggle-portal-key').forEach(function (btn) {
            btn.addEventListener('click', function () {
              var parent = this.closest('.sfx-dashboard-card');
              var valEl = parent.querySelector('.portal-lic-key-val');
              if (!valEl) return;
              var rawKey = valEl.getAttribute('data-raw');
              if (this.textContent.trim() === 'Hide') {
                valEl.textContent = '••••-••••-••••-••••';
                this.textContent = 'Show';
              } else {
                valEl.textContent = rawKey;
                this.textContent = 'Hide';
              }
            });
          });

          // Copy key listener
          licensesContainer.querySelectorAll('.btn-copy-portal-key').forEach(function (btn) {
            btn.addEventListener('click', function () {
              var key = this.getAttribute('data-key');
              if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(key).catch(function () {});
              } else {
                var ta = document.createElement('textarea');
                ta.value = key;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                try { document.execCommand('copy'); } catch (e) {}
                document.body.removeChild(ta);
              }
              var originalText = this.textContent;
              this.textContent = 'Copied!';
              this.style.color = 'var(--sfx-positive)';
              var that = this;
              setTimeout(function () {
                that.textContent = originalText;
                that.style.color = '#fff';
              }, 2000);
            });
          });

          // Reissue key listener
          licensesContainer.querySelectorAll('.btn-customer-reissue-key').forEach(function (btn) {
            btn.addEventListener('click', async function () {
              var licId = this.getAttribute('data-id');
              if (confirm('Reissue a new license key for your account? Your previous key will be replaced.')) {
                var origText = this.textContent;
                this.textContent = 'Reissuing…';
                this.disabled = true;
                try {
                  var res = await window.SFX_PAYMENT_SERVICE.reissueLicenseKeyCustomer(authToken || portal, licId);
                  alert(res.message || 'License key successfully reissued!');
                  await loadVerifiedPortalData(portal, emailHint);
                } catch (err) {
                  alert('Error reissuing license key: ' + err.message);
                  this.textContent = origText;
                  this.disabled = false;
                }
              }
            });
          });
        }
      }

      // ── 3. Render Downloads (Plugin and/or 7GB Library) ──
      // Requirement: If customer purchased only plugin, do not show 7GB library download.
      // If customer purchased only library, do not show plugin license.
      if (downloadsContainer) {
        if (!isPaid) {
          downloadsContainer.innerHTML = '';
        } else {
          var tokenQuery = authToken ? ('&token=' + encodeURIComponent(authToken)) : '';
          var zxpUrl = (portal.downloads && portal.downloads.zxp_url)
            ? portal.downloads.zxp_url
            : ('/api/download?type=zxp' + tokenQuery);
          var zipUrl = (portal.downloads && portal.downloads.zip_url)
            ? portal.downloads.zip_url
            : ('/api/download?type=zip' + tokenQuery);
          var sfxLibUrl = (portal.downloads && portal.downloads.sfx_library_url) 
            ? portal.downloads.sfx_library_url 
            : ('/api/download?type=sfx-library' + tokenQuery);

          var downloadCardsHtml = '<div class="sfx-dashboard-card">';
          downloadCardsHtml += 
            '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">' +
              '<div style="font-size: 13px; font-weight: 700; color: #fff;">' + (hasLibrary ? '7GB Master SFX Library &amp; Downloads' : 'Software Downloads') + '</div>' +
              '<span class="sfx-badge-status active">Unlocked</span>' +
            '</div>';

          if (hasPlugin) {
            downloadCardsHtml += 
              '<div style="font-size: 11.5px; color: var(--sfx-text-muted); margin-bottom: 12px;">SFX Composer Pro Software Package: Windows 10/11 &amp; macOS 11+ (Intel &amp; Apple Silicon)</div>' +
              '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">' +
                '<a href="' + zxpUrl + '" download class="sfx-button sfx-button--quiet" style="height: 38px; border: 1px solid var(--sfx-border); justify-content: center; font-size: 12px; color: #fff; background: #121418; text-decoration: none;">' +
                  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>' +
                  'Software Installer (.zxp)' +
                '</a>' +
                '<a href="' + zipUrl + '" download class="sfx-button sfx-button--quiet" style="height: 38px; border: 1px solid var(--sfx-border); justify-content: center; font-size: 12px; color: #fff; background: #121418; text-decoration: none;">' +
                  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>' +
                  'Standalone Package (.zip)' +
                '</a>' +
              '</div>';
          }

          // 7GB SFX Library Button (Shown ONLY if library was purchased)
          if (hasLibrary) {
            downloadCardsHtml += 
              '<div style="font-size: 11.5px; color: var(--sfx-text-muted); margin-bottom: 8px;">Over 4,500+ master cinematic WAV sound effects organized into 18 categories:</div>' +
              '<a href="' + sfxLibUrl + '" id="cdm-sfx-library-btn" target="_blank" rel="noopener noreferrer" class="sfx-button" style="height: 40px; width: 100%; border: 1px solid #10b981; justify-content: center; font-size: 12.5px; font-weight: 700; color: #fff; background: #059669; text-decoration: none;">' +
                '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>' +
                'Download 7GB Master SFX Library (Google Drive)' +
              '</a>';
          }

          downloadCardsHtml += '</div>';
          downloadsContainer.innerHTML = downloadCardsHtml;
        }
      }

      // ── 4. Setup Guide Visibility ──
      if (setupGuide) {
        setupGuide.style.display = hasPlugin ? 'block' : 'none';
      }

      // ── 5. Render Orders History ──
      if (ordersTbody) {
        var orders = portal.orders || [];
        if (!orders.length) {
          ordersTbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--sfx-text-muted); padding: 14px;">No purchase orders found.</td></tr>';
        } else {
          ordersTbody.innerHTML = orders.map(function (ord) {
            var date = new Date(ord.created_at).toLocaleDateString();
            var ordStatus = (ord.payment_status || '').toLowerCase();
            var badge = (ordStatus === 'completed' || ordStatus === 'paid')
              ? '<span class="sfx-badge-status active">Paid</span>'
              : (ordStatus === 'failed' ? '<span class="sfx-badge-status revoked">Failed</span>' : '<span class="sfx-badge-status pending">Pending</span>');

            return '<tr>' +
              '<td><code style="font-size:11px;">' + (ord.provider_order_id || '—') + '</code></td>' +
              '<td><code style="font-size:11px;">' + (ord.provider_payment_id || '—') + '</code></td>' +
              '<td>₹' + ord.amount + '</td>' +
              '<td>' + badge + '</td>' +
              '<td>' + date + '</td>' +
            '</tr>';
          }).join('');
        }
      }

      showDashboardView();
    }

    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal && modal.classList.contains('is-open')) {
        closeDashboard();
      }
    });
  }

  // ── 5. FAQ INTERACTIVE ACCORDION ──
  function setupFaqAccordion() {
    var faqItems = document.querySelectorAll('.faq-item');
    if (!faqItems.length) return;

    faqItems.forEach(function (item, index) {
      var questionBtn = item.querySelector('.faq-question');
      if (!questionBtn) return;

      // Click: Toggle question and close siblings
      questionBtn.addEventListener('click', function () {
        var isOpen = item.classList.contains('is-open');

        // Close other items (support opening one FAQ at a time)
        faqItems.forEach(function (other) {
          if (other !== item) {
            other.classList.remove('is-open');
            var otherBtn = other.querySelector('.faq-question');
            if (otherBtn) otherBtn.setAttribute('aria-expanded', 'false');
          }
        });

        // Toggle clicked item
        if (isOpen) {
          item.classList.remove('is-open');
          questionBtn.setAttribute('aria-expanded', 'false');
        } else {
          item.classList.add('is-open');
          questionBtn.setAttribute('aria-expanded', 'true');
        }
      });

      // Keyboard Accessibility: ArrowUp and ArrowDown navigate between questions
      questionBtn.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          var nextIndex = (index + 1) % faqItems.length;
          var nextBtn = faqItems[nextIndex].querySelector('.faq-question');
          if (nextBtn) nextBtn.focus();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          var prevIndex = (index - 1 + faqItems.length) % faqItems.length;
          var prevBtn = faqItems[prevIndex].querySelector('.faq-question');
          if (prevBtn) prevBtn.focus();
        }
      });
    });
  }

  // ── 6. SMOOTH SCROLL CTA BUTTONS ──
  function setupSmoothScrollButtons() {
    var scrollTriggers = document.querySelectorAll('[data-scroll-to]');
    scrollTriggers.forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var targetId = this.getAttribute('data-scroll-to');
        var targetEl = document.getElementById(targetId);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }

  // ── 7. SFX LIBRARY 20-FOLDER EXPLORER ──
  function setupFolderExplorer() {
    var searchInput = document.getElementById('folder-search-input');
    var countBadge = document.getElementById('folder-count-badge');
    var filterBtns = document.querySelectorAll('.sfx-folder-filter-btn');
    var folderCards = document.querySelectorAll('.sfx-folder-card');

    if (!folderCards.length) return;

    var currentCategory = 'all';
    var currentQuery = '';

    function filterFolders() {
      var visibleCount = 0;
      var q = currentQuery.trim().toLowerCase();

      folderCards.forEach(function (card) {
        var cat = card.getAttribute('data-category') || '';
        var name = (card.getAttribute('data-name') || '').toLowerCase();
        var text = card.textContent.toLowerCase();

        var matchesCategory = (currentCategory === 'all' || cat === currentCategory);
        var matchesQuery = (!q || name.indexOf(q) !== -1 || text.indexOf(q) !== -1);

        if (matchesCategory && matchesQuery) {
          card.style.display = 'block';
          visibleCount++;
        } else {
          card.style.display = 'none';
        }
      });

      if (countBadge) {
        countBadge.textContent = 'Showing ' + visibleCount + ' of 20 categories';
      }
    }

    if (searchInput) {
      searchInput.addEventListener('input', function () {
        currentQuery = this.value;
        filterFolders();
      });
    }

    filterBtns.forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        filterBtns.forEach(function (b) { b.classList.remove('is-active'); });
        this.classList.add('is-active');
        currentCategory = this.getAttribute('data-filter') || 'all';
        filterFolders();
      });
    });

    // Expand/Collapse folder card on click (card or header)
    folderCards.forEach(function (card) {
      card.addEventListener('click', function (e) {
        if (e.target.closest('a, button, input')) return;
        card.classList.toggle('is-expanded');
      });
    });
  }

  // ── 9. SFX LIBRARY LICENSE VERIFICATION & SECURE DOWNLOAD ──
  function setupLibraryDownloadForm() {
    var form = document.getElementById('sfx-library-download-form');
    var input = document.getElementById('sfx-lib-license-input');
    var submitBtn = document.getElementById('sfx-lib-download-submit-btn');
    var btnLabel = document.getElementById('sfx-lib-btn-label');
    var statusArea = document.getElementById('sfx-lib-status-area');

    if (!form || !input) return;

    // Auto-formatting for license key input
    input.addEventListener('input', function () {
      var val = input.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
      if (val && !val.startsWith('SFX') && !'SFX'.startsWith(val)) {
        val = 'SFX-' + val;
      }
      input.value = val;
    });

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var key = (input.value || '').trim().toUpperCase();

      if (!key) {
        showStatus('error', 'Please enter your SFX Composer license key.');
        input.focus();
        return;
      }

      var keyRegex = /^SFX-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
      if (!keyRegex.test(key)) {
        showStatus('error', 'Invalid license key format. Keys follow the format: SFX-XXXX-XXXX-XXXX-XXXX.');
        input.focus();
        return;
      }

      // 1. Loading State
      setLoading(true);
      showStatus('loading', '<div style="display: flex; align-items: center; gap: 10px;"><span class="sfx-spinner" style="display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.2); border-top-color: #38bdf8; border-radius: 50%; animation: sfx-spin 0.8s linear infinite;"></span><span>Verifying license key with security server...</span></div>');

      try {
        var res = await fetch('/api/download?type=sfx-library&verify_only=true', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ license_key: key })
        });

        var data;
        try {
          data = await res.json();
        } catch (jsonErr) {
          data = { ok: false, message: 'Server response error. Please try again.' };
        }

        if (!res.ok || !data.ok) {
          setLoading(false);
          var errMsg = data.message || 'License verification failed. Please check your key.';
          showStatus('error', '<strong>Verification Failed:</strong> ' + escapeHtml(errMsg));
          return;
        }

        // 2. Success State
        showStatus('success', '<strong>License Verified!</strong> Initializing 7GB master audio archive download...');

        // 3. Trigger Direct Download
        var downloadUrl = '/api/download?type=sfx-library&license_key=' + encodeURIComponent(key);
        
        var hiddenFrame = document.getElementById('sfx-download-iframe');
        if (!hiddenFrame) {
          hiddenFrame = document.createElement('iframe');
          hiddenFrame.id = 'sfx-download-iframe';
          hiddenFrame.style.display = 'none';
          document.body.appendChild(hiddenFrame);
        }
        hiddenFrame.src = downloadUrl;

        // 4. Download Confirmation
        setTimeout(function () {
          setLoading(false);
          showStatus('downloading', '<div style="display: flex; flex-direction: column; gap: 6px;">' +
            '<div style="font-weight: 700; color: #34d399; font-size: 14px;">Download Started!</div>' +
            '<div style="color: #cbd5e1;">Your browser is now downloading <strong>SFX-Composer-Master-Library.zip (7GB)</strong>.</div>' +
            '<div style="font-size: 12px; color: #94a3b8; margin-top: 4px;">If the download did not start automatically, <a href="' + downloadUrl + '" style="color: #38bdf8; text-decoration: underline;">click here to resume download</a>.</div>' +
          '</div>');
        }, 1200);

      } catch (netErr) {
        setLoading(false);
        showStatus('error', '<strong>Network Error:</strong> Could not connect to license verification server. Please check your internet connection.');
      }
    });

    function setLoading(isLoading) {
      input.disabled = isLoading;
      submitBtn.disabled = isLoading;
      if (isLoading) {
        submitBtn.style.opacity = '0.7';
        submitBtn.style.cursor = 'not-allowed';
        if (btnLabel) btnLabel.textContent = 'Verifying...';
      } else {
        submitBtn.style.opacity = '1';
        submitBtn.style.cursor = 'pointer';
        if (btnLabel) btnLabel.textContent = 'Verify License & Download';
      }
    }

    function showStatus(type, html) {
      statusArea.style.display = 'block';
      if (type === 'loading') {
        statusArea.style.background = 'rgba(56, 189, 248, 0.08)';
        statusArea.style.border = '1px solid rgba(56, 189, 248, 0.3)';
        statusArea.style.color = '#38bdf8';
      } else if (type === 'error') {
        statusArea.style.background = 'rgba(239, 68, 68, 0.1)';
        statusArea.style.border = '1px solid rgba(239, 68, 68, 0.35)';
        statusArea.style.color = '#fca5a5';
      } else if (type === 'success' || type === 'downloading') {
        statusArea.style.background = 'rgba(16, 185, 129, 0.12)';
        statusArea.style.border = '1px solid rgba(16, 185, 129, 0.4)';
        statusArea.style.color = '#a7f3d0';
      }
      statusArea.innerHTML = html;
    }

    function escapeHtml(str) {
      var div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }
  }

  // ── 10. RAZORPAY COMPLIANCE & LEGAL POLICY MODALS ──
  (function initComplianceModals() {
    function openModal(modalId) {
      var modal = document.getElementById(modalId);
      if (modal) {
        modal.classList.add('is-open');
        document.body.classList.add('sfx-modal-open');
      }
    }

    function closeModal(modal) {
      if (modal) {
        modal.classList.remove('is-open');
        if (!document.querySelector('.sfx-modal.is-open')) {
          document.body.classList.remove('sfx-modal-open');
        }
      }
    }

    // Trigger buttons and links
    var triggers = document.querySelectorAll('[data-open-modal], a[href="#terms"], a[href="#privacy"], a[href="#refund"], a[href="#install-guide"]');
    triggers.forEach(function (trig) {
      trig.addEventListener('click', function (e) {
        var modalId = trig.getAttribute('data-open-modal');
        if (!modalId) {
          var href = trig.getAttribute('href');
          if (href === '#terms') modalId = 'terms-modal';
          else if (href === '#privacy') modalId = 'privacy-modal';
          else if (href === '#refund') modalId = 'refund-modal';
          else if (href === '#install-guide') modalId = 'install-guide-modal';
        }
        if (modalId && document.getElementById(modalId)) {
          e.preventDefault();
          openModal(modalId);
        }
      });
    });

    // Close buttons & backdrops for compliance modals
    ['terms-modal', 'privacy-modal', 'refund-modal', 'install-guide-modal'].forEach(function (id) {
      var m = document.getElementById(id);
      if (m) {
        var closeBtn = m.querySelector('.sfx-modal-close');
        var backdrop = m.querySelector('.sfx-modal-backdrop');
        if (closeBtn) closeBtn.addEventListener('click', function () { closeModal(m); });
        if (backdrop) backdrop.addEventListener('click', function () { closeModal(m); });
      }
    });

    // Global escape key handler
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        ['terms-modal', 'privacy-modal', 'refund-modal', 'install-guide-modal'].forEach(function (id) {
          var m = document.getElementById(id);
          if (m && m.classList.contains('is-open')) {
            closeModal(m);
          }
        });
      }
    });
  })();
})();
