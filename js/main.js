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
    setupAdminPortalModal();
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
        var cdm = document.getElementById('customer-dashboard-modal');
        if (cdm) {
          cdm.classList.add('is-open');
          var email = successEmailDisp ? successEmailDisp.textContent : '';
          if (email) {
            var lookupInput = document.getElementById('cdm-lookup-email');
            if (lookupInput) {
              lookupInput.value = email;
              document.getElementById('cdm-lookup-btn')?.click();
            }
          }
        }
      });
    }

    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal && modal.classList.contains('is-open')) {
        closeCheckout();
      }
    });
  }

  // ── 5. CUSTOMER DASHBOARD & LICENSE MANAGER ──
  function setupCustomerDashboard() {
    var modal = document.getElementById('customer-dashboard-modal');
    var modalClose = document.getElementById('cdm-close');
    var modalBackdrop = document.getElementById('cdm-backdrop');
    var openBtn = document.getElementById('open-customer-dashboard-btn');
    var lookupEmail = document.getElementById('cdm-lookup-email');
    var lookupBtn = document.getElementById('cdm-lookup-btn');
    var statusMsg = document.getElementById('cdm-status-msg');
    var displayOwner = document.getElementById('cdm-display-owner');
    var displayStatus = document.getElementById('cdm-display-status');
    var displayDevice = document.getElementById('cdm-display-device');
    var btnResetDevice = document.getElementById('cdm-btn-reset-device');
    var ordersTbody = document.getElementById('cdm-orders-tbody');

    var currentLoadedCustomer = null;

    function openDashboard() {
      if (modal) {
        modal.classList.add('is-open');
        document.body.style.overflow = 'hidden';

        // Auto load from cache if available
        try {
          var raw = localStorage.getItem('sfx_customer_session');
          if (raw) {
            var sess = JSON.parse(raw);
            if (sess.email && lookupEmail && !lookupEmail.value) {
              lookupEmail.value = sess.email;
              loadCustomerData(sess.email);
            }
          }
        } catch (e) {}
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

    if (lookupBtn) {
      lookupBtn.addEventListener('click', function () {
        var email = lookupEmail.value.trim().toLowerCase();
        if (!email) return;
        loadCustomerData(email);
      });
    }

    async function loadCustomerData(email) {
      lookupBtn.disabled = true;
      lookupBtn.textContent = 'Loading…';
      if (statusMsg) statusMsg.style.display = 'none';

      try {
        var portal = await window.SFX_PAYMENT_SERVICE.getCustomerPortal(email);
        currentLoadedCustomer = portal;

        if (!portal.found) {
          if (statusMsg) {
            statusMsg.textContent = 'No purchase records found for ' + email + '. Complete checkout to get access.';
            statusMsg.style.display = 'block';
            statusMsg.style.background = 'rgba(255, 214, 10, 0.15)';
            statusMsg.style.color = 'var(--sfx-caution)';
          }
          if (displayOwner) displayOwner.textContent = 'Unregistered: ' + email;
          if (ordersTbody) {
            ordersTbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color: var(--sfx-text-muted);">No orders found.</td></tr>';
          }
          lookupBtn.disabled = false;
          lookupBtn.textContent = 'Lookup Account';
          return;
        }

        if (displayOwner) displayOwner.textContent = 'Licensed to: ' + portal.email;

        // Render Licenses
        var lic = portal.licenses && portal.licenses[0];
        if (lic) {
          if (displayStatus) {
            displayStatus.textContent = lic.status === 'active' ? 'Active Lifetime' : 'Revoked';
            displayStatus.className = 'sfx-badge-status ' + (lic.status === 'active' ? 'active' : 'revoked');
          }
          var activeDevs = lic.active_devices || [];
          if (displayDevice) {
            if (activeDevs.length > 0) {
              displayDevice.textContent = 'Activated on: ' + (activeDevs[0].device_name || 'Workstation');
            } else {
              displayDevice.textContent = 'Available for activation (1 Workstation Slot)';
            }
          }
        }

        // Render Orders Table
        if (ordersTbody) {
          var orders = portal.orders || [];
          if (orders.length === 0) {
            ordersTbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color: var(--sfx-text-muted);">No orders found.</td></tr>';
          } else {
            ordersTbody.innerHTML = orders.map(function (ord) {
              var date = new Date(ord.created_at).toLocaleDateString();
              return '<tr>' +
                '<td><code style="font-size:11px;">' + (ord.provider_order_id || ord.id.substring(0, 8)) + '</code></td>' +
                '<td>₹' + ord.amount + '</td>' +
                '<td><span class="sfx-badge-status active">' + ord.payment_status + '</span></td>' +
                '<td>' + date + '</td>' +
              '</tr>';
            }).join('');
          }
        }

        if (statusMsg) {
          statusMsg.textContent = 'Account verified: Lifetime Pro license active.';
          statusMsg.style.display = 'block';
          statusMsg.style.background = 'rgba(48, 209, 88, 0.15)';
          statusMsg.style.color = 'var(--sfx-positive)';
        }
      } catch (err) {
        if (statusMsg) {
          statusMsg.textContent = 'Error: ' + err.message;
          statusMsg.style.display = 'block';
          statusMsg.style.background = 'rgba(255, 69, 58, 0.15)';
          statusMsg.style.color = 'var(--sfx-critical)';
        }
      } finally {
        lookupBtn.disabled = false;
        lookupBtn.textContent = 'Lookup Account';
      }
    }

    if (btnResetDevice) {
      btnResetDevice.addEventListener('click', function () {
        alert('Workstation reset requested. When launching SFX Composer on your new machine, enter your registered email and license key to bind the new workstation.');
      });
    }

    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal && modal.classList.contains('is-open')) {
        closeDashboard();
      }
    });
  }

  // ── 6. ADMIN LICENSE & OPERATIONS PORTAL MODAL ──
  function setupAdminPortalModal() {
    var modal = document.getElementById('admin-portal-modal');
    var modalClose = document.getElementById('apm-close');
    var modalBackdrop = document.getElementById('apm-backdrop');
    var openBtn = document.getElementById('open-admin-portal-btn');
    var keyInput = document.getElementById('apm-service-key-input');
    var connectBtn = document.getElementById('apm-btn-connect');
    var apmContent = document.getElementById('apm-content');

    var statSales = document.getElementById('apm-stat-sales');
    var statRev = document.getElementById('apm-stat-rev');
    var statTotal = document.getElementById('apm-stat-total');
    var statActive = document.getElementById('apm-stat-active');
    var statRevoked = document.getElementById('apm-stat-revoked');

    var searchInput = document.getElementById('apm-search-input');
    var licensesTbody = document.getElementById('apm-licenses-tbody');
    var ordersTbody = document.getElementById('apm-orders-tbody');
    var issueForm = document.getElementById('apm-form-issue');
    var issueResult = document.getElementById('apm-issue-result');

    function openAdminModal() {
      if (modal) {
        modal.classList.add('is-open');
        document.body.style.overflow = 'hidden';

        var savedKey = sessionStorage.getItem('sfx_admin_key');
        if (savedKey) {
          keyInput.value = savedKey;
          loadAdminDashboard(savedKey);
        }
      }
    }

    function closeAdminModal() {
      if (modal) {
        modal.classList.remove('is-open');
        document.body.style.overflow = '';
      }
    }

    if (openBtn) {
      openBtn.addEventListener('click', function (e) {
        // Navigate directly to dedicated Admin Dashboard
        window.location.href = 'admin.html';
      });
    }

    if (modalClose) modalClose.addEventListener('click', closeAdminModal);
    if (modalBackdrop) modalBackdrop.addEventListener('click', closeAdminModal);

    if (connectBtn) {
      connectBtn.addEventListener('click', function () {
        var key = keyInput.value.trim();
        if (!key) return alert('Supabase Service Role Key required');
        sessionStorage.setItem('sfx_admin_key', key);
        loadAdminDashboard(key);
      });
    }

    async function loadAdminDashboard(key) {
      connectBtn.disabled = true;
      connectBtn.textContent = 'Verifying…';

      try {
        var stats = await window.SFX_PAYMENT_SERVICE.getAdminStats(key);
        if (statSales) statSales.textContent = stats.total_sales || 0;
        if (statRev) statRev.textContent = '₹' + (stats.total_revenue || 0);
        if (statTotal) statTotal.textContent = stats.total_licenses || 0;
        if (statActive) statActive.textContent = stats.active_licenses || 0;
        if (statRevoked) statRevoked.textContent = stats.revoked_licenses || 0;

        await loadLicensesList(key);
        await loadOrdersList(key);
        if (apmContent) apmContent.style.display = 'flex';
      } catch (err) {
        alert('Admin connection failed: ' + err.message);
      } finally {
        connectBtn.disabled = false;
        connectBtn.textContent = 'Connected';
      }
    }

    async function loadLicensesList(key, query) {
      if (!licensesTbody) return;
      licensesTbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--sfx-text-muted);">Loading licenses…</td></tr>';
      try {
        var list = await window.SFX_PAYMENT_SERVICE.searchAdminLicenses(key, query || '');
        if (!list || !list.length) {
          licensesTbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--sfx-text-muted);">No licenses found.</td></tr>';
          return;
        }

        licensesTbody.innerHTML = list.map(function (lic) {
          var date = new Date(lic.created_at).toLocaleDateString();
          var devCount = (lic.active_devices || []).length;
          var devLabel = devCount + ' / ' + (lic.max_devices || 1);
          var statusBadge = lic.status === 'active' ? '<span class="sfx-badge-status active">Active</span>' : '<span class="sfx-badge-status revoked">Revoked</span>';

          return '<tr>' +
            '<td><strong>' + lic.email + '</strong></td>' +
            '<td>' + statusBadge + '</td>' +
            '<td>' + devLabel + '</td>' +
            '<td>' + date + '</td>' +
            '<td>' +
              '<button type="button" class="sfx-button sfx-button--quiet btn-admin-reset" data-id="' + lic.id + '" style="font-size: 10.5px; padding: 2px 6px; margin-right: 4px; border: 1px solid var(--sfx-border);">Reset Device</button>' +
              (lic.status === 'active' ? '<button type="button" class="sfx-button sfx-button--quiet btn-admin-revoke" data-id="' + lic.id + '" style="font-size: 10.5px; padding: 2px 6px; border: 1px solid #ff453a; color: #ff453a;">Revoke</button>' : '<span style="color:#8c8c98; font-size:10.5px;">Revoked</span>') +
            '</td>' +
          '</tr>';
        }).join('');

        licensesTbody.querySelectorAll('.btn-admin-reset').forEach(function (btn) {
          btn.addEventListener('click', async function () {
            var licId = this.getAttribute('data-id');
            var k = sessionStorage.getItem('sfx_admin_key');
            if (confirm('Free device slots for this license?')) {
              await window.SFX_PAYMENT_SERVICE.resetDevice(k, licId);
              loadAdminDashboard(k);
            }
          });
        });

        licensesTbody.querySelectorAll('.btn-admin-revoke').forEach(function (btn) {
          btn.addEventListener('click', async function () {
            var licId = this.getAttribute('data-id');
            var k = sessionStorage.getItem('sfx_admin_key');
            var reason = prompt('Reason for revocation:', 'Refunded');
            if (reason) {
              await window.SFX_PAYMENT_SERVICE.revokeLicense(k, licId, reason);
              loadAdminDashboard(k);
            }
          });
        });
      } catch (e) {
        licensesTbody.innerHTML = '<tr><td colspan="5" style="color:var(--sfx-critical);">' + e.message + '</td></tr>';
      }
    }

    async function loadOrdersList(key) {
      if (!ordersTbody) return;
      ordersTbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--sfx-text-muted);">Loading orders…</td></tr>';
      try {
        var orders = await window.SFX_PAYMENT_SERVICE.getAdminOrders(key, 50);
        if (!orders || !orders.length) {
          ordersTbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--sfx-text-muted);">No payment orders.</td></tr>';
          return;
        }

        ordersTbody.innerHTML = orders.map(function (ord) {
          var date = new Date(ord.created_at).toLocaleDateString();
          var stClass = ord.payment_status === 'completed' ? 'active' : 'pending';
          return '<tr>' +
            '<td><strong>' + ord.customer_email + '</strong></td>' +
            '<td>₹' + ord.amount + '</td>' +
            '<td>' + ord.payment_provider + '</td>' +
            '<td><code style="font-size: 10.5px;">' + (ord.provider_payment_id || '—') + '</code></td>' +
            '<td><span class="sfx-badge-status ' + stClass + '">' + ord.payment_status + '</span></td>' +
            '<td>' + date + '</td>' +
          '</tr>';
        }).join('');
      } catch (e) {
        ordersTbody.innerHTML = '<tr><td colspan="6" style="color:var(--sfx-critical);">' + e.message + '</td></tr>';
      }
    }

    if (searchInput) {
      searchInput.addEventListener('input', function () {
        var k = sessionStorage.getItem('sfx_admin_key');
        if (k) loadLicensesList(k, this.value.trim());
      });
    }

    if (issueForm) {
      issueForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        var email = document.getElementById('apm-issue-email').value.trim();
        var sendEmail = document.getElementById('apm-issue-send-email').checked;
        var k = sessionStorage.getItem('sfx_admin_key');

        if (issueResult) {
          issueResult.style.display = 'block';
          issueResult.textContent = 'Generating cryptographic license…';
        }

        try {
          var res = await window.SFX_PAYMENT_SERVICE.issueComplimentaryLicense(k, email, 'pro', 'lifetime', sendEmail);
          if (res.ok) {
            issueResult.innerHTML = '<strong style="color: var(--sfx-positive);">License Issued!</strong><br/>' +
              'Key: <code style="color: var(--sfx-accent); font-weight: 800; font-size: 13px;">' + res.license_key + '</code><br/>' +
              'Customer: ' + res.email + '<br/>' +
              'Email status: ' + (res.email_delivery?.info || 'Not sent');
            loadAdminDashboard(k);
          } else {
            issueResult.innerHTML = '<span style="color: var(--sfx-critical);">Error: ' + res.message + '</span>';
          }
        } catch (err) {
          issueResult.innerHTML = '<span style="color: var(--sfx-critical);">Error: ' + err.message + '</span>';
        }
      });
    }

    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal && modal.classList.contains('is-open')) {
        closeAdminModal();
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
