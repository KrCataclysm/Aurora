import { CFG } from './config.js';

const TAU = Math.PI * 2;
const RTL = /[֐-׿؀-ۿݐ-ݿיִ-﷿ﹰ-﻿]/;
const FONT = '"Cormorant Garamond", "Iowan Old Style", Georgia, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", serif';

export const pt = (t) => ({
  x: 16 * Math.sin(t) ** 3,
  y: 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t),
});

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lerp = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const nextFrame = () => new Promise((r) => requestAnimationFrame(r));
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

function fit(canvas) {
  const w = canvas.parentElement.clientWidth;
  const h = canvas.parentElement.clientHeight;
  canvas.width = Math.round(w * CFG.dpr);
  canvas.height = Math.round(h * CFG.dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(CFG.dpr, 0, 0, CFG.dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

export function layout(w, h) {
  const wide = w / h > 1.5;
  const s = Math.min((w * 0.9) / 32, (h * (wide ? 0.6 : 0.54)) / 29);
  return { s, cx: w / 2, cy: h * (wide ? 0.6 : h < 700 ? 0.54 : 0.5) };
}
const toXY = (t, L) => {
  const p = pt(t);
  return [L.cx + p.x * L.s, L.cy - (p.y + 2.5) * L.s];
};

/* Sets the phrases in centred lines that follow the outline of the heart,
   each phrase once, never crossing the edge. Runs in small time slices so
   the main thread stays free while the heart is being drawn. */
async function buildItems(pts, L, w, h, phrases, isDead) {
  try { await document.fonts.ready; } catch (e) { /* fonts are optional */ }
  const mk = document.createElement('canvas').getContext('2d');
  const rose = hex(css('--rose'));
  const petal = hex(css('--petal'));
  const violet = hex(css('--violet'));
  const lav = hex(css('--lav'));
  const fs = Math.min(23, Math.max(13, L.s * 1.42));
  const font = `italic 500 ${fs}px ${FONT}`;
  mk.font = font;
  const remaining = shuffle(phrases.slice()).map((text) => ({ text, tw: Math.ceil(mk.measureText(text).width) }));
  if (!remaining.length) return [];
  const minW = Math.min(...remaining.map((p) => p.tw));
  const crossings = (y) => {
    const xs = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[i + 1];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
    }
    xs.sort((a, b) => a - b);
    const out = [];
    for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i], xs[i + 1]]);
    return out;
  };
  const top = Math.min(...pts.map((p) => p[1]));
  const bottom = Math.max(...pts.map((p) => p[1]));
  const pitch = fs * 1.62;
  const th = Math.ceil(fs * 1.5);
  const items = [];
  const mkSprite = (text, tw, color) => {
    const sp = document.createElement('canvas');
    sp.width = Math.ceil((tw + 6) * CFG.dpr);
    sp.height = Math.ceil(th * CFG.dpr);
    const sc = sp.getContext('2d');
    sc.scale(CFG.dpr, CFG.dpr);
    sc.font = font;
    sc.textAlign = 'center';
    sc.textBaseline = 'middle';
    if (RTL.test(text)) sc.direction = 'rtl';
    sc.fillStyle = color;
    sc.fillText(text, (tw + 6) / 2, th / 2);
    return sp;
  };
  let t0 = performance.now();
  let row = 0;
  for (let y = top + pitch * 1.0; y < bottom - pitch * 0.55; y += pitch, row++) {
    if (isDead()) return items;
    if (performance.now() - t0 > 5) {
      await nextFrame();
      t0 = performance.now();
    }
    const a = crossings(y - fs * 0.62);
    const b = crossings(y + fs * 0.62);
    const spans = [];
    a.forEach(([l1, r1]) => b.forEach(([l2, r2]) => {
      const l = Math.max(l1, l2) + fs * 0.9;
      const r = Math.min(r1, r2) - fs * 0.9;
      if (r - l >= minW) spans.push([l, r]);
    }));
    const pair = row % 2 ? [violet, lav] : [rose, petal];
    spans.forEach(([l, r]) => {
      const W = r - l;
      const picks = [];
      let used = 0;
      for (let n = 0; n < 3; n++) {
        const gap = picks.length ? fs * 1.1 : 0;
        const k = remaining.findIndex((p) => used + gap + p.tw <= W);
        if (k < 0) break;
        const p = remaining.splice(k, 1)[0];
        picks.push(p);
        used += gap + p.tw;
      }
      if (!picks.length) return;
      const sum = picks.reduce((s, p) => s + p.tw, 0);
      const gap = picks.length > 1 ? Math.min((W - sum) / (picks.length - 1), fs * 2.4) : 0;
      let x = l + (W - (sum + gap * (picks.length - 1))) / 2;
      picks.forEach((p, k) => {
        const t = clamp((x + p.tw / 2 - L.cx) / (16 * L.s) * 0.5 + 0.5);
        const color = `rgb(${lerp(pair[0], pair[1], t).join(',')})`;
        items.push({ sp: mkSprite(p.text, p.tw, color), tw: p.tw + 6, th, rot: 0, x: x + p.tw / 2, y, at: row * 230 + k * 110 });
        x += p.tw + gap;
      });
    });
  }
  return items;
}

