import { CFG } from './config.js';
import { mount } from './scenes.js';

const root = document.getElementById('root');
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function fail() {
  const p = document.createElement('p');
  p.className = 'err';
  p.textContent = CFG.errorText;
  root.replaceChildren(p);
}

async function decrypt(p, pass) {
  if (p.v !== 1 || p.kdf !== 'PBKDF2-SHA256' || !(p.iter > 0 && p.iter <= 1000000)) throw new Error('format');
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: b64(p.salt), iterations: p.iter },
    base, { name: 'AES-GCM', length: 256 }, false, ['decrypt'],
  );
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(p.iv) }, key, b64(p.ct));
  return JSON.parse(new TextDecoder().decode(plain));
}

const strs = (a) => Array.isArray(a) && a.every((x) => typeof x === 'string');

function valid(d) {
  return d && d.gate && typeof d.gate.a === 'string' && typeof d.gate.b === 'string'
    && typeof d.title === 'string' && strs(d.mosaic) && d.mosaic.length > 0
    && strs(d.blocks) && d.blocks.length > 0
    && Array.isArray(d.cards) && d.cards.length >= 3
    && d.cards.every((c) => c && typeof c.f === 'string' && typeof c.b === 'string')
    && typeof d.closing === 'string' && typeof d.sig === 'string';
}

async function boot() {
  const pass = location.hash.slice(1);
  if (!pass || !crypto.subtle) return fail();
  let data;
  try {
    const res = await fetch(CFG.dev ? CFG.devPayload : CFG.payload, { cache: 'no-store' });
    if (!res.ok) return fail();
    data = await decrypt(await res.json(), pass);
  } catch (e) {
    return fail();
  }
  if (!valid(data)) return fail();
  document.title = data.title;
  document.body.classList.add('ready', 'locked');
  drawStars();
  addEventListener('resize', drawStars);
  mount(data, root);
}

/* a few fine motes of light that drift upward and breathe */
let motes = [];
let starLoop = false;
function drawStars() {
  const c = document.getElementById('stars');
  const w = innerWidth;
  const h = innerHeight;
  c.width = Math.round(w * CFG.dpr);
  c.height = Math.round(h * CFG.dpr);
  const x = c.getContext('2d');
  x.setTransform(CFG.dpr, 0, 0, CFG.dpr, 0, 0);
  const n = CFG.lowEnd ? 24 : 42;
  const tint = ['#F7EEF5', '#FFC2D8', '#D6C6FA'];
  motes = Array.from({ length: n }, () => ({
    x: Math.random() * w, y: Math.random() * h, r: 0.4 + Math.random() * 0.9, a: 0.15 + Math.random() * 0.45,
    ph: Math.random() * 6.28, vy: -(0.02 + Math.random() * 0.07), vx: (Math.random() - 0.5) * 0.03, c: tint[Math.floor(Math.random() * 3)],
  }));
  const paint = (t, k) => {
    x.clearRect(0, 0, w, h);
    for (const s of motes) {
      s.x += s.vx * k;
      s.y += s.vy * k;
      if (s.y < -4) { s.y = h + 4; s.x = Math.random() * w; }
      x.globalAlpha = s.a * (0.6 + 0.4 * Math.sin(t * 0.0012 + s.ph));
      x.fillStyle = s.c;
      x.beginPath();
      x.arc(s.x, s.y, s.r, 0, 6.2832);
      x.fill();
    }
    x.globalAlpha = 1;
  };
  paint(0, 0);
  if (CFG.reduced || starLoop) return;
  starLoop = true;
  let last = performance.now();
  const frame = (now) => {
    paint(now, Math.min(now - last, 50) / 16.7);
    last = now;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

boot();
