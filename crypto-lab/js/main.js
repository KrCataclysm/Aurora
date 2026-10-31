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

function drawStars() {
  const c = document.getElementById('stars');
  const w = innerWidth;
  const h = innerHeight;
  c.width = Math.round(w * CFG.dpr);
  c.height = Math.round(h * 1.15 * CFG.dpr);
  const x = c.getContext('2d');
  x.setTransform(CFG.dpr, 0, 0, CFG.dpr, 0, 0);
  const n = CFG.lowEnd ? 60 : 110;
  for (let i = 0; i < n; i++) {
    x.globalAlpha = 0.15 + Math.random() * 0.5;
    x.fillStyle = Math.random() < 0.3 ? '#FFC2D8' : '#F7EEF5';
    x.beginPath();
    x.arc(Math.random() * w, Math.random() * h * 1.15, 0.4 + Math.random() * 1.1, 0, Math.PI * 2);
    x.fill();
  }
}

boot();
