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
  const s = Math.min((w * 0.9) / 32, (h * (wide ? 0.6 : 0.54)) / 29);
  return { s, cx: w / 2, cy: h * (wide ? 0.6 : h < 700 ? 0.54 : 0.5) };
}
const toXY = (t, L) => {
  const p = pt(t);
  return [L.cx + p.x * L.s, L.cy - (p.y + 2.5) * L.s];
};

/* Sets the phrases in centred lines that follow the outline of the curve,
   each phrase once, never crossing the edge. Runs in small time slices so
   the main thread stays free while the curve is being drawn. */
async function buildItems(pts, L, w, h, phrases, isDead) {
  try { await document.fonts.ready; } catch (e) { /* fonts are optional */ }
  const mk = document.createElement('canvas').getContext('2d');
  const rose = hex(css('--rose'));
  const petal = hex(css('--petal'));
  const violet = hex(css('--violet'));
  const lav = hex(css('--lav'));
  const fs = Math.min(20, Math.max(11, L.s * 1.18));
  const font = `italic 300 ${fs}px ${FONT}`;
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
  const pitch = fs * 1.9;
  const th = Math.ceil(fs * 1.6);
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
  for (let y = top + pitch * 0.9; y < bottom - pitch * 0.5; y += pitch, row++) {
    if (isDead()) return items;
    if (performance.now() - t0 > 5) {
      await nextFrame();
      t0 = performance.now();
    }
    const a = crossings(y - fs * 0.6);
    const b = crossings(y + fs * 0.6);
    const spans = [];
    a.forEach(([l1, r1]) => b.forEach(([l2, r2]) => {
      const l = Math.max(l1, l2) + fs * 0.7;
      const r = Math.min(r1, r2) - fs * 0.7;
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
        const t = Math.min(1, Math.max(0, (x + p.tw / 2 - L.cx) / (16 * L.s) * 0.5 + 0.5));
        const color = `rgb(${lerp(pair[0], pair[1], t).join(',')})`;
        items.push({ sp: mkSprite(p.text, p.tw, color), tw: p.tw + 6, th, rot: 0, x: x + p.tw / 2, y, at: row * 230 + k * 110 });
        x += p.tw + gap;
      });
    });
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
    lc.lineWidth = 0.9;
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
      lc.shadowBlur = 6;
    }
    lc.beginPath();
    lc.arc(pts[i][0], pts[i][1], 1.7, 0, TAU);
    lc.fill();
    lc.shadowBlur = 0;
  };

  const startMosaic = async () => {
    const items = await itemsP;
    if (st.dead) return;
    const span = Math.max(1, ...items.map((it) => it.at));
    if (staticMode) items.forEach((it) => { it.at = -1000; });
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
