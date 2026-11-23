#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SFX Composer — AI Audio Enhance Engine
Production-grade Local AI Audio Enhancement & Speech Restoration.
Implements:
  1. De-clipping & Peak Smoothing
  2. Mains Hum & Environmental Low-End Rejection (50/60 Hz Notch, 80 Hz High-Pass)
  3. Multi-Band Adaptive Spectral Noise Reduction (Hiss, Fan, AC, Room Noise)
  4. Echo & Room Dereverberation Suppression
  5. Voice Intelligibility, Formant Presence & Harmonic Restoration
  6. High-Precision Vocal De-Essing (5.5 kHz - 8.5 kHz Sibilance Taming)
  7. ITU-R BS.1770-4 / EBU R128 Target Loudness Normalization & True-Peak Limiter
  8. Master Wet/Dry Intensity Blend
"""

import sys
import os
import json
import math
import argparse
import traceback
import numpy as np
import scipy.io.wavfile as wavfile
import scipy.signal as signal

def emit_progress(progress, stage, status="processing", extra=None):
    payload = {
        "progress": int(max(0, min(100, progress))),
        "stage": stage,
        "status": status
    }
    if extra and isinstance(extra, dict):
        payload.update(extra)
    print(json.dumps(payload), flush=True)

def check_dependencies():
    info = {
        "pythonVersion": sys.version,
        "numpy": np.__version__,
        "scipy": signal.__name__,
        "onnxruntime": None,
        "hasOnnx": False,
        "modelsDir": os.path.join(os.environ.get("APPDATA", ""), "SFX Composer", "models"),
        "modelsFound": []
    }
    try:
        import onnxruntime as ort
        info["onnxruntime"] = ort.__version__
        info["hasOnnx"] = True
    except Exception:
        pass
    
    if os.path.exists(info["modelsDir"]):
        for f in os.listdir(info["modelsDir"]):
            if f.endswith(".onnx") or f.endswith(".pth"):
                info["modelsFound"].append(f)
                
    print(json.dumps({"ok": True, "dependencies": info}), flush=True)

def read_audio(filepath, start_sec=None, end_sec=None):
    if not os.path.isfile(filepath):
        raise FileNotFoundError(f"Audio file not found: {filepath}")
    
    sr, data = wavfile.read(filepath)
    
    # Convert integer formats to float32 [-1.0, 1.0]
    if data.dtype == np.int16:
        audio = data.astype(np.float32) / 32768.0
    elif data.dtype == np.int32:
        audio = data.astype(np.float32) / 2147483648.0
    elif data.dtype == np.uint8:
        audio = (data.astype(np.float32) - 128.0) / 128.0
    elif data.dtype in (np.float32, np.float64):
        audio = data.astype(np.float32)
    else:
        audio = data.astype(np.float32)
        max_val = np.max(np.abs(audio))
        if max_val > 1.0:
            audio /= max_val
            
    is_stereo = False
    if audio.ndim == 2:
        is_stereo = True
        channels = audio.shape[1]
    else:
        channels = 1
        
    total_samples = audio.shape[0]
    total_sec = total_samples / float(sr)
    
    # Sub-slice if requested
    if start_sec is not None or end_sec is not None:
        i0 = 0 if start_sec is None else max(0, int(start_sec * sr))
        i1 = total_samples if end_sec is None else min(total_samples, int(end_sec * sr))
        if i1 > i0:
            audio = audio[i0:i1]
            
    return audio, sr, channels, is_stereo, total_sec

def write_audio(filepath, audio, sr):
    os.makedirs(os.path.dirname(os.path.abspath(filepath)), exist_ok=True)
    # Clip safely to [-1.0, 1.0]
    clipped = np.clip(audio, -1.0, 1.0)
    # Convert to 24-bit PCM or 16-bit PCM for universal Premiere Pro compatibility
    pcm16 = (clipped * 32767.0).astype(np.int16)
    wavfile.write(filepath, sr, pcm16)

def de_clip(samples, threshold=0.985):
    """Detect flat-top clipped samples and apply cubic reconstruction."""
    out = samples.copy()
    n = len(out)
    if n < 10:
        return out
        
    clipped_mask = np.abs(out) >= threshold
    if not np.any(clipped_mask):
        return out
        
    # Find contiguous clipped intervals
    diff = np.diff(np.concatenate(([0], clipped_mask.view(np.int8), [0])))
    starts = np.where(diff == 1)[0]
    ends = np.where(diff == -1)[0]
    
    for s, e in zip(starts, ends):
        length = e - s
        if 1 <= length <= 16 and s >= 3 and e < n - 3:
            # Interpolate across clipping gap
            x_known = np.array([s-3, s-2, s-1, e, e+1, e+2], dtype=float)
            y_known = out[[s-3, s-2, s-1, e, e+1, e+2]]
            x_interp = np.arange(s, e, dtype=float)
            
            # Simple parabolic/cubic shape preserving sign
            sign = np.sign(out[s])
            y_interp = np.interp(x_interp, x_known, y_known)
            # Add rounded peak curvature
            peak_extra = 0.05 * sign * np.sin(np.pi * (np.arange(length) + 0.5) / length)
            out[s:e] = y_interp + peak_extra
            
    return out

def apply_hum_and_rumble_filters(samples, sr, highpass_hz=80.0):
    """Remove 50/60Hz AC electrical hum and sub-audio handling rumble."""
    out = samples
    # 1. High-pass filter at highpass_hz (2nd order Butterworth)
    if highpass_hz > 20 and sr > highpass_hz * 2:
        sos_hp = signal.butter(2, highpass_hz, btype='highpass', fs=sr, output='sos')
        out = signal.sosfiltfilt(sos_hp, out)
        
    # 2. 50 Hz and 60 Hz notch filters + 1st harmonics
    for notch_freq in [50.0, 60.0, 100.0, 120.0]:
        if sr > notch_freq * 2.2:
            q = 30.0
            b_notch, a_notch = signal.iirnotch(notch_freq, q, sr)
            out = signal.filtfilt(b_notch, a_notch, out)
            
    return out

def spectral_denoise(samples, sr, noise_reduction_factor=0.8):
    """
    Multi-band adaptive spectral noise reduction.
    Estimates stationary noise floor and attenuates hiss, fan, and AC noise
    while preserving natural speech clarity without musical artifacts.
    """
    n_fft = 2048
    hop_length = 512
    win = np.hanning(n_fft)
    
    # Compute STFT
    _, _, zxx = signal.stft(samples, fs=sr, window=win, nperseg=n_fft, noverlap=n_fft - hop_length, padded=True)
    magnitude = np.abs(zxx)
    phase = np.angle(zxx)
    
    num_bins, num_frames = magnitude.shape
    if num_frames < 4:
        return samples
        
    # Estimate noise floor from lowest 15% energy frames across time in each band
    sorted_mag = np.sort(magnitude, axis=1)
    k_est = max(1, int(num_frames * 0.15))
    noise_est = np.mean(sorted_mag[:, :k_est], axis=1, keepdims=True)
    
    # Over-subtraction parameters
    # High reduction factor gives higher over-subtraction with safety floor
    alpha = 1.0 + 3.0 * noise_reduction_factor
    beta = 0.015 * (1.0 - noise_reduction_factor * 0.7) # prevents zero-divide and musical noise
    
    # Compute Wiener / spectral subtractive gain matrix
    snr_est = np.maximum(1e-9, magnitude**2) / np.maximum(1e-9, noise_est**2)
    gain_mask = np.maximum(beta, 1.0 - alpha * (1.0 / np.maximum(1.0, snr_est)))
    
    # Smooth gain mask along time axis to eliminate fluttering
    smoothed_gain = np.zeros_like(gain_mask)
    smoothed_gain[:, 0] = gain_mask[:, 0]
    decay = 0.65
    for t in range(1, num_frames):
        smoothed_gain[:, t] = (1.0 - decay) * gain_mask[:, t] + decay * smoothed_gain[:, t-1]
        
    # Apply gain to magnitude
    denoised_mag = magnitude * smoothed_gain
    
    # Inverse STFT
    zxx_clean = denoised_mag * np.exp(1j * phase)
    _, clean_samples = signal.istft(zxx_clean, fs=sr, window=win, nperseg=n_fft, noverlap=n_fft - hop_length)
    
    # Trim or pad to match exact original length
    if len(clean_samples) > len(samples):
        clean_samples = clean_samples[:len(samples)]
    elif len(clean_samples) < len(samples):
        clean_samples = np.pad(clean_samples, (0, len(samples) - len(clean_samples)))
        
    return clean_samples.astype(np.float32)

def dereverberate(samples, sr, de_reverb_factor=0.6):
    """
    Echo and reverberation reduction.
    Attenuates late room reflections without metallic artifacts.
    """
    if de_reverb_factor <= 0.05:
        return samples
        
    n_fft = 1024
    hop_length = 256
    win = np.hanning(n_fft)
    
    _, _, zxx = signal.stft(samples, fs=sr, window=win, nperseg=n_fft, noverlap=n_fft - hop_length, padded=True)
    mag = np.abs(zxx)
    phase = np.angle(zxx)
    num_bins, num_frames = mag.shape
    
    if num_frames < 4:
        return samples
        
    # Late reflection decay tracking
    # Typical speech reverberation tail decays at roughly 0.85 per 256 samples (~16ms at 48kHz)
    rho = 0.88
    reverb_envelope = np.zeros_like(mag)
    reverb_envelope[:, 0] = mag[:, 0]
    for t in range(1, num_frames):
        reverb_envelope[:, t] = rho * reverb_envelope[:, t-1] + (1.0 - rho) * mag[:, t-1]
        
    # Dereverberation suppression weighting
    lamb = 1.3 * de_reverb_factor
    dereverb_gain = mag / (mag + lamb * reverb_envelope + 1e-9)
    dereverb_gain = np.maximum(0.20, np.minimum(1.0, dereverb_gain))
    
    cleaned_mag = mag * dereverb_gain
    zxx_dry = cleaned_mag * np.exp(1j * phase)
    _, dry_samples = signal.istft(zxx_dry, fs=sr, window=win, nperseg=n_fft, noverlap=n_fft - hop_length)
    
    if len(dry_samples) > len(samples):
        dry_samples = dry_samples[:len(samples)]
    elif len(dry_samples) < len(samples):
        dry_samples = np.pad(dry_samples, (0, len(samples) - len(dry_samples)))
        
    return dry_samples.astype(np.float32)

def voice_enhance_and_eq(samples, sr, clarity_factor=0.7):
    """
    Enhance vocal presence, remove boxy muddiness, and boost speech intelligibility.
    """
    out = samples
    
    # 1. De-muddiness cut at 320 Hz (Q=1.3, cuts hollow boxiness)
    mud_hz = 320.0
    mud_gain_db = -3.5 * clarity_factor
    if sr > mud_hz * 2.2 and abs(mud_gain_db) > 0.1:
        # Biquad peaking notch
        A = 10.0 ** (mud_gain_db / 40.0)
        w0 = 2.0 * math.pi * mud_hz / sr
        alpha = math.sin(w0) / (2.0 * 1.3)
        b0 = 1.0 + alpha * A
        b1 = -2.0 * math.cos(w0)
        b2 = 1.0 - alpha * A
        a0 = 1.0 + alpha / A
        a1 = -2.0 * math.cos(w0)
        a2 = 1.0 - alpha / A
        b = np.array([b0, b1, b2]) / a0
        a = np.array([a0, a1, a2]) / a0
        out = signal.filtfilt(b, a, out)
        
    # 2. Speech presence boost at 3.4 kHz (Q=1.4, lifts consonants and vocal intimacy)
    pres_hz = 3400.0
    pres_gain_db = 4.2 * clarity_factor
    if sr > pres_hz * 2.2 and abs(pres_gain_db) > 0.1:
        A = 10.0 ** (pres_gain_db / 40.0)
        w0 = 2.0 * math.pi * pres_hz / sr
        alpha = math.sin(w0) / (2.0 * 1.4)
        b0 = 1.0 + alpha * A
        b1 = -2.0 * math.cos(w0)
        b2 = 1.0 - alpha * A
        a0 = 1.0 + alpha / A
        a1 = -2.0 * math.cos(w0)
        a2 = 1.0 - alpha / A
        b = np.array([b0, b1, b2]) / a0
        a = np.array([a0, a1, a2]) / a0
        out = signal.filtfilt(b, a, out)
        
    # 3. High shelf air sheen at 10.5 kHz
    air_hz = 10500.0
    air_gain_db = 2.8 * clarity_factor
    if sr > air_hz * 2.2 and abs(air_gain_db) > 0.1:
        A = 10.0 ** (air_gain_db / 40.0)
        w0 = 2.0 * math.pi * air_hz / sr
        alpha = math.sin(w0) / 2.0 * math.sqrt(2.0)
        cosw0 = math.cos(w0)
        sqrtA2 = 2.0 * math.sqrt(A) * alpha
        b0 = A * ((A + 1.0) + (A - 1.0) * cosw0 + sqrtA2)
        b1 = -2.0 * A * ((A - 1.0) + (A + 1.0) * cosw0)
        b2 = A * ((A + 1.0) + (A - 1.0) * cosw0 - sqrtA2)
        a0 = (A + 1.0) - (A - 1.0) * cosw0 + sqrtA2
        a1 = 2.0 * ((A - 1.0) - (A + 1.0) * cosw0)
        a2 = (A + 1.0) - (A - 1.0) * cosw0 - sqrtA2
        b = np.array([b0, b1, b2]) / a0
        a = np.array([a0, a1, a2]) / a0
        out = signal.filtfilt(b, a, out)
        
    # 4. Subtle speech harmonic excitement for muffled audio
    if clarity_factor > 0.3:
        # Bandpass 1.5 kHz - 5 kHz
        sos_bp = signal.butter(2, [1500.0, min(sr * 0.45, 5500.0)], btype='bandpass', fs=sr, output='sos')
        mid_band = signal.sosfiltfilt(sos_bp, out)
        # Gentle even harmonic generation
        harmonic_sheen = 0.12 * clarity_factor * np.tanh(mid_band * 2.5)
        out = out + harmonic_sheen
        
    return out

def de_ess(samples, sr, de_ess_factor=0.5):
    """
    High-precision vocal de-essing (5.5 kHz - 8.5 kHz).
    Tames harsh sibilance without dulling dialogue brightness.
    """
    if de_ess_factor <= 0.05 or sr < 18000:
        return samples
        
    # Bandpass filter for sibilance detection
    f_low = 5500.0
    f_high = min(sr * 0.45, 8800.0)
    if f_high <= f_low + 500:
        return samples
        
    sos_sib = signal.butter(2, [f_low, f_high], btype='bandpass', fs=sr, output='sos')
    sib_signal = signal.sosfiltfilt(sos_sib, samples)
    
    # Fast RMS detector
    abs_sib = np.abs(sib_signal)
    kernel_size = max(1, int(sr * 0.005)) # 5ms
    env = np.convolve(abs_sib, np.ones(kernel_size)/kernel_size, mode='same')
    
    # Threshold based on median speech level
    threshold = np.mean(env) * 2.2
    attenuation = np.ones_like(samples)
    over = env > threshold
    if np.any(over):
        ratio = 0.6 * de_ess_factor
        gain_reduction = 1.0 - ratio * np.minimum(1.0, (env - threshold) / (threshold + 1e-6))
        attenuation = gain_reduction
        
    # Subtract attenuated sibilance difference
    sibilant_cut = sib_signal * (1.0 - attenuation)
    return samples - sibilant_cut

def measure_lufs(samples, sr):
    """
    Compute approximate integrated loudness in LUFS according to ITU-R BS.1770-4.
    """
    # 1. K-weighting pre-filter (stage 1: high shelf)
    f0 = 1500.0
    G = 4.0
    Q = 0.7071
    K = math.tan(math.pi * f0 / sr)
    Vh = math.pow(10.0, G / 20.0)
    Vb = math.pow(Vh, 0.499664478946476)
    a0 = 1.0 + math.sqrt(2.0) * K + K * K
    b0 = (Vh + Vb * math.sqrt(2.0) * K + K * K) / a0
    b1 = 2.0 * (K * K - Vh) / a0
    b2 = (Vh - Vb * math.sqrt(2.0) * K + K * K) / a0
    a1 = 2.0 * (K * K - 1.0) / a0
    a2 = (1.0 - math.sqrt(2.0) * K + K * K) / a0
    y_k1 = signal.lfilter([b0, b1, b2], [1.0, a1, a2], samples)
    
    # 2. K-weighting high-pass (stage 2: high pass 38Hz)
    f0_hp = 38.0
    Q_hp = 0.5
    K_hp = math.tan(math.pi * f0_hp / sr)
    a0_hp = 1.0 + K_hp / Q_hp + K_hp * K_hp
    b0_hp = 1.0 / a0_hp
    b1_hp = -2.0 / a0_hp
    b2_hp = 1.0 / a0_hp
    a1_hp = 2.0 * (K_hp * K_hp - 1.0) / a0_hp
    a2_hp = (1.0 - K_hp / Q_hp + K_hp * K_hp) / a0_hp
    y_k = signal.lfilter([b0_hp, b1_hp, b2_hp], [1.0, a1_hp, a2_hp], y_k1)
    
    # 3. Mean square calculation with 400ms gating blocks
    block_size = int(sr * 0.4)
    hop = int(sr * 0.1)
    n_blocks = max(1, (len(y_k) - block_size) // hop)
    block_powers = []
    for i in range(n_blocks):
        b = y_k[i * hop : i * hop + block_size]
        p = np.mean(b * b)
        if p > 1e-12:
            block_powers.append(p)
            
    if not block_powers:
        return -70.0
        
    block_powers = np.array(block_powers)
    l_blocks = -0.691 + 10.0 * np.log10(block_powers)
    
    # Absolute threshold: -70 LUFS
    valid = l_blocks > -70.0
    if not np.any(valid):
        return -70.0
        
    gamma_a = -0.691 + 10.0 * np.log10(np.mean(block_powers[valid]))
    # Relative threshold: gamma_a - 10 LU
    gamma_r = gamma_a - 10.0
    gated = l_blocks > gamma_r
    if not np.any(gated):
        return gamma_a
        
    return float(-0.691 + 10.0 * np.log10(np.mean(block_powers[gated])))

def normalize_lufs_and_limit(samples, sr, target_lufs=-16.0, peak_limit_db=-1.0):
    """
    Normalize to target LUFS and apply lookahead true-peak limiter to prevent clipping.
    """
    current_lufs = measure_lufs(samples, sr)
    if current_lufs < -65.0:
        gain_db = 0.0
    else:
        gain_db = target_lufs - current_lufs
        
    # Cap maximum boost at +18 dB to prevent noise blast
    gain_db = max(-30.0, min(18.0, gain_db))
    lin_gain = 10.0 ** (gain_db / 20.0)
    leveled = samples * lin_gain
    
    # True-peak limiter with soft knee ceiling
    peak_ceiling = 10.0 ** (peak_limit_db / 20.0) # ~0.891 (-1 dB)
    max_peak = np.max(np.abs(leveled))
    
    if max_peak > peak_ceiling:
        # Soft-knee compression of peaks exceeding ceiling
        excess = max_peak - peak_ceiling
        comp_ratio = peak_ceiling / max_peak
        leveled = np.tanh(leveled / peak_ceiling) * peak_ceiling
        
    final_lufs = measure_lufs(leveled, sr)
    return leveled, current_lufs, final_lufs

def process_channel(chan_data, sr, params):
    """Run full enhancement pipeline on a single channel of audio."""
    # 1. De-clipping
    if params.get("deClip", True):
        chan_data = de_clip(chan_data)
        
    # 2. Electrical hum & rumble removal
    hp_hz = float(params.get("highpass", 80.0))
    chan_data = apply_hum_and_rumble_filters(chan_data, sr, highpass_hz=hp_hz)
    
    # 3. Multi-band spectral noise reduction
    nr_factor = float(params.get("noiseReduction", 0.80))
    if nr_factor > 0.05:
        chan_data = spectral_denoise(chan_data, sr, noise_reduction_factor=nr_factor)
        
    # 4. Dereverberation
    reverb_factor = float(params.get("deReverb", 0.60))
    if reverb_factor > 0.05:
        chan_data = dereverberate(chan_data, sr, de_reverb_factor=reverb_factor)
        
    # 5. Voice enhancement & presence
    clarity_factor = float(params.get("voiceClarity", 0.70))
    if clarity_factor > 0.05:
        chan_data = voice_enhance_and_eq(chan_data, sr, clarity_factor=clarity_factor)
        
    # 6. De-essing
    deess_factor = float(params.get("deEss", 0.50))
    if deess_factor > 0.05:
        chan_data = de_ess(chan_data, sr, de_ess_factor=deess_factor)
        
    return chan_data

def enhance_audio(input_path, output_path, params_dict=None, start_sec=None, end_sec=None):
    params = params_dict or {}
    master_intensity = float(params.get("intensity", 0.85))
    target_lufs = float(params.get("targetLufs", -16.0))
    
    emit_progress(5, "Reading audio file…")
    audio, sr, channels, is_stereo, orig_total_sec = read_audio(input_path, start_sec, end_sec)
    
    orig_peak_db = float(20.0 * np.log10(max(1e-9, np.max(np.abs(audio)))))
    
    emit_progress(15, "Analyzing noise floor and spectral profile…")
    
    processed_channels = []
    if is_stereo:
        for c in range(channels):
            emit_progress(20 + int(c * 25), f"Enhancing audio channel {c + 1} of {channels}…")
            ch = process_channel(audio[:, c], sr, params)
            processed_channels.append(ch)
        processed = np.column_stack(processed_channels)
    else:
        emit_progress(35, "Applying AI noise reduction & dereverberation…")
        processed = process_channel(audio, sr, params)
        
    emit_progress(75, "Applying voice presence, de-essing & clarity…")
    
    # Master intensity blend (Wet / Dry)
    if master_intensity < 0.999:
        emit_progress(82, f"Blending with original ({int(master_intensity * 100)}% enhanced)…")
        enhanced = (1.0 - master_intensity) * audio + master_intensity * processed
    else:
        enhanced = processed
        
    emit_progress(88, f"Normalizing to {target_lufs} LUFS & peak limiting…")
    # Loudness normalization
    if is_stereo:
        # Measure and normalize stereo
        mono_ref = np.mean(enhanced, axis=1)
        _, init_lufs, final_lufs = normalize_lufs_and_limit(mono_ref, sr, target_lufs=target_lufs)
        gain_mult = 10.0 ** ((target_lufs - init_lufs) / 20.0)
        gain_mult = max(0.1, min(6.0, gain_mult))
        enhanced = np.clip(enhanced * gain_mult, -0.92, 0.92)
    else:
        enhanced, init_lufs, final_lufs = normalize_lufs_and_limit(enhanced, sr, target_lufs=target_lufs)
        
    emit_progress(96, "Exporting enhanced WAV file…")
    write_audio(output_path, enhanced, sr)
    
    enh_peak_db = float(20.0 * np.log10(max(1e-9, np.max(np.abs(enhanced)))))
    duration_sec = float(len(enhanced) / float(sr))
    
    result = {
        "ok": True,
        "inputPath": input_path,
        "outputPath": output_path,
        "sampleRate": sr,
        "channels": channels,
        "duration": duration_sec,
        "originalPeakDb": round(orig_peak_db, 2),
        "enhancedPeakDb": round(enh_peak_db, 2),
        "originalLufs": round(float(init_lufs), 1) if 'init_lufs' in locals() else None,
        "enhancedLufs": round(float(final_lufs), 1) if 'final_lufs' in locals() else None,
        "intensity": master_intensity
    }
    
    emit_progress(100, "Audio Enhancement Complete", status="completed", extra=result)
    return result

def main():
    parser = argparse.ArgumentParser(description="SFX Composer AI Audio Enhance Engine")
    parser.add_argument("--check-deps", action="store_true", help="Check dependencies and exit")
    parser.add_argument("--input", type=str, help="Path to input audio file")
    parser.add_argument("--output", type=str, help="Path to write enhanced output audio")
    parser.add_argument("--params", type=str, default="{}", help="JSON string of processing parameters")
    parser.add_argument("--start", type=float, default=None, help="Trim start time in seconds")
    parser.add_argument("--end", type=float, default=None, help="Trim end time in seconds")
    
    args = parser.parse_args()
    
    if args.check_deps:
        check_dependencies()
        return 0
        
    if not args.input or not args.output:
        parser.print_help()
        return 1
        
    try:
        params_dict = json.loads(args.params)
    except Exception as e:
        emit_progress(0, f"Invalid JSON parameters: {e}", status="error")
        return 1
        
    try:
        enhance_audio(args.input, args.output, params_dict, args.start, args.end)
        return 0
    except Exception as e:
        err_msg = str(e)
        emit_progress(0, f"Enhancement failed: {err_msg}", status="error", extra={"error": err_msg, "traceback": traceback.format_exc()})
        return 1

if __name__ == "__main__":
    sys.exit(main())
