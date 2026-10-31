import { CFG } from './config.js';

const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const RTL = /[֐-׿؀-ۿݐ-ݿיִ-﷿ﹰ-﻿]/;
const FONT = 'Fraunces, "Noto Sans", system-ui, "Segoe UI", sans-serif';

export function createStack(canvas, phrases, cb = {}) {
  const ctx = canvas.getContext('2d');
  const css = getComputedStyle(document.documentElement);
  const rose = css.getPropertyValue('--rose').trim();
  const petal = css.getPropertyValue('--petal').trim();
  const text = css.getPropertyValue('--text').trim();
  const ROSE = hex(rose);
  const PETAL = hex(petal);
  const N = 5;
  let w = 0;
  let h = 0;
  let rows = [];
  let wicks = [];
  let smoke = [];
  let elapsed = 0;
  let running = false;
  let raf = 0;
  let last = 0;
  let relightAt = -1;
  let allOut = false;

  function build() {
    const box = canvas.parentElement;
    w = box.clientWidth;
    h = box.clientHeight;
    canvas.width = Math.round(w * CFG.dpr);
    canvas.height = Math.round(h * CFG.dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(CFG.dpr, 0, 0, CFG.dpr, 0, 0);

    const W = Math.min(w * 0.9, 560);
    const tiers = [{ n: 3, f: 0.52 }, { n: 3, f: 0.76 }, { n: 4, f: 1 }];
    const total = tiers.reduce((a, t) => a + t.n, 0);
    const gap = 10;
    let fs = clamp(W * 0.046, 14, 24);
    const compFor = (f) => f * 3.6 + 30 + total * f * 1.8 + gap * (tiers.length - 1);
    if (compFor(fs) > h * 0.9) fs = Math.max(10, fs * ((h * 0.9) / compFor(fs)));
    const rh = fs * 1.8;
    const wickLen = fs * 3.6;
    const comp = compFor(fs);
    const yTop = (h - comp) / 2 + wickLen + 30;
    const order = phrases.slice().sort(() => Math.random() - 0.5);
    const meas = document.createElement('canvas').getContext('2d');
    let idx = 0;
    let ri = 0;
    rows = [];
    tiers.forEach((t, ti) => {
      const Wt = W * t.f;
      for (let r = 0; r < t.n; r++, ri++) {
        const items = [];
        let used = 0;
        for (let guard = 0; guard < 8; guard++) {
          const s = order[idx % order.length];
          let size = fs * rnd(0.92, 1.12);
          meas.font = `${size}px ${FONT}`;
          let tw = meas.measureText(s).width;
          if (tw > Wt) {
            size *= Wt / tw;
            tw = Wt;
          }
          if (items.length && used + tw + fs * 0.9 > Wt) break;
          items.push({ s, size, tw });
          used += tw + (items.length > 1 ? fs * 0.9 : 0);
          idx++;
        }
        const sum = items.reduce((a, i) => a + i.tw, 0);
        const space = items.length > 1 ? (Wt - sum) / (items.length - 1) : 0;
        const sp = document.createElement('canvas');
        sp.width = Math.ceil((Wt + 4) * CFG.dpr);
        sp.height = Math.ceil(rh * CFG.dpr);
        const sc = sp.getContext('2d');
        sc.scale(CFG.dpr, CFG.dpr);
        sc.textBaseline = 'middle';
        let x = items.length > 1 ? 2 : (Wt - sum) / 2 + 2;
        items.forEach((it) => {
          const base = mix(PETAL, ROSE, clamp(ri / (total - 1) + rnd(-0.15, 0.15)));
          sc.fillStyle = `rgb(${base.join(',')})`;
          sc.font = `${it.size}px ${FONT}`;
          sc.direction = RTL.test(it.s) ? 'rtl' : 'ltr';
          sc.textAlign = 'left';
          sc.fillText(it.s, x + (sc.direction === 'rtl' ? 0 : 0), rh / 2);
          x += it.tw + space;
        });
        rows.push({ sp, w: Wt + 4, h: rh, x: (w - Wt) / 2 - 2, y: yTop + ri * rh + ti * gap, at: 200 + (total - 1 - ri) * 140 });
      }
    });
    const topW = W * tiers[0].f;
    const tops = elapsed > 0 ? wicks : [];
    wicks = Array.from({ length: N }, (_, i) => {
      const x = w / 2 + (i - (N - 1) / 2) * (topW * 0.2);
      const len = wickLen * rnd(0.85, 1.15);
      const old = tops[i];
      return {
        x, y: yTop, tx: x + rnd(-3, 3), ty: yTop - len,
        lit: old ? old.lit : 0, want: old ? old.want : 0, out: old ? old.out : false,
        litAt: old ? old.litAt : 200 + total * 140 + 700 + i * 380,
      };
    });
    if (CFG.reduced) wicks.forEach((c) => { c.want = 1; c.lit = 1; });
    if (cb.onLayout) cb.onLayout(wicks.map((c) => ({ x: c.tx, y: c.ty - 6 })));
  }

  function extinguish(c) {
    c.want = 0;
    c.out = true;
    for (let i = 0; i < 7; i++) smoke.push({ x: c.tx + rnd(-2, 2), y: c.ty - 8, vy: rnd(0.3, 0.8), vx: rnd(-0.2, 0.2), life: 1 });
    if (cb.onSnuff) cb.onSnuff();
  }

  function draw(dt) {
    const k = dt / 16.7;
    ctx.clearRect(0, 0, w, h);
    for (const r of rows) {
      const a = clamp((elapsed - r.at) / 600);
      if (a <= 0) continue;
      ctx.globalAlpha = a;
      ctx.drawImage(r.sp, r.x, r.y + (1 - a) * 6, r.w, r.h);
    }
    const topA = rows.length ? clamp((elapsed - rows[0].at) / 600) : 0;
    wicks.forEach((c, i) => {
      if (elapsed >= c.litAt && c.want === 0 && !c.out) {
        c.want = 1;
        if (cb.onLight) cb.onLight(i, N);
      }
      c.lit += (c.want - c.lit) * 0.08 * k;
      ctx.globalAlpha = topA;
      ctx.strokeStyle = petal;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(c.tx, c.ty);
      ctx.stroke();
      if (c.lit < 0.02) return;
      const f = c.lit;
      const fl = CFG.reduced ? 1 : 1 + 0.12 * Math.sin(elapsed * 0.013 + i * 1.7) + 0.08 * Math.sin(elapsed * 0.031 + i * 3.1);
      const wob = CFG.reduced ? 0 : Math.sin(elapsed * 0.007 + i) * 1.2;
      const fx = c.tx;
      const fy = c.ty - 3;
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(fx, fy - 6, 0, fx, fy - 6, 30 * f);
      g.addColorStop(0, `rgba(${ROSE.join(',')},${0.3 * f})`);
      g.addColorStop(1, `rgba(${ROSE.join(',')},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(fx - 34, fy - 40, 68, 68);
      ctx.globalCompositeOperation = 'source-over';
      const fg = ctx.createLinearGradient(0, fy + 6, 0, fy - 14 * f * fl);
      fg.addColorStop(0, rose);
      fg.addColorStop(1, petal);
      ctx.globalAlpha = f;
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(fx, fy + 6 * f);
      ctx.quadraticCurveTo(fx - 5.5 * f, fy, fx + wob, fy - 14 * f * fl);
      ctx.quadraticCurveTo(fx + 5.5 * f, fy, fx, fy + 6 * f);
      ctx.fill();
      ctx.fillStyle = text;
      ctx.globalAlpha = 0.85 * f;
      ctx.beginPath();
      ctx.ellipse(fx + wob * 0.3, fy + 1, 1.6 * f, 3.4 * f * fl, 0, 0, TAU);
      ctx.fill();
    });
    ctx.fillStyle = petal;
    smoke = smoke.filter((s) => s.life > 0);
    smoke.forEach((s) => {
      s.x += s.vx * k + Math.sin(elapsed * 0.01 + s.y) * 0.15;
      s.y -= s.vy * k;
      s.life -= 0.012 * k;
      ctx.globalAlpha = Math.max(0, s.life) * 0.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 1 + (1 - s.life) * 2.2, 0, TAU);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    if (!allOut && wicks.every((c) => c.out && c.lit < 0.05)) {
      allOut = true;
      relightAt = elapsed + 3500;
      if (cb.onAllOut) cb.onAllOut();
    }
    if (allOut && elapsed >= relightAt) {
      allOut = false;
      wicks.forEach((c, i) => {
        c.out = false;
        c.litAt = elapsed + i * 380;
      });
    }
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min(now - last, 50);
    last = now;
    elapsed += dt;
    draw(dt);
    raf = requestAnimationFrame(frame);
  }

  function toggle(i) {
    const c = wicks[i];
    if (!c) return;
    if (c.out || c.want === 0) {
      c.out = false;
      c.litAt = elapsed;
      return;
    }
    if (c.lit > 0.3) extinguish(c);
  }

  return {
    start() {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    rebuild() {
      build();
      draw(0);
    },
    toggle,
  };
}
