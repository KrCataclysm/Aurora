import { CFG } from './config.js';
import * as sfx from './sfx.js';
import { play, miniPath } from './curve.js';

const NS = 'http://www.w3.org/2000/svg';
const TAU = Math.PI * 2;
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const sv = (tag, attrs = {}) => {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
};
const rnd = (a, b) => a + Math.random() * (b - a);

/* ---------- petal particles (shared canvas) ---------- */
const P = [];
let pc = null;
let pctx = null;
let pRunning = false;
let rain = false;
let colors = null;

function petalCanvas() {
  pc = el('canvas', 'petals');
  pc.setAttribute('aria-hidden', 'true');
  pctx = pc.getContext('2d');
  const size = () => {
    pc.width = Math.round(innerWidth * CFG.dpr);
    pc.height = Math.round(innerHeight * CFG.dpr);
    pctx.setTransform(CFG.dpr, 0, 0, CFG.dpr, 0, 0);
  };
  size();
  addEventListener('resize', size);
  return pc;
}

function spawn(x, y, vx, vy, g) {
  if (P.length >= CFG.maxParticles) return;
  P.push({ x, y, vx, vy, g, r: rnd(0, TAU), vr: rnd(-0.08, 0.08), s: rnd(5, 11), c: Math.random() < 0.5 ? colors.rose : colors.petal });
  runPetals();
}

function runPetals() {
  if (pRunning) return;
  pRunning = true;
  let last = performance.now();
  const frame = (now) => {
    const k = Math.min(now - last, 50) / 16.7;
    last = now;
    pctx.clearRect(0, 0, innerWidth, innerHeight);
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.vy += p.g * k;
      p.x += p.vx * k;
      p.y += p.vy * k;
      p.r += p.vr * k;
      if (p.y > innerHeight + 20 || p.x < -30 || p.x > innerWidth + 30) {
        P.splice(i, 1);
        continue;
      }
      pctx.save();
      pctx.translate(p.x, p.y);
      pctx.rotate(p.r);
      pctx.fillStyle = p.c;
      pctx.globalAlpha = 0.9;
      pctx.beginPath();
      pctx.ellipse(0, 0, p.s, p.s * 0.55, 0, 0, TAU);
      pctx.fill();
      pctx.restore();
    }
    if (P.length || rain) requestAnimationFrame(frame);
    else {
      pRunning = false;
      pctx.clearRect(0, 0, innerWidth, innerHeight);
    }
  };
  requestAnimationFrame(frame);
}

function burst(x, y) {
  if (CFG.reduced) return;
  for (let i = 0; i < 18; i++) spawn(x, y, rnd(-2.2, 2.2), rnd(-4.5, -1), 0.07);
}

/* ---------- procedural flowers ---------- */
function blob(r, phase, lobes) {
  let d = '';
  for (let i = 0; i < 36; i++) {
    const a = (TAU * i) / 36;
    const rr = r * (1 + 0.1 * Math.sin(lobes * a + phase));
    d += (i ? 'L' : 'M') + (Math.cos(a) * rr).toFixed(1) + ' ' + (Math.sin(a) * rr).toFixed(1);
  }
  return d + 'Z';
}

function flower(kind) {
  const s = sv('svg', { viewBox: '-50 -50 100 100', 'aria-hidden': 'true' });
  const g = sv('g', { transform: `rotate(${Math.round(rnd(0, 360))})` });
  if (kind === 'rose') {
    for (let i = 0; i < 6; i++) {
      g.appendChild(sv('path', { d: blob(46 - i * 7, rnd(0, TAU), 5 + (i % 3)), class: i % 2 ? 'f1' : 'f2', 'stroke-width': '0.7' }));
    }
    g.appendChild(sv('path', { d: blob(5, 0, 3), class: 'core' }));
  } else {
    const n = Math.round(rnd(5, 8));
    for (let i = 0; i < n; i++) {
      g.appendChild(sv('ellipse', { cx: 0, cy: -25, rx: 12, ry: 23, class: i % 2 ? 'f1' : 'f2', transform: `rotate(${(360 / n) * i})` }));
    }
    g.appendChild(sv('circle', { r: 10, class: 'core' }));
    g.appendChild(sv('circle', { r: 4, class: 'f1' }));
  }
  s.appendChild(g);
  return s;
}

