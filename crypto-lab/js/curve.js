import { CFG } from './config.js';

const TAU = Math.PI * 2;
const RTL = /[֐-׿؀-ۿݐ-ݿיִ-﷿ﹰ-﻿]/;
const FONT = 'Fraunces, "Noto Sans", system-ui, "Segoe UI", "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

export const pt = (t) => ({
  x: 16 * Math.sin(t) ** 3,
  y: 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t),
});

export function miniPath(n = 90, s = 1) {
  let d = '';
  for (let i = 0; i < n; i++) {
    const p = pt((TAU * i) / n);
    d += (i ? 'L' : 'M') + (p.x * s).toFixed(2) + ' ' + (-(p.y + 2.5) * s).toFixed(2);
  }
  return d + 'Z';
}

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lerp = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const nextFrame = () => new Promise((r) => requestAnimationFrame(r));
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

function layout(w, h) {
  const wide = w / h > 1.5;
  const s = Math.min((w * 0.84) / 32, (h * (wide ? 0.6 : 0.5)) / 29);
  return { s, cx: w / 2, cy: h * (wide ? 0.6 : 0.56) };
}
const toXY = (t, L) => {
  const p = pt(t);
  return [L.cx + p.x * L.s, L.cy - (p.y + 2.5) * L.s];
};

/* Lays the phrases out inside the curve. Runs in small time slices so the
   main thread stays free while the curve is being drawn. */
async function buildItems(pts, L, w, h, phrases, isDead) {
  try { await document.fonts.ready; } catch (e) { /* fonts are optional */ }
  const path = new Path2D();
  pts.forEach((p, i) => (i ? path.lineTo(p[0], p[1]) : path.moveTo(p[0], p[1])));
  path.closePath();
  const hit = document.createElement('canvas').getContext('2d');
  const mk = document.createElement('canvas').getContext('2d');
  const rose = hex(css('--rose'));
  const petal = hex(css('--petal'));
  const cell = Math.max(8, L.s * 0.9);
  const cols = Math.ceil(w / cell);
  const taken = new Set();
  const cap = CFG.lowEnd ? 120 : CFG.maxWords;
  const order = shuffle(phrases.slice());
  const items = [];
  let t0 = performance.now();
  for (let k = 0, tries = 0; items.length < cap && tries < cap * 3 && order.length; k++, tries++) {
    if (isDead()) return items;
    if (performance.now() - t0 > 5) {
      await nextFrame();
      t0 = performance.now();
    }
    const text = order[k % order.length];
    const size = L.s * (1.1 + Math.random() * 1.5);
    const rot = (Math.random() - 0.5) * 0.5;
    mk.font = `${size}px ${FONT}`;
    const tw = Math.ceil(mk.measureText(text).width) + 8;
    const th = Math.ceil(size * 1.5);
    const hw = (tw * Math.abs(Math.cos(rot)) + th * Math.abs(Math.sin(rot))) / 2;
    const hh = (th * Math.abs(Math.cos(rot)) + tw * Math.abs(Math.sin(rot))) / 2;
    let placed = null;
    for (let a = 0; a < 40 && !placed; a++) {
      const x = L.cx + (Math.random() - 0.5) * 32 * L.s;
      const y = L.cy + (Math.random() - 0.5) * 30 * L.s;
      const inside = [[0, 0], [-hw * 0.6, 0], [hw * 0.6, 0], [0, -hh * 0.5], [0, hh * 0.5]]
        .every(([dx, dy]) => hit.isPointInPath(path, x + dx, y + dy));
      if (!inside) continue;
      const cells = [];
      for (let gx = Math.floor((x - hw) / cell); gx <= Math.floor((x + hw) / cell); gx++) {
        for (let gy = Math.floor((y - hh * 0.6) / cell); gy <= Math.floor((y + hh * 0.6) / cell); gy++) {
          cells.push(gy * cols + gx);
        }
      }
      if (cells.some((c) => taken.has(c))) continue;
      cells.forEach((c) => taken.add(c));
      placed = { x, y };
    }
    if (!placed) continue;
    const sp = document.createElement('canvas');
    sp.width = Math.ceil(tw * CFG.dpr);
    sp.height = Math.ceil(th * CFG.dpr);
    const sc = sp.getContext('2d');
    sc.scale(CFG.dpr, CFG.dpr);
    sc.font = mk.font;
    sc.textAlign = 'center';
    sc.textBaseline = 'middle';
    if (RTL.test(text)) sc.direction = 'rtl';
    const t = Math.min(1, Math.max(0, (placed.y - (L.cy - 15 * L.s)) / (30 * L.s) + (Math.random() - 0.5) * 0.4));
    sc.fillStyle = `rgb(${lerp(rose, petal, t).join(',')})`;
    sc.fillText(text, tw / 2, th / 2);
    items.push({ sp, tw, th, rot, ...placed, at: 0 });
  }
  return items;
}

