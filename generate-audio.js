const fs = require('fs');
const path = require('path');

function createWavBuffer(sampleRate, channels, floatSamplesL, floatSamplesR) {
  const numSamples = floatSamplesL.length;
  const numChannels = channels;
  const bytesPerSample = 2; // 16-bit
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF identifier
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt subchunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20);  // AudioFormat (1 for PCM)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34); // BitsPerSample

  // data subchunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    // Clamp Left
    let sL = Math.max(-1, Math.min(1, floatSamplesL[i]));
    let intL = sL < 0 ? sL * 0x8000 : sL * 0x7FFF;
    buffer.writeInt16LE(Math.round(intL), offset);
    offset += 2;

    if (numChannels === 2) {
      let sR = Math.max(-1, Math.min(1, floatSamplesR ? floatSamplesR[i] : floatSamplesL[i]));
      let intR = sR < 0 ? sR * 0x8000 : sR * 0x7FFF;
      buffer.writeInt16LE(Math.round(intR), offset);
      offset += 2;
    }
  }

  return buffer;
}

const SR = 44100;

// 1. Cinematic Whoosh (~1.4s)
function generateWhoosh() {
  const duration = 1.4;
  const totalSamples = Math.floor(duration * SR);
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);

  // State variable filter for whoosh sweep
  let lowL = 0, bandL = 0, highL = 0;
  let lowR = 0, bandR = 0, highR = 0;

  for (let i = 0; i < totalSamples; i++) {
    const t = i / SR;
    const progress = t / duration;

    // Amplitude envelope (parabolic / bell curve centered at 0.55)
    const env = Math.pow(Math.sin(progress * Math.PI), 2.2);

    // Center frequency sweep: rises from 150Hz to 1600Hz then drops to 250Hz
    const cutoff = 150 + 1500 * Math.pow(Math.sin(progress * Math.PI), 1.8);
    const q = 3.5;
    const f = 2 * Math.sin(Math.PI * cutoff / SR);

    // White noise with subtle pink slope
    const whiteL = (Math.random() * 2 - 1) * 0.9;
    const whiteR = (Math.random() * 2 - 1) * 0.9;

    // Sub-harmonic tonal layer (swept pitch)
    const subFreq = 80 + 220 * Math.sin(progress * Math.PI);
    const sub = Math.sin(2 * Math.PI * subFreq * t) * 0.35;

    // Filter Left
    highL = (whiteL + sub) - lowL - q * bandL;
    bandL += f * highL;
    lowL += f * bandL;

    // Filter Right (slight stereo decorrelation)
    highR = (whiteR + sub) - lowR - q * bandR;
    bandR += f * highR;
    lowR += f * bandR;

    // Stereo panning sweep from left to right
    const pan = progress; // 0 (left) to 1 (right)
    const panL = Math.cos(pan * Math.PI * 0.5);
    const panR = Math.sin(pan * Math.PI * 0.5);

    left[i] = (bandL * 1.5 + lowL * 0.4) * env * panL * 1.3;
    right[i] = (bandR * 1.5 + lowR * 0.4) * env * panR * 1.3;
  }

  return { left, right };
}

// 2. Deep Impact (~2.2s)
function generateImpact() {
  const duration = 2.2;
  const totalSamples = Math.floor(duration * SR);
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);

  let phase = 0;
  for (let i = 0; i < totalSamples; i++) {
    const t = i / SR;

    // Pitch drop: starts at 220Hz, plunges quickly to 45Hz sub boom
    const freq = 45 + 180 * Math.exp(-t * 22);
    phase += 2 * Math.PI * freq / SR;

    // Sub sine boom
    const boom = Math.sin(phase) * Math.exp(-t * 1.8);
    // Subtle second harmonic for richness
    const warmSub = Math.sin(phase * 0.5) * Math.exp(-t * 1.2) * 0.3;

    // Initial click/thud transient in first 40ms
    const transientEnv = Math.exp(-t * 85);
    const transientNoise = (Math.random() * 2 - 1) * transientEnv * 0.7;
    const transientThump = Math.sin(2 * Math.PI * 180 * t) * transientEnv * 0.8;

    // Rumble tail (low filtered noise)
    const rumbleEnv = Math.pow(Math.max(0, 1 - t / duration), 2.5) * Math.min(1, t * 15);
    const rumbleL = (Math.random() * 2 - 1) * rumbleEnv * 0.15;
    const rumbleR = (Math.random() * 2 - 1) * rumbleEnv * 0.15;

    // Combined & saturated slightly
    let mono = boom * 0.8 + warmSub + transientNoise + transientThump;
    mono = Math.tanh(mono * 1.4); // warm tape saturation

    left[i] = (mono + rumbleL) * 0.95;
    right[i] = (mono + rumbleR) * 0.95;
  }

  return { left, right };
}

