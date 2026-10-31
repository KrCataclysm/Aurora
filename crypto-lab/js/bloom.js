import { CFG } from './config.js';

const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const outBack = (t) => 1 + 1.9 * Math.pow(t - 1, 3) + 0.9 * Math.pow(t - 1, 2);
const outCubic = (t) => 1 - Math.pow(1 - t, 3);
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgb = (c) => `rgb(${c.join(',')})`;

/* A flower drawn as stippled particles. Everything is built from a few
   parametric shapes (stem, leaves, three rows of petals) and grows once. */
export function createBloom(canvas, cb = {}) {
  const ctx = canvas.getContext('2d');
  const css = getComputedStyle(document.documentElement);
  const ROSE = hex(css.getPropertyValue('--rose').trim());
  const PETAL = hex(css.getPropertyValue('--petal').trim());
  const DEEP = hex(css.getPropertyValue('--deep').trim());
  const CORE = mix(ROSE, DEEP, 0.45);
  const palette = Array.from({ length: 7 }, (_, i) => {
    const t = i / 6;
    return rgb(t < 0.5 ? mix(CORE, ROSE, t * 2) : mix(ROSE, PETAL, (t - 0.5) * 2));
  });
  palette.push(rgb(mix(PETAL, DEEP, 0.6)));
  const SOIL = 7;
  const VIOLET = hex(css.getPropertyValue('--violet').trim());
  const LAV = hex(css.getPropertyValue('--lav').trim());
  palette.push(rgb(mix(VIOLET, DEEP, 0.45)), rgb(VIOLET), rgb(LAV));

  let w = 0;
  let h = 0;
  let R = 0;
  let head = [0, 0];
  let ring = { x: 0, y: 0, r: 0 };
  let parts = [];
  let motes = [];
  let elapsed = 0;
  let running = false;
  let raf = 0;
  let last = 0;
  let bloomed = false;
  const ptr = { x: 0, y: 0, on: false };

  function build() {
    const box = canvas.parentElement;
    w = box.clientWidth;
    h = box.clientHeight;
    canvas.width = Math.round(w * CFG.dpr);
    canvas.height = Math.round(h * CFG.dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(CFG.dpr, 0, 0, CFG.dpr, 0, 0);

    const k = CFG.lowEnd ? 0.5 : 1;
    R = Math.min(w * 0.42, h * 0.21);
    const ps = clamp(R / 150, 1, 1.5);
    const cx = w / 2;
    const y0 = h * 0.74;
    const stemTop = y0 - 0.95 * R;
    head = [cx, stemTop];
    ring = { x: cx, y: y0 - 1.3 * R, r: Math.min(1.35 * R, w * 0.46) };
    parts = [];
    const add = (o) => parts.push({ ox: 0, oy: 0, vx: 0, vy: 0, ph: rnd(0, TAU), sw: 0, a: 1, vis: 0, x: 0, y: 0, ...o });

    /* soil: a low mound of fine grains */
    const Wd = Math.min(w * 0.94, R * 3.4);
    const Hm = R * 0.16;
    for (let i = 0; i < 800 * k; i++) {
      const u = rnd(-1, 1);
      const prof = Hm * Math.pow(1 - u * u, 1.3);
      const x = cx + (u * Wd) / 2;
      const y = y0 - rnd(-0.1, 1) * prof;
      add({ hx: x, hy: y, bx: x, by: y + 20, t0: rnd(0, 1400), dur: 800, ci: SOIL, sz: rnd(0.9, 1.7) * ps, a: rnd(0.35, 0.7) });
    }

    /* stem: a slow S curve */
    const stemLen = y0 - stemTop;
    const stemX = (s) => cx + Math.sin(s * Math.PI * 1.4) * R * 0.045;
    for (let i = 0; i < 360 * k; i++) {
      const s = Math.random();
      add({
        hx: stemX(s) + rnd(-1.4, 1.4) * (1.15 - 0.55 * s), hy: y0 - s * stemLen, bx: cx, by: y0,
        t0: 900 + s * 2000, dur: 460, ci: 8 + Math.floor(rnd(0, 2.4)), sz: rnd(1, 1.9) * ps, sw: s * 0.4,
      });
    }

    /* leaves, each with a midrib */
    [[0.3, -1], [0.52, 1]].forEach(([s, side], li) => {
      const sx = stemX(s);
      const sy = y0 - s * stemLen;
      const ang = side * 1.05;
      const dir = [Math.sin(ang), -Math.cos(ang)];
      const perp = [Math.cos(ang), Math.sin(ang)];
      const Ll = R * 0.72;
      const Wl = R * 0.2;
      for (let i = 0; i < 430 * k; i++) {
        const t = Math.pow(Math.random(), 0.9);
        const rib = Math.random() < 0.16;
        const edge = Math.random() < 0.38;
        const u = rib ? rnd(-0.04, 0.04) : edge ? (Math.random() < 0.5 ? -1 : 1) * rnd(0.86, 1) : rnd(-0.86, 0.86);
        const hw = Wl * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.02)), 0.8);
        add({
          hx: sx + dir[0] * t * Ll + perp[0] * u * hw,
          hy: sy + dir[1] * t * Ll + perp[1] * u * hw + t * t * Ll * 0.2,
          bx: sx, by: sy, t0: 2400 + li * 450 + t * 700, dur: 760,
          ci: rib ? 10 : edge ? 9 : 8, sz: rnd(1, 1.8) * ps, sw: s * 0.4 + t * 0.35,
        });
      }
    });

    /* petals: three rows, outer to inner, with a stippled rim */
    [
      { n: 4, len: 0.56, wid: 0.2, spread: 76, delay: 0, cnt: 170 },
      { n: 4, len: 0.8, wid: 0.2, spread: 42, delay: 380, cnt: 185 },
      { n: 3, len: 1.0, wid: 0.19, spread: 14, delay: 760, cnt: 210 },
    ].forEach((row) => {
      for (let j = 0; j < row.n; j++) {
        const f = row.n === 1 ? 0 : (j / (row.n - 1)) * 2 - 1;
        const a = (f * row.spread * Math.PI) / 180;
        const Lp = R * row.len * (1 - 0.18 * Math.abs(f));
        const Wp = R * row.wid;
        const dir = [Math.sin(a), -Math.cos(a)];
        const perp = [Math.cos(a), Math.sin(a)];
        const tp = 3700 + row.delay + (1 - Math.abs(f)) * 140;
        for (let i = 0; i < row.cnt * k; i++) {
          const t = Math.pow(Math.random(), 0.85);
          const rim = Math.random() < 0.72;
          const u = rim ? (Math.random() < 0.5 ? -1 : 1) * rnd(0.8, 1) : rnd(-0.8, 0.8);
          const hw = Wp * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.85);
          const curl = Math.sign(f || 1) * t * t * Lp * 0.1;
          add({
            hx: head[0] + dir[0] * t * Lp + perp[0] * (u * hw + curl), hy: head[1] + dir[1] * t * Lp + perp[1] * (u * hw + curl),
            bx: head[0], by: head[1], t0: tp + t * 220, dur: 1200, open: true,
            ci: clamp(Math.floor(t * 4.6 + (rim ? 1.3 : 0) + rnd(-0.5, 0.5)), 0, 6),
            sz: rnd(1.1, 2.1) * ps, a: rim ? 1 : 0.55, sw: 1,
          });
        }
      }
    });
    parts.sort((p, q) => p.ci - q.ci);

    motes = Array.from({ length: Math.round(46 * k) }, () => {
      const a = rnd(0, TAU);
      const d = Math.sqrt(Math.random()) * ring.r * 0.92;
      return { x: ring.x + Math.cos(a) * d, y: ring.y + Math.sin(a) * d, ph: rnd(0, TAU), s: rnd(0.8, 1.7) * ps };
    });
  }

  function update(dt) {
    const k = dt / 16.7;
    const RAD = 84;
    for (const p of parts) {
      const e = (elapsed - p.t0) / p.dur;
      if (e <= 0) {
        p.vis = 0;
        continue;
      }
      const q = p.open ? outBack(clamp(e)) : outCubic(clamp(e));
      p.vis = clamp(e * 2);
      p.x = p.bx + (p.hx - p.bx) * q;
      p.y = p.by + (p.hy - p.by) * q;
      const moving = Math.abs(p.ox) + Math.abs(p.oy) + Math.abs(p.vx) + Math.abs(p.vy) > 0.01;
      if (!ptr.on && !moving) continue;
      if (ptr.on) {
        const dx = p.x + p.ox - ptr.x;
        const dy = p.y + p.oy - ptr.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < RAD * RAD) {
          const d = Math.sqrt(d2) || 1;
          const f = (1 - d / RAD) * 2.1 * k;
          p.vx += (dx / d) * f;
          p.vy += (dy / d) * f;
        }
      }
      p.vx = (p.vx - p.ox * 0.05 * k) * 0.9;
      p.vy = (p.vy - p.oy * 0.05 * k) * 0.9;
      p.ox += p.vx * k;
      p.oy += p.vy * k;
    }
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    const sway = Math.sin(elapsed * 0.0008) * 3;
    let lastCi = -1;
    for (const p of parts) {
      if (!p.vis) continue;
      const sh = elapsed > 7200 ? 0.84 + 0.16 * Math.sin(elapsed * 0.0027 + p.ph) : 1;
      ctx.globalAlpha = p.a * p.vis * sh;
      if (p.ci !== lastCi) {
        ctx.fillStyle = palette[p.ci];
        lastCi = p.ci;
      }
      ctx.fillRect(p.x + p.ox + sway * p.sw - p.sz / 2, p.y + p.oy - p.sz / 2, p.sz, p.sz);
    }
    const rf = clamp((elapsed - 5600) / 2200);
    if (rf > 0) {
      ctx.fillStyle = palette[6];
      const n = CFG.lowEnd ? 100 : 170;
      for (let j = 0; j < n; j++) {
        const f = (j * TAU) / n + elapsed * 0.00003;
        ctx.globalAlpha = 0.42 * rf * (0.6 + 0.4 * Math.sin(f * 4));
        ctx.fillRect(ring.x + ring.r * Math.cos(f) - 0.8, ring.y + ring.r * Math.sin(f) - 0.8, 1.6, 1.6);
      }
      for (const m of motes) {
        ctx.globalAlpha = rf * (0.3 + 0.35 * Math.sin(elapsed * 0.0018 + m.ph));
        ctx.fillRect(m.x, m.y + Math.sin(elapsed * 0.0006 + m.ph) * 3, m.s, m.s);
      }
    }
    ctx.globalAlpha = 1;
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min(now - last, 50);
    last = now;
    elapsed += dt;
    update(dt);
    draw();
    if (!bloomed && elapsed > 4400) {
      bloomed = true;
      if (cb.onBloom) cb.onBloom();
    }
    raf = requestAnimationFrame(frame);
  }

  const local = (e) => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  if (!CFG.reduced) {
    canvas.addEventListener('pointermove', (e) => {
      [ptr.x, ptr.y] = local(e);
      ptr.on = true;
    });
    canvas.addEventListener('pointerleave', () => { ptr.on = false; });
    canvas.addEventListener('pointercancel', () => { ptr.on = false; });
    canvas.addEventListener('pointerdown', (e) => {
      [ptr.x, ptr.y] = local(e);
      ptr.on = true;
      if (Math.hypot(ptr.x - head[0], ptr.y - (head[1] - R * 0.4)) < R * 0.85 && cb.onTap) cb.onTap(ptr.x, ptr.y);
    });
    canvas.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') ptr.on = false; });
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
      update(0);
      draw();
    },
    drawStatic() {
      build();
      elapsed = 12000;
      update(0);
      draw();
    },
  };
}
