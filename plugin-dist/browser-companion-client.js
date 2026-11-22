/*
  SFX Composer — companion browser client (panel side).

  The real browser is a separate Chromium (Electron) window, because a CEP
  panel cannot host one. This file is everything the panel needs to work with it:

    install()   downloads the official Electron runtime for this computer from
                the official GitHub release, checks it against a pinned SHA-256,
                unpacks it, and copies the companion app (../browser-companion)
                into it. Nothing is installed system-wide.
    launch()    starts it, then waits until its bridge answers.
    api()       talks to the bridge over http://127.0.0.1 with the bearer token
                the companion wrote to bridge.json (readable only by this user).
    subscribe() live download/tab state, kept in sync by a long-poll loop that
                merges updates idempotently (same id = same row, never a duplicate).
    readOffline()  the saved download history, for when the browser isn't running.

  Exposed as window.__sfxCompanion.
*/
(function () {
  'use strict';

  var ELECTRON_VERSION = '44.9.3';
  var RELEASE_BASE = 'https://github.com/electron/electron/releases/download/v' + ELECTRON_VERSION + '/';
  // Only these hosts may serve the runtime (GitHub redirects release assets between them).
  var DOWNLOAD_HOSTS = /^(github\.com|objects\.githubusercontent\.com|release-assets\.githubusercontent\.com)$/;

  /*
    SHA-256 of each official release zip, copied from the release's own
    SHASUMS256.txt. A download that doesn't match is deleted, not used.
  */
  var RUNTIMES = {
    'win32-x64': {
      zip: 'electron-v' + ELECTRON_VERSION + '-win32-x64.zip',
      sha256: '41a1ffa0541cb0f2c9b9fe920dd2cef1793ad0ea2ada1a9582958880f4d1b23c',
      exe: 'electron.exe', app: 'resources/app', unpack: 'powershell', approxMb: 151
    },
    'win32-arm64': {
      zip: 'electron-v' + ELECTRON_VERSION + '-win32-arm64.zip',
      sha256: '66662802d00c2626a203f8909467dab3504def4ce8615c152135b994a5cec220',
      exe: 'electron.exe', app: 'resources/app', unpack: 'powershell', approxMb: 149
    },
    'darwin-x64': {
      zip: 'electron-v' + ELECTRON_VERSION + '-darwin-x64.zip',
      sha256: '451363b59bb7d2c1c9e0c4baa99106004eaabe724aa21a0c6b4c87469293531a',
      exe: 'Electron.app/Contents/MacOS/Electron', app: 'Electron.app/Contents/Resources/app', unpack: 'ditto', approxMb: 130
    },
    'darwin-arm64': {
      zip: 'electron-v' + ELECTRON_VERSION + '-darwin-arm64.zip',
      sha256: '4af51382278d00291dfcda265eddd9bab6e98cebb09f46aadc8438bf606de162',
      exe: 'Electron.app/Contents/MacOS/Electron', app: 'Electron.app/Contents/Resources/app', unpack: 'ditto', approxMb: 125
    },
    'linux-x64': {
      zip: 'electron-v' + ELECTRON_VERSION + '-linux-x64.zip',
      sha256: '6e7fd2d450d442507b846ace4ae6e2bd17e1b1653e86a033b5231abfc23e6df4',
      exe: 'electron', app: 'resources/app', unpack: 'unzip', approxMb: 118
    }
  };

  var STATE_WAIT_MS = 20000;

  /* ------------------------------------------------------------------ *
   * Node access (the panel runs with Node enabled)
   * ------------------------------------------------------------------ */
  function nodeRequire() {
    try {
      if (window.cep_node && typeof window.cep_node.require === 'function') return window.cep_node.require;
      if (typeof window.require === 'function') return window.require;
    } catch (e) {
      /* no node */
    }
    return null;
  }

  function mods() {
    var req = nodeRequire();
    if (!req) throw new Error('This panel has no file access, so the browser can\u2019t be set up.');
    return {
      fs: req('fs'), path: req('path'), os: req('os'), https: req('https'), http: req('http'),
      crypto: req('crypto'), cp: req('child_process')
    };
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function platformKey() {
    var p = typeof process !== 'undefined' ? process : { platform: '', arch: '' };
    return p.platform + '-' + p.arch;
  }

  function supported() {
    return !!RUNTIMES[platformKey()];
  }

  /* ------------------------------------------------------------------ *
   * Paths (must match browser-companion/lib/safety.js)
   * ------------------------------------------------------------------ */
  function appDataDir() {
    var m = mods();
    var env = process.env;
    if (process.platform === 'win32') return env.APPDATA || m.path.join(m.os.homedir(), 'AppData', 'Roaming');
    if (process.platform === 'darwin') return m.path.join(m.os.homedir(), 'Library', 'Application Support');
    return env.XDG_CONFIG_HOME || m.path.join(m.os.homedir(), '.config');
  }

  function dataDir() {
    return mods().path.join(appDataDir(), 'SFX Composer', 'Browser');
  }

  function runtimeDir() {
    return mods().path.join(appDataDir(), 'SFX Composer', 'browser-runtime');
  }

  function companionSourceDir() {
    var m = mods();
    if (window.__sfxCompanionSourceDir) return window.__sfxCompanionSourceDir; // tests only
    var p = decodeURIComponent(new URL(window.location.href).pathname);
    if (/^\/[A-Za-z]:/.test(p)) p = p.substring(1);
    return m.path.resolve(m.path.dirname(p), '..', 'browser-companion');
  }

  function runtimeSpec() {
    var spec = RUNTIMES[platformKey()];
    if (!spec) throw new Error('The built-in browser isn\u2019t available on this computer (' + platformKey() + ').');
    return spec;
  }

  function exePath() {
    var spec = runtimeSpec();
    return mods().path.join(runtimeDir(), spec.exe);
  }

  function appDir() {
    var spec = runtimeSpec();
    return mods().path.join.apply(null, [runtimeDir()].concat(spec.app.split('/')));
  }

  /* ------------------------------------------------------------------ *
   * File helpers (kept to APIs available in older CEP Node versions)
   * ------------------------------------------------------------------ */
  function mkdirp(dir) {
    var m = mods();
    if (m.fs.existsSync(dir)) return;
    mkdirp(m.path.dirname(dir));
    try {
      m.fs.mkdirSync(dir);
    } catch (e) {
      if (!m.fs.existsSync(dir)) throw e;
    }
  }

  function isInside(parent, child) {
    var m = mods();
    var rel = m.path.relative(m.path.resolve(parent), m.path.resolve(child));
    return rel !== '' && rel.indexOf('..') !== 0 && !m.path.isAbsolute(rel);
  }

  function removeRecursive(target) {
    var m = mods();
    // Deletion is only ever done inside the browser-runtime folder.
    if (!(m.path.resolve(target) === m.path.resolve(runtimeDir()) || isInside(runtimeDir(), target))) {
      throw new Error('Refusing to delete outside the browser runtime folder.');
    }
    var st;
    try {
      st = m.fs.lstatSync(target);
    } catch (e) {
      return;
    }
    if (st.isDirectory() && !st.isSymbolicLink()) {
      m.fs.readdirSync(target).forEach(function (name) {
        removeRecursive(m.path.join(target, name));
      });
      m.fs.rmdirSync(target);
    } else {
      m.fs.unlinkSync(target);
    }
  }

  function copyDir(src, dst) {
    var m = mods();
    mkdirp(dst);
    m.fs.readdirSync(src).forEach(function (name) {
      var from = m.path.join(src, name);
      var to = m.path.join(dst, name);
      var st = m.fs.statSync(from);
      if (st.isDirectory()) copyDir(from, to);
      else m.fs.copyFileSync(from, to);
    });
  }

  /** "path:size" lines of every file — detects when the shipped companion changed. */
  function fingerprint(dir) {
    var m = mods();
    var lines = [];
    (function walk(d, rel) {
      m.fs.readdirSync(d).sort().forEach(function (name) {
        var full = m.path.join(d, name);
        var st = m.fs.statSync(full);
        if (st.isDirectory()) walk(full, rel + name + '/');
        else lines.push(rel + name + ':' + st.size);
      });
    })(dir, '');
    return m.crypto.createHash('sha256').update(lines.join('\n')).digest('hex');
  }

  function readJson(file) {
    try {
      return JSON.parse(mods().fs.readFileSync(file, 'utf8'));
    } catch (e) {
      return null;
    }
  }

  /* ------------------------------------------------------------------ *
   * Install
   * ------------------------------------------------------------------ */
  function versionFile() {
    return mods().path.join(runtimeDir(), 'sfx-runtime.json');
  }

  function isInstalled() {
    if (!supported()) return false;
    var m = mods();
    var info = readJson(versionFile());
    if (!info || info.electron !== ELECTRON_VERSION) return false;
    try {
      var exe = m.fs.statSync(exePath());
      var main = m.fs.statSync(m.path.join(appDir(), 'main.js'));
      // Never accept an empty/blocked placeholder as an installed runtime.
      return exe.isFile() && exe.size >= 5 * 1024 * 1024 && main.isFile() && main.size > 0;
    } catch (e) {
      return false;
    }
  }

  function appNeedsSync() {
    var info = readJson(versionFile());
    return !info || info.appFingerprint !== fingerprint(companionSourceDir());
  }

  /** Re-copies the shipped companion into the runtime when the panel was updated. No download. */
  function syncApp() {
    var m = mods();
    var target = appDir();
    if (m.fs.existsSync(target)) removeRecursive(target);
    copyDir(companionSourceDir(), target);
    var info = readJson(versionFile()) || { electron: ELECTRON_VERSION };
    info.appFingerprint = fingerprint(companionSourceDir());
    m.fs.writeFileSync(versionFile(), JSON.stringify(info));
  }

  function downloadFile(url, dest, expectedSha, onProgress, signal, hops) {
    var m = mods();
    hops = hops || 0;
    return new Promise(function (resolve, reject) {
      var u;
      try {
        u = new URL(url);
      } catch (e) {
        return reject(new Error('Bad download address.'));
      }
      if (u.protocol !== 'https:' || !DOWNLOAD_HOSTS.test(u.hostname)) {
        return reject(new Error('Refusing to download from ' + u.hostname + ' (not an official Electron release host).'));
      }

      var settled = false;
      function fail(err) {
        if (settled) return;
        settled = true;
        reject(err);
      }
      function ok(value) {
        if (settled) return;
        settled = true;
        resolve(value);
      }

      var req = m.https.get(url, { headers: { 'User-Agent': 'SFX-Composer-Browser-Setup' } }, function (res) {
        if ([301, 302, 303, 307, 308].indexOf(res.statusCode) !== -1 && res.headers.location) {
          res.resume();
          if (hops >= 5) return fail(new Error('Too many redirects.'));
          return resolve(downloadFile(new URL(res.headers.location, url).href, dest, expectedSha, onProgress, signal, hops + 1));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return fail(new Error('The download server answered ' + res.statusCode + '.'));
        }

        var total = Number(res.headers['content-length']) || 0;
        var received = 0;
        var lastTick = 0;
        var lastDataAt = Date.now();
        var hash = m.crypto.createHash('sha256');
        var part = dest + '.part';
        try {
          if (m.fs.existsSync(part)) m.fs.unlinkSync(part);
        } catch (e) {}
        var out = m.fs.createWriteStream(part);
        var finished = false;

        function tickProgress(force) {
          if (!onProgress) return;
          var now = Date.now();
          if (!force && now - lastTick < 200) return;
          lastTick = now;
          var t = total > 0 ? total : received;
          // Clamp display so we never show >100% while still downloading
          var r = total > 0 ? Math.min(received, total) : received;
          onProgress({ phase: 'download', received: r, total: t, state: 'DOWNLOADING' });
        }

        function finalize() {
          if (finished) return;
          finished = true;
          try {
            out.end();
          } catch (e) {}

          var digest;
          try {
            digest = hash.digest('hex');
          } catch (e) {
            return fail(new Error('Could not hash the downloaded file.'));
          }

          if (onProgress) {
            onProgress({
              phase: 'verify',
              received: received,
              total: total || received,
              state: 'VERIFYING'
            });
          }

          if (expectedSha && digest !== expectedSha) {
            try {
              m.fs.unlinkSync(part);
            } catch (e) {}
            return fail(
              new Error(
                'The downloaded file failed its integrity check (SHA-256 mismatch), so it was deleted. ' +
                  'Try setup again. If this keeps happening, your network may be modifying the download.'
              )
            );
          }

          try {
            if (m.fs.existsSync(dest)) m.fs.unlinkSync(dest);
            m.fs.renameSync(part, dest);
          } catch (e) {
            return fail(e);
          }

          if (onProgress) {
            onProgress({
              phase: 'download',
              received: received,
              total: received,
              state: 'DOWNLOADING',
              done: true
            });
          }
          ok({ bytes: received, sha256: digest });
        }

        res.on('data', function (chunk) {
          if (finished || settled) return;
          received += chunk.length;
          hash.update(chunk);
          // Hashing alone does not persist a download. Without this write the
          // SHA can be correct while the extracted archive is empty.
          if (!out.write(chunk)) res.pause();
          lastDataAt = Date.now();
          if (signal && signal.cancelled) {
            try {
              req.destroy();
            } catch (e) {}
            try {
              out.destroy();
            } catch (e) {}
            try {
              m.fs.unlinkSync(part);
            } catch (e) {}
            return fail(new Error('Cancelled.'));
          }
          tickProgress(false);
        });

        out.on('drain', function () {
          try { res.resume(); } catch (e) {}
        });

        res.on('end', function () {
          // Ensure the write stream flushes even if pipe edge-cases leave it open
          try {
            out.end();
          } catch (e) {}
        });

        out.on('finish', function () {
          finalize();
        });
        out.on('error', function (err) {
          fail(err);
        });
        res.on('error', function (err) {
          fail(err);
        });

        // Idle watchdog: if no bytes for 45s after start, abort
        var watchdog = setInterval(function () {
          if (settled || finished) {
            clearInterval(watchdog);
            return;
          }
          if (signal && signal.cancelled) {
            clearInterval(watchdog);
            try {
              req.destroy();
            } catch (e) {}
            return fail(new Error('Cancelled.'));
          }
          if (Date.now() - lastDataAt > 45000) {
            clearInterval(watchdog);
            try {
              req.destroy();
            } catch (e) {}
            fail(new Error('The download stalled (no data for 45 seconds). Try again.'));
          }
        }, 5000);
      });

      // Initial connection timeout only (not whole download)
      req.setTimeout(60000, function () {
        req.destroy(new Error('Could not connect to the download server in time.'));
      });
      req.on('error', function (err) {
        fail(err && err.message === 'cancelled' ? new Error('Cancelled.') : err);
      });
    });
  }

  /**
   * Find the platform executable under root (handles nested extract folders).
   * Returns absolute path or null.
   */
  function findRuntimeExe(root, exeName) {
    var m = mods();
    var direct = m.path.join(root, exeName);
    try {
      if (m.fs.existsSync(direct) && m.fs.statSync(direct).isFile()) return direct;
    } catch (e) {}
    // Shallow search: one or two levels (common when a single top folder is created)
    try {
      var names = m.fs.readdirSync(root);
      for (var i = 0; i < names.length; i++) {
        var p1 = m.path.join(root, names[i]);
        try {
          var st = m.fs.statSync(p1);
          if (st.isFile() && names[i] === exeName) return p1;
          if (st.isDirectory()) {
            var nested = m.path.join(p1, exeName);
            if (m.fs.existsSync(nested) && m.fs.statSync(nested).isFile()) return nested;
            // one more level
            var sub = m.fs.readdirSync(p1);
            for (var j = 0; j < sub.length; j++) {
              var p2 = m.path.join(p1, sub[j], exeName);
              if (m.fs.existsSync(p2) && m.fs.statSync(p2).isFile()) return p2;
            }
          }
        } catch (e2) {}
      }
    } catch (e3) {}
    return null;
  }

  /**
   * If electron.exe landed inside a single nested folder, promote that folder's
   * contents up into dest so runtimeDir()/electron.exe is correct.
   */
  function flattenIfNested(dest, exeName) {
    var m = mods();
    var found = findRuntimeExe(dest, exeName);
    if (!found) return null;
    var expected = m.path.join(dest, exeName);
    if (found === expected) return found;
    // Promote: move everything from the nested parent into dest
    var nestedRoot = m.path.dirname(found);
    // Safety: nestedRoot must be inside dest
    if (!isInside(dest, nestedRoot) && m.path.resolve(nestedRoot) !== m.path.resolve(dest)) {
      return found; // unexpected layout; leave as-is and let verify fail clearly
    }
    if (m.path.resolve(nestedRoot) === m.path.resolve(dest)) return found;
    var names = m.fs.readdirSync(nestedRoot);
    names.forEach(function (name) {
      var from = m.path.join(nestedRoot, name);
      var to = m.path.join(dest, name);
      if (m.fs.existsSync(to)) {
        try { removeRecursive(to); } catch (e) {}
      }
      m.fs.renameSync(from, to);
    });
    // Remove emptied nested dirs (best-effort)
    try {
      var walkUp = nestedRoot;
      while (m.path.resolve(walkUp) !== m.path.resolve(dest) && isInside(dest, walkUp)) {
        var left = m.fs.readdirSync(walkUp);
        if (left.length) break;
        m.fs.rmdirSync(walkUp);
        walkUp = m.path.dirname(walkUp);
      }
    } catch (e) {}
    return m.path.join(dest, exeName);
  }

  function unpack(spec, zip, dest) {
    var m = mods();
    return new Promise(function (resolve, reject) {
      function fail(err) {
        reject(new Error('Unpacking failed: ' + (err && err.message ? err.message : err)));
      }
      function ok() {
        resolve();
      }

      // Prefer tar.exe on Windows — more reliable for large Electron zips than Expand-Archive.
      function tryTar(next) {
        m.cp.execFile(
          'tar.exe',
          ['-xf', zip, '-C', dest],
          { windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
          function (err) {
            if (!err) return ok();
            next(err);
          }
        );
      }

      function tryPowerShell(next) {
        var q = function (s) {
          return "'" + String(s).replace(/'/g, "''") + "'";
        };
        // Use .NET ZipFile for better large-archive support than Expand-Archive on older PS
        var cmd =
          'Add-Type -AssemblyName System.IO.Compression.FileSystem; ' +
          '[System.IO.Compression.ZipFile]::ExtractToDirectory(' +
          q(zip) + ', ' + q(dest) + ')';
        m.cp.execFile(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', cmd],
          { windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
          function (err) {
            if (!err) return ok();
            // Last resort: classic Expand-Archive
            m.cp.execFile(
              'powershell.exe',
              [
                '-NoProfile',
                '-NonInteractive',
                '-ExecutionPolicy',
                'Bypass',
                '-Command',
                'Expand-Archive -LiteralPath ' + q(zip) + ' -DestinationPath ' + q(dest) + ' -Force'
              ],
              { windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
              function (err2) {
                if (!err2) return ok();
                next(err2 || err);
              }
            );
          }
        );
      }

      if (spec.unpack === 'powershell') {
        tryTar(function () {
          tryPowerShell(fail);
        });
      } else if (spec.unpack === 'ditto') {
        m.cp.execFile('ditto', ['-x', '-k', zip, dest], function (err) {
          if (err) fail(err);
          else ok();
        });
      } else {
        m.cp.execFile('unzip', ['-q', '-o', zip, '-d', dest], function (err) {
          if (err) fail(err);
          else ok();
        });
      }
    });
  }

  /**
   * Downloads, verifies and unpacks the runtime, then copies the companion app.
   * opts.onProgress({phase, received, total}); opts.signal = {cancelled:false}.
   */
  function install(opts) {
    opts = opts || {};
    var m;
    var spec;
    try {
      m = mods();
      spec = runtimeSpec();
    } catch (e) {
      return Promise.reject(e);
    }
    var progress = opts.onProgress || function () {};
    var tmpDir = m.path.join(appDataDir(), 'SFX Composer', 'setup-temp');
    var zip = m.path.join(tmpDir, spec.zip);

    return stopCompanion()
      .then(function () {
        mkdirp(tmpDir);
        mkdirp(runtimeDir());
        progress({ phase: 'download', state: 'DOWNLOADING', received: 0, total: 0 });
        return downloadFile(RELEASE_BASE + spec.zip, zip, spec.sha256, progress, opts.signal);
      })
      .then(function () {
        progress({ phase: 'unpack', state: 'EXTRACTING', received: 1, total: 1 });
        removeRecursive(runtimeDir());
        mkdirp(runtimeDir());
        return unpack(spec, zip, runtimeDir()).catch(function (err) {
          // Leave no plausible-looking partial installation behind. A later
          // Retry starts from a clean, isolated runtime folder.
          try { removeRecursive(runtimeDir()); } catch (cleanupErr) {}
          try { mkdirp(runtimeDir()); } catch (mkdirErr) {}
          throw err;
        });
      })
      .then(function () {
        progress({ phase: 'verify', state: 'VERIFYING', received: 1, total: 1 });

        // Electron zips sometimes extract into a single nested folder; flatten so
        // runtimeDir()/electron.exe is the real path.
        var foundExe = flattenIfNested(runtimeDir(), spec.exe);
        if (!foundExe || !m.fs.existsSync(foundExe)) {
          // List what we actually got for a useful error
          var listing = [];
          try {
            listing = m.fs.readdirSync(runtimeDir()).slice(0, 20);
          } catch (e) {}
          try { removeRecursive(runtimeDir()); mkdirp(runtimeDir()); } catch (cleanupErr) {}
          throw new Error(
            'The unpacked runtime is missing its program file (' +
              exePath() +
              '). Contents: [' +
              listing.join(', ') +
              ']. The download may have been blocked by antivirus, or extraction failed.'
          );
        }

        // Size sanity: official electron.exe is tens of MB; a tiny stub means a bad extract.
        var exeStat;
        try {
          exeStat = m.fs.statSync(foundExe);
        } catch (e) {
          throw new Error('Could not stat program file: ' + foundExe);
        }
        if (!exeStat.isFile() || exeStat.size < 5 * 1024 * 1024) {
          throw new Error(
            'Program file looks incomplete (' +
              Math.round((exeStat.size || 0) / 1024) +
              ' KB at ' +
              foundExe +
              '). Delete the browser-runtime folder and try Retry setup.'
          );
        }

        // Required sibling files on Windows (presence check only). Do not use
        // chrome_elf.dll here: Electron 44 no longer ships that legacy DLL.
        if (process.platform === 'win32') {
          var need = ['resources', 'resources.pak', 'icudtl.dat'];
          for (var i = 0; i < need.length; i++) {
            var p = m.path.join(runtimeDir(), need[i]);
            if (!m.fs.existsSync(p)) {
              throw new Error(
                'Runtime is incomplete: missing ' +
                  need[i] +
                  ' next to electron.exe. Extraction may have been interrupted.'
              );
            }
          }
        }

        if (process.platform !== 'win32') {
          try {
            m.fs.chmodSync(exePath(), 493); // 0755
          } catch (e) {
            /* already executable */
          }
        }

        progress({ phase: 'finish', state: 'INITIALIZING', received: 1, total: 1 });
        mkdirp(appDir());
        if (m.fs.existsSync(appDir())) {
          try {
            removeRecursive(appDir());
          } catch (e) {}
          mkdirp(appDir());
        }
        copyDir(companionSourceDir(), appDir());
        if (!m.fs.existsSync(m.path.join(appDir(), 'main.js'))) {
          throw new Error('Companion app failed to copy (main.js missing).');
        }
        m.fs.writeFileSync(
          versionFile(),
          JSON.stringify({
            electron: ELECTRON_VERSION,
            appFingerprint: fingerprint(companionSourceDir()),
            installedAt: Date.now(),
            state: 'READY',
            exeBytes: exeStat.size
          })
        );
        try {
          m.fs.unlinkSync(zip);
        } catch (e) {
          /* leftover temp file is harmless */
        }
        // Final gate: must pass isInstalled()
        if (!isInstalled()) {
          throw new Error('Installation finished but the runtime is still not detected. Try Repair setup.');
        }
        progress({ phase: 'ready', state: 'READY', received: 1, total: 1 });
      });
  }

  /* ------------------------------------------------------------------ *
   * Bridge client
   * ------------------------------------------------------------------ */
  var conn = null; // {port, token}
  var connected = false;

  function readHandshake() {
    var info = readJson(mods().path.join(dataDir(), 'bridge.json'));
    return info && info.port && info.token ? info : null;
  }

  function request(method, path, body, opts) {
    opts = opts || {};
    if (!conn) return Promise.reject(Object.assign(new Error('The browser isn\u2019t running.'), { code: 'not-connected' }));
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () {
      if (controller) controller.abort();
    }, opts.timeoutMs || 8000);
    var init = {
      method: method,
      headers: { Authorization: 'Bearer ' + conn.token },
      signal: controller ? controller.signal : undefined
    };
    if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    return fetch('http://127.0.0.1:' + conn.port + path, init)
      .then(function (res) {
        clearTimeout(timer);
        return res.json().catch(function () {
          return {};
        }).then(function (json) {
          if (!res.ok) {
            throw Object.assign(new Error(json.message || json.error || 'Request failed (' + res.status + ')'), {
              code: json.error || 'http-' + res.status,
              status: res.status
            });
          }
          return json;
        });
      })
      .catch(function (err) {
        clearTimeout(timer);
        if (err && err.name === 'AbortError') throw Object.assign(new Error('The browser did not answer in time.'), { code: 'timeout' });
        if (err && !err.code && /fetch|network|Failed/i.test(String(err.message))) {
          throw Object.assign(new Error('The browser isn\u2019t reachable.'), { code: 'not-connected' });
        }
        throw err;
      });
  }

  /** Reads bridge.json and checks the browser really answers. */
  function connect() {
    var info;
    try {
      info = readHandshake();
    } catch (e) {
      info = null;
    }
    if (!info) {
      conn = null;
      return Promise.resolve(false);
    }
    conn = { port: info.port, token: info.token };
    return request('GET', '/v1/health', undefined, { timeoutMs: 2500 }).then(
      function () {
        return true;
      },
      function () {
        conn = null;
        return false;
      }
    );
  }

  function stopCompanion() {
    return connect().then(function (up) {
      if (!up) return undefined;
      return request('POST', '/v1/quit', {}).catch(function () {}).then(function () {
        return sleep(1500);
      });
    });
  }

  /**
   * Starts the browser and waits until its bridge answers. opts.extraArgs is for
   * automated tests only (the panel never passes it).
   */
  function launch(opts) {
    opts = opts || {};
    var m;
    try {
      m = mods();
      if (!isInstalled()) return Promise.reject(new Error('The browser isn\u2019t set up yet.'));
    } catch (e) {
      return Promise.reject(e);
    }
    return connect().then(function (already) {
      if (already) return true;
      try {
        if (appNeedsSync()) syncApp();
        try {
          m.fs.unlinkSync(m.path.join(dataDir(), 'bridge.json')); // stale handshake from a crash
        } catch (e) {
          /* none */
        }
        var child = m.cp.spawn(exePath(), (opts.extraArgs || []).concat([]), {
          detached: true,
          stdio: 'ignore',
          cwd: runtimeDir(),
          env: Object.assign({}, process.env, opts.env || {})
        });
        child.on('error', function () {});
        child.unref();
      } catch (e) {
        return Promise.reject(new Error('Could not start the browser: ' + (e.message || e)));
      }
      var started = Date.now();
      return (function waitReady() {
        return connect().then(function (up) {
          if (up) return true;
          if (Date.now() - started > (opts.timeoutMs || 30000)) {
            throw new Error('The browser didn\u2019t start in time. Try again, or re-run setup.');
          }
          return sleep(400).then(waitReady);
        });
      })();
    });
  }

  /* ------------------------------------------------------------------ *
   * Live state: downloads + tabs, merged idempotently
   * ------------------------------------------------------------------ */
  var downloads = new Map();
  var browserState = { tabs: [], activeId: null };
  var settings = { downloadDir: '', homeUrl: '' };
  var subscribers = [];
  var watching = false;

  function snapshot() {
    var list = Array.from(downloads.values()).sort(function (a, b) {
      return b.startedAt - a.startedAt;
    });
    return {
      connected: connected,
      downloads: list,
      browser: browserState,
      settings: settings,
      hasActive: list.some(function (d) {
        return d.state === 'progressing';
      })
    };
  }

  function emit() {
    var snap = snapshot();
    subscribers.slice().forEach(function (fn) {
      try {
        fn(snap);
      } catch (e) {
        /* a bad listener must not stop the others */
      }
    });
  }

  function setConnected(value) {
    if (connected === value) return;
    connected = value;
    if (!value) {
      var offline = readOffline();
      if (offline) {
        downloads = new Map();
        offline.downloads.forEach(function (d) {
          downloads.set(d.id, d);
        });
        settings = offline.settings;
        browserState = { tabs: [], activeId: null, dock: false, pins: offline.pins };
      }
    }
    emit();
  }

  function apply(res, full) {
    if (full) downloads = new Map();
    (res.downloads || []).forEach(function (d) {
      downloads.set(d.id, d);
    });
    (res.removed || []).forEach(function (id) {
      downloads.delete(id);
    });
    if (res.browser) browserState = res.browser;
    if (res.settings) settings = res.settings;
    emit();
  }

  function watchLoop() {
    var since = 0;
    function step() {
      if (!watching) return undefined;
      var ready = conn ? Promise.resolve(true) : connect();
      return ready
        .then(function (up) {
          if (!up) {
            setConnected(false);
            since = 0;
            return sleep(1500);
          }
          // While the browser is docked into this panel, say so on every poll: if
          // the panel goes away the browser notices and pops its window back out.
          var viewer = browserState && browserState.dock ? '&viewer=1' : '';
          return request('GET', '/v1/state?since=' + since + '&wait=' + STATE_WAIT_MS + viewer, undefined, { timeoutMs: STATE_WAIT_MS + 8000 }).then(
            function (res) {
              var full = since === 0;
              connected = true; // set before apply so subscribers see it
              apply(res, full);
              since = res.seq;
            }
          );
        })
        .catch(function () {
          conn = null;
          since = 0;
          setConnected(false);
          return sleep(1500);
        })
        .then(step);
    }
    step();
  }

  function startWatching() {
    if (watching) return;
    watching = true;
    watchLoop();
  }

  function stopWatching() {
    watching = false;
  }

  function subscribe(fn) {
    subscribers.push(fn);
    fn(snapshot());
    return function () {
      subscribers = subscribers.filter(function (x) {
        return x !== fn;
      });
    };
  }

  /** Saved history + settings, read straight from disk (browser not running). */
  function readOffline() {
    try {
      var m = mods();
      var history = readJson(m.path.join(dataDir(), 'downloads.json'));
      var config = readJson(m.path.join(dataDir(), 'config.json')) || {};
      var items = history && Array.isArray(history.items) ? history.items : [];
      var out = items
        .filter(function (d) {
          return d && typeof d.id === 'string' && typeof d.filename === 'string';
        })
        .map(function (d) {
          return {
            id: d.id, filename: d.filename, ext: d.ext, kind: d.kind, sourceHost: d.sourceHost, path: d.path, dir: d.dir,
            totalBytes: d.totalBytes, receivedBytes: d.receivedBytes,
            state: d.state === 'progressing' ? 'interrupted' : d.state,
            canResume: false, startedAt: d.startedAt, finishedAt: d.finishedAt,
            error: d.state === 'progressing' ? 'The browser was closed before this finished.' : d.error || '',
            importState: d.importState === 'importing' ? 'none' : d.importState || 'none', importDetail: d.importDetail || '',
            importable: d.state === 'completed' && d.kind !== 'other', offline: true
          };
        });
      return {
        downloads: out,
        settings: { downloadDir: config.downloadDir || '', homeUrl: config.homeUrl || '' },
        pins: sanitizePins(config.pins)
      };
    } catch (e) {
      return null;
    }
  }

  /* ------------------------------------------------------------------ *
   * Pinned sites (same rules as browser-companion/lib/pins.js)
   * ------------------------------------------------------------------ */
  var MAX_PINS = 12;

  function isHttp(value) {
    try {
      var u = new URL(String(value));
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch (e) {
      return false;
    }
  }

  function normalizePin(input) {
    if (!input || !isHttp(input.url)) return null;
    var url = new URL(String(input.url)).href;
    var title = String(input.title || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
    if (!title) title = new URL(url).hostname.replace(/^www\./, '');
    return { url: url, title: title.substring(0, 60) };
  }

  function sanitizePins(list) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (item) {
      var pin = normalizePin(item);
      if (
        pin &&
        out.length < MAX_PINS &&
        !out.some(function (p) {
          return p.url === pin.url;
        })
      ) {
        out.push(pin);
      }
    });
    return out;
  }

  function currentPins() {
    return sanitizePins(browserState && browserState.pins);
  }

  /** Edits config.json directly; only used while the browser is NOT running. */
  function editPinsOffline(edit) {
    var m = mods();
    var file = m.path.join(dataDir(), 'config.json');
    var config = readJson(file) || {};
    var result = edit(sanitizePins(config.pins));
    if (result.error) return result;
    config.pins = result.pins;
    mkdirp(dataDir());
    var tmp = file + '.' + process.pid + '.tmp';
    m.fs.writeFileSync(tmp, JSON.stringify(config, null, 2));
    m.fs.renameSync(tmp, file);
    browserState = Object.assign({}, browserState, { pins: result.pins });
    emit();
    return { ok: true, pins: result.pins };
  }

  function pinAdd(url, title) {
    var pin = normalizePin({ url: url, title: title });
    if (!pin) return Promise.reject(Object.assign(new Error('That is not a web address that can be pinned.'), { code: 'bad-url' }));
    if (connected) return request('POST', '/v1/pins', { add: pin });
    try {
      return Promise.resolve(
        editPinsOffline(function (list) {
          var at = list.findIndex(function (p) {
            return p.url === pin.url;
          });
          if (at !== -1) list[at] = pin;
          else if (list.length >= MAX_PINS) return { error: 'too-many-pins' };
          else list.push(pin);
          return { pins: list };
        })
      ).then(function (r) {
        if (r.error) throw Object.assign(new Error('You can pin up to ' + MAX_PINS + ' sites. Unpin one first.'), { code: r.error });
        return r;
      });
    } catch (e) {
      return Promise.reject(e);
    }
  }

  function pinRemove(url) {
    if (connected) return request('POST', '/v1/pins', { remove: url });
    try {
      return Promise.resolve(
        editPinsOffline(function (list) {
          return {
            pins: list.filter(function (p) {
              return p.url !== url;
            })
          };
        })
      );
    } catch (e) {
      return Promise.reject(e);
    }
  }

  /* ------------------------------------------------------------------ *
   * Navigation, tabs, docking and the live view
   * ------------------------------------------------------------------ */
  function toBase64(buffer) {
    var bytes = new Uint8Array(buffer);
    var chunk = 0x8000;
    var text = '';
    for (var i = 0; i < bytes.length; i += chunk) {
      text += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return window.btoa(text);
  }

  /** Newest picture of the active tab, or null if nothing changed within waitMs. */
  function fetchFrame(after, waitMs) {
    if (!conn) return Promise.reject(Object.assign(new Error('The browser isn\u2019t running.'), { code: 'not-connected' }));
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () {
      if (controller) controller.abort();
    }, (waitMs || 1500) + 6000);
    return fetch('http://127.0.0.1:' + conn.port + '/v1/view/frame?after=' + (after || 0) + '&wait=' + (waitMs || 1500), {
      headers: { Authorization: 'Bearer ' + conn.token },
      signal: controller ? controller.signal : undefined
    })
      .then(function (res) {
        clearTimeout(timer);
        if (res.status === 204) return null;
        if (!res.ok) throw Object.assign(new Error('Live view request failed (' + res.status + ')'), { code: 'http-' + res.status });
        var id = Number(res.headers.get('X-Frame-Id')) || 0;
        return res.arrayBuffer().then(function (buf) {
          return { id: id, dataUrl: 'data:image/png;base64,' + toBase64(buf) };
        });
      })
      .catch(function (err) {
        clearTimeout(timer);
        throw err;
      });
  }

  /** Is this finished download safe to import? (inside its folder, still on disk) */
  function checkFile(rec) {
    try {
      var m = mods();
      if (!rec || !rec.path || !rec.dir) return 'The file location is unknown.';
      if (!isInside(rec.dir, rec.path) || m.path.basename(rec.path) !== rec.filename) return 'The file is not inside the download folder.';
      var st = m.fs.statSync(rec.path);
      if (!st.isFile() || st.size === 0) return 'The file is empty or missing.';
      return '';
    } catch (e) {
      return 'The file is no longer on disk.';
    }
  }

  window.__sfxCompanion = {
    ELECTRON_VERSION: ELECTRON_VERSION,
    platformKey: platformKey,
    supported: supported,
    approxDownloadMb: function () {
      return supported() ? runtimeSpec().approxMb : 0;
    },
    paths: { dataDir: dataDir, runtimeDir: runtimeDir, exePath: exePath, appDir: appDir },
    isInstalled: isInstalled,
    install: install,
    launch: launch,
    connect: connect,
    request: request,
    subscribe: subscribe,
    startWatching: startWatching,
    stopWatching: stopWatching,
    readOffline: readOffline,
    checkFile: checkFile,
    pins: { list: currentPins, add: pinAdd, remove: pinRemove, max: MAX_PINS },
    nav: function (action) {
      return request('POST', '/v1/nav', { action: action });
    },
    tab: function (action, id) {
      return request('POST', '/v1/tabs', { action: action, id: id });
    },
    navigate: function (url, newTab) {
      return request('POST', '/v1/navigate', { url: url, newTab: !!newTab });
    },
    setDock: function (on) {
      return request('POST', '/v1/view/mode', { dock: !!on });
    },
    setViewport: function (width, height) {
      return request('POST', '/v1/view/size', { width: width, height: height });
    },
    sendInput: function (events) {
      return request('POST', '/v1/view/input', { events: events }, { timeoutMs: 4000 });
    },
    fetchFrame: fetchFrame,
    isConnected: function () {
      return connected;
    },
    snapshot: snapshot
  };
})();