// 3. Soft Transition (~1.1s)
function generateTransition() {
  const duration = 1.1;
  const totalSamples = Math.floor(duration * SR);
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);

  let lpL = 0, lpR = 0;
  for (let i = 0; i < totalSamples; i++) {
    const t = i / SR;
    const progress = t / duration;

    // Gentle Gaussian-like envelope
    const env = Math.pow(Math.sin(progress * Math.PI), 2.0);

    // Warm chord chime (A major 7th ethereal harmonics: 440, 554, 659, 830)
    const chime1 = Math.sin(2 * Math.PI * 440 * t) * 0.15;
    const chime2 = Math.sin(2 * Math.PI * 554.37 * t) * 0.12;
    const chime3 = Math.sin(2 * Math.PI * 659.25 * t) * 0.14;
    const chime4 = Math.sin(2 * Math.PI * 830.61 * t) * 0.10;
    const chimeLayer = chime1 + chime2 + chime3 + chime4;

    // Soft airy whoosh
    const cutoff = 400 + 1200 * Math.sin(progress * Math.PI);
    const alpha = (2 * Math.PI * cutoff / SR) / (1 + 2 * Math.PI * cutoff / SR);
    
    const noiseL = (Math.random() * 2 - 1) * 0.35;
    const noiseR = (Math.random() * 2 - 1) * 0.35;
    lpL += alpha * (noiseL - lpL);
    lpR += alpha * (noiseR - lpR);

    // Subtle stereo widening
    left[i] = (lpL * 1.2 + chimeLayer * 0.8) * env * 1.1;
    right[i] = (lpR * 1.2 + chimeLayer * 0.8) * env * 1.1;
  }

  return { left, right };
}

// 4. Cinematic Riser (~3.0s)
function generateRiser() {
  const duration = 3.0;
  const totalSamples = Math.floor(duration * SR);
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);

  let phaseA = 0;
  let phaseB = 0;
  let lfoPhase = 0;
  let lowL = 0, bandL = 0;

  for (let i = 0; i < totalSamples; i++) {
    const t = i / SR;
    const progress = t / duration;

    // Exponential volume swell up to the end
    const env = Math.pow(progress, 1.7) * (i > totalSamples - 200 ? (totalSamples - i) / 200 : 1);

    // Frequency climb from 90Hz to 780Hz
    const freq = 90 * Math.pow(780 / 90, progress);
    phaseA += 2 * Math.PI * freq / SR;
    phaseB += 2 * Math.PI * (freq * 1.008) / SR; // detune for tension chorus

    // Oscillators: mix of saw approximation and sine
    const sawA = (phaseA % (2 * Math.PI)) / Math.PI - 1;
    const sawB = (phaseB % (2 * Math.PI)) / Math.PI - 1;
    const synthLayer = (sawA * 0.35 + sawB * 0.35 + Math.sin(phaseA) * 0.4);

    // Accelerating noise flutter LFO (from 4Hz to 28Hz)
    const lfoRate = 4 + 24 * Math.pow(progress, 2);
    lfoPhase += 2 * Math.PI * lfoRate / SR;
    const flutter = 0.6 + 0.4 * Math.sin(lfoPhase);

    // Filtered noise riser
    const cutoff = 200 + 3800 * Math.pow(progress, 2);
    const f = 2 * Math.sin(Math.PI * cutoff / SR);
    const q = 4.0;
    const noise = (Math.random() * 2 - 1) * flutter * 0.4;
    
    const high = noise - lowL - q * bandL;
    bandL += f * high;
    lowL += f * bandL;

    const out = (synthLayer * 0.6 + bandL * 1.2) * env;
    left[i] = Math.tanh(out * 1.2) * 0.9;
    right[i] = Math.tanh(out * 1.2) * 0.9;
  }

  return { left, right };
}

