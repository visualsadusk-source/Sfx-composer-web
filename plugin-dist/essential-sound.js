/*
  SFX Composer — Essential Sound (Browse panel bridge)

  Compact mountable panel for library/browse selection.
  Full workspace lives in audio-tools.js (Essential Sound Studio).
  This module keeps a lightweight category processor for in-place use
  and forwards heavy editing to window.__sfxAudioTools.
*/
(function () {
  'use strict';

  var DEFAULTS = {
    sfx: { gainDb: 0, fadeIn: 0, fadeOut: 0.05, normalize: true, targetDb: -1, pitch: 0, reverb: 0, highpass: 0, clarity: 0, width: 0 },
    music: { gainDb: 0, fadeIn: 0.01, fadeOut: 0.05, normalize: true, targetDb: -14, pitch: 0, reverb: 0, highpass: 0, clarity: 0, width: 0 },
    dialogue: { gainDb: 0, fadeIn: 0, fadeOut: 0.02, normalize: true, targetDb: -16, pitch: 0, reverb: 0, highpass: 80, clarity: 0.4, width: 0 },
    ambience: { gainDb: -3, fadeIn: 0.5, fadeOut: 0.5, normalize: false, targetDb: -18, pitch: 0, reverb: 0.15, highpass: 0, clarity: 0, width: 0.2 }
  };

  var mountedEl = null;
  var currentPath = '';
  var audioCtx = null;
  var sourceNode = null;

  var state = {
    file: null,
    buffer: null,
    category: 'sfx',
    params: Object.assign({}, DEFAULTS.sfx),
    error: '',
    status: '',
    analysis: null
  };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function nodeRequire() {
    try {
      if (window.cep_node && window.cep_node.require) return window.cep_node.require;
      if (typeof window.require === 'function') return window.require;
    } catch (e) {}
    return null;
  }

  function getCtx() {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error('Web Audio API is not available.');
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function dbToLin(db) {
    return Math.pow(10, Number(db) / 20);
  }

  function guessCategory(name) {
    var n = String(name || '').toLowerCase();
    if (/\b(music|song|score|theme|bed)\b/.test(n)) return 'music';
    if (/\b(dialog|dialogue|voice|vo|narrat|speech)\b/.test(n)) return 'dialogue';
    if (/\b(ambi|atmos|room.?tone|bg|env|nature|wind|rain)\b/.test(n)) return 'ambience';
    return 'sfx';
  }

  function loadBuffer(path) {
    var req = nodeRequire();
    if (!req) return Promise.reject(new Error('No file access'));
    var fs = req('fs');
    var buf = fs.readFileSync(path);
    var ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    var ctx = getCtx();
    return new Promise(function (resolve, reject) {
      ctx.decodeAudioData(ab.slice(0), resolve, function () {
        reject(new Error('Could not decode audio'));
      });
    });
  }

  function measurePeak(buffer) {
    var peak = 0;
    for (var c = 0; c < buffer.numberOfChannels; c++) {
      var d = buffer.getChannelData(c);
      for (var i = 0; i < d.length; i++) {
        var v = Math.abs(d[i]);
        if (v > peak) peak = v;
      }
    }
    return peak;
  }

  function processBuffer(src, params) {
    if (!src) return null;
    var ctx = getCtx();
    var frames = src.length;
    var out = ctx.createBuffer(src.numberOfChannels, frames, src.sampleRate);
    var gain = dbToLin(params.gainDb);
    if (params.normalize) {
      var peak = measurePeak(src);
      if (peak > 1e-9) gain *= dbToLin(params.targetDb) / peak;
    }
    var peakCheck = measurePeak(src) * gain;
    if (peakCheck > 1) gain /= peakCheck;
    var fadeInN = Math.min(frames, Math.floor((params.fadeIn || 0) * src.sampleRate));
    var fadeOutN = Math.min(frames, Math.floor((params.fadeOut || 0) * src.sampleRate));
    var hp = Number(params.highpass) || 0;
    var clarity = Number(params.clarity) || 0;
    for (var c = 0; c < src.numberOfChannels; c++) {
      var input = src.getChannelData(c);
      var output = out.getChannelData(c);
      var hpState = 0;
      for (var i = 0; i < frames; i++) {
        var s = input[i];
        if (hp > 0) {
          var alpha = Math.exp((-2 * Math.PI * hp) / src.sampleRate);
          hpState = alpha * (hpState + s - (i > 0 ? input[i - 1] : 0));
          s = s - hpState;
        }
        if (clarity > 0) s = s + clarity * 0.3 * Math.tanh(s * 2.5);
        s *= gain;
        if (i < fadeInN && fadeInN > 0) {
          var fi = i / fadeInN;
          s *= fi * fi * (3 - 2 * fi);
        }
        if (i > frames - fadeOutN && fadeOutN > 0) {
          var fo = (frames - 1 - i) / fadeOutN;
          s *= fo * fo * (3 - 2 * fo);
        }
        output[i] = s;
      }
    }
    var rev = Number(params.reverb) || 0;
    if (rev > 0.01) {
      var delaySamples = Math.floor(0.028 * src.sampleRate);
      for (var c2 = 0; c2 < out.numberOfChannels; c2++) {
        var ch = out.getChannelData(c2);
        var tmp = new Float32Array(ch.length);
        tmp.set(ch);
        for (var k = delaySamples; k < ch.length; k++) {
          ch[k] += tmp[k - delaySamples] * rev * 0.35;
        }
      }
    }
    var width = Number(params.width) || 0;
    if (width !== 0 && out.numberOfChannels >= 2) {
      var L = out.getChannelData(0);
      var R = out.getChannelData(1);
      for (var j = 0; j < frames; j++) {
        var mid = (L[j] + R[j]) * 0.5;
        var side = (L[j] - R[j]) * 0.5 * (1 + width);
        L[j] = mid + side;
        R[j] = mid - side;
      }
    }
    return out;
  }

  function stopPlay() {
    if (sourceNode) {
      try { sourceNode.stop(); } catch (e) {}
      try { sourceNode.disconnect(); } catch (e2) {}
      sourceNode = null;
    }
  }

  function playBuffer(buffer, tag) {
    stopPlay();
    var ctx = getCtx();
    var src = ctx.createBufferSource();
    src.buffer = buffer;
    if (tag === 'processed' && state.params.pitch) {
      src.playbackRate.value = Math.pow(2, state.params.pitch / 12);
    }
    var g = ctx.createGain();
    g.gain.value = 1;
    src.connect(g);
    g.connect(ctx.destination);
    sourceNode = src;
    src.onended = function () { sourceNode = null; };
    src.start(0);
  }

  function bufferToWav(audioBuffer) {
    var numCh = audioBuffer.numberOfChannels;
    var sr = audioBuffer.sampleRate;
    var len = audioBuffer.length;
    var dataSize = len * numCh * 2;
    var buffer = new ArrayBuffer(44 + dataSize);
    var view = new DataView(buffer);
    function str(o, s) {
      for (var i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
    }
    str(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    str(8, 'WAVE');
    str(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numCh, true);
    view.setUint32(24, sr, true);
    view.setUint32(28, sr * numCh * 2, true);
    view.setUint16(32, numCh * 2, true);
    view.setUint16(34, 16, true);
    str(36, 'data');
    view.setUint32(40, dataSize, true);
    var offset = 44;
    for (var i = 0; i < len; i++) {
      for (var c = 0; c < numCh; c++) {
        var s = Math.max(-1, Math.min(1, audioBuffer.getChannelData(c)[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        offset += 2;
      }
    }
    return buffer;
  }

  function placeOnTimeline(filePath, gainDb) {
    var services = window.__sfxServices;
    var bridge = services && services.bridge;
    if (!bridge || typeof bridge.invoke !== 'function') {
      return Promise.reject(new Error('Host bridge unavailable'));
    }
    return bridge.invoke('sfx.import', {
      path: filePath,
      atPlayhead: true,
      snapToFrame: true,
      gainDb: gainDb || 0
    });
  }

  function openInStudio() {
    if (window.__sfxAudioTools && state.file && state.file.path) {
      window.__sfxAudioTools.open(state.file.path, state.file.name);
    } else if (window.__sfxAudioTools) {
      window.__sfxAudioTools.setOpen(true);
    }
  }

  function setCategory(cat) {
    if (!DEFAULTS[cat]) cat = 'sfx';
    state.category = cat;
    state.params = Object.assign({}, DEFAULTS[cat]);
    if (mountedEl) renderInto(mountedEl);
  }

  function renderInto(container) {
    container.innerHTML = '';
    var root = el('div', 'sfx-es');
    var head = el('div', 'sfx-es__head');
    head.appendChild(el('strong', '', 'Essential Sound'));
    if (state.file) head.appendChild(el('span', 'sfx-es__file', state.file.name || state.file.path));
    root.appendChild(head);

    if (state.error) root.appendChild(el('div', 'sfx-es__error', state.error));
    if (state.status) root.appendChild(el('div', 'sfx-es__status', state.status));

    if (!state.file) {
      root.appendChild(el('p', 'sfx-es__muted', 'Select a sound in the library to process it.'));
      container.appendChild(root);
      return;
    }

    var cats = el('div', 'sfx-es__cats');
    ;['music', 'sfx', 'dialogue', 'ambience'].forEach(function (id) {
      var label = id === 'sfx' ? 'SFX' : id.charAt(0).toUpperCase() + id.slice(1);
      var b = el('button', 'sfx-es__cat' + (state.category === id ? ' is-active' : ''), label);
      b.type = 'button';
      b.addEventListener('click', function () { setCategory(id); });
      cats.appendChild(b);
    });
    root.appendChild(cats);

    if (!state.buffer) {
      root.appendChild(el('p', 'sfx-es__muted', 'Loading audio…'));
      container.appendChild(root);
      return;
    }

    var actions = el('div', 'sfx-es__sec');
    var studioBtn = el('button', 'sfx-es__cat is-active', 'Open Essential Sound Studio');
    studioBtn.type = 'button';
    studioBtn.style.width = '100%';
    studioBtn.style.marginBottom = '8px';
    studioBtn.addEventListener('click', openInStudio);
    actions.appendChild(studioBtn);

    var playProc = el('button', 'sfx-es__cat', 'Preview processed');
    playProc.type = 'button';
    playProc.addEventListener('click', function () {
      var processed = processBuffer(state.buffer, state.params);
      if (processed) playBuffer(processed, 'processed');
    });
    actions.appendChild(playProc);

    var playOrig = el('button', 'sfx-es__cat', 'Preview original');
    playOrig.type = 'button';
    playOrig.addEventListener('click', function () {
      playBuffer(state.buffer, 'original');
    });
    actions.appendChild(playOrig);

    var placeBtn = el('button', 'sfx-es__cat', 'Add to Timeline');
    placeBtn.type = 'button';
    placeBtn.addEventListener('click', function () {
      state.status = 'Importing…';
      renderInto(container);
      var processed = processBuffer(state.buffer, state.params);
      try {
        var req = nodeRequire();
        var fs = req('fs');
        var path = req('path');
        var os = req('os');
        var tmp = path.join(os.tmpdir(), 'sfx-composer-audio');
        if (!fs.existsSync(tmp)) fs.mkdirSync(tmp);
        var out = path.join(tmp, 'es_' + Date.now() + '.wav');
        fs.writeFileSync(out, Buffer.from(bufferToWav(processed)));
        placeOnTimeline(out, 0)
          .then(function () {
            state.status = 'Placed on timeline.';
            state.error = '';
            renderInto(container);
          })
          .catch(function (err) {
            state.error = err && err.message ? err.message : String(err);
            state.status = '';
            renderInto(container);
          });
      } catch (err) {
        state.error = err && err.message ? err.message : String(err);
        state.status = '';
        renderInto(container);
      }
    });
    actions.appendChild(placeBtn);
    root.appendChild(actions);

    root.appendChild(el('p', 'sfx-es__muted', 'Full EQ, compression, trim, fades, library, and timeline apply are in Essential Sound Studio.'));
    container.appendChild(root);
  }

  function bindFile(file) {
    stopPlay();
    state.file = file;
    state.buffer = null;
    state.analysis = null;
    state.error = '';
    state.status = '';
    if (!file || !file.path) {
      if (mountedEl) renderInto(mountedEl);
      return;
    }
    if (file.path === currentPath && state.buffer) {
      if (mountedEl) renderInto(mountedEl);
      return;
    }
    currentPath = file.path;
    setCategory(guessCategory(file.name));
    if (mountedEl) renderInto(mountedEl);
    loadBuffer(file.path)
      .then(function (buf) {
        if (state.file && state.file.path !== file.path) return;
        state.buffer = buf;
        if (mountedEl) renderInto(mountedEl);
      })
      .catch(function (err) {
        state.error = err && err.message ? err.message : String(err);
        if (mountedEl) renderInto(mountedEl);
      });
  }

  function mount(container, file) {
    mountedEl = container;
    bindFile(file || null);
  }

  window.__sfxEssentialSound = {
    mount: mount,
    bindFile: bindFile,
    stop: stopPlay,
    openStudio: openInStudio
  };
})();
