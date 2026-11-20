/**
 * SFX Composer — Web Audio Engine
 * Real-time DSP, Multi-track Mini Timeline, Essential Sound Filtering,
 * Audio Tools Trim/Fade/Normalize, and Client-Side WAV Export.
 */

(function () {
  'use strict';

  var audioCtx = null;
  var bufferCache = {};
  var activeSources = [];

  function getAudioContext() {
    if (!audioCtx) {
      var AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        console.warn('Web Audio API not supported in this browser.');
        return null;
      }
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  // Auto unlock on first user interaction
  function unlockAudio() {
    var ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().then(function () {
        console.log('AudioContext initialized & unlocked.');
      });
    }
  }
  ['click', 'keydown', 'touchstart'].forEach(function (evt) {
    window.addEventListener(evt, unlockAudio, { once: true, passive: true });
  });

  // Base64 to ArrayBuffer helper for dataURIs
  function base64ToArrayBuffer(base64) {
    var binaryString = window.atob(base64);
    var len = binaryString.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  // Load and decode sound by item object
  function loadSound(item) {
    return new Promise(function (resolve, reject) {
      if (bufferCache[item.id]) {
        return resolve(bufferCache[item.id]);
      }

      var ctx = getAudioContext();
      if (!ctx) return reject(new Error('AudioContext unavailable'));

      function decodeData(arrayBuf) {
        ctx.decodeAudioData(
          arrayBuf,
          function (decoded) {
            bufferCache[item.id] = decoded;
            resolve(decoded);
          },
          function (err) {
            reject(err || new Error('Audio decoding failed'));
          }
        );
      }

      // Try dataUri first if present to avoid CORS issues completely
      if (item.dataUri && item.dataUri.indexOf('base64,') !== -1) {
        try {
          var b64Data = item.dataUri.split('base64,')[1];
          var arrayBuffer = base64ToArrayBuffer(b64Data);
          decodeData(arrayBuffer);
          return;
        } catch (e) {
          console.warn('Failed decoding base64 dataUri, falling back to fetch url', e);
        }
      }

      // Fallback to fetch
      fetch(item.url)
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status + ' loading sound ' + item.url);
          return res.arrayBuffer();
        })
        .then(decodeData)
        .catch(function (fetchErr) {
          console.error('Fetch error:', fetchErr);
          reject(fetchErr);
        });
    });
  }

  // Preload all catalog sounds into memory
  function preloadCatalog(catalog) {
    if (!catalog || !catalog.length) return Promise.resolve();
    var promises = catalog.map(function (item) {
      return loadSound(item).catch(function (err) {
        console.warn('Could not preload ' + item.name, err);
        return null;
      });
    });
    return Promise.all(promises);
  }

  // Calculate Peak Amplitude in buffer between start and end seconds
  function measurePeak(buffer, startSec, endSec) {
    if (!buffer) return 0;
    var sr = buffer.sampleRate;
    var i0 = Math.max(0, Math.floor((startSec || 0) * sr));
    var i1 = Math.min(buffer.length, Math.floor((endSec != null ? endSec : buffer.duration) * sr));
    var max = 0;
    for (var c = 0; c < buffer.numberOfChannels; c++) {
      var data = buffer.getChannelData(c);
      for (var i = i0; i < i1; i++) {
        var abs = Math.abs(data[i]);
        if (abs > max) max = abs;
      }
    }
    return max;
  }

  function dbToGain(db) {
    return Math.pow(10, Number(db) / 20);
  }

  function gainToDb(gain) {
    if (gain <= 1e-6) return -120;
    return 20 * Math.log10(gain);
  }

  // Fast client-side WAV encoder
  function audioBufferToWav(buffer, optStart, optEnd) {
    var sr = buffer.sampleRate;
    var numChannels = buffer.numberOfChannels;
    var startFrame = Math.max(0, Math.floor((optStart || 0) * sr));
    var endFrame = Math.min(buffer.length, Math.floor((optEnd != null ? optEnd : buffer.duration) * sr));
    if (endFrame <= startFrame) endFrame = buffer.length;

    var numFrames = endFrame - startFrame;
    var bytesPerSample = 2; // 16-bit
    var blockAlign = numChannels * bytesPerSample;
    var byteRate = sr * blockAlign;
    var dataSize = numFrames * blockAlign;
    var totalSize = 44 + dataSize;
    var arrayBuffer = new ArrayBuffer(totalSize);
    var view = new DataView(arrayBuffer);

    function writeString(offset, string) {
      for (var i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    }

    // RIFF header
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');

    // fmt subchunk
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // 16 for PCM
    view.setUint16(20, 1, true);  // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sr, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true); // 16 bits per sample

    // data subchunk
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    var offset = 44;
    var channels = [];
    for (var c = 0; c < numChannels; c++) {
      channels.push(buffer.getChannelData(c));
    }

    for (var i = 0; i < numFrames; i++) {
      for (var ch = 0; ch < numChannels; ch++) {
        var s = channels[ch][startFrame + i];
        s = Math.max(-1, Math.min(1, s));
        var val = s < 0 ? s * 0x8000 : s * 0x7FFF;
        view.setInt16(offset, Math.round(val), true);
        offset += 2;
      }
    }

    return new Blob([view], { type: 'audio/wav' });
  }

  // Master Audio Engine object
  var AudioEngine = {
    getAudioContext: getAudioContext,
    loadSound: loadSound,
    preloadCatalog: preloadCatalog,
    measurePeak: measurePeak,
    dbToGain: dbToGain,
    gainToDb: gainToDb,
    audioBufferToWav: audioBufferToWav,
    bufferCache: bufferCache,

    // Standalone sample audition player with optional onEnded callback
    currentSoloPlayer: null,
    playSample: function (item, onProgress, onEnded) {
      var self = this;
      this.stopSample();

      var ctx = getAudioContext();
      if (!ctx) return Promise.reject(new Error('No context'));

      return loadSound(item).then(function (buffer) {
        var source = ctx.createBufferSource();
        source.buffer = buffer;

        var gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(1.0, ctx.currentTime);

        source.connect(gainNode);
        gainNode.connect(ctx.destination);

        var startTime = ctx.currentTime;
        var duration = buffer.duration;

        source.start(0);

        var timerId = null;
        if (onProgress) {
          timerId = setInterval(function () {
            var elapsed = ctx.currentTime - startTime;
            if (elapsed > duration) elapsed = duration;
            onProgress(elapsed, duration);
            if (elapsed >= duration) {
              clearInterval(timerId);
            }
          }, 40);
        }

        source.onended = function () {
          if (timerId) clearInterval(timerId);
          if (self.currentSoloPlayer && self.currentSoloPlayer.source === source) {
            self.currentSoloPlayer = null;
          }
          if (onEnded) onEnded();
        };

        self.currentSoloPlayer = {
          source: source,
          gainNode: gainNode,
          itemId: item.id,
          stop: function () {
            if (timerId) clearInterval(timerId);
            try {
              source.stop();
            } catch (e) {}
            self.currentSoloPlayer = null;
            if (onEnded) onEnded();
          }
        };

        return self.currentSoloPlayer;
      });
    },

    stopSample: function () {
      if (this.currentSoloPlayer) {
        this.currentSoloPlayer.stop();
        this.currentSoloPlayer = null;
      }
    },

    isPlayingSample: function (id) {
      return this.currentSoloPlayer && (!id || this.currentSoloPlayer.itemId === id);
    },

    // ── ESSENTIAL SOUND LIVE DSP CHAIN ──
    essentialChain: null,
    playWithEssentialSound: function (item, params, onEnded) {
      this.stopEssentialSound();
      var ctx = getAudioContext();
      if (!ctx) return;

      var self = this;
      return loadSound(item).then(function (buffer) {
        var source = ctx.createBufferSource();
        source.buffer = buffer;

        // Highpass Filter
        var hpFilter = ctx.createBiquadFilter();
        hpFilter.type = 'highpass';
        hpFilter.frequency.setValueAtTime(params.highpass || 20, ctx.currentTime);

        // Lowpass Filter
        var lpFilter = ctx.createBiquadFilter();
        lpFilter.type = 'lowpass';
        lpFilter.frequency.setValueAtTime(params.lowpass || 20000, ctx.currentTime);

        // Bass Shelf (Low Shelf)
        var bassFilter = ctx.createBiquadFilter();
        bassFilter.type = 'lowshelf';
        bassFilter.frequency.setValueAtTime(160, ctx.currentTime);
        bassFilter.gain.setValueAtTime(params.bass || 0, ctx.currentTime);

        // Mid Peaking EQ (Presence / Tone)
        var eqFilter = ctx.createBiquadFilter();
        eqFilter.type = 'peaking';
        eqFilter.frequency.setValueAtTime(2500, ctx.currentTime);
        eqFilter.Q.setValueAtTime(1.0, ctx.currentTime);
        eqFilter.gain.setValueAtTime(params.eq || 0, ctx.currentTime);

        // Gain node with Fade In / Fade Out automation
        var gainNode = ctx.createGain();
        var targetGain = dbToGain(params.gainDb || 0);
        var fadeIn = Math.max(0.005, Number(params.fadeIn) || 0);
        var fadeOut = Math.max(0.005, Number(params.fadeOut) || 0);
        var dur = buffer.duration;
        var now = ctx.currentTime;

        gainNode.gain.setValueAtTime(0.0001, now);
        gainNode.gain.exponentialRampToValueAtTime(targetGain, now + fadeIn);

        if (dur > fadeOut) {
          gainNode.gain.setValueAtTime(targetGain, now + dur - fadeOut);
          gainNode.gain.exponentialRampToValueAtTime(0.0001, now + dur);
        }

        // Connect chain: source -> hp -> lp -> bass -> eq -> gain -> destination
        source.connect(hpFilter);
        hpFilter.connect(lpFilter);
        lpFilter.connect(bassFilter);
        bassFilter.connect(eqFilter);
        eqFilter.connect(gainNode);
        gainNode.connect(ctx.destination);

        source.start(0);

        source.onended = function () {
          if (self.essentialChain && self.essentialChain.source === source) {
            self.essentialChain = null;
          }
          if (onEnded) onEnded();
        };

        self.essentialChain = {
          source: source,
          hpFilter: hpFilter,
          lpFilter: lpFilter,
          bassFilter: bassFilter,
          eqFilter: eqFilter,
          gainNode: gainNode,
          buffer: buffer,
          updateParams: function (p) {
            var t = ctx.currentTime;
            if (p.highpass !== undefined) hpFilter.frequency.setTargetAtTime(p.highpass, t, 0.05);
            if (p.lowpass !== undefined) lpFilter.frequency.setTargetAtTime(p.lowpass, t, 0.05);
            if (p.bass !== undefined) bassFilter.gain.setTargetAtTime(p.bass, t, 0.05);
            if (p.eq !== undefined) eqFilter.gain.setTargetAtTime(p.eq, t, 0.05);
            if (p.gainDb !== undefined) gainNode.gain.setTargetAtTime(dbToGain(p.gainDb), t, 0.05);
          },
          stop: function () {
            try { source.stop(); } catch (e) {}
            self.essentialChain = null;
            if (onEnded) onEnded();
          }
        };

        return self.essentialChain;
      });
    },

    stopEssentialSound: function () {
      if (this.essentialChain) {
        this.essentialChain.stop();
        this.essentialChain = null;
      }
    },

    // ── AUDIO TOOLS DSP RENDERER (OFFLINE AUDIO CONTEXT) ──
    renderProcessedSample: function (buffer, params) {
      var sr = buffer.sampleRate;
      var trimStart = Math.max(0, Number(params.trimStart) || 0);
      var trimEnd = Math.min(buffer.duration, Number(params.trimEnd) || buffer.duration);
      if (trimEnd <= trimStart) trimEnd = buffer.duration;
      var duration = trimEnd - trimStart;

      var OfflineContextClass = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (!OfflineContextClass) {
        return Promise.reject(new Error('OfflineAudioContext not supported'));
      }

      var offlineCtx = new OfflineContextClass(buffer.numberOfChannels, Math.ceil(duration * sr), sr);
      var src = offlineCtx.createBufferSource();
      src.buffer = buffer;

      // Filter nodes
      var hp = offlineCtx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = params.highpass || 20;

      var lp = offlineCtx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = params.lowpass || 20000;

      var gainNode = offlineCtx.createGain();
      var gainMultiplier = dbToGain(params.gainDb || 0);

      // If normalize requested, boost peak to -1 dBFS
      if (params.normalize) {
        var currentPeak = measurePeak(buffer, trimStart, trimEnd);
        if (currentPeak > 1e-5) {
          var targetPeak = dbToGain(-1); // -1 dBFS
          gainMultiplier = targetPeak / currentPeak;
        }
      }

      gainNode.gain.setValueAtTime(0.0001, 0);
      var fadeIn = Math.min(duration * 0.4, Math.max(0.002, Number(params.fadeIn) || 0));
      var fadeOut = Math.min(duration * 0.4, Math.max(0.002, Number(params.fadeOut) || 0));

      gainNode.gain.exponentialRampToValueAtTime(gainMultiplier, fadeIn);
      if (duration > fadeOut) {
        gainNode.gain.setValueAtTime(gainMultiplier, duration - fadeOut);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, duration);
      }

      src.connect(hp);
      hp.connect(lp);
      lp.connect(gainNode);
      gainNode.connect(offlineCtx.destination);

      src.start(0, trimStart, duration);

      return offlineCtx.startRendering();
    },

    // ── MULTI-TRACK MINI TIMELINE ENGINE ──
    timeline: {
      isPlaying: false,
      isLooping: false,
      currentTime: 0,
      totalDuration: 8.0, // 8-second demo sequence
      clips: [],
      scheduledNodes: [],
      timerId: null,
      startEpoch: 0,
      onTick: null,
      onStateChange: null,
      masterGainNode: null,
      analyserNode: null,

      init: function () {
        var ctx = getAudioContext();
        if (ctx && !this.masterGainNode) {
          this.masterGainNode = ctx.createGain();
          this.analyserNode = ctx.createAnalyser();
          this.analyserNode.fftSize = 64;
          this.analyserNode.smoothingTimeConstant = 0.8;

          this.masterGainNode.connect(this.analyserNode);
          this.analyserNode.connect(ctx.destination);
        }
      },

      setClips: function (clipList) {
        this.clips = clipList;
      },

      addClip: function (clip) {
        this.clips.push(clip);
        if (this.onStateChange) this.onStateChange();
      },

      removeClip: function (clipId) {
        this.clips = this.clips.filter(function (c) { return c.id !== clipId; });
        if (this.onStateChange) this.onStateChange();
      },

      updateClip: function (clipId, updates) {
        var clip = this.clips.find(function (c) { return c.id === clipId; });
        if (clip) {
          Object.assign(clip, updates);
          if (this.onStateChange) this.onStateChange();
        }
      },

      play: function (fromTime) {
        var ctx = getAudioContext();
        if (!ctx) return;
        this.init();
        this.stop();

        var self = this;
        this.isPlaying = true;
        this.currentTime = (fromTime !== undefined) ? fromTime : this.currentTime;
        if (this.currentTime >= this.totalDuration) this.currentTime = 0;

        var startOffset = this.currentTime;
        var startCtxTime = ctx.currentTime;
        this.startEpoch = startCtxTime - startOffset;
        this.scheduledNodes = [];

        // Schedule all clips on the timeline
        this.clips.forEach(function (clip) {
          var item = window.SFX_AUDIO_CATALOG.find(function (cat) { return cat.id === clip.soundId; });
          if (!item) return;

          loadSound(item).then(function (buf) {
            if (!self.isPlaying) return;

            var clipStart = clip.startTime;
            var clipEnd = clip.startTime + clip.duration;

            // Only schedule if clip overlaps playback window
            if (clipEnd > startOffset && clipStart < self.totalDuration) {
              var source = ctx.createBufferSource();
              source.buffer = buf;

              var clipGain = ctx.createGain();
              var vol = clip.gain != null ? clip.gain : 1.0;
              var fadeIn = clip.fadeIn || 0.02;
              var fadeOut = clip.fadeOut || 0.05;

              var scheduleAt = Math.max(0, clipStart - startOffset);
              var bufferOffset = (startOffset > clipStart) ? (startOffset - clipStart) : 0;
              var playDur = clip.duration - bufferOffset;

              var nodeStartTime = startCtxTime + scheduleAt;
              var nodeEndTime = nodeStartTime + playDur;

              // Apply gain and fades
              clipGain.gain.setValueAtTime(0.0001, nodeStartTime);
              clipGain.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), nodeStartTime + fadeIn);

              if (playDur > fadeOut) {
                clipGain.gain.setValueAtTime(Math.max(0.001, vol), nodeEndTime - fadeOut);
                clipGain.gain.exponentialRampToValueAtTime(0.0001, nodeEndTime);
              }

              source.connect(clipGain);
              clipGain.connect(self.masterGainNode);

              source.start(nodeStartTime, bufferOffset, playDur);
              self.scheduledNodes.push(source);
            }
          });
        });

        // Animation / playhead timer loop
        this.timerId = setInterval(function () {
          var now = ctx.currentTime;
          var elapsed = now - self.startEpoch;

          if (elapsed >= self.totalDuration) {
            if (self.isLooping) {
              self.play(0);
            } else {
              self.stop();
              self.currentTime = 0;
              if (self.onTick) self.onTick(0);
              if (self.onStateChange) self.onStateChange();
            }
            return;
          }

          self.currentTime = elapsed;
          if (self.onTick) self.onTick(elapsed);
        }, 25);

        if (this.onStateChange) this.onStateChange();
      },

      pause: function () {
        this.stop();
        if (this.onStateChange) this.onStateChange();
      },

      stop: function () {
        this.isPlaying = false;
        if (this.timerId) {
          clearInterval(this.timerId);
          this.timerId = null;
        }
        this.scheduledNodes.forEach(function (node) {
          try { node.stop(); } catch (e) {}
        });
        this.scheduledNodes = [];
      },

      seek: function (time) {
        var wasPlaying = this.isPlaying;
        this.stop();
        this.currentTime = Math.max(0, Math.min(this.totalDuration, time));
        if (this.onTick) this.onTick(this.currentTime);
        if (wasPlaying) {
          this.play(this.currentTime);
        } else {
          if (this.onStateChange) this.onStateChange();
        }
      },

      getMeterLevel: function () {
        if (!this.analyserNode || !this.isPlaying) return 0;
        var dataArray = new Uint8Array(this.analyserNode.frequencyBinCount);
        this.analyserNode.getByteFrequencyData(dataArray);
        var sum = 0;
        for (var i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        var avg = sum / dataArray.length;
        return avg / 255; // 0 to 1
      }
    }
  };

  window.SFX_AUDIO_ENGINE = AudioEngine;
})();
