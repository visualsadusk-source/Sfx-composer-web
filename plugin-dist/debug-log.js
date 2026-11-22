/*
  SFX Composer — debug log.

  window.__sfxDebug is a small shared logger used by Marker Mode (and the
  later phases). It keeps the most recent entries in memory, mirrors them to a
  log file when the panel has Node access, and can produce one block of text
  to copy and send when something goes wrong.

  Log file (best effort):  <your user folder>/SFX Composer Logs/debug.log
*/
(function () {
  'use strict';

  var MAX_ENTRIES = 400;
  var MAX_FILE_BYTES = 1000000;
  var entries = [];
  var filePath = null;
  var fsModule = null;

  function nodeRequire() {
    try {
      if (window.cep_node && typeof window.cep_node.require === 'function') return window.cep_node.require;
      if (typeof window.require === 'function') return window.require;
    } catch (e) {
      /* no node */
    }
    return null;
  }

  function initFile() {
    try {
      var req = nodeRequire();
      if (!req) return;
      var os = req('os');
      var path = req('path');
      var fs = req('fs');
      var dir = path.join(os.homedir(), 'SFX Composer Logs');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir);
      var file = path.join(dir, 'debug.log');
      try {
        if (fs.existsSync(file) && fs.statSync(file).size > MAX_FILE_BYTES) {
          fs.renameSync(file, path.join(dir, 'debug.old.log'));
        }
      } catch (e2) {
        /* rotation is optional */
      }
      filePath = file;
      fsModule = fs;
    } catch (e) {
      filePath = null;
      fsModule = null;
    }
  }

  function stringify(data) {
    if (data === undefined) return '';
    try {
      if (data instanceof Error) return data.stack || data.message;
      return typeof data === 'string' ? data : JSON.stringify(data);
    } catch (e) {
      return String(data);
    }
  }

  function write(level, message, data) {
    var line = new Date().toISOString() + ' [' + level + '] ' + message;
    var extra = stringify(data);
    if (extra) line += ' ' + extra;

    entries.push(line);
    if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);

    if (fsModule && filePath) {
      try {
        fsModule.appendFileSync(filePath, line + '\n');
      } catch (e) {
        /* never let logging break the panel */
      }
    }
  }

  initFile();

  window.__sfxDebug = {
    info: function (m, d) { write('info', m, d); },
    warn: function (m, d) { write('warn', m, d); },
    error: function (m, d) { write('error', m, d); },
    dump: function () {
      var header = 'SFX Composer debug log (' + entries.length + ' entries)\n' +
        'userAgent: ' + navigator.userAgent + '\n';
      return header + entries.join('\n');
    },
    clear: function () { entries = []; },
    getFilePath: function () { return filePath; }
  };

  window.addEventListener('error', function (event) {
    write('error', 'window error: ' + (event.message || ''), event.filename ? event.filename + ':' + event.lineno : '');
  });
  window.addEventListener('unhandledrejection', function (event) {
    write('error', 'unhandled rejection', event.reason && event.reason.message ? event.reason.message : String(event.reason));
  });

  write('info', 'debug log started');
})();
