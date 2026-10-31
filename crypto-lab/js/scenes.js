import { CFG } from './config.js';
import * as sfx from './sfx.js';
import { play } from './curve.js';
import { createBloom } from './bloom.js';
import { createStack } from './tiers.js';
import { createPuzzle } from './puzzle.js';

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
const words = (node, text, cls) => {
  text.split(/\s+/).filter(Boolean).forEach((w, i, a) => {
    const sp = el('span', cls, w);
    sp.style.setProperty('--i', i);
    node.appendChild(sp);
    if (i < a.length - 1) node.appendChild(document.createTextNode(' '));
  });
  return node;
};

/* ---------- petals: a few drifting, a few released by touch ---------- */
const P = [];
let pctx = null;
let pRunning = false;
let drift = false;
let ambient = false;
let colors = null;

function petalCanvas() {
  const pc = el('canvas', 'petals');
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
  if (P.length >= 48) return;
  P.push({ x, y, vx, vy, g, r: rnd(0, TAU), vr: rnd(-0.05, 0.05), s: size || rnd(5, 9), c: Math.random() < 0.55 ? colors.petal : colors.rose, ph: rnd(0, TAU) });
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
      p.x += (p.vx + Math.sin(now * 0.001 + p.ph) * 0.25) * k;
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
      pctx.globalAlpha = 0.85;
      pctx.beginPath();
      pctx.ellipse(0, 0, p.s, p.s * 0.5, 0, 0, TAU);
      pctx.fill();
      pctx.restore();
    }
    if (P.length || drift || ambient) requestAnimationFrame(frame);
    else {
      pRunning = false;
      pctx.clearRect(0, 0, innerWidth, innerHeight);
    }
  };
  requestAnimationFrame(frame);
}

function release(x, y) {
  if (CFG.reduced) return;
  for (let i = 0; i < 12; i++) spawn(x, y, rnd(-1.6, 1.6), rnd(-3.2, -0.8), 0.05);
}

