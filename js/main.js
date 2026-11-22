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
  });

  // ── 1. FIXED LEFT VERTICAL NAVIGATION & MOBILE DRAWER ──
  function setupLeftNav() {
    var navLinks = document.querySelectorAll('.sfx-nav-link');
    var sections = document.querySelectorAll('section[id]');
    var mobileToggle = document.getElementById('mobile-nav-toggle');
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
              if (link.getAttribute('href') === '#' + id) {
                link.classList.add('is-active');
              } else {
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
            description: 'SFX Composer Ultimate Bundle (Plugin + 7GB SFX Library)',
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
        if (result.email_delivery && result.email_delivery.sent) {
          successEmailStatusDisp.textContent = '✓ Delivered to Inbox';
          successEmailStatusDisp.style.color = 'var(--sfx-positive)';
        } else {
          successEmailStatusDisp.textContent = result.email_delivery?.info || 'Delivery queued';
          successEmailStatusDisp.style.color = 'var(--sfx-caution)';
        }
      }

      // Deliver 7GB SFX Library Google Drive Link securely post-verification
      var successDriveBtn = document.getElementById('success-sfx-library-btn');
      if (successDriveBtn) {
        var libraryUrl = (result.downloads && result.downloads.sfx_library_url)
          ? result.downloads.sfx_library_url
          : 'https://drive.google.com/file/d/1rF1f3KEKSpri1KoZqP8SCv-Q0-NYxvGD/view?usp=sharing';
        successDriveBtn.href = libraryUrl;
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

  // ── 5. CUSTOMER DASHBOARD & LICENSE MANAGER (SECURE VERIFICATION) ──
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

    // Simplified Lookup Form
    var lookupForm = document.getElementById('cdm-lookup-form');
    var emailInput = document.getElementById('cdm-email-input');
    var btnFindLicense = document.getElementById('cdm-btn-find-license');
    var verificationBox = document.getElementById('cdm-ownership-verification-box');
    var verifyProofInput = document.getElementById('cdm-verify-proof');

    // Dashboard View Elements
    var authEmailDisplay = document.getElementById('cdm-auth-email-display');
    var btnSignout = document.getElementById('cdm-btn-signout');
    var statusBanner = document.getElementById('cdm-account-status-banner');
    var licensesContainer = document.getElementById('cdm-licenses-container');
    var downloadsContainer = document.getElementById('cdm-downloads-container');
    var ordersTbody = document.getElementById('cdm-orders-tbody');

    var currentAuthEmail = '';
    var activeCustomerSession = null;

    function getStoredSession() {
      try {
        var raw = localStorage.getItem('sfx_customer_session');
        if (raw) return JSON.parse(raw);
      } catch (e) {}
      return null;
    }

    function saveStoredSession(data) {
      try {
        localStorage.setItem('sfx_customer_session', JSON.stringify(data));
      } catch (e) {}
    }

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
      var stored = getStoredSession();
      if (stored && stored.email && (stored.order_id || stored.token || stored.license_key)) {
        activeCustomerSession = stored;
        if (recentSessionBanner && recentSessionEmail) {
          recentSessionEmail.textContent = stored.email;
          recentSessionBanner.style.display = 'block';
        }
        if (emailInput && !emailInput.value) {
          emailInput.value = stored.email;
        }
      }
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

    if (openBtn) {
      openBtn.addEventListener('click', function (e) {
        e.preventDefault();
        openDashboard();
      });
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
          var res = await window.SFX_PAYMENT_SERVICE.getCustomerPortal({
            email: activeCustomerSession.email,
            order_id: activeCustomerSession.order_id,
            payment_id: activeCustomerSession.payment_id,
            token: activeCustomerSession.token
          });
          if (res && res.is_paid && res.verified) {
            await loadVerifiedPortalData(res, activeCustomerSession.email);
            showDashboardView();
            setAuthStatus('', true);
          } else {
            throw new Error(res.message || 'Could not verify recent session.');
          }
        } catch (err) {
          setAuthStatus('Could not verify recent session: ' + err.message, false);
        } finally {
          this.disabled = false;
          this.textContent = 'Open My Dashboard';
        }
      });
    }

    // ── LICENSE LOOKUP SUBMIT HANDLER (Find My License) ──
    if (lookupForm) {
      lookupForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        var email = (emailInput?.value || '').trim().toLowerCase();
        var proof = (verifyProofInput?.value || '').trim();

        if (!email) {
          setAuthStatus('Please enter your registered purchase email address.', false);
          return;
        }

        if (btnFindLicense) {
          btnFindLicense.disabled = true;
          var origBtnText = btnFindLicense.textContent;
          btnFindLicense.textContent = 'Finding License…';
        }
        setAuthStatus('', true);

        try {
          var payload = { email: email };
          var stored = getStoredSession();

          if (proof) {
            payload.proof = proof;
          } else if (stored && stored.email && stored.email.toLowerCase() === email) {
            if (stored.order_id) payload.order_id = stored.order_id;
            if (stored.payment_id) payload.payment_id = stored.payment_id;
            if (stored.token) payload.token = stored.token;
          }

          var result = await window.SFX_PAYMENT_SERVICE.getCustomerPortal(payload);

          // If paid customer found, but ownership proof needed on this device
          if (result.requires_verification) {
            if (verificationBox) verificationBox.style.display = 'flex';
            if (verifyProofInput) verifyProofInput.focus();
            if (btnFindLicense) btnFindLicense.textContent = 'VERIFY & UNLOCK LICENSE';
            setAuthStatus(result.message || 'Verified purchase found! Please enter your Razorpay Order ID or Payment ID to unlock your license.', true);
            return;
          }

          // If ownership verified & paid
          if (result && result.is_paid && result.verified) {
            currentAuthEmail = result.email || email;
            saveStoredSession({
              email: currentAuthEmail,
              token: result.token,
              order_id: result.licenses && result.licenses[0] ? result.licenses[0].provider_order_id : '',
              payment_id: result.licenses && result.licenses[0] ? result.licenses[0].provider_payment_id : '',
              license_key: result.licenses && result.licenses[0] ? result.licenses[0].license_key : ''
            });
            await loadVerifiedPortalData(result, currentAuthEmail);
            showDashboardView();
            setAuthStatus('', true);
            if (verificationBox) verificationBox.style.display = 'none';
          } else {
            throw new Error(result.message || 'No verified purchase found for this email address.');
          }
        } catch (err) {
          setAuthStatus(err.message || 'No verified purchase found for this email address.', false);
        } finally {
          if (btnFindLicense) {
            btnFindLicense.disabled = false;
            if (btnFindLicense.textContent === 'Finding License…') {
              btnFindLicense.textContent = origBtnText;
            }
          }
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
        if (verifyProofInput) verifyProofInput.value = '';
        if (verificationBox) verificationBox.style.display = 'none';
        if (btnFindLicense) btnFindLicense.textContent = 'FIND MY LICENSE';
        setAuthStatus('', true);
        showAuthView();
      });
    }

    async function loadVerifiedPortalData(authArg, emailHint) {
      var portal = await window.SFX_PAYMENT_SERVICE.getCustomerPortal(authArg);
      var email = portal.email || emailHint || 'Customer';
      var authToken = typeof authArg === 'string' ? authArg : (authArg && authArg.token ? authArg.token : '');

      if (authEmailDisplay) {
        authEmailDisplay.textContent = email;
      }

      var isPaid = !!(portal && portal.is_paid && Array.isArray(portal.licenses) && portal.licenses.length > 0);

      // ── 1. Render Account Status Banner (Unpaid vs Paid Lifetime) ──
      if (statusBanner) {
        if (!isPaid) {
          statusBanner.innerHTML = 
            '<div class="sfx-dashboard-card" style="border: 1px solid rgba(255, 159, 10, 0.4); background: rgba(255, 159, 10, 0.05); padding: 16px; margin-bottom: 4px;">' +
              '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">' +
                '<span class="sfx-badge-status revoked" style="color: #ff9f0a; border-color: rgba(255, 159, 10, 0.5); background: rgba(255, 159, 10, 0.1);">Account Active — Purchase Required</span>' +
                '<span style="font-size: 13px; font-weight: 700; color: #fff;">₹199 <span style="font-size: 11px; font-weight: 400; color: var(--sfx-text-muted);">(one-time payment)</span></span>' +
              '</div>' +
              '<div style="font-size: 14px; font-weight: 700; color: #fff; margin-bottom: 4px;">SFX Composer Complete Bundle</div>' +
              '<p style="font-size: 12px; color: var(--sfx-text-muted); line-height: 1.5; margin: 0 0 14px 0;">' +
                'Your account is ready. Purchase SFX Composer to unlock your downloads and license.' +
              '</p>' +
              '<button type="button" id="cdm-btn-upgrade-checkout" class="sfx-site-btn-primary" style="width: 100%; justify-content: center; height: 38px; font-size: 13px; font-weight: 700;">' +
                '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 6px;"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>' +
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
                  '<div style="font-size: 14px; font-weight: 700; color: #fff;">SFX Composer Complete Bundle</div>' +
                  '<div style="font-size: 11.5px; color: var(--sfx-text-muted);">₹199 • Lifetime Access • Official License Granted</div>' +
                '</div>' +
                '<span class="sfx-badge-status active">Active Lifetime Entitlement</span>' +
              '</div>' +
            '</div>';
        }
      }

      // ── 2. Render Licenses List ──
      if (licensesContainer) {
        var licenses = portal.licenses || [];
        if (!isPaid || !licenses.length) {
          licensesContainer.innerHTML = 
            '<div class="sfx-dashboard-card" style="text-align: center; padding: 22px; border: 1px dashed var(--sfx-border);">' +
              '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="var(--sfx-text-muted)" stroke-width="1.5" style="margin: 0 auto 8px; display: block;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>' +
              '<div style="font-size: 13px; color: #fff; font-weight: 700; margin-bottom: 4px;">No Active License</div>' +
              '<div style="font-size: 11.5px; color: var(--sfx-text-muted); max-width: 380px; margin: 0 auto;">Complete payment to generate and bind your cryptographically secured AES-256-GCM license key.</div>' +
            '</div>';
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
                    '<span style="font-size: 11px; color: var(--sfx-text-muted);">AES-256-GCM Decrypted</span>' +
                  '</div>' +
                  '<div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;">' +
                    '<code class="portal-lic-key-val" data-raw="' + lic.license_key + '" style="font-family: var(--sfx-font-mono); font-size: 17px; font-weight: 800; color: #ffffff; letter-spacing: 0.08em; user-select: all;">••••-••••-••••-••••</code>' +
                    '<div style="display: flex; gap: 6px;">' +
                      '<button type="button" class="btn-toggle-portal-key sfx-button sfx-button--quiet" style="height: 30px; font-size: 11px; padding: 0 12px; border: 1px solid var(--sfx-border); color: var(--sfx-accent);">' +
                        'Reveal' +
                      '</button>' +
                      '<button type="button" class="btn-copy-portal-key sfx-button sfx-button--quiet" data-key="' + lic.license_key + '" style="height: 30px; font-size: 11px; padding: 0 12px; border: 1px solid var(--sfx-border); color: #fff;">' +
                        'Copy' +
                      '</button>' +
                    '</div>' +
                  '</div>' +
                '</div>';
            } else {
              // Legacy Hashed License Notice & Reissue Button
              keyBoxHtml = 
                '<div style="background: rgba(255, 159, 10, 0.08); border: 1px solid rgba(255, 159, 10, 0.3); border-radius: 8px; padding: 14px; margin: 12px 0;">' +
                  '<div style="color: #ff9f0a; font-weight: 700; font-size: 12.5px; margin-bottom: 4px;">Legacy Hash Security Notice</div>' +
                  '<p style="font-size: 11.5px; color: var(--sfx-text-muted); line-height: 1.5; margin: 0 0 10px 0;">' +
                    'This license was recorded under our previous one-way cryptographic SHA-256 hash architecture and cannot be mathematically recovered from the hash alone. Click below to securely generate and bind a fresh encrypted key to your account.' +
                  '</p>' +
                  '<button type="button" class="btn-customer-reissue-key sfx-site-btn-primary" data-id="' + lic.id + '" style="height: 30px; font-size: 11.5px; padding: 0 14px;">' +
                    'Reissue License Key' +
                  '</button>' +
                '</div>';
            }

            return '<div class="sfx-dashboard-card" style="margin-bottom: 12px;">' +
              '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">' +
                '<div>' +
                  '<div style="font-weight: 700; font-size: 15px; color: #fff;">SFX Composer Pro v2.4 (Universal)</div>' +
                  '<div style="font-size: 11.5px; color: var(--sfx-text-muted);">Licensed for Premiere Pro &amp; After Effects</div>' +
                '</div>' +
                statusBadge +
              '</div>' +
              keyBoxHtml +
              '<!-- License Metadata Grid -->' +
              '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; margin: 10px 0; background: rgba(0,0,0,0.25); border: 1px solid var(--sfx-border); border-radius: 6px; padding: 10px 12px; font-size: 11.5px;">' +
                '<div><span style="color: var(--sfx-text-muted); font-size: 10.5px; display: block;">License ID</span><code style="font-size: 10.5px; color: var(--sfx-accent); font-weight: 700;">' + (lic.license_id || lic.id) + '</code></div>' +
                '<div><span style="color: var(--sfx-text-muted); font-size: 10.5px; display: block;">Purchase Date</span><strong>' + purchaseDateStr + '</strong></div>' +
                '<div><span style="color: var(--sfx-text-muted); font-size: 10.5px; display: block;">Payment Status</span>' + paymentStatusStr + '</div>' +
                '<div><span style="color: var(--sfx-text-muted); font-size: 10.5px; display: block;">Product ID</span><span style="color: #fff;">' + (lic.product_id || 'sfx-composer-bundle') + '</span></div>' +
                (lic.provider_order_id ? '<div><span style="color: var(--sfx-text-muted); font-size: 10.5px; display: block;">Order ID</span><code style="font-size: 10.5px; color: #93c5fd;">' + lic.provider_order_id + '</code></div>' : '') +
                (lic.provider_payment_id ? '<div><span style="color: var(--sfx-text-muted); font-size: 10.5px; display: block;">Payment ID</span><code style="font-size: 10.5px; color: var(--sfx-accent);">' + lic.provider_payment_id + '</code></div>' : '') +
              '</div>' +
              '<div style="background: rgba(0,0,0,0.4); border: 1px solid var(--sfx-border); padding: 10px 14px; border-radius: 6px; font-size: 12px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">' +
                '<div>' +
                  '<span style="color: var(--sfx-text-muted); font-size: 11px;">Workstation Status: </span>' +
                  workstationStatus +
                '</div>' +
                '<button type="button" class="btn-portal-reset-device sfx-button sfx-button--quiet" data-id="' + lic.id + '" style="height: 24px; font-size: 10.5px; border: 1px solid var(--sfx-border);">' +
                  'Transfer Workstation' +
                '</button>' +
              '</div>' +
            '</div>';
          }).join('');

          // Reveal/Hide Key event listener
          licensesContainer.querySelectorAll('.btn-toggle-portal-key').forEach(function (btn) {
            btn.addEventListener('click', function () {
              var parent = this.closest('.sfx-dashboard-card');
              var valEl = parent.querySelector('.portal-lic-key-val');
              if (!valEl) return;
              var rawKey = valEl.getAttribute('data-raw');
              if (this.textContent === 'Reveal') {
                valEl.textContent = rawKey;
                this.textContent = 'Hide';
              } else {
                valEl.textContent = '••••-••••-••••-••••';
                this.textContent = 'Reveal';
              }
            });
          });

          // Copy key event listener
          licensesContainer.querySelectorAll('.btn-copy-portal-key').forEach(function (btn) {
            btn.addEventListener('click', function () {
              var key = this.getAttribute('data-key');
              if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(key);
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

          // Customer Reissue Key event listener
          licensesContainer.querySelectorAll('.btn-customer-reissue-key').forEach(function (btn) {
            btn.addEventListener('click', async function () {
              var licId = this.getAttribute('data-id');
              if (confirm('Reissue a new license key for your account? Your previous key will be replaced and secured.')) {
                var origText = this.textContent;
                this.textContent = 'Reissuing…';
                this.disabled = true;
                try {
                  var res = await window.SFX_PAYMENT_SERVICE.reissueLicenseKeyCustomer(authArg, licId);
                  alert(res.message || 'License key successfully reissued!');
                  await loadVerifiedPortalData(authArg, emailHint);
                } catch (err) {
                  alert('Error reissuing license key: ' + err.message);
                  this.textContent = origText;
                  this.disabled = false;
                }
              }
            });
          });

          // Transfer workstation listener
          licensesContainer.querySelectorAll('.btn-portal-reset-device').forEach(function (btn) {
            btn.addEventListener('click', function () {
              alert('To transfer your workstation license: Simply open SFX Composer on your new workstation in Premiere Pro or After Effects, enter your registered email (' + email + ') and license key. The server will automatically rebind your activation slot.');
            });
          });
        }
      }

      // ── 3. Render Downloads Container (Locked for Unpaid, Unlocked for Paid) ──
      if (downloadsContainer) {
        if (!isPaid) {
          downloadsContainer.innerHTML = 
            '<div class="sfx-dashboard-card">' +
              '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">' +
                '<div style="font-size: 13px; font-weight: 700; color: #fff;">Download Plugin &amp; SFX Library</div>' +
                '<span class="sfx-badge-status revoked" style="color: #ff9f0a; border-color: rgba(255, 159, 10, 0.4);">Locked — Purchase Required</span>' +
              '</div>' +
              '<div style="font-size: 11.5px; color: var(--sfx-text-muted); margin-bottom: 12px;">Active purchase entitlement is required to download installer packages and sound libraries.</div>' +
              '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">' +
                '<button type="button" disabled class="sfx-button sfx-button--quiet" style="height: 38px; border: 1px solid var(--sfx-border); justify-content: center; font-size: 12px; color: var(--sfx-text-muted); opacity: 0.5; cursor: not-allowed; background: #0c0d10;">' +
                  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>' +
                  'Locked — ZXP Installer' +
                '</button>' +
                '<button type="button" disabled class="sfx-button sfx-button--quiet" style="height: 38px; border: 1px solid var(--sfx-border); justify-content: center; font-size: 12px; color: var(--sfx-text-muted); opacity: 0.5; cursor: not-allowed; background: #0c0d10;">' +
                  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>' +
                  'Locked — CEP ZIP' +
                '</button>' +
              '</div>' +
              '<button type="button" disabled class="sfx-button" style="height: 38px; width: 100%; border: 1px solid var(--sfx-border); justify-content: center; font-size: 12px; font-weight: 600; color: var(--sfx-text-muted); opacity: 0.5; cursor: not-allowed; background: #0c0d10;">' +
                '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>' +
                'Locked — 7GB SFX Library (Purchase Required)' +
              '</button>' +
            '</div>';
        } else {
          var tokenQuery = authToken ? ('&token=' + encodeURIComponent(authToken)) : '';
          var zxpUrl = '/api/download?type=zxp' + tokenQuery;
          var zipUrl = '/api/download?type=zip' + tokenQuery;
          var sfxLibUrl = (portal.downloads && portal.downloads.sfx_library_url) 
            ? portal.downloads.sfx_library_url 
            : ('/api/download?type=sfx-library' + tokenQuery);

          downloadsContainer.innerHTML = 
            '<div class="sfx-dashboard-card">' +
              '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">' +
                '<div style="font-size: 13px; font-weight: 700; color: #fff;">Download Plugin &amp; SFX Library</div>' +
                '<span class="sfx-badge-status active">Unlocked</span>' +
              '</div>' +
              '<div style="font-size: 11.5px; color: var(--sfx-text-muted); margin-bottom: 12px;">Compatible with Premiere Pro &amp; After Effects CC 2021 – 2026 (Windows &amp; macOS Apple Silicon / Intel)</div>' +
              '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">' +
                '<a href="' + zxpUrl + '" download class="sfx-button sfx-button--quiet" style="height: 38px; border: 1px solid var(--sfx-border); justify-content: center; font-size: 12px; color: #fff; background: #121418; text-decoration: none;">' +
                  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>' +
                  'ZXP Installer (.zxp)' +
                '</a>' +
                '<a href="' + zipUrl + '" download class="sfx-button sfx-button--quiet" style="height: 38px; border: 1px solid var(--sfx-border); justify-content: center; font-size: 12px; color: #fff; background: #121418; text-decoration: none;">' +
                  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>' +
                  'Manual CEP ZIP (.zip)' +
                '</a>' +
              '</div>' +
              '<a href="' + sfxLibUrl + '" id="cdm-sfx-library-btn" target="_blank" rel="noopener noreferrer" class="sfx-button" style="height: 38px; width: 100%; border: 1px solid #10b981; justify-content: center; font-size: 12px; font-weight: 700; color: #fff; background: #059669; text-decoration: none;">' +
                '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>' +
                'Download 7GB SFX Library (Google Drive)' +
              '</a>' +
            '</div>';
        }
      }

      // Render Orders
      if (ordersTbody) {
        var orders = portal.orders || [];
        if (!orders.length) {
          ordersTbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--sfx-text-muted); padding: 14px;">No purchase orders found.</td></tr>';
        } else {
          ordersTbody.innerHTML = orders.map(function (ord) {
            var date = new Date(ord.created_at).toLocaleDateString();
            var badge = ord.payment_status === 'completed'
              ? '<span class="sfx-badge-status active">Paid</span>'
              : '<span class="sfx-badge-status revoked" style="color:#ff9f0a; border-color:#ff9f0a;">Pending</span>';

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
    faqItems.forEach(function (item) {
      var questionBtn = item.querySelector('.faq-question');
      if (questionBtn) {
        questionBtn.addEventListener('click', function () {
          var isOpen = item.classList.contains('is-open');

          // Close other items for neatness
          faqItems.forEach(function (other) {
            other.classList.remove('is-open');
            var otherBtn = other.querySelector('.faq-question');
            if (otherBtn) otherBtn.setAttribute('aria-expanded', 'false');
          });

          if (!isOpen) {
            item.classList.add('is-open');
            questionBtn.setAttribute('aria-expanded', 'true');
          }
        });
      }
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
      btn.addEventListener('click', function () {
        filterBtns.forEach(function (b) { b.classList.remove('is-active'); });
        this.classList.add('is-active');
        currentCategory = this.getAttribute('data-filter') || 'all';
        filterFolders();
      });
    });

    // Expand/Collapse folder card on click
    folderCards.forEach(function (card) {
      var head = card.querySelector('.sfx-folder-card-head');
      if (head) {
        head.addEventListener('click', function () {
          card.classList.toggle('is-expanded');
        });
      }
    });
  }
})();
