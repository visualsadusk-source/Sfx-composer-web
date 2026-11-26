/**
 * js/feature-flags.js
 * Central feature flags for SFX Composer website.
 * Toggle ENABLE_AUDIO_EFFECTS_STORE to true to restore the Audio Effects / 7GB SFX Library store.
 */
(function () {
  window.SFX_FEATURE_FLAGS = Object.freeze({
    ENABLE_AUDIO_EFFECTS_STORE: false
  });

  if (!window.SFX_FEATURE_FLAGS.ENABLE_AUDIO_EFFECTS_STORE) {
    document.documentElement.classList.add('sfx-audio-store-hidden');

    // Inject minimal CSS to immediately hide Audio Effects store tabs/links/sections before paint
    var style = document.createElement('style');
    style.id = 'sfx-feature-flag-styles';
    style.textContent = [
      'html.sfx-audio-store-hidden a[href="library.html"],',
      'html.sfx-audio-store-hidden a[href="/library.html"],',
      'html.sfx-audio-store-hidden a[href^="/library"],',
      'html.sfx-audio-store-hidden .sfx-bundle-hero-banner,',
      'html.sfx-audio-store-hidden #sfx-library,',
      'html.sfx-audio-store-hidden [data-feature="audio-effects-store"] {',
      '  display: none !important;',
      '}'
    ].join('\n');
    document.head.appendChild(style);

    document.addEventListener('DOMContentLoaded', function () {
      // Remove/hide list items in footer that only wrap a hidden library.html link
      document.querySelectorAll('footer li').forEach(function (li) {
        var link = li.querySelector('a[href="library.html"], a[href="/library.html"]');
        if (link) li.style.display = 'none';
      });

      // Update checkout & pricing copy on public pages so Audio Effects / 7GB Library is not offered for sale
      document.querySelectorAll('.ew-pricing-card h3').forEach(function (el) {
        if (el.textContent.indexOf('Ultimate Bundle') !== -1) {
          el.textContent = 'SFX Composer Pro Software';
        }
      });
      document.querySelectorAll('.ew-pricing-card .ew-kicker').forEach(function (el) {
        if (el.textContent.indexOf('Complete Bundle') !== -1) {
          el.innerHTML = '<span class="ew-kicker-dot"></span> Lifetime License';
        }
      });
      document.querySelectorAll('.ew-pricing-card .ew-check-list li').forEach(function (li) {
        if (li.textContent.indexOf('7GB Master SFX Library') !== -1) {
          li.style.display = 'none';
        }
      });
      document.querySelectorAll('.sfx-buy-trigger').forEach(function (btn) {
        if (btn.textContent.indexOf('Complete Bundle') !== -1) {
          btn.textContent = btn.textContent.replace('Buy Complete Bundle', 'Buy SFX Composer');
        }
      });
      document.querySelectorAll('#sfx-checkout-modal div').forEach(function (div) {
        if (div.children.length === 0 && div.textContent.indexOf('Software + 7GB SFX Library') !== -1) {
          div.textContent = 'SFX Composer Pro Software · Lifetime License';
        }
      });

      // On index.html, hide the "7GB Master SFX Library Included" feature card & 7GB stat if present
      document.querySelectorAll('.ew-feature-card').forEach(function (card) {
        if (card.textContent.indexOf('7GB Master SFX Library') !== -1) {
          card.style.display = 'none';
        }
      });
      document.querySelectorAll('.ew-stat').forEach(function (stat) {
        if (stat.textContent.indexOf('Master SFX Library') !== -1) {
          stat.style.display = 'none';
        }
      });
    });
  }
})();
