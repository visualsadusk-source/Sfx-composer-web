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
        var alpha = l === 0 ? 0.9 : (l === 1 ? 0.45 : 0.25);
        ctx.strokeStyle = l === 0 ? '#35EA86' : 'rgba(53, 234, 134, ' + alpha + ')';
        ctx.lineWidth = l === 0 ? 2.5 : 1.5;

        if (l === 0) {
          ctx.shadowColor = '#35EA86';
          ctx.shadowBlur = 12;
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
      document.body.style.overflow = 'hidden';
    }

    function closeVideoModal() {
      if (modal) modal.classList.remove('is-open');
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

    function openCheckout() {
      if (modal) {
        modal.classList.add('is-open');
        document.body.style.overflow = 'hidden';
        if (checkoutForm) checkoutForm.style.display = 'flex';
        if (successView) successView.style.display = 'none';
        if (errorMsg) errorMsg.style.display = 'none';
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg> Pay ₹199 via Razorpay';
        }
      }
    }

    function closeCheckout() {
      if (modal) {
        modal.classList.remove('is-open');
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
            description: 'SFX Composer Pro Lifetime License',
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

    // Auth View Elements
    var authView = document.getElementById('cdm-auth-view');
    var dashboardView = document.getElementById('cdm-dashboard-view');
    var recentSessionBanner = document.getElementById('cdm-recent-session-banner');
    var recentSessionEmail = document.getElementById('cdm-recent-session-email');
    var btnInstantUnlock = document.getElementById('cdm-btn-instant-unlock');
    var formRequestOtp = document.getElementById('cdm-form-request-otp');
    var emailInput = document.getElementById('cdm-email-input');
    var btnSendOtp = document.getElementById('cdm-btn-send-otp');
    var otpStep = document.getElementById('cdm-otp-step');
    var otpInput = document.getElementById('cdm-otp-input');
    var btnVerifyOtp = document.getElementById('cdm-btn-verify-otp');
    var btnResendOtp = document.getElementById('cdm-btn-resend-otp');
    var btnChangeEmail = document.getElementById('cdm-btn-change-email');
    var authStatus = document.getElementById('cdm-auth-status');

    // Dashboard View Elements
    var authEmailDisplay = document.getElementById('cdm-auth-email-display');
    var btnSignout = document.getElementById('cdm-btn-signout');
    var licensesContainer = document.getElementById('cdm-licenses-container');
    var ordersTbody = document.getElementById('cdm-orders-tbody');

    var currentAuthEmail = '';
    var activeCustomerSession = null;

    // Initialize client-side Supabase for customer auth
    var supabaseClient = null;
    try {
      if (window.supabase && window.SFX_PAYMENT_SERVICE) {
        var cfg = window.SFX_PAYMENT_SERVICE.getConfig();
        supabaseClient = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
      }
    } catch (e) {
      console.warn('Customer portal Supabase client init warning:', e);
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

    async function checkCurrentSession() {
      // 1. Check Supabase Auth session first
      if (supabaseClient) {
        try {
          var { data: sessData } = await supabaseClient.auth.getSession();
          if (sessData && sessData.session && sessData.session.user) {
            await loadVerifiedPortalData(sessData.session.access_token, sessData.session.user.email);
            return true;
          }
        } catch (e) {}
      }

      // 2. Check local checkout session proof (if customer just completed purchase)
      try {
        var rawSess = localStorage.getItem('sfx_customer_session');
        if (rawSess) {
          var cached = JSON.parse(rawSess);
          if (cached && cached.email && (cached.order_id || cached.license_key)) {
            activeCustomerSession = cached;
            if (recentSessionBanner && recentSessionEmail) {
              recentSessionEmail.textContent = cached.email;
              recentSessionBanner.style.display = 'block';
            }
          }
        }
      } catch (e) {}

      showAuthView();
      return false;
    }

    function showAuthView() {
      if (authView) authView.style.display = 'block';
      if (dashboardView) dashboardView.style.display = 'none';
    }

    function showDashboardView() {
      if (authView) authView.style.display = 'none';
      if (dashboardView) dashboardView.style.display = 'flex';
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
          await loadVerifiedPortalData(activeCustomerSession, activeCustomerSession.email);
        } catch (err) {
          setAuthStatus('Could not verify recent session: ' + err.message, false);
        } finally {
          this.disabled = false;
          this.textContent = 'Open My Dashboard';
        }
      });
    }

    // Step 1: Request OTP email
    if (formRequestOtp) {
      formRequestOtp.addEventListener('submit', async function (e) {
        e.preventDefault();
        var email = (emailInput?.value || '').trim().toLowerCase();
        if (!email) return;

        currentAuthEmail = email;
        btnSendOtp.disabled = true;
        btnSendOtp.textContent = 'Sending Code…';
        setAuthStatus('', true);

        try {
          if (!supabaseClient) {
            throw new Error('Supabase client unavailable');
          }

          var { error } = await supabaseClient.auth.signInWithOtp({
            email: email,
            options: {
              shouldCreateUser: true
            }
          });

          if (error) throw error;

          if (otpStep) otpStep.style.display = 'block';
          setAuthStatus('Verification code sent to ' + email + '. Check your inbox or spam.', true);
          if (otpInput) {
            otpInput.value = '';
            otpInput.focus();
          }
        } catch (err) {
          setAuthStatus('Could not send verification code: ' + err.message, false);
        } finally {
          btnSendOtp.disabled = false;
          btnSendOtp.textContent = 'Send Code';
        }
      });
    }

    // Step 2: Verify OTP
    if (btnVerifyOtp) {
      btnVerifyOtp.addEventListener('click', async function () {
        var email = currentAuthEmail || (emailInput?.value || '').trim().toLowerCase();
        var code = (otpInput?.value || '').trim();

        if (!email) {
          setAuthStatus('Please enter your email first.', false);
          return;
        }
        if (!code || code.length < 6) {
          setAuthStatus('Please enter the full 6-digit code from your email.', false);
          return;
        }

        btnVerifyOtp.disabled = true;
        btnVerifyOtp.textContent = 'Verifying…';
        setAuthStatus('', true);

        try {
          if (!supabaseClient) throw new Error('Supabase client unavailable');

          var { data, error } = await supabaseClient.auth.verifyOtp({
            email: email,
            token: code,
            type: 'email'
          });

          if (error) throw error;

          if (data && data.session) {
            await loadVerifiedPortalData(data.session.access_token, email);
          } else {
            throw new Error('Verification failed. Invalid code.');
          }
        } catch (err) {
          setAuthStatus('Verification error: ' + err.message, false);
        } finally {
          btnVerifyOtp.disabled = false;
          btnVerifyOtp.textContent = 'Verify & Access';
        }
      });
    }

    // Resend OTP
    if (btnResendOtp) {
      btnResendOtp.addEventListener('click', function () {
        if (formRequestOtp) formRequestOtp.dispatchEvent(new Event('submit'));
      });
    }

    // Change email
    if (btnChangeEmail) {
      btnChangeEmail.addEventListener('click', function () {
        if (otpStep) otpStep.style.display = 'none';
        if (emailInput) emailInput.focus();
        setAuthStatus('', true);
      });
    }

    // Sign out / switch account
    if (btnSignout) {
      btnSignout.addEventListener('click', async function () {
        if (supabaseClient) {
          await supabaseClient.auth.signOut().catch(function () {});
        }
        localStorage.removeItem('sfx_customer_session');
        activeCustomerSession = null;
        currentAuthEmail = '';
        if (recentSessionBanner) recentSessionBanner.style.display = 'none';
        if (otpStep) otpStep.style.display = 'none';
        if (emailInput) emailInput.value = '';
        if (otpInput) otpInput.value = '';
        setAuthStatus('', true);
        showAuthView();
      });
    }

    // Fetch and render verified portal data
    async function loadVerifiedPortalData(authArg, emailHint) {
      var portal = await window.SFX_PAYMENT_SERVICE.getCustomerPortal(authArg);
      var email = portal.email || emailHint || 'Customer';

      if (authEmailDisplay) {
        authEmailDisplay.textContent = email;
      }

      // Render Licenses List
      if (licensesContainer) {
        var licenses = portal.licenses || [];
        if (!licenses.length) {
          licensesContainer.innerHTML = 
            '<div class="sfx-dashboard-card" style="text-align: center; padding: 24px;">' +
              '<div style="font-size: 14px; color: var(--sfx-caution); font-weight: 700; margin-bottom: 6px;">No Active Licenses Found</div>' +
              '<div style="font-size: 12px; color: var(--sfx-text-muted); margin-bottom: 14px;">We could not find an issued license for ' + email + '. Complete a purchase for ₹199 to instantly unlock SFX Composer.</div>' +
              '<a href="#buy-now" class="sfx-site-btn-primary" style="padding: 8px 18px; font-size: 12px; display: inline-block;">Purchase Lifetime License (₹199)</a>' +
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

            // Key Display
            var keyBoxHtml = '';
            if (lic.license_key) {
              keyBoxHtml = 
                '<div style="background: #000; border: 1px solid var(--sfx-accent); border-radius: 8px; padding: 14px; margin: 12px 0;">' +
                  '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">' +
                    '<span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--sfx-accent); font-weight: 700;">Your Official License Key</span>' +
                    '<span style="font-size: 11px; color: var(--sfx-text-muted);">Never share this key</span>' +
                  '</div>' +
                  '<div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">' +
                    '<code style="font-family: var(--sfx-font-mono); font-size: 18px; font-weight: 800; color: #ffffff; letter-spacing: 0.08em; user-select: all;">' + lic.license_key + '</code>' +
                    '<button type="button" class="btn-copy-portal-key sfx-button sfx-button--quiet" data-key="' + lic.license_key + '" style="height: 30px; font-size: 11px; padding: 0 12px; border: 1px solid var(--sfx-border); color: #fff;">' +
                      'Copy Key' +
                    '</button>' +
                  '</div>' +
                '</div>';
            } else {
              keyBoxHtml = '<div style="font-size: 12px; color: var(--sfx-text-muted); padding: 8px 0;">License key verified. Enter registered email in plugin to activate.</div>';
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

          // Transfer workstation listener
          licensesContainer.querySelectorAll('.btn-portal-reset-device').forEach(function (btn) {
            btn.addEventListener('click', function () {
              alert('To transfer your workstation license: Simply open SFX Composer on your new workstation in Premiere Pro or After Effects, enter your registered email (' + email + ') and license key. The server will automatically rebind your activation slot.');
            });
          });
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
})();
