const fs = require('fs');
const path = require('path');

const audioDir = path.resolve(__dirname, 'assets/audio');
const files = [
  { id: 'whoosh', name: 'Cinematic Whoosh', file: 'cinematic-whoosh.wav', cat: 'SFX', tags: ['Cinematic', 'Transition', 'Fast'], duration: 1.4 },
  { id: 'impact', name: 'Deep Impact', file: 'deep-impact.wav', cat: 'SFX', tags: ['Boom', 'Sub', 'Trailer'], duration: 2.2 },
  { id: 'transition', name: 'Soft Transition', file: 'soft-transition.wav', cat: 'SFX', tags: ['Smooth', 'Chime', 'Cut'], duration: 1.1 },
  { id: 'riser', name: 'Tension Riser', file: 'riser.wav', cat: 'SFX', tags: ['Tension', 'Build-up', 'Climax'], duration: 3.0 },
  { id: 'click', name: 'Modern UI Click', file: 'ui-click.wav', cat: 'SFX', tags: ['Interface', 'Snap', 'Clean'], duration: 0.15 },
  { id: 'atmosphere', name: 'Ambient Atmosphere', file: 'ambient-atmosphere.wav', cat: 'Ambience', tags: ['Drone', 'Dark', 'Lush'], duration: 5.0 }
];

const catalog = files.map(item => {
  const buf = fs.readFileSync(path.join(audioDir, item.file));
  const b64 = buf.toString('base64');
  return {
    ...item,
    url: 'assets/audio/' + item.file,
    dataUri: 'data:audio/wav;base64,' + b64,
    sizeKb: (buf.length / 1024).toFixed(1)
  };
});

const content = `// Bundled High-Fidelity Audio Sample Library Manifest
window.SFX_AUDIO_CATALOG = ${JSON.stringify(catalog, null, 2)};
`;

fs.writeFileSync(path.join(audioDir, 'audio-manifest.js'), content, 'utf8');
console.log('Successfully wrote audio-manifest.js with bundled audio assets!');
