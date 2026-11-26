/**
 * js/release-service.js
 * Automatic Latest-Release Detection for SFX Composer Website.
 * - Zero GitHub tokens or service-role credentials in frontend code.
 * - Reads public release metadata from Supabase `latest-release` Edge Function
 *   (or official public `Sfx-composer-updt/main/version.json` manifest).
 * - Never fabricates releases or falls back to hardcoded outdated ZXP URLs.
 */
(function (window) {
  'use strict';

  var BASELINE_VERSION = '2.2.0';
  var EXPECTED_EXTENSION_ID = 'com.sfxcomposer.panel';
  var CACHE_KEY = 'sfx_latest_release_cache_v1';
  var CACHE_TTL_MS = 5 * 60 * 1000;
  var EDGE_RELEASE_URL = 'https://wyjazmiihwjlrkggeeez.supabase.co/functions/v1/latest-release';
  var MANIFEST_URL = 'https://raw.githubusercontent.com/visualsadusk-source/Sfx-composer-updt/main/version.json';

  function isValidSemver(v) {
    return /^\d+\.\d+\.\d+$/.test(String(v || '').trim());
  }

  function compareSemver(a, b) {
    var pa = String(a || '0.0.0').split('.').map(function (n) { return parseInt(n, 10) || 0; });
    var pb = String(b || '0.0.0').split('.').map(function (n) { return parseInt(n, 10) || 0; });
    for (var i = 0; i < 3; i++) {
      if ((pa[i] || 0) > (pb[i] || 0)) return 1;
      if ((pa[i] || 0) < (pb[i] || 0)) return -1;
    }
    return 0;
  }

  function normalizeRelease(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.extension_id !== EXPECTED_EXTENSION_ID) return null;
    var ver = String(raw.latest_version || '').trim();
    if (!isValidSemver(ver)) return null;
    if (raw.approved === false || raw.status === 'draft' || raw.status === 'unapproved') return null;
    return {
      ok: true,
      product: String(raw.product || 'SFX Composer'),
      extension_id: EXPECTED_EXTENSION_ID,
      latest_version: ver,
      release_date: String(raw.release_date || ''),
      changelog: Array.isArray(raw.changelog) ? raw.changelog : [],
      release_notes_url: String(raw.release_notes_url || ''),
      sha256: raw.sha256 || (raw.downloads && raw.downloads.windows && raw.downloads.windows.sha256) || null
    };
  }

  function readCache() {
    try {
      var raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (parsed && parsed.expiresAt > Date.now() && parsed.data) {
        return parsed.data;
      }
    } catch (e) {}
    return null;
  }

  function writeCache(data) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({
        expiresAt: Date.now() + CACHE_TTL_MS,
        data: data
      }));
    } catch (e) {}
  }

  async function fetchLatestRelease(forceRefresh) {
    if (!forceRefresh) {
      var cached = readCache();
      if (cached) return cached;
    }

    var urls = [EDGE_RELEASE_URL, MANIFEST_URL];
    for (var i = 0; i < urls.length; i++) {
      try {
        var res = await fetch(urls[i], { headers: { Accept: 'application/json' } });
        if (!res.ok) continue;
        var json = await res.json();
        var normalized = normalizeRelease(json);
        if (normalized) {
          writeCache(normalized);
          return normalized;
        }
      } catch (e) {
        // Try next public metadata source or fail gracefully
      }
    }
    return null;
  }

  function applyVersionToDom(release) {
    if (!release) return;
    var ver = release.latest_version;
    document.querySelectorAll('[data-sfx-version]').forEach(function (el) {
      var prefix = el.getAttribute('data-sfx-version-prefix') || '';
      el.textContent = prefix + ver;
    });

    if (compareSemver(ver, BASELINE_VERSION) > 0) {
      document.querySelectorAll('[data-sfx-new-release-badge]').forEach(function (badge) {
        badge.textContent = 'New Version Available · v' + ver;
        badge.style.display = 'inline-flex';
      });
    }
  }

  window.SFXReleaseService = {
    BASELINE_VERSION: BASELINE_VERSION,
    compareSemver: compareSemver,
    isValidSemver: isValidSemver,
    normalizeRelease: normalizeRelease,
    getLatestRelease: fetchLatestRelease
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      fetchLatestRelease(false).then(applyVersionToDom);
    });
  } else {
    fetchLatestRelease(false).then(applyVersionToDom);
  }
})(window);
