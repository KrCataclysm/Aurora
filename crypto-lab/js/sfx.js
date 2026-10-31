import { CFG } from './config.js';

let ac = null;
let master = null;
let analyser = null;
let muted = false;
let unlocked = false;
let freq = null;

function ensure() {
  if (ac) return ac;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ac = new AC();
  master = ac.createGain();
  master.gain.value = CFG.gain;
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 24;
  comp.ratio.value = 3;
  comp.attack.value = 0.005;
  comp.release.value = 0.15;
  analyser = ac.createAnalyser();
  analyser.fftSize = 64;
  analyser.smoothingTimeConstant = 0.7;
  freq = new Uint8Array(analyser.frequencyBinCount);
  master.connect(comp);
  comp.connect(analyser);
  analyser.connect(ac.destination);
  return ac;
}

export function unlock() {
  if (!ensure()) return;
  unlocked = true;
  ac.resume();
}

document.addEventListener('visibilitychange', () => {
  if (!ac || !unlocked) return;
  if (document.hidden) ac.suspend();
  else ac.resume();
});

export function setMuted(m) {
  muted = m;
  if (!ac) return;
  master.gain.cancelScheduledValues(ac.currentTime);
  master.gain.setTargetAtTime(m ? 0 : CFG.gain, ac.currentTime, 0.03);
}
export const isMuted = () => muted;

export function levels() {
  if (!analyser) return null;
  analyser.getByteFrequencyData(freq);
  return freq;
}

const live = () => ac && unlocked && !muted && ac.state === 'running';

function voice(type, f, t, dur, peak) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
  return o;
}

function noise(t, dur, type, f, q, peak) {
  const len = Math.max(1, Math.floor(ac.sampleRate * dur));
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const flt = ac.createBiquadFilter();
  flt.type = type;
  flt.frequency.value = f;
  flt.Q.value = q;
  const g = ac.createGain();
  g.gain.setValueAtTime(peak, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(flt);
  flt.connect(g);
  g.connect(master);
  src.start(t);
}

function ks(f, dur, vol, t) {
  const sr = ac.sampleRate;
  const n = Math.max(2, Math.round(sr / f));
  const len = Math.floor(sr * Math.min(dur, 1.4));
  const buf = ac.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  const line = new Float32Array(n);
  for (let i = 0; i < n; i++) line[i] = Math.random() * 2 - 1;
  let idx = 0;
  for (let i = 0; i < len; i++) {
    const j = (idx + 1) % n;
    d[i] = line[idx];
    line[idx] = (line[idx] + line[j]) * 0.498;
    idx = j;
  }
  const fade = Math.floor(sr * 0.12);
  for (let i = 0; i < fade; i++) d[len - 1 - i] *= i / fade;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3500;
  const g = ac.createGain();
  g.gain.value = vol;
  src.connect(lp);
  lp.connect(g);
  g.connect(master);
  src.start(t);
}

const PENTA = [0, 2, 4, 7, 9];
const semis = (step) => PENTA[step % 5] + 12 * Math.floor(step / 5);

export function bell(i, n) {
  if (!live()) return;
  const t = ac.currentTime;
  const f = 330 * Math.pow(2, semis(Math.floor((i * 15) / n)) / 12);
  voice('sine', f, t, 0.9, 0.45);
  voice('sine', f * 2.76, t, 0.35, 0.1);
}

export function lubdub() {
  if (!live()) return;
  const t = ac.currentTime;
  [[0, 0.9], [0.2, 0.6]].forEach(([dt, p]) => {
    const o = voice('sine', 78, t + dt, 0.3, p);
    o.frequency.exponentialRampToValueAtTime(38, t + dt + 0.2);
  });
}

export function petal() {
  if (!live()) return;
  noise(ac.currentTime, 0.18, 'bandpass', 3200, 0.8, 0.05);
}

export function pluck(step = 0) {
  if (!live()) return;
  ks(220 * Math.pow(2, semis(step) / 12), 0.9, 0.5, ac.currentTime);
}

export function click() {
  if (!live()) return;
  const t = ac.currentTime;
  noise(t, 0.04, 'bandpass', 2400, 1, 0.35);
  voice('triangle', 1300, t, 0.03, 0.12);
}

export function chord() {
  if (!live()) return;
  const t = ac.currentTime;
  [82.41, 110, 146.83, 196, 246.94, 329.63].forEach((f, i) => ks(f, 1.4, 0.22, t + i * 0.035));
}

export function arp() {
  if (!live()) return;
  const t = ac.currentTime;
  for (let i = 0; i < 6; i++) {
    const f = 523.25 * Math.pow(2, semis(i) / 12);
    voice('sine', f, t + i * 0.09, 0.6, 0.3);
    voice('sine', f * 2.76, t + i * 0.09, 0.2, 0.06);
  }
}

export function shimmer() {
  if (!live()) return;
  const t = ac.currentTime;
  [1568, 1976, 2349, 3136].forEach((f, i) => voice('sine', f, t + i * 0.08, 0.7, 0.1));
}

export function snap() {
  if (!live()) return;
  const t = ac.currentTime;
  noise(t, 0.03, 'bandpass', 1800, 2, 0.28);
  voice('triangle', 520, t, 0.07, 0.16);
}