// 5. UI Click (~0.15s)
function generateClick() {
  const duration = 0.15;
  const totalSamples = Math.floor(duration * SR);
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);

  for (let i = 0; i < totalSamples; i++) {
    const t = i / SR;

    // Fast transient click
    const clickEnv = Math.exp(-t * 240);
    const click = Math.sin(2 * Math.PI * 2200 * t) * clickEnv * 0.9;

    // Body 'tock' resonance at 750Hz
    const bodyEnv = Math.exp(-t * 70);
    const body = Math.sin(2 * Math.PI * 750 * t) * bodyEnv * 0.5;

    // High snap noise
    const noiseEnv = Math.exp(-t * 400);
    const noise = (Math.random() * 2 - 1) * noiseEnv * 0.4;

    const val = (click + body + noise) * 0.9;
    left[i] = val;
    right[i] = val;
  }

  return { left, right };
}

// 6. Ambient Atmosphere (~5.0s loopable feel)
function generateAtmosphere() {
  const duration = 5.0;
  const totalSamples = Math.floor(duration * SR);
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);

  // F minor cinematic pad chords (F1: 43.65Hz, C2: 65.41Hz, Ab2: 103.83Hz, Eb3: 155.56Hz, C4: 261.63Hz)
  const freqs = [65.41, 103.83, 130.81, 155.56, 196.00, 261.63];

  for (let i = 0; i < totalSamples; i++) {
    const t = i / SR;

    // Smooth loop envelope (fade in at start, fade out at end)
    let env = 1.0;
    if (t < 0.5) env = 0.5 * (1 - Math.cos(Math.PI * t / 0.5));
    if (t > duration - 0.5) env = 0.5 * (1 - Math.cos(Math.PI * (duration - t) / 0.5));

    // Slow moving LFO modulations
    const lfo1 = Math.sin(2 * Math.PI * 0.25 * t);
    const lfo2 = Math.cos(2 * Math.PI * 0.18 * t);

    let droneL = 0;
    let droneR = 0;

    for (let f = 0; f < freqs.length; f++) {
      const baseFreq = freqs[f];
      const detuneL = baseFreq * (1 + 0.003 * lfo1);
      const detuneR = baseFreq * (1 - 0.003 * lfo2);
      const amp = 0.15 / (f * 0.4 + 1);

      droneL += Math.sin(2 * Math.PI * detuneL * t) * amp;
      droneR += Math.sin(2 * Math.PI * detuneR * t) * amp;
    }

    // Gentle tape breath
    const airL = (Math.random() * 2 - 1) * 0.04 * (1 + 0.3 * lfo1);
    const airR = (Math.random() * 2 - 1) * 0.04 * (1 + 0.3 * lfo2);

    left[i] = (droneL + airL) * env * 1.3;
    right[i] = (droneR + airR) * env * 1.3;
  }

  return { left, right };
}

const sounds = [
  { name: 'cinematic-whoosh.wav', gen: generateWhoosh },
  { name: 'deep-impact.wav', gen: generateImpact },
  { name: 'soft-transition.wav', gen: generateTransition },
  { name: 'riser.wav', gen: generateRiser },
  { name: 'ui-click.wav', gen: generateClick },
  { name: 'ambient-atmosphere.wav', gen: generateAtmosphere },
];

const outDir = path.resolve(__dirname, 'assets/audio');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

sounds.forEach(s => {
  const { left, right } = s.gen();
  const buf = createWavBuffer(SR, 2, left, right);
  const filePath = path.join(outDir, s.name);
  fs.writeFileSync(filePath, buf);
  console.log(`Generated ${s.name} (${(buf.length / 1024).toFixed(1)} KB)`);
});
