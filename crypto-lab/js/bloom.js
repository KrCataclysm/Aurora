import { CFG } from './config.js';

const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const outBack = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
const outCubic = (t) => 1 - Math.pow(1 - t, 3);
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgb = (c) => `rgb(${c.join(',')})`;

export function createBloom(canvas, cb = {}) {
  const ctx = canvas.getContext('2d');
  const css = getComputedStyle(document.documentElement);
  const ROSE = hex(css.getPropertyValue('--rose').trim());
  const PETAL = hex(css.getPropertyValue('--petal').trim());
  const DEEP = hex(css.getPropertyValue('--deep').trim());
  const CORE = mix(ROSE, DEEP, 0.4);
  const palette = Array.from({ length: 7 }, (_, i) => {
    const t = i / 6;
    return rgb(t < 0.5 ? mix(CORE, ROSE, t * 2) : mix(ROSE, PETAL, (t - 0.5) * 2));
  });
  palette.push(rgb(mix(PETAL, DEEP, 0.55)));

  let w = 0;
  let h = 0;
  let R = 0;
  let Cx = 0;
  let Cy = 0;
  let parts = [];
  let rings = [];
  let stars = [];
  let elapsed = 0;
  let running = false;
  let raf = 0;
  let last = 0;
  let bloomed = false;
  const ptr = { x: 0, y: 0, on: false };
  let tgx = 0;
  let tgy = 0;
  let tx = 0;
  let ty = 0;

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
    R = Math.min(w * 0.4, h * 0.2);
    const ps = clamp(R / 150, 1, 1.6);
    const cx = w / 2;
    const y0 = h * 0.7;
    Cx = cx;
    Cy = y0 - 1.45 * R;
    const B = [cx, Cy + 0.5 * R];
    parts = [];
    const add = (o) => parts.push({ ox: 0, oy: 0, vx: 0, vy: 0, ph: rnd(0, TAU), sw: 0, a: 1, vis: 0, x: 0, y: 0, ...o });

    const Wd = Math.min(w * 0.96, R * 3.6);
    const Hm = R * 0.2;
    for (let i = 0; i < 700 * k; i++) {
      const u = rnd(-1, 1);
      const prof = Hm * Math.pow(1 - u * u, 1.2);
      const x = cx + (u * Wd) / 2;
      const y = y0 - rnd(-0.15, 1) * prof;
      add({ hx: x, hy: y, bx: x, by: y + 24, t0: rnd(0, 1200), dur: 700, ci: 7, sz: rnd(1, 2) * ps, a: 0.6 });
    }

    const top = B[1] + 4;
    const stemLen = y0 - top;
    const stemX = (s) => cx + Math.sin(s * Math.PI) * R * 0.05;
    for (let i = 0; i < 320 * k; i++) {
      const s = Math.random();
      add({
        hx: stemX(s) + rnd(-1.6, 1.6) * (1.2 - 0.5 * s), hy: y0 - s * stemLen, bx: cx, by: y0,
        t0: 800 + s * 2200, dur: 420, ci: 4 + Math.floor(rnd(0, 2)), sz: rnd(1.2, 2.2) * ps, sw: s * 0.5,
      });
    }

    [[0.32, -1], [0.55, 1]].forEach(([s, side], li) => {
      const sx = stemX(s);
      const sy = y0 - s * stemLen;
      const dir = [side * 0.906, -0.423];
      const perp = [0.423, side * 0.906];
      const Ll = R * 0.62;
      const Wl = R * 0.2;
      for (let i = 0; i < 380 * k; i++) {
        const t = Math.random();
        const u = rnd(-1, 1);
        const hw = Wl * Math.pow(Math.sin(Math.PI * t), 0.85);
        add({
          hx: sx + dir[0] * t * Ll + perp[0] * u * hw,
          hy: sy + dir[1] * t * Ll + perp[1] * u * hw + t * t * Ll * 0.15,
          bx: sx, by: sy, t0: 2300 + li * 500 + t * 800, dur: 700,
          ci: Math.abs(u) > 0.8 ? 5 : 4 - Math.floor(rnd(0, 2)), sz: rnd(1.2, 2.1) * ps, sw: s * 0.5 + t * 0.3,
        });
      }
    });

    [{ n: 9, len: 0.82, wid: 0.27, spread: 82, delay: 0, cnt: 150 }, { n: 6, len: 0.56, wid: 0.22, spread: 56, delay: 500, cnt: 120 }]
      .forEach((row) => {
        for (let j = 0; j < row.n; j++) {
          const f = (j / (row.n - 1)) * 2 - 1;
          const a = (f * row.spread * Math.PI) / 180;
          const Lp = R * row.len * (1 - 0.3 * Math.abs(f));
          const Wp = R * row.wid;
          const dir = [Math.sin(a), -Math.cos(a)];
          const perp = [Math.cos(a), Math.sin(a)];
          const tp = 3600 + row.delay + (1 - Math.abs(f)) * 200;
          for (let i = 0; i < row.cnt * k; i++) {
            const t = Math.pow(Math.random(), 0.8);
            const u = rnd(-1, 1);
            const hw = Wp * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.04)), 0.9) * (1 - 0.15 * t);
            add({
              hx: B[0] + dir[0] * t * Lp + perp[0] * u * hw, hy: B[1] + dir[1] * t * Lp + perp[1] * u * hw,
              bx: B[0], by: B[1], t0: tp + t * 250, dur: 1100, open: true,
              ci: clamp(Math.floor(t * 6.9 + rnd(-0.6, 0.6)), 0, 6), sz: rnd(1.3, 2.5) * ps, sw: 1,
            });
          }
        }
      });
    parts.sort((p, q) => p.ci - q.ci);

    rings = [
      { n: 150, ry: R, rot: 0, spd: 0.00004, ph0: 0 },
      { n: 110, ry: R * 0.35, rot: 0.4, spd: -0.00008, ph0: 1 },
      { n: 110, ry: R * 0.6, rot: 1.5, spd: 0.00006, ph0: 2 },
      { n: 110, ry: R * 0.85, rot: 2.6, spd: -0.00005, ph0: 3 },
    ].map((r) => ({ ...r, n: Math.round(r.n * k) }));
    stars = Array.from({ length: Math.round(90 * k) }, () => {
      const a = rnd(0, TAU);
      const d = Math.sqrt(Math.random()) * R * 0.95;
      return { x: Cx + Math.cos(a) * d, y: Cy + Math.sin(a) * d, ph: rnd(0, TAU), s: rnd(0.8, 1.8) };
    });
  }

  function update(dt) {
    const k = dt / 16.7;
    const RAD = 80;
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
          const f = (1 - d / RAD) * 2.2 * k;
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
    const D = CFG.dpr;
    ctx.setTransform(D, 0, 0, D, tx * 7 * D, ty * 5 * D);
    const sway = Math.sin(elapsed * 0.0009) * 3.5;
    let lastCi = -1;
    for (const p of parts) {
      if (!p.vis) continue;
      const sh = elapsed > 7000 ? 0.82 + 0.18 * Math.sin(elapsed * 0.003 + p.ph) : 1;
      ctx.globalAlpha = p.a * p.vis * sh;
      if (p.ci !== lastCi) {
        ctx.fillStyle = palette[p.ci];
        lastCi = p.ci;
      }
      ctx.fillRect(p.x + p.ox + sway * p.sw - p.sz / 2, p.y + p.oy - p.sz / 2, p.sz, p.sz);
    }
    const rf = clamp((elapsed - 5200) / 1800);
    if (rf > 0) {
      ctx.setTransform(D, 0, 0, D, tx * 17 * D, ty * 13 * D);
      ctx.fillStyle = palette[6];
      for (const r of rings) {
        const cr = Math.cos(r.rot);
        const sr = Math.sin(r.rot);
        for (let j = 0; j < r.n; j++) {
          const f = r.ph0 + (j * TAU) / r.n + elapsed * r.spd;
          const lx = R * Math.cos(f);
          const ly = r.ry * Math.sin(f);
          ctx.globalAlpha = 0.8 * rf * (0.65 + 0.35 * Math.sin(f * 3 + r.ph0));
          ctx.fillRect(Cx + lx * cr - ly * sr - 1, Cy + lx * sr + ly * cr - 1, 2, 2);
        }
      }
      for (const s of stars) {
        ctx.globalAlpha = rf * (0.5 + 0.4 * Math.sin(elapsed * 0.002 + s.ph));
        ctx.fillRect(s.x, s.y, s.s, s.s);
      }
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(D, 0, 0, D, 0, 0);
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min(now - last, 50);
    last = now;
    elapsed += dt;
    tx += (tgx - tx) * 0.08;
    ty += (tgy - ty) * 0.08;
    update(dt);
    draw();
    if (!bloomed && elapsed > 4300) {
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
      if (Math.hypot(ptr.x - Cx, ptr.y - Cy) < R * 1.05 && cb.onTap) cb.onTap(ptr.x, ptr.y);
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
    setTilt(x, y) {
      tgx = x;
      tgy = y;
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
