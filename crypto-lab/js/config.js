export const CFG = {
  payload: 'payload.enc.json',
  devPayload: 'payload.dev.enc.json',
  dev: new URLSearchParams(location.search).has('dev'),
  reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
  lowEnd: (navigator.hardwareConcurrency || 4) <= 4,
  dpr: Math.min(window.devicePixelRatio || 1, 2),
  gain: 0.35,
  maxParticles: 120,
  maxWords: 220,
  errorText: 'Decryption key missing or invalid.',
};
