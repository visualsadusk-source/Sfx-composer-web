# SFX Composer — Premium Product Website & Interactive Demo

A responsive, high-conversion product website for **SFX Composer**, the complete audio and sound-design toolkit for Adobe Premiere Pro and After Effects video editors.

Built with a deep black aesthetic (`#080A09`), glowing neon green accents (`#35EA86`), minimal typography, fixed vertical left navigation, scroll-based feature showcases, and a **browser-based interactive Web Audio API DSP workstation demo**.

---

## 🚀 Live Demo Highlights

The website features an interactive in-browser simulation of the desktop plugin:

1. **SFX Library Auditioning:**
   - 6 bundled high-fidelity sample sounds (`Cinematic Whoosh`, `Deep Impact`, `Soft Transition`, `Tension Riser`, `Modern UI Click`, `Ambient Atmosphere`).
   - Real-time HTML5 audio / Web Audio API playback with live progress bars and waveform previews.
   - Zero fake audio — real 44.1kHz / 16-bit WAV assets.
2. **Multi-Track Mini Timeline:**
   - 3 audio tracks (`A1 FX / IMPACTS`, `A2 TRANSITIONS`, `A3 AMBIENCE`).
   - Add/remove sounds from the library.
   - Drag audio clips horizontally along tracks to reposition and align them.
   - Synchronized visual playhead and 30fps timecode counter (`00:00:00:00`).
   - Individual clip volume and fade in/out inspector.
   - Real-time 14-segment LED master VU meter.
   - Play, Stop (RTZ), and Loop playback modes.
3. **Essential Sound Studio:**
   - 4 audio categories: **Music**, **SFX**, **Dialogue**, and **Ambience**.
   - Real-time Web Audio DSP filter chain:
     - `High-Pass Filter` (20 Hz – 600 Hz)
     - `Low-Pass Filter` (2 kHz – 20 kHz)
     - `Bass Shelf Filter` (160 Hz, -12 dB to +12 dB)
     - `Peaking EQ Filter` (2.5 kHz presence, -12 dB to +12 dB)
     - `Gain & Smoothstep Fade In/Out`
     - `Automatic Peak Normalization` (calculates buffer peak and snaps to -1.0 dBFS).
4. **Audio Tools Suite (Trim & WAV Export):**
   - High-resolution interactive waveform canvas.
   - Draggable Trim Start & Trim End handles.
   - Visual fade in & fade out envelope overlays.
   - **Client-Side WAV Exporter:** Renders trimmed and filtered audio via `OfflineAudioContext` and triggers instant browser download of a pristine 16-bit WAV file.
5. **Browser Search Hub Demo:**
   - Instant search across Sound Effects, Cinematic, Ambient, Foley, and Music categories.
   - Fast auditioning and "+ Add to Timeline" workflow.
6. **AI Sound Assistant:**
   - Contextual chat interface simulating sound design consultation.
   - Interactive prompt chips and quick audition action buttons.

---

## 🎨 Visual Identity

- **Background:** `#080A09` (Deep Charcoal Black)
- **Primary Accent:** `#35EA86` (Vivid Neon Green)
- **Secondary Accent:** `#0D2818` / `#143D24` (Subtle Dark Emerald)
- **Typography:** Modern clean sans-serif with monospace timecodes.
- **Navigation:** Fixed vertical sidebar on desktop; responsive slide-out drawer on tablet and mobile.

---

## 📁 Project Structure

```
sfx-composer-website/
├── index.html                   # Main responsive product landing page
├── css/
│   └── style.css                # Custom properties, neon glow, and responsive layouts
├── js/
│   ├── audio-engine.js          # Web Audio API engine, DSP filters, timeline & WAV encoder
│   ├── demo-app.js              # Plugin UI demo, tabs, mini timeline & AI assistant
│   └── main.js                  # Left nav scrollspy, hero waveform canvas, modals, FAQ
├── assets/
│   ├── audio/
│   │   ├── cinematic-whoosh.wav
│   │   ├── deep-impact.wav
│   │   ├── soft-transition.wav
│   │   ├── riser.wav
│   │   ├── ui-click.wav
│   │   ├── ambient-atmosphere.wav
│   │   └── audio-manifest.js    # Catalog data with base64 data URIs for zero CORS issues
│   └── brand/
│       ├── mark-128.png         # Official SFX Composer mark
│       └── icons/
├── generate-audio.js            # Node script for procedural synthesis of sample audio
└── bundle-manifest.js           # Node script for bundling audio into manifest
```

---

## 🏃 Running the Website

The website has **zero external build dependencies**. You can run it instantly using any static server or by double-clicking `index.html`:

### Option A: Local Dev Server (Recommended)
```bash
# Using Node.js npx serve
npx serve .

# Or using Python 3
python -m http.server 8080
```
Open `http://localhost:8080` in your web browser.

### Option B: Direct File Open
Double click `index.html` to open directly in Google Chrome, Microsoft Edge, Firefox, or Safari. The audio manifest includes base64 data URIs so Web Audio API works seamlessly even from `file:///`.

---

## 💳 Payment & Video Configuration

1. **₹199 Pricing & Checkout:**
   - The pricing card highlights the ₹199 introductory offer.
   - The "Buy" buttons trigger an interactive modal with order summary and license selection.
   - Connect your **Razorpay**, **Stripe**, or **LemonSqueezy** payment link in `checkout-form` when ready for production.
2. **Tutorial Video Embeds:**
   - 7 placeholder tutorial cards are marked "Coming Soon".
   - In `js/main.js`, update `tutorialData` with your official YouTube embed URLs when videos are published.

---

## 📧 Support
For extension questions, contact: `visualsadusk@gmail.com`.