/* The heart is stippled in fine particles that draw themselves along the
   outline, settle into a soft shimmer, and move away from a touch. */
export function play(o) {
  const { line, mosaic, stage, phrases, sfx, onClose, onDone } = o;
  const staticMode = !!o.staticMode;
  const st = { dead: false, visible: true, closed: false };
  const { ctx: lc, w, h } = fit(line);
  const { ctx: mc } = fit(mosaic);
  const L = layout(w, h);
  const N = CFG.lowEnd ? 60 : 80;
  const DUR = 5600;
  const ps = clamp(L.s / 9, 0.9, 1.5);
  const rose = hex(css('--rose'));
  const petal = hex(css('--petal'));
  const violet = hex(css('--violet'));
  const lav = hex(css('--lav'));
  const stops = [rose, petal, lav, violet];
  const colorAt = (s) => {
    const f = clamp(s) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(f));
    return lerp(stops[i], stops[i + 1], f - i);
  };
  const palette = Array.from({ length: 32 }, (_, i) => `rgb(${colorAt(i / 31).join(',')})`);
  const poly = Array.from({ length: 181 }, (_, i) => toXY((TAU * i) / 180, L));
  const itemsP = buildItems(poly, L, w, h, phrases, () => st.dead);

  const parts = [];
  const M = CFG.lowEnd ? 1400 : 2800;
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
  for (let i = 0; i < M; i++) {
    const t = Math.random() * TAU;
    const [bx, by] = toXY(t, L);
    const [bx2, by2] = toXY(t + 0.01, L);
    const tl = Math.hypot(bx2 - bx, by2 - by) || 1;
    const nx = -(by2 - by) / tl;
    const ny = (bx2 - bx) / tl;
    const dust = Math.random() < 0.24;
    const off = gauss() * (dust ? 7 : 1.5) * ps;
    const s = Math.min(t, TAU - t) / Math.PI;
    parts.push({
      x: bx + nx * off, y: by + ny * off, ox: 0, oy: 0, vx: 0, vy: 0,
      t0: (t / TAU) * DUR * 0.94 + rnd(0, 220), sz: rnd(0.8, 1.7) * ps * (dust ? 0.8 : 1),
      a: dust ? rnd(0.25, 0.55) : rnd(0.7, 1), ph: rnd(0, TAU), ci: Math.round(s * 31),
    });
  }
  /* a veil of light dust inside the heart */
  const inside = new Path2D();
  poly.forEach((p, i) => (i ? inside.lineTo(p[0], p[1]) : inside.moveTo(p[0], p[1])));
  const hit = document.createElement('canvas').getContext('2d');
  for (let i = 0, n = 0; n < (CFG.lowEnd ? 70 : 150) && i < 4000; i++) {
    const x = L.cx + (Math.random() - 0.5) * 32 * L.s;
    const y = L.cy + (Math.random() - 0.5) * 30 * L.s;
    if (!hit.isPointInPath(inside, x, y)) continue;
    n++;
    parts.push({
      x, y, ox: 0, oy: 0, vx: 0, vy: 0, t0: DUR * 0.7 + rnd(0, 1800), sz: rnd(0.6, 1.3) * ps,
      a: rnd(0.18, 0.4), ph: rnd(0, TAU), ci: Math.round(rnd(0, 31)),
    });
  }
  parts.sort((p, q) => p.ci - q.ci);

  const nodes = Array.from({ length: N }, (_, i) => {
    const [x, y] = toXY((TAU * i) / N, L);
    return { x, y, at: (i / N) * DUR * 0.94, s: Math.min(i, N - i) / (N / 2) };
  });
  const glow = document.createElement('canvas');
  glow.width = glow.height = 28;
  const gx = glow.getContext('2d');
  const gg = gx.createRadialGradient(14, 14, 0, 14, 14, 14);
  gg.addColorStop(0, 'rgba(255,255,255,.95)');
  gg.addColorStop(0.25, 'rgba(255,194,216,.55)');
  gg.addColorStop(1, 'rgba(255,123,172,0)');
  gx.fillStyle = gg;
  gx.fillRect(0, 0, 28, 28);

  const ptr = { x: 0, y: 0, on: false };
  const host = line.closest('section');
  const local = (e) => {
    const r = line.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const onMove = (e) => { [ptr.x, ptr.y] = local(e); ptr.on = true; };
  const onLeave = () => { ptr.on = false; };
  if (!staticMode && !CFG.reduced && host) {
    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerdown', onMove);
    host.addEventListener('pointerleave', onLeave);
    host.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') ptr.on = false; });
  }

  let e = 0;
  let bellAt = 0;
  let lastBeat = 0;
  const draw = (dt) => {
    const k = dt / 16.7;
    lc.clearRect(0, 0, w, h);
    const RAD = 70;
    let last = -1;
    for (const p of parts) {
      const v = clamp((e - p.t0) / 260);
      if (v <= 0) continue;
      if (ptr.on || Math.abs(p.ox) + Math.abs(p.oy) + Math.abs(p.vx) + Math.abs(p.vy) > 0.01) {
        if (ptr.on) {
          const dx = p.x + p.ox - ptr.x;
          const dy = p.y + p.oy - ptr.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < RAD * RAD) {
            const d = Math.sqrt(d2) || 1;
            const f = (1 - d / RAD) * 1.9 * k;
            p.vx += (dx / d) * f;
            p.vy += (dy / d) * f;
          }
        }
        p.vx = (p.vx - p.ox * 0.05 * k) * 0.9;
        p.vy = (p.vy - p.oy * 0.05 * k) * 0.9;
        p.ox += p.vx * k;
        p.oy += p.vy * k;
      }
      const sh = e > DUR ? 0.78 + 0.22 * Math.sin(e * 0.0026 + p.ph) : 1;
      lc.globalAlpha = p.a * v * sh;
      if (p.ci !== last) {
        lc.fillStyle = palette[p.ci];
        last = p.ci;
      }
      lc.fillRect(p.x + p.ox - p.sz / 2, p.y + p.oy - p.sz / 2, p.sz, p.sz);
    }
    for (const n of nodes) {
      const v = clamp((e - n.at) / 400);
      if (v <= 0) continue;
      const lead = clamp(1 - (e - n.at) / 900);
      const tw = e > DUR ? 0.5 + 0.5 * Math.sin(e * 0.003 + n.at) : 1;
      lc.globalAlpha = v * (0.22 + 0.2 * tw + 0.6 * lead);
      const r = (3.2 + 4.6 * lead) * ps;
      lc.drawImage(glow, n.x - r, n.y - r, r * 2, r * 2);
    }
    lc.globalAlpha = 1;
  };

  const beat = () => {
    stage.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.016)' }, { transform: 'scale(1)' }],
      { duration: 1100, easing: 'ease-in-out' },
    );
  };

  const startMosaic = async () => {
    const items = await itemsP;
    if (st.dead) return;
    const span = Math.max(1, ...items.map((it) => it.at));
    if (staticMode) items.forEach((it) => { it.at = -1000; });
    const drawWords = (t) => {
      mc.clearRect(0, 0, w, h);
      for (const it of items) {
        const a = clamp((t - it.at) / 700);
        if (a <= 0) continue;
        mc.globalAlpha = a;
        mc.drawImage(it.sp, it.x - it.tw / 2, it.y - it.th / 2 + (1 - a) * 4, it.tw, it.th);
      }
      mc.globalAlpha = 1;
    };
    if (staticMode) {
      drawWords(0);
      if (onDone) onDone();
      return;
    }
    let t = 0;
    let prev = performance.now();
    const frame = (now) => {
      if (st.dead) return;
      t += Math.min(now - prev, 50);
      prev = now;
      drawWords(t);
      if (t < span + 760) requestAnimationFrame(frame);
      else {
        lastBeat = e;
        if (onDone) onDone();
      }
    };
    requestAnimationFrame(frame);
  };

  if (staticMode) {
    e = DUR * 3;
    draw(16);
    startMosaic();
    return { cancel() { st.dead = true; } };
  }

  let running = false;
  let prev = 0;
  const frame = (now) => {
    if (st.dead || !st.visible) {
      running = false;
      return;
    }
    const dt = Math.min(now - prev, 50);
    prev = now;
    e += dt;
    while (bellAt < N && e >= nodes[bellAt].at) {
      sfx.bell(bellAt, N);
      bellAt++;
    }
    if (!st.closed && e >= DUR) {
      st.closed = true;
      beat();
      sfx.lubdub();
      if (navigator.vibrate) navigator.vibrate(30);
      if (onClose) onClose();
      setTimeout(startMosaic, 900);
    }
    if (st.closed && lastBeat && e - lastBeat > 4800) {
      lastBeat = e;
      beat();
    }
    draw(dt);
    requestAnimationFrame(frame);
  };
  const run = () => {
    if (running || st.dead) return;
    running = true;
    prev = performance.now();
    requestAnimationFrame(frame);
  };
  const io = host ? new IntersectionObserver((entries) => {
    st.visible = entries[0].isIntersecting;
    if (st.visible) run();
  }, { threshold: 0.05 }) : null;
  if (io) io.observe(host);
  run();
  return {
    cancel() {
      st.dead = true;
      if (io) io.disconnect();
      if (host) {
        host.removeEventListener('pointermove', onMove);
        host.removeEventListener('pointerdown', onMove);
        host.removeEventListener('pointerleave', onLeave);
      }
    },
  };
}