/* ---------- build ---------- */
export function mount(data, root) {
  const cs = getComputedStyle(document.documentElement);
  colors = { rose: cs.getPropertyValue('--rose').trim(), petal: cs.getPropertyValue('--petal').trim() };
  const scenes = [];
  const cardsAt = clamp(Number.isInteger(data.cardsAt) ? data.cardsAt : 0, 0, data.blocks.length - 1);
  let curveRun = null;

  /* gate */
  const gate = el('div', 'gate');
  const gbtn = el('button', 'gate-btn');
  gbtn.type = 'button';
  gbtn.append(el('span', 'gate-a', data.gate.a), el('span', 'gate-b', data.gate.b));
  gate.appendChild(gbtn);

  /* sound toggle */
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

  /* 1 · curve */
  const s1 = el('section', 'scene s1');
  const stage = el('div', 'stage');
  const line = el('canvas');
  const mosaic = el('canvas');
  line.setAttribute('aria-hidden', 'true');
  mosaic.setAttribute('aria-hidden', 'true');
  stage.append(line, mosaic);
  const title = words(el('h1', 'title'), data.title, 'tw');
  s1.append(stage, title);
  scenes.push(s1);

  /* 2 · bloom */
  const s2 = el('section', 'scene s2');
  const bloomCv = el('canvas', 'bloom');
  bloomCv.setAttribute('aria-hidden', 'true');
  s2.appendChild(bloomCv);
  scenes.push(s2);

  /* 3 · the letter: short thoughts share a screen so the reading stays light */
  const textScenes = [];
  const groups = [];
  const tall = innerHeight >= 720;
  for (let i = 0; i < data.blocks.length;) {
    const pair = tall && i !== cardsAt && i + 1 < data.blocks.length && i + 1 !== cardsAt
      && data.blocks[i].length + data.blocks[i + 1].length <= 420;
    groups.push(pair ? [i, i + 1] : [i]);
    i += pair ? 2 : 1;
  }
  groups.forEach((group) => {
    const sc = el('section', 'scene text ' + (group[0] % 2 ? 'tone-b' : 'tone-a'));
    group.forEach((idx, k) => {
      const p = el('p', 'prose ' + (idx % 2 ? 'tone-b' : 'tone-a') + (k ? ' cont' : ''), data.blocks[idx]);
      p.style.setProperty('--p', k);
      sc.appendChild(p);
      if (idx === cardsAt) {
        const row = el('div', 'cards');
        data.cards.slice(0, 3).forEach((c, ci) => {
          const card = el('button', 'card');
          card.type = 'button';
          card.style.setProperty('--i', ci);
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
        sc.appendChild(row);
      }
    });
    textScenes.push(sc);
    scenes.push(sc);
  });

  /* 4 · a small puzzle that assembles itself */
  const pz = data.puzzle || {};
  const sp = el('section', 'scene puzzle');
  const pzHint = el('p', 'puzzle-hint', pz.hint || '');
  const pzCv = el('canvas');
  pzCv.setAttribute('role', 'img');
  pzCv.setAttribute('aria-label', 'Um quebra-cabeça se monta sozinho');
  const pzDone = el('p', 'puzzle-done', pz.done || '');
  sp.append(pzHint, pzCv, pzDone);
  if (CFG.reduced) sp.classList.add('solved');
  scenes.push(sp);

  /* 5 · wishes, stacked */
  const s3 = el('section', 'scene cake');
  const stackCv = el('canvas', 'cake-cv');
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

  /* 6 · closing */
  const end = el('section', 'scene end');
  const closing = words(el('h2', 'closing'), data.closing, 'cw');
  const rule = el('div', 'rule');
  rule.setAttribute('aria-hidden', 'true');
  const sig = el('p', 'sig', data.sig);
  const again = el('button', 'again', 'Ver de novo');
  again.type = 'button';
  [closing, rule, sig, again].forEach((n, k) => n.style.setProperty('--i', k));
  end.append(closing, rule, sig, again);
  scenes.push(end);

  const nav = el('div', 'nav');
  const prevBtn = el('button', 'prev');
  prevBtn.type = 'button';
  prevBtn.setAttribute('aria-label', 'Voltar');
  const back = sv('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' });
  back.appendChild(sv('path', { d: 'M14.5 5.5L8 12l6.5 6.5', class: 'ico line' }));
  prevBtn.appendChild(back);
  const nextBtn = el('button', 'next');
  nextBtn.type = 'button';
  nextBtn.setAttribute('aria-label', 'Continuar');
  const arrow = sv('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' });
  arrow.appendChild(sv('path', { d: 'M5 12h14M13 6l6 6-6 6', class: 'ico line' }));
  nextBtn.append(el('span', 'next-t', 'continuar'), arrow);
  nav.append(prevBtn, nextBtn);
  const progress = el('div', 'progress');
  progress.setAttribute('aria-hidden', 'true');
  root.append(gate, mute, nav, progress, petalCanvas(), ...scenes);

  /* ---------- behaviour ---------- */
  const phrases = data.mosaic;
  const bloom = createBloom(bloomCv, {
    onBloom: () => sfx.shimmer(),
    onTap: (x, y) => {
      const r = bloomCv.getBoundingClientRect();
      release(r.left + x, r.top + y);
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
    onAllOut: () => sfx.arp(),
  });
  wickBtns.forEach((b, i) => b.addEventListener('click', () => stack.toggle(i)));

  const fitTitle = () => {
    title.style.fontSize = '';
    let fs = parseFloat(getComputedStyle(title).fontSize);
    const max = s1.clientHeight * 0.2;
    while (title.offsetHeight > max && fs > 26) {
      fs -= 2;
      title.style.fontSize = fs + 'px';
    }
  };
  const puzzle = createPuzzle(pzCv, data.title, {
    onPlace: () => sfx.snap(),
    onSolved: () => {
      sp.classList.add('solved');
      sfx.arp();
      const r = pzCv.getBoundingClientRect();
      for (let i = 0; i < 3; i++) release(r.left + r.width * (0.25 + 0.25 * i), r.top + r.height * 0.5);
    },
  });
  if (CFG.dev) window.__puzzle = puzzle;
  const buildCanvases = () => {
    if (CFG.reduced) bloom.drawStatic();
    else bloom.rebuild();
    stack.rebuild();
    puzzle.rebuild();
  };
  buildCanvases();
  fitTitle();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      stack.rebuild();
      puzzle.rebuild();
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
    document.body.classList.remove('locked');
    document.body.classList.add('started');
    gate.classList.add('gone');
    setTimeout(() => gate.remove(), 1000);
    runCurve(CFG.reduced);
    if (!CFG.reduced) {
      ambient = true;
      setInterval(() => {
        if (!document.hidden && P.length < 9) spawn(rnd(0, innerWidth), -10, rnd(-0.25, 0.25), rnd(0.35, 0.7), 0.001, rnd(3.5, 6.5));
      }, 3600);
    }
  });

  mute.addEventListener('click', () => {
    const m = !sfx.isMuted();
    sfx.setMuted(m);
    mute.classList.toggle('off', m);
    mute.setAttribute('aria-pressed', String(m));
    mute.setAttribute('aria-label', m ? 'Ativar som' : 'Silenciar');
  });

  again.addEventListener('click', () => {
    go(0);
    setTimeout(() => runCurve(CFG.reduced), CFG.reduced ? 0 : 900);
  });

  /* resize: ignore the mobile toolbar showing and hiding */
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
      buildCanvases();
    }, 250);
  });

  addEventListener('scroll', () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    progress.style.transform = `scaleY(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
    s1.style.setProperty('--out', clamp(scrollY / (innerHeight * 0.8), 0, 1).toFixed(3));
  }, { passive: true });

  /* each screen settles in as a whole; the puzzle starts when it is in view */
  const ioSeen = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (en.isIntersecting && en.intersectionRatio >= 0.3) {
        en.target.classList.add('seen');
        if (en.target === sp && en.intersectionRatio >= 0.85) puzzle.start();
      }
    }
  }, { threshold: [0.3, 0.85, 0.98] });
  [...textScenes, sp].forEach((n) => ioSeen.observe(n));

  /* keep every text screen inside the viewport, since the page does not scroll by hand */
  const probe = el('div');
  probe.style.cssText = 'position:fixed;left:-9px;top:0;width:1px;height:100svh;pointer-events:none;visibility:hidden';
  document.body.appendChild(probe);
  const fitScreens = () => {
    const H = probe.getBoundingClientRect().height || innerHeight;
    textScenes.forEach((sc) => {
      sc.style.removeProperty('--fs');
      const pr = sc.querySelector('.prose');
      let fs = parseFloat(getComputedStyle(pr).fontSize);
      for (let n = 0; n < 16 && sc.getBoundingClientRect().height > H + 1 && fs > 16; n++) {
        fs -= 1;
        sc.style.setProperty('--fs', fs + 'px');
      }
    });
  };
  fitScreens();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitScreens);
  addEventListener('resize', () => setTimeout(fitScreens, 300));

  /* navigation: only the buttons (and the keyboard) move the page, slowly and softly */
  let scrollAnim = 0;
  let animating = false;
  const smoothTo = (y) => {
    if (CFG.reduced) {
      scrollTo(0, y);
      return;
    }
    cancelAnimationFrame(scrollAnim);
    animating = true;
    const y0 = scrollY;
    const d = y - y0;
    const t0 = performance.now();
    const dur = clamp((Math.abs(d) / innerHeight) * 900 + 600, 800, 1600);
    const step = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      scrollTo(0, y0 + d * e);
      if (t < 1) scrollAnim = requestAnimationFrame(step);
      else animating = false;
    };
    scrollAnim = requestAnimationFrame(step);
  };
  const currentIdx = () => {
    const y = scrollY + innerHeight * 0.5;
    let k = 0;
    scenes.forEach((sc, i) => { if (sc.offsetTop <= y) k = i; });
    return k;
  };
  let target = 0;
  const go = (i) => {
    if (i < 0 || i >= scenes.length) return;
    target = i;
    smoothTo(scenes[i].offsetTop);
    refreshNav(i);
  };
  const refreshNav = (idx = currentIdx()) => {
    const ready = started && s1.classList.contains('done');
    nav.classList.toggle('on', ready && idx < scenes.length - 1 || ready && idx > 0);
    nextBtn.classList.toggle('hide', idx >= scenes.length - 1);
    prevBtn.classList.toggle('hide', idx <= 0);
  };
  const base = () => (animating ? target : currentIdx());
  nextBtn.addEventListener('click', () => go(base() + 1));
  prevBtn.addEventListener('click', () => go(base() - 1));
  addEventListener('keydown', (e) => {
    if (!started) return;
    if (['ArrowDown', 'PageDown', ' '].includes(e.key) && !(e.target.closest && e.target.closest('button'))) {
      e.preventDefault();
      go(base() + 1);
    } else if (['ArrowUp', 'PageUp'].includes(e.key)) {
      e.preventDefault();
      go(base() - 1);
    }
  });
  /* no manual scrolling: wheel and touch drags are ignored */
  addEventListener('wheel', (e) => { if (started) e.preventDefault(); }, { passive: false });
  addEventListener('touchmove', (e) => { if (started) e.preventDefault(); }, { passive: false });
  addEventListener('scroll', () => refreshNav(), { passive: true });
  new MutationObserver(() => refreshNav()).observe(s1, { attributes: true, attributeFilter: ['class'] });
  addEventListener('resize', () => refreshNav());

  /* closing: a soft arpeggio and a few petals */
  let driftTimer = null;
  let endPlayed = false;
  const ioEnd = new IntersectionObserver((entries) => {
    for (const en of entries) {
      const on = en.isIntersecting && en.intersectionRatio >= 0.5;
      end.classList.toggle('lit', on);
      if (on) {
        if (!endPlayed) {
          endPlayed = true;
          sfx.arp();
        }
        if (!CFG.reduced && !driftTimer) {
          drift = true;
          driftTimer = setInterval(() => spawn(rnd(0, innerWidth), -12, rnd(-0.3, 0.3), rnd(0.5, 0.9), 0.0015), 900);
        }
      } else {
        endPlayed = false;
        drift = false;
        clearInterval(driftTimer);
        driftTimer = null;
      }
    }
  }, { threshold: [0, 0.1, 0.5] });
  ioEnd.observe(end);
}
