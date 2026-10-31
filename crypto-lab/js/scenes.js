import { CFG } from './config.js';
import * as sfx from './sfx.js';
import { play } from './curve.js';
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

/* ---------- petals: a few drifting, a few released by touch ---------- */
const P = [];
let pctx = null;
let pRunning = false;
let drift = false;
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
    if (P.length || drift) requestAnimationFrame(frame);
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
  const title = el('h1', 'title', data.title);
  const hint = el('p', 'hint', 'deslize para ler a mensagem inteira');
  const cue = el('div', 'cue');
  cue.setAttribute('aria-hidden', 'true');
  s1.append(stage, title, hint, cue);
  scenes.push(s1);

  /* 2 · bloom */
  const s2 = el('section', 'scene s2');
  const bloomCv = el('canvas', 'bloom');
  bloomCv.setAttribute('aria-hidden', 'true');
  s2.appendChild(bloomCv);
  scenes.push(s2);

  /* 3 · the letter, one screen per block */
  const reveals = [];
  let cardsScene = null;
  data.blocks.forEach((text, i) => {
    const sc = el('section', 'scene text ' + (i % 2 ? 'tone-b' : 'tone-a'));
    const p = el('p', 'prose');
    const spaced = /\s/.test(text);
    const parts = spaced ? text.split(/\s+/).filter(Boolean) : text.match(/.{1,2}/gu) || [];
    const spans = parts.map((w, k) => {
      const sp = el('span', 'w' + (CFG.reduced ? ' on' : ''), w);
      p.appendChild(sp);
      if (spaced && k < parts.length - 1) p.appendChild(document.createTextNode(' '));
      return sp;
    });
    reveals.push({ sc, p, spans, started: false, done: CFG.reduced, k: 0, timer: 0 });
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
      sc.appendChild(row);
    }
    scenes.push(sc);
  });

  /* 4 · wishes, stacked */
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

  /* 5 · closing */
  const end = el('section', 'scene end');
  const closing = el('h2', 'closing', data.closing);
  const rule = el('div', 'rule');
  rule.setAttribute('aria-hidden', 'true');
  const sig = el('p', 'sig', data.sig);
  const again = el('button', 'again', 'Ver de novo');
  again.type = 'button';
  end.append(closing, rule, sig, again);
  scenes.push(end);

  const progress = el('div', 'progress');
  progress.setAttribute('aria-hidden', 'true');
  root.append(gate, mute, progress, petalCanvas(), ...scenes);

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
    const max = s1.clientHeight * 0.22;
    while (title.offsetHeight > max && fs > 26) {
      fs -= 2;
      title.style.fontSize = fs + 'px';
    }
  };
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
    document.body.classList.toggle('scrolled', scrollY > 40);
  }, { passive: true });

  /* the letter: words appear as the page settles; leaving the screen or tapping finishes it */
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
        }, 130);
      } else if (!en.isIntersecting && r.started) finish(r);
    }
  }, { threshold: [0, 0.1, 0.35, 0.5] });
  reveals.forEach((r) => ioText.observe(r.sc));

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