/* ---------- build ---------- */
export function mount(data, root) {
  const cs = getComputedStyle(document.documentElement);
  colors = { rose: cs.getPropertyValue('--rose').trim(), petal: cs.getPropertyValue('--petal').trim() };
  const scenes = [];
  const cardsAt = Math.min(Math.max(Number.isInteger(data.cardsAt) ? data.cardsAt : 0, 0), data.blocks.length - 1);
  let curveRun = null;

  /* S0 gate */
  const gate = el('div', 'gate');
  const gbtn = el('button', 'gate-btn');
  gbtn.type = 'button';
  gbtn.append(el('span', 'gate-a', data.gate.a), el('span', 'gate-b', data.gate.b));
  gate.appendChild(gbtn);

  /* mute */
  const mute = el('button', 'mute');
  mute.type = 'button';
  mute.setAttribute('aria-label', 'Silenciar');
  const bars = sv('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' });
  const spk = sv('path', { d: 'M4 9v6h4l5 4V5L8 9H4z', class: 'ico' });
  const wave = sv('path', { d: 'M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12', class: 'ico line' });
  const slash = sv('path', { d: 'M17 9l5 6M22 9l-5 6', class: 'ico line off' });
  bars.append(spk, wave, slash);
  mute.appendChild(bars);

  /* S1 curve */
  const s1 = el('section', 'scene s1');
  s1.appendChild(el('div', 'aurora'));
  const stage = el('div', 'stage');
  const line = el('canvas');
  const mosaic = el('canvas');
  line.setAttribute('aria-hidden', 'true');
  mosaic.setAttribute('aria-hidden', 'true');
  stage.append(line, mosaic);
  const title = el('h1', 'title', data.title);
  s1.append(stage, title);
  scenes.push(s1);

  /* S2 flowers */
  const s2 = el('section', 'scene s2');
  const garden = el('div', 'garden');
  const nF = Math.min(14, Math.max(6, Math.round(innerWidth / 70)));
  for (let i = 0; i < nF; i++) {
    const size = Math.round(rnd(78, 150));
    const b = el('button', 'flower');
    b.type = 'button';
    b.setAttribute('aria-label', 'Flower');
    b.style.width = size + 'px';
    b.style.height = size + 'px';
    b.style.left = `calc(${(((i + 0.5) / nF) * 100 + rnd(-2, 2)).toFixed(1)}% - ${size / 2}px)`;
    b.style.bottom = `${-Math.round(size * rnd(0.12, 0.3))}px`;
    b.style.setProperty('--d', `${(i * 0.11 + rnd(0, 0.2)).toFixed(2)}s`);
    b.appendChild(flower(Math.random() < 0.4 ? 'rose' : 'flower'));
    b.addEventListener('click', () => {
      const r = b.getBoundingClientRect();
      burst(r.left + r.width / 2, r.top + r.height * 0.45);
      sfx.petal();
      sfx.pluck(i % 10);
    });
    garden.appendChild(b);
  }
  s2.appendChild(garden);
  scenes.push(s2);

  /* S3+ text, cards */
  const reveals = [];
  let eqBars = null;
  let cardsScene = null;
  data.blocks.forEach((text, i) => {
    const sc = el('section', 'scene text');
    const p = el('p', 'prose' + (text.length < 140 ? ' center' : ''));
    const parts = /\s/.test(text) ? text.split(/\s+/).filter(Boolean) : text.match(/.{1,2}/gu) || [];
    const spans = parts.map((w, k) => {
      const sp = el('span', 'w' + (CFG.reduced ? ' on' : ''), w);
      p.appendChild(sp);
      if (/\s/.test(text) && k < parts.length - 1) p.appendChild(document.createTextNode(' '));
      return sp;
    });
    reveals.push({ sc, spans, started: false });
    sc.appendChild(p);
    if (i === cardsAt) {
      cardsScene = sc;
      sc.classList.add('with-cards');
      const row = el('div', 'cards');
      data.cards.slice(0, 3).forEach((c, ci) => {
        const card = el('button', 'card');
        card.type = 'button';
        card.setAttribute('aria-pressed', 'false');
        const inner = el('span', 'in');
        inner.append(el('span', 'face front', c.f), el('span', 'face back', c.b));
        card.appendChild(inner);
        card.addEventListener('click', () => {
          const on = card.classList.toggle('flip');
          card.setAttribute('aria-pressed', String(on));
          sfx.click();
          if (on && ci === 2) sfx.chord();
        });
        row.appendChild(card);
      });
      const eq = el('div', 'eq');
      eq.setAttribute('aria-hidden', 'true');
      eqBars = Array.from({ length: 24 }, () => eq.appendChild(el('i')));
      sc.append(row, eq);
    }
    scenes.push(sc);
  });

  /* S end */
  const end = el('section', 'scene end');
  const closing = el('h2', 'closing', data.closing);
  const mini = sv('svg', { viewBox: '-20 -20 40 40', class: 'mini', 'aria-hidden': 'true' });
  mini.appendChild(sv('path', { d: miniPath(90, 1), class: 'mini-path' }));
  const sig = el('p', 'sig', data.sig);
  const again = el('button', 'again', 'Ver de novo');
  again.type = 'button';
  end.append(closing, mini, sig, again);
  scenes.push(end);

  const progress = el('div', 'progress');
  progress.setAttribute('aria-hidden', 'true');
  root.append(gate, mute, progress, petalCanvas(), ...scenes);

  /* ---------- behaviour ---------- */
  const phrases = data.mosaic;
  const runCurve = (staticMode) => {
    if (curveRun) curveRun.cancel();
    title.classList.remove('show');
    curveRun = play({
      line, mosaic, stage, phrases, sfx, staticMode,
      onDone: () => title.classList.add('show'),
    });
  };

  gbtn.addEventListener('click', () => {
    sfx.unlock();
    document.body.classList.remove('locked');
    document.body.classList.add('started');
    gate.classList.add('gone');
    setTimeout(() => gate.remove(), 900);
    runCurve(CFG.reduced);
  });

  mute.addEventListener('click', () => {
    const m = !sfx.isMuted();
    sfx.setMuted(m);
    mute.classList.toggle('off', m);
    mute.setAttribute('aria-label', m ? 'Ativar som' : 'Silenciar');
  });

  again.addEventListener('click', () => {
    scrollTo({ top: 0, behavior: CFG.reduced ? 'auto' : 'smooth' });
    setTimeout(() => runCurve(CFG.reduced), CFG.reduced ? 0 : 700);
  });

  let rs;
  addEventListener('resize', () => {
    clearTimeout(rs);
    rs = setTimeout(() => {
      if (document.body.classList.contains('started') && title.classList.contains('show')) runCurve(true);
    }, 250);
  });

  const onScroll = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    progress.style.transform = `scaleY(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
  };
  addEventListener('scroll', onScroll, { passive: true });

  /* growth of flowers, word reveal, equalizer, final scene */
  let eqOn = false;
  const eqLoop = (now) => {
    if (!eqOn || document.hidden) {
      eqOn = false;
      return;
    }
    const lv = sfx.levels();
    eqBars.forEach((b, i) => {
      const breathe = 0.12 + 0.1 * Math.sin(now / 900 + i * 0.5);
      const v = lv ? lv[i % lv.length] / 255 : 0;
      b.style.transform = `scaleY(${Math.max(v, breathe).toFixed(3)})`;
    });
    requestAnimationFrame(eqLoop);
  };
  let rainTimer = null;
  let endPlayed = false;

  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      const t = en.target;
      if (t === s2 && en.isIntersecting) {
        garden.classList.add('grown');
        io.unobserve(s2);
      }
      const rv = reveals.find((r) => r.sc === t);
      if (rv && en.isIntersecting && !rv.started) {
        rv.started = true;
        if (!CFG.reduced) {
          let k = 0;
          const timer = setInterval(() => {
            if (k >= rv.spans.length) return clearInterval(timer);
            rv.spans[k++].classList.add('on');
          }, 333);
        }
      }
      if (t === cardsScene) {
        if (en.isIntersecting && !eqOn) {
          eqOn = true;
          requestAnimationFrame(eqLoop);
        } else if (!en.isIntersecting) eqOn = false;
      }
      if (t === end) {
        end.classList.toggle('in', en.isIntersecting);
        if (en.isIntersecting) {
          if (!endPlayed) {
            endPlayed = true;
            sfx.arp();
          }
          if (!CFG.reduced && !rainTimer) {
            rain = true;
            rainTimer = setInterval(() => {
              spawn(rnd(0, innerWidth), -12, rnd(-0.4, 0.4), rnd(0.5, 1.1), 0.002);
            }, 380);
          }
        } else {
          endPlayed = false;
          rain = false;
          clearInterval(rainTimer);
          rainTimer = null;
        }
      }
    }
  }, { threshold: 0.5 });
  [s2, end, ...reveals.map((r) => r.sc)].forEach((n) => io.observe(n));
  if (CFG.reduced) garden.classList.add('grown');

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && eqOn) requestAnimationFrame(eqLoop);
  });
}
