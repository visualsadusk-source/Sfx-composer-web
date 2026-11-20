/**
 * SFX Composer — Browser Demo Adapter
 * Bridges Adobe Premiere Pro CEP extension APIs to standard Web Browser APIs.
 * Emulates:
 * 1. window.__adobe_cep__ (host environment, evalScript, getSystemPath)
 * 2. window.cep_node & window.require (path, fs virtual in-memory store)
 * 3. window.__sfxServices (library entries, host bridge, logging)
 * 4. Premiere Pro sequence insertion simulator
 */

(function (window) {
  'use strict';

  var REPLY_MAGIC = '@@SFXBOX_REPLY@@';
  var nextReplyId = 1;

  // ── 1. CEP Host Environment Mock ──
  var cepMock = {
    getHostEnvironment: function () {
      return JSON.stringify({
        appId: 'PPRO',
        appName: 'Premiere Pro',
        appVersion: '24.2.0',
        appLocale: 'en_US'
      });
    },

    getCurrentApiVersion: function () {
      return JSON.stringify({ major: 11, minor: 2, micro: 0 });
    },

    getSystemPath: function (pathType) {
      return '/virtual/' + (pathType || 'userData');
    },

    openURLInDefaultBrowser: function (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return true;
    },

    evalScript: function (script, callback) {
      var cb = callback || function () {};
      var replyId = nextReplyId++;

      try {
        // Parse SFXBox.dispatch(JSON_STRING)
        var match = script.match(/SFXBox\.dispatch\(([\s\S]+)\)/);
        if (!match) {
          cb(REPLY_MAGIC + JSON.stringify({ id: replyId, ok: true, ms: 1, result: { success: true } }));
          return;
        }

        var innerJson = JSON.parse(match[1]);
        var envelope = typeof innerJson === 'string' ? JSON.parse(innerJson) : innerJson;
        var cmd = envelope.command || envelope.cmd || '';
        var params = envelope.params || {};

        var result = handleHostCommand(cmd, params);
        var replyPayload = {
          id: envelope.id || replyId,
          ok: true,
          ms: 2,
          result: result
        };

        cb(REPLY_MAGIC + JSON.stringify(replyPayload));
      } catch (err) {
        console.warn('[SFX Composer Browser Adapter] evalScript fallback for:', script, err);
        cb(REPLY_MAGIC + JSON.stringify({
          id: replyId,
          ok: true,
          ms: 1,
          result: { hostKind: 'premiere', appVersion: '24.2.0', hostBundleVersion: '2.4.0' }
        }));
      }
    }
  };

  function handleHostCommand(command, params) {
    switch (command) {
      case 'system.handshake':
        return {
          hostKind: 'premiere',
          appVersion: '24.2.0',
          hostBundleVersion: '2.4.0',
          echo: String(params && params.nonce !== undefined ? params.nonce : '')
        };

      case 'project.info':
        return {
          name: 'Epic_Teaser_Cut_v04.prproj',
          location: '/Projects/Trailers/Epic_Teaser/',
          dirty: false
        };

      case 'timeline.info':
        return {
          active: true,
          name: 'Epic_Teaser_Cut_v04',
          frameRate: 23.976,
          playheadTimecode: '00:01:24:08',
          tracks: [
            { id: 'A1', name: 'A1 (FX / Hits)', muted: false, locked: false },
            { id: 'A2', name: 'A2 (Transitions)', muted: false, locked: false },
            { id: 'A3', name: 'A3 (Ambience)', muted: false, locked: false }
          ]
        };

      case 'sfx.import':
      case 'place_audio':
        var track = (params && (params.track || params.trackIndex)) || 'A1';
        var name = (params && (params.name || params.clipName)) || 'Selected SFX';
        if (window.SFX_PLUGIN_CONTROLLER && window.SFX_PLUGIN_CONTROLLER.showToast) {
          window.SFX_PLUGIN_CONTROLLER.showToast('✓ Placed "' + name + '" on Premiere Pro Track ' + track + ' at playhead (00:01:24:08)');
        }
        return {
          success: true,
          track: track,
          playhead: '00:01:24:08',
          clipId: 'clip_' + Date.now()
        };

      default:
        return { success: true, command: command };
    }
  }

  // Install CEP mock if running in a standard web browser
  if (!window.__adobe_cep__) {
    window.__adobe_cep__ = cepMock;
  }

  // ── 2. Virtual Node.js Environment (cep_node & require) ──
  var pathShim = {
    basename: function (p, ext) {
      var base = String(p || '').split(/[\\/]/).pop() || '';
      if (ext && base.endsWith(ext)) base = base.slice(0, -ext.length);
      return base;
    },
    dirname: function (p) {
      var parts = String(p || '').split(/[\\/]/);
      parts.pop();
      return parts.join('/') || '.';
    },
    extname: function (p) {
      var base = pathShim.basename(p);
      var idx = base.lastIndexOf('.');
      return idx > 0 ? base.slice(idx) : '';
    },
    join: function () {
      var parts = Array.prototype.slice.call(arguments).filter(Boolean);
      return parts.join('/').replace(/\/+/g, '/');
    },
    resolve: function () {
      return pathShim.join.apply(null, arguments);
    }
  };

  var osShim = {
    homedir: function () { return '/Users/demo'; },
    platform: function () { return navigator.platform && navigator.platform.includes('Win') ? 'win32' : 'darwin'; },
    tmpdir: function () { return '/tmp'; }
  };

  var virtualFs = {
    existsSync: function () { return true; },
    statSync: function (p) {
      return {
        isFile: function () { return true; },
        isDirectory: function () { return false; },
        size: 154200,
        mtime: new Date()
      };
    },
    readFileSync: function (filePath, encoding) {
      if (typeof filePath === 'string' && filePath.endsWith('.json')) {
        return JSON.stringify({
          version: 2,
          assets: (window.SFX_AUDIO_CATALOG || []).map(function (s) {
            return {
              id: s.id,
              name: s.name,
              path: s.url || ('assets/audio/' + s.file),
              category: s.cat,
              tags: s.tags || [],
              duration: s.duration || 1.5,
              sizeBytes: 120000
            };
          })
        });
      }
      return new Uint8Array(64);
    },
    writeFileSync: function () { return true; },
    mkdirSync: function () { return true; }
  };

  var nodeRequireShim = function (mod) {
    if (mod === 'path') return pathShim;
    if (mod === 'os') return osShim;
    if (mod === 'fs') return virtualFs;
    return {};
  };

  if (!window.cep_node) {
    window.cep_node = { require: nodeRequireShim };
  }
  if (!window.require) {
    window.require = nodeRequireShim;
  }

  // ── 3. Host Services Bridge (__sfxServices) ──
  var activeListeners = new Set();
  var servicesMock = {
    bridge: {
      invoke: function (cmd, params) {
        return new Promise(function (resolve) {
          setTimeout(function () {
            resolve(handleHostCommand(cmd, params));
          }, 30);
        });
      }
    },
    library: {
      entries: function () {
        return (window.SFX_AUDIO_CATALOG || []).map(function (c) {
          return {
            id: c.id,
            name: c.name,
            path: c.url,
            category: c.cat,
            keywords: c.tags || [],
            duration: c.duration || 1.4
          };
        });
      },
      allEntries: function () {
        return servicesMock.library.entries();
      },
      subscribe: function (fn) {
        activeListeners.add(fn);
        return function () { activeListeners.delete(fn); };
      },
      rescan: function () {
        return Promise.resolve(servicesMock.library.entries());
      },
      toggleFavourite: function (id) {
        if (window.SFX_PLUGIN_CONTROLLER) {
          window.SFX_PLUGIN_CONTROLLER.state.favorites[id] = !window.SFX_PLUGIN_CONTROLLER.state.favorites[id];
        }
        return Promise.resolve(true);
      }
    },
    log: {
      info: function () {},
      warn: function () {},
      error: function () {}
    }
  };

  window.__sfxServices = servicesMock;

  console.log('[SFX Composer] Browser Demo Adapter loaded successfully.');
})(window);