export function play(o) {
  const { line, mosaic, stage, phrases, sfx, onClose, onDone } = o;
  const staticMode = !!o.staticMode;
  const st = { dead: false };
  const { ctx: lc, w, h } = fit(line);
  const { ctx: mc } = fit(mosaic);
  const L = layout(w, h);
  const N = CFG.lowEnd ? 60 : 80;
  const DUR = 6000;
  const petalC = css('--petal');
  const roseC = css('--rose');
  const pts = Array.from({ length: N + 1 }, (_, i) => toXY((TAU * i) / N, L));
  const itemsP = buildItems(pts, L, w, h, phrases, () => st.dead);

  const drawNode = (i) => {
    lc.strokeStyle = petalC;
    lc.globalAlpha = 0.8;
    lc.lineWidth = 1;
    if (i > 0) {
      lc.beginPath();
      lc.moveTo(pts[i - 1][0], pts[i - 1][1]);
      lc.lineTo(pts[i][0], pts[i][1]);
      lc.stroke();
    }
    lc.globalAlpha = 1;
    lc.fillStyle = petalC;
    if (!CFG.lowEnd) {
      lc.shadowColor = roseC;
      lc.shadowBlur = 8;
    }
    lc.beginPath();
    lc.arc(pts[i][0], pts[i][1], 2.2, 0, TAU);
    lc.fill();
    lc.shadowBlur = 0;
  };

  const startMosaic = async () => {
    const items = await itemsP;
    if (st.dead) return;
    const span = 4000;
    shuffle(items.map((_, i) => i)).forEach((idx, rank) => {
      items[idx].at = staticMode ? -1000 : (rank / items.length) * span;
    });
    const draw = (e) => {
      mc.clearRect(0, 0, w, h);
      for (const it of items) {
        const a = Math.min(1, Math.max(0, (e - it.at) / 500));
        if (a <= 0) continue;
        mc.save();
        mc.globalAlpha = a;
        mc.translate(it.x, it.y);
        mc.rotate(it.rot);
        mc.drawImage(it.sp, -it.tw / 2, -it.th / 2, it.tw, it.th);
        mc.restore();
      }
    };
    if (staticMode) {
      draw(0);
      if (onDone) onDone();
      return;
    }
    let e = 0;
    let last = performance.now();
    const frame = (now) => {
      if (st.dead) return;
      e += Math.min(now - last, 50);
      last = now;
      draw(e);
      if (e < span + 520) requestAnimationFrame(frame);
      else if (onDone) onDone();
    };
    requestAnimationFrame(frame);
  };

  if (staticMode) {
    for (let i = 0; i <= N; i++) drawNode(i);
    startMosaic();
    return { cancel() { st.dead = true; } };
  }

  let shown = 0;
  let elapsed = 0;
  let last = performance.now();
  const frame = (now) => {
    if (st.dead) return;
    elapsed += Math.min(now - last, 50);
    last = now;
    const target = Math.min(N + 1, Math.floor((elapsed / DUR) * N) + 1);
    while (shown < target) {
      drawNode(shown);
      if (shown < N) sfx.bell(shown, N);
      shown++;
    }
    if (shown >= N + 1) {
      stage.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.05)' }, { transform: 'scale(1)' }],
        { duration: 900, easing: 'ease-in-out' },
      );
      sfx.lubdub();
      if (navigator.vibrate) navigator.vibrate(30);
      if (onClose) onClose();
      setTimeout(startMosaic, 900);
      return;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return { cancel() { st.dead = true; } };
}
