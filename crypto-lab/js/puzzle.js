import { CFG } from './config.js';
import { pt } from './curve.js';

const TAU = Math.PI * 2;
const G = 3;
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lerp = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const ease = (t) => 1 - Math.pow(1 - t, 3);
const EMOJI = /[\u{1F300}-\u{1FAFF}☀-➿️]/gu;

/* A 3x3 jigsaw. Tap one piece, then another, to swap them. The picture is
   drawn from the same stippled heart as the opening scene. */
export function createPuzzle(canvas, title, cb = {}) {
  const ctx = canvas.getContext('2d');
  const css = getComputedStyle(document.documentElement);
  const rose = hex(css.getPropertyValue('--rose').trim());
  const petal = hex(css.getPropertyValue('--petal').trim());
  const lav = hex(css.getPropertyValue('--lav').trim());
  const violet = hex(css.getPropertyValue('--violet').trim());
  const stops = [rose, petal, lav, violet];
  const colorAt = (s) => {
    const f = clamp(s) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(f));
    return lerp(stops[i], stops[i + 1], f - i);
  };

  const H = Array.from({ length: G - 1 }, () => Array.from({ length: G }, () => (Math.random() < 0.5 ? 1 : -1)));
  const V = Array.from({ length: G }, () => Array.from({ length: G - 1 }, () => (Math.random() < 0.5 ? 1 : -1)));
  const slots = Array.from({ length: G * G }, (_, i) => i);
  let guard = 0;
  do {
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }
  } while (slots.filter((p, i) => p !== i).length < 7 && ++guard < 50);

  let S = 300;
  let c = 100;
  let pad = 30;
  let pic = null;
  let paths = [];
  const pos = new Map();
  let selected = -1;
  let cursor = 0;
  let focused = false;
  let solved = false;
  let solvedAt = 0;
  let raf = 0;
  let anim = 0;

  const knob = (p, x0, y0, x1, y1, nx, ny, dir) => {
    if (!dir) {
      p.lineTo(x1, y1);
      return;
    }
    const ex = x1 - x0;
    const ey = y1 - y0;
    const P = (u, v) => [x0 + ex * u + nx * dir * c * v, y0 + ey * u + ny * dir * c * v];
    p.lineTo(...P(0.4, 0));
    p.bezierCurveTo(...P(0.4, 0.08), ...P(0.34, 0.1), ...P(0.34, 0.17));
    p.bezierCurveTo(...P(0.34, 0.27), ...P(0.66, 0.27), ...P(0.66, 0.17));
    p.bezierCurveTo(...P(0.66, 0.1), ...P(0.6, 0.08), ...P(0.6, 0));
    p.lineTo(x1, y1);
  };

  const pathFor = (id) => {
    const r = Math.floor(id / G);
    const k = id % G;
    const top = r === 0 ? 0 : -H[r - 1][k];
    const bottom = r === G - 1 ? 0 : H[r][k];
    const right = k === G - 1 ? 0 : V[r][k];
    const left = k === 0 ? 0 : -V[r][k - 1];
    const p = new Path2D();
    p.moveTo(0, 0);
    knob(p, 0, 0, c, 0, 0, -1, top);
    knob(p, c, 0, c, c, 1, 0, right);
    knob(p, c, c, 0, c, 0, 1, bottom);
    knob(p, 0, c, 0, 0, -1, 0, left);
    p.closePath();
    return p;
  };

  const makePicture = () => {
    const D = CFG.dpr;
    const cv = document.createElement('canvas');
    cv.width = Math.round(S * D);
    cv.height = Math.round(S * D);
    const x = cv.getContext('2d');
    x.scale(D, D);
    const bg = x.createLinearGradient(0, 0, S, S);
    bg.addColorStop(0, '#0b0612');
    bg.addColorStop(1, '#190c27');
    x.fillStyle = bg;
    x.fillRect(0, 0, S, S);
    const s = (S * 0.8) / 32;
    const cx = S / 2;
    const cy = S * 0.5;
    const to = (t) => {
      const p = pt(t);
      return [cx + p.x * s, cy - (p.y + 2.5) * s];
    };
    const n = CFG.lowEnd ? 1800 : 3200;
    for (let i = 0; i < n; i++) {
      const t = Math.random() * TAU;
      const [bx, by] = to(t);
      const [bx2, by2] = to(t + 0.01);
      const tl = Math.hypot(bx2 - bx, by2 - by) || 1;
      const nx = -(by2 - by) / tl;
      const ny = (bx2 - bx) / tl;
      const dust = Math.random() < 0.3;
      const g = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
      const off = g * (dust ? 9 : 1.6);
      const sc = colorAt(Math.min(t, TAU - t) / Math.PI);
      x.globalAlpha = dust ? rnd(0.2, 0.5) : rnd(0.65, 1);
      x.fillStyle = `rgb(${sc.join(',')})`;
      const z = rnd(0.8, 1.7) * (S / 300);
      x.fillRect(bx + nx * off - z / 2, by + ny * off - z / 2, z, z);
    }
    x.globalAlpha = 1;
    const clean = String(title).replace(EMOJI, '').trim();
    const lines = clean.includes(',') ? clean.split(',').map((t, i, a) => (i < a.length - 1 ? t.trim() + ',' : t.trim())) : [clean];
    const font = (px) => `${px}px "Mrs Saint Delafield", "La Belle Aurore", cursive`;
    let px = S * 0.2;
    x.font = font(px);
    const widest = Math.max(...lines.map((l) => x.measureText(l).width));
    px *= Math.min(1, (S * 0.62) / widest);
    x.font = font(px);
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillStyle = 'rgb(255,217,232)';
    lines.forEach((l, i) => x.fillText(l, cx, cy + (i - (lines.length - 1) / 2) * px * 0.95 - S * 0.02));
    return cv;
  };

  const slotXY = (i) => [pad + (i % G) * c, pad + Math.floor(i / G) * c];

  function build() {
    const box = canvas.parentElement;
    S = Math.round(clamp(Math.min((box.clientWidth - 40) / 1.2, 430, (box.clientHeight - 220) / 1.2), 200, 430) / G) * G;
    c = S / G;
    pad = Math.round(c * 0.3);
    const W = S + pad * 2;
    canvas.width = Math.round(W * CFG.dpr);
    canvas.height = Math.round(W * CFG.dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = W + 'px';
    ctx.setTransform(CFG.dpr, 0, 0, CFG.dpr, 0, 0);
    pic = makePicture();
    paths = Array.from({ length: G * G }, (_, id) => pathFor(id));
    slots.forEach((id, i) => {
      const [x, y] = slotXY(i);
      const q = pos.get(id);
      if (q) Object.assign(q, { x, y, fx: x, fy: y, tx: x, ty: y, t: 1 });
      else pos.set(id, { x, y, fx: x, fy: y, tx: x, ty: y, t: 1 });
    });
    draw(performance.now());
  }

  function drawPiece(id, lift) {
    const q = pos.get(id);
    const r = Math.floor(id / G);
    const k = id % G;
    ctx.save();
    ctx.translate(q.x, q.y);
    if (lift) {
      ctx.translate(c / 2, c / 2);
      ctx.scale(1.045, 1.045);
      ctx.translate(-c / 2, -c / 2);
    }
    ctx.clip(paths[id]);
    ctx.drawImage(pic, -k * c, -r * c, S, S);
    ctx.restore();
    if (solved) return;
    ctx.save();
    ctx.translate(q.x, q.y);
    if (lift) {
      ctx.translate(c / 2, c / 2);
      ctx.scale(1.045, 1.045);
      ctx.translate(-c / 2, -c / 2);
    }
    ctx.lineWidth = lift ? 1.8 : 1;
    ctx.strokeStyle = lift ? 'rgba(255,123,172,.95)' : 'rgba(255,194,216,.32)';
    if (lift) {
      ctx.shadowColor = 'rgba(255,123,172,.7)';
      ctx.shadowBlur = 14;
    }
    ctx.stroke(paths[id]);
    ctx.restore();
  }

  function draw(now) {
    const W = S + pad * 2;
    ctx.clearRect(0, 0, W, W);
    let moving = false;
    pos.forEach((q) => {
      if (q.t < 1) {
        q.t = Math.min(1, q.t + 0.06);
        const e = CFG.reduced ? 1 : ease(q.t);
        q.x = q.fx + (q.tx - q.fx) * e;
        q.y = q.fy + (q.ty - q.fy) * e;
        moving = true;
      }
    });
    const order = slots.slice().sort((a, b) => (pos.get(a).t < 1 ? 1 : 0) - (pos.get(b).t < 1 ? 1 : 0));
    order.forEach((id) => { if (slots.indexOf(id) !== selected) drawPiece(id, false); });
    if (selected >= 0) drawPiece(slots[selected], true);
    if (focused && !solved) {
      const [x, y] = slotXY(cursor);
      ctx.strokeStyle = 'rgba(255,194,216,.9)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 5]);
      ctx.strokeRect(x + 3, y + 3, c - 6, c - 6);
      ctx.setLineDash([]);
    }
    if (solved) {
      const f = clamp((now - solvedAt) / 1600);
      const gl = ctx.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W * 0.62);
      gl.addColorStop(0, `rgba(255,123,172,${0.16 * (1 - f)})`);
      gl.addColorStop(1, 'rgba(255,123,172,0)');
      ctx.fillStyle = gl;
      ctx.fillRect(0, 0, W, W);
      if (f < 1) moving = true;
    }
    if (moving || selected >= 0) raf = requestAnimationFrame(draw);
    else raf = 0;
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(draw); };

  function checkSolved() {
    if (solved || !slots.every((id, i) => id === i)) return;
    solved = true;
    solvedAt = performance.now();
    selected = -1;
    if (cb.onSolved) cb.onSolved();
    kick();
  }

  function choose(i) {
    if (solved || i < 0 || i >= G * G) return;
    if (selected < 0) {
      selected = i;
      if (cb.onSelect) cb.onSelect();
    } else if (selected === i) {
      selected = -1;
    } else {
      const a = slots[selected];
      const b = slots[i];
      slots[selected] = b;
      slots[i] = a;
      [[a, i], [b, selected]].forEach(([id, slot]) => {
        const q = pos.get(id);
        const [tx, ty] = slotXY(slot);
        Object.assign(q, { fx: q.x, fy: q.y, tx, ty, t: CFG.reduced ? 1 : 0 });
      });
      selected = -1;
      if (cb.onSwap) cb.onSwap();
      checkSolved();
    }
    kick();
  }

  canvas.addEventListener('pointerdown', (e) => {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left - pad;
    const y = e.clientY - r.top - pad;
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    cursor = Math.floor(y / c) * G + Math.floor(x / c);
    choose(cursor);
  });
  canvas.addEventListener('keydown', (e) => {
    const m = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -G, ArrowDown: G }[e.key];
    if (m) {
      e.preventDefault();
      const col = (cursor % G) + (Math.abs(m) === 1 ? m : 0);
      const next = cursor + m;
      if (col >= 0 && col < G && next >= 0 && next < G * G) cursor = next;
      kick();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      choose(cursor);
    }
  });
  canvas.addEventListener('focus', () => { focused = true; kick(); });
  canvas.addEventListener('blur', () => { focused = false; kick(); });

  return {
    rebuild: build,
    isSolved: () => solved,
    solveNow() {
      slots.forEach((_, i) => { slots[i] = i; });
      slots.forEach((id, i) => {
        const q = pos.get(id);
        const [x, y] = slotXY(i);
        Object.assign(q, { x, y, fx: x, fy: y, tx: x, ty: y, t: 1 });
      });
      checkSolved();
    },
    stop() {
      cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}
