import { CFG } from './config.js';
import * as sfx from './sfx.js';
import { play, miniPath } from './curve.js';
import { createBloom } from './bloom.js';
import { createStack } from './tiers.js';

const NS = 'http://www.w3.org/2000/svg';
const TAU = Math.PI * 2;
const WICKS = 5;
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
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

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

function spawn(x, y, vx, vy, g, size) {
  if (P.length >= CFG.maxParticles) return;
  P.push({ x, y, vx, vy, g, r: rnd(0, TAU), vr: rnd(-0.08, 0.08), s: size || rnd(5, 11), c: Math.random() < 0.5 ? colors.rose : colors.petal });
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
      g.appendChild(sv('path', { d: blob(46 - i * 7, rnd(0, TAU), 5 + (i % 3)), class: i % 2 ? 'f1' : 'f2' }));
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
  const cardsAt = clamp(Number.isInteger(data.cardsAt) ? data.cardsAt : 0, 0, data.blocks.length - 1);
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
  mute.setAttribute('aria-pressed', 'false');
  const icon = sv('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' });
  icon.append(
    sv('path', { d: 'M4 9v6h4l5 4V5L8 9H4z', class: 'ico' }),
    sv('path', { d: 'M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12', class: 'ico line' }),
    sv('path', { d: 'M17 9l5 6M22 9l-5 6', class: 'ico line off' }),
  );
  mute.appendChild(icon);

  /* S1 curve */
  const s1 = el('section', 'scene s1');
  const stage = el('div', 'stage');
  const line = el('canvas');
  const mosaic = el('canvas');
  line.setAttribute('aria-hidden', 'true');
  mosaic.setAttribute('aria-hidden', 'true');
  stage.append(line, mosaic);
  const title = el('h1', 'title', data.title);
  const cue = el('div', 'cue');
  cue.setAttribute('aria-hidden', 'true');
  s1.append(stage, title, cue);
  scenes.push(s1);

  /* S2 bloom + flowers */
  const s2 = el('section', 'scene s2');
  const bloomCv = el('canvas', 'bloom');
  bloomCv.setAttribute('aria-hidden', 'true');
  const garden = el('div', 'garden');
  s2.append(bloomCv, garden);
  scenes.push(s2);

  /* S2b stack */
  const s3 = el('section', 'scene stack');
  const stackCv = el('canvas', 'stack-cv');
  stackCv.setAttribute('aria-hidden', 'true');
  const wickLayer = el('div', 'wicks');
  const wickBtns = Array.from({ length: WICKS }, (_, i) => {
    const b = el('button', 'wick-btn');
    b.type = 'button';
    b.setAttribute('aria-label', `Switch ${i + 1}`);
    wickLayer.appendChild(b);
    return b;
  });
  s3.append(stackCv, wickLayer);
  scenes.push(s3);

  /* S3+ text, cards */
  const reveals = [];
  let eqBars = null;
  let cardsScene = null;
  data.blocks.forEach((text, i) => {
    const sc = el('section', 'scene text');
    const p = el('p', 'prose' + (text.length < 140 ? ' center' : ''));
    const spaced = /\s/.test(text);
    const parts = spaced ? text.split(/\s+/).filter(Boolean) : text.match(/.{1,2}/gu) || [];
    const spans = parts.map((w, k) => {
      const sp = el('span', 'w' + (CFG.reduced ? ' on' : ''), w);
      p.appendChild(sp);
      if (spaced && k < parts.length - 1) p.appendChild(document.createTextNode(' '));
      return sp;
    });
    const rv = { sc, p, spans, started: false, done: CFG.reduced, k: 0, timer: 0 };
    reveals.push(rv);
    sc.appendChild(p);
    if (i === cardsAt) {
      cardsScene = sc;
      const row = el('div', 'cards');
      data.cards.slice(0, 3).forEach((c, ci) => {
        const card = el('button', 'card');
        card.type = 'button';
        card.setAttribute('aria-pressed', 'false');
        const inner = el('span', 'card-in');
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
  mini.append(sv('path', { d: miniPath(90, 1), class: 'mini-ping' }), sv('path', { d: miniPath(90, 1), class: 'mini-path' }));
  const heartBtn = el('button', 'mini-btn');
  heartBtn.type = 'button';
  heartBtn.setAttribute('aria-label', 'Pulse');
  heartBtn.appendChild(mini);
  const sig = el('p', 'sig', data.sig);
  const again = el('button', 'again', 'Ver de novo');
  again.type = 'button';
  end.append(closing, heartBtn, sig, again);
  scenes.push(end);

  const progress = el('div', 'progress');
  progress.setAttribute('aria-hidden', 'true');
  const aurora = el('div', 'aurora');
  aurora.setAttribute('aria-hidden', 'true');
  root.append(aurora, gate, mute, progress, petalCanvas(), ...scenes);

  /* ---------- layout helpers ---------- */
  const fitTitle = () => {
    title.style.fontSize = '';
    let fs = parseFloat(getComputedStyle(title).fontSize);
    const max = s1.clientHeight * 0.28;
    while (title.offsetHeight > max && fs > 26) {
      fs -= 2;
      title.style.fontSize = fs + 'px';
    }
  };

  let grown = CFG.reduced;
  const buildGarden = () => {
    garden.replaceChildren();
    const base = Math.min(innerWidth, innerHeight * 0.9);
    const nF = clamp(Math.round(innerWidth / 70), 6, 14);
    for (let i = 0; i < nF; i++) {
      const size = Math.round(clamp(base * rnd(0.2, 0.38), 64, 170));
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
    garden.classList.toggle('settled', grown);
  };
  buildGarden();

  /* ---------- behaviour ---------- */
  const phrases = data.mosaic;
  const bloom = createBloom(bloomCv, {
    onBloom: () => sfx.shimmer(),
    onTap: (x, y) => {
      const r = bloomCv.getBoundingClientRect();
      burst(r.left + x, r.top + y);
      sfx.petal();
      sfx.pluck(4);
    },
  });
  const stack = createStack(stackCv, phrases, {
    onLayout: (pos) => pos.forEach((p, i) => {
      if (!wickBtns[i]) return;
      wickBtns[i].style.left = p.x + 'px';
      wickBtns[i].style.top = p.y + 'px';
    }),
    onLight: (i, n) => sfx.bell(i, n),
    onSnuff: () => {
      sfx.click();
      sfx.petal();
    },
    onAllOut: () => {
      sfx.arp();
      const r = stackCv.getBoundingClientRect();
      for (let i = 0; i < 3; i++) burst(r.left + r.width * (0.3 + 0.2 * i), r.top + r.height * 0.35);
    },
  });
  wickBtns.forEach((b, i) => b.addEventListener('click', () => stack.toggle(i)));
  const buildCanvases = () => {
    if (CFG.reduced) bloom.drawStatic();
    else bloom.rebuild();
    stack.rebuild();
  };
  buildCanvases();
  fitTitle();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      stack.rebuild();
      fitTitle();
    });
  }

  const live = [[s2, CFG.reduced ? { start() {}, stop() {} } : bloom], [s3, stack]];
  const ioLive = new IntersectionObserver((entries) => {
    for (const en of entries) {
      const o = live.find((l) => l[0] === en.target)[1];
      if (en.isIntersecting) o.start();
      else o.stop();
    }
  }, { threshold: 0.1 });
  live.forEach((l) => ioLive.observe(l[0]));

  if (!CFG.reduced) {
    addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || !document.body.classList.contains('started')) return;
      if (Math.random() < 0.3) spawn(e.clientX + rnd(-4, 4), e.clientY + rnd(-4, 4), rnd(-0.3, 0.3), rnd(0.1, 0.6), 0.004, rnd(2, 4));
    });
  }

  const runCurve = (staticMode) => {
    if (curveRun) curveRun.cancel();
    title.classList.remove('show');
    s1.classList.remove('done');
    curveRun = play({
      line, mosaic, stage, phrases, sfx, staticMode,
      onDone: () => {
        title.classList.add('show');
        s1.classList.add('done');
      },
    });
  };

  let started = false;
  gbtn.addEventListener('click', () => {
    if (started) return;
    started = true;
    sfx.unlock();
    enableTilt();
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
    mute.setAttribute('aria-pressed', String(m));
    mute.setAttribute('aria-label', m ? 'Ativar som' : 'Silenciar');
  });

  again.addEventListener('click', () => {
    scrollTo({ top: 0, behavior: CFG.reduced ? 'auto' : 'smooth' });
    setTimeout(() => runCurve(CFG.reduced), CFG.reduced ? 0 : 700);
  });

  /* resize: ignore the mobile toolbar showing/hiding */
  let lw = innerWidth;
  let lh = innerHeight;
  let rs;
  addEventListener('resize', () => {
    clearTimeout(rs);
    rs = setTimeout(() => {
      if (innerWidth === lw && Math.abs(innerHeight - lh) < 140) return;
      lw = innerWidth;
      lh = innerHeight;
      fitTitle();
      if (started && title.classList.contains('show')) runCurve(true);
      buildGarden();
      buildCanvases();
    }, 250);
  });

  const stars = document.getElementById('stars');
  const tilt = { x: 0, y: 0, tx: 0, ty: 0 };
  let scrollShift = 0;
  let tiltRaf = 0;
  let tiltOn = false;
  let tiltBase = null;
  const place = () => {
    stars.style.transform = `translate3d(${(tilt.x * 10).toFixed(1)}px, ${(scrollShift + tilt.y * 8).toFixed(1)}px, 0)`;
  };
  const easeTilt = () => {
    tiltRaf = 0;
    tilt.x += (tilt.tx - tilt.x) * 0.1;
    tilt.y += (tilt.ty - tilt.y) * 0.1;
    place();
    if (Math.abs(tilt.tx - tilt.x) + Math.abs(tilt.ty - tilt.y) > 0.003) tiltRaf = requestAnimationFrame(easeTilt);
  };
  const setTilt = (x, y) => {
    tilt.tx = clamp(x, -1, 1);
    tilt.ty = clamp(y, -1, 1);
    bloom.setTilt(tilt.tx, tilt.ty);
    if (!tiltRaf) tiltRaf = requestAnimationFrame(easeTilt);
  };
  const onOrient = (e) => {
    if (e.gamma == null || e.beta == null) return;
    if (!tiltBase) tiltBase = { g: e.gamma, b: e.beta };
    tiltBase.g += (e.gamma - tiltBase.g) * 0.01;
    tiltBase.b += (e.beta - tiltBase.b) * 0.01;
    setTilt((e.gamma - tiltBase.g) / 20, (e.beta - tiltBase.b) / 20);
  };
  const enableTilt = async () => {
    if (CFG.reduced || tiltOn) return;
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        if ((await DeviceOrientationEvent.requestPermission()) !== 'granted') return;
      }
      addEventListener('deviceorientation', onOrient, { passive: true });
      tiltOn = true;
    } catch (e) { /* tilt is optional */ }
  };
  if (!CFG.reduced) {
    addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse' && document.body.classList.contains('started')) {
        setTilt((e.clientX / innerWidth - 0.5) * 2, (e.clientY / innerHeight - 0.5) * 2);
      }
    }, { passive: true });
  }
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    const p = max > 0 ? Math.min(1, scrollY / max) : 0;
    progress.style.transform = `scaleY(${p})`;
    scrollShift = (0.5 - p) * 0.14 * innerHeight;
    place();
    document.body.classList.toggle('scrolled', scrollY > 40);
  };
  addEventListener('scroll', onScroll, { passive: true });

  heartBtn.addEventListener('click', () => {
    heartBtn.classList.remove('thump');
    void heartBtn.offsetWidth;
    heartBtn.classList.add('thump');
    sfx.lubdub();
    if (navigator.vibrate) navigator.vibrate([30, 70, 30]);
    const r = heartBtn.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2);
  });

  /* words: start when mostly in view, finish at once if the reader moves on or taps */
  const finish = (r) => {
    if (r.done) return;
    clearInterval(r.timer);
    r.done = true;
    r.spans.forEach((s) => s.classList.add('on', 'now'));
  };
  reveals.forEach((r) => r.p.addEventListener('click', () => finish(r)));
  const ioText = new IntersectionObserver((entries) => {
    for (const en of entries) {
      const r = reveals.find((x) => x.sc === en.target);
      if (!r || r.done) continue;
      const seen = en.isIntersecting && (en.intersectionRatio >= 0.35 || en.intersectionRect.height >= innerHeight * 0.5);
      if (seen && !r.started) {
        r.started = true;
        r.timer = setInterval(() => {
          if (r.k >= r.spans.length) {
            clearInterval(r.timer);
            r.done = true;
            return;
          }
          r.spans[r.k++].classList.add('on');
        }, 333);
      } else if (!en.isIntersecting && r.started) finish(r);
    }
  }, { threshold: [0, 0.1, 0.35, 0.5] });
  reveals.forEach((r) => ioText.observe(r.sc));

  /* flowers grow once, equalizer, final scene */
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
      if (t === s2 && en.isIntersecting && !grown) {
        grown = true;
        garden.classList.add('grown');
      }
      if (t === cardsScene) {
        if (en.isIntersecting && !eqOn) {
          eqOn = true;
          requestAnimationFrame(eqLoop);
        } else if (!en.isIntersecting) eqOn = false;
      }
      if (t === end) {
        const on = en.isIntersecting && en.intersectionRatio >= 0.5;
        end.classList.toggle('lit', on);
        if (on) {
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
  }, { threshold: [0, 0.1, 0.5] });
  [s2, end, cardsScene].forEach((n) => io.observe(n));
  if (CFG.reduced) garden.classList.add('grown');

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && eqOn) requestAnimationFrame(eqLoop);
  });
}
