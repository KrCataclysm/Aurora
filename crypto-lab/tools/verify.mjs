// usage: node tools/verify.mjs <key> [payload.enc.json]
// Confirms the key opens the payload and the fields respect the length limits.
// Prints only ok/failed and field names, never the content.
import fs from 'node:fs';
import crypto from 'node:crypto';

const [, , key, file = 'payload.enc.json'] = process.argv;
if (!key) { console.error('usage: node tools/verify.mjs <key> [file]'); process.exit(1); }

const b64 = (s) => Buffer.from(s, 'base64');
let p;
try { p = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { console.error('cannot read payload'); process.exit(1); }

let d;
try {
  const raw = b64(p.ct);
  const dec = crypto.createDecipheriv('aes-256-gcm', crypto.pbkdf2Sync(key, b64(p.salt), p.iter, 32, 'sha256'), b64(p.iv));
  dec.setAuthTag(raw.subarray(raw.length - 16));
  d = JSON.parse(Buffer.concat([dec.update(raw.subarray(0, raw.length - 16)), dec.final()]).toString('utf8'));
} catch { console.error('failed: wrong key or damaged payload'); process.exit(1); }

const len = (s) => [...String(s)].length;
const bad = [];
const max = (name, v, n) => { if (typeof v !== 'string') bad.push(`${name}: missing`); else if (len(v) > n) bad.push(`${name}: ${len(v)} > ${n}`); };
max('gate.a', d.gate?.a, 20);
max('gate.b', d.gate?.b, 30);
max('title', d.title, 40);
max('closing', d.closing, 80);
max('sig', d.sig, 30);
if (!Array.isArray(d.mosaic) || !d.mosaic.length) bad.push('mosaic: missing');
else d.mosaic.forEach((s, i) => max(`mosaic[${i}]`, s, 40));
if (!Array.isArray(d.blocks) || d.blocks.length < 1) bad.push('blocks: missing');
else d.blocks.forEach((s, i) => max(`blocks[${i}]`, s, 420));
if (!Number.isInteger(d.cardsAt) || d.cardsAt < 0 || d.cardsAt >= (d.blocks?.length ?? 0)) bad.push('cardsAt: out of range');
if (!Array.isArray(d.cards) || d.cards.length < 3) bad.push('cards: need 3');
else d.cards.slice(0, 3).forEach((c, i) => { max(`cards[${i}].f`, c?.f, 20); max(`cards[${i}].b`, c?.b, 40); });

if (bad.length) {
  console.error('failed:\n' + bad.map((b) => '  ' + b).join('\n'));
  process.exit(1);
}
console.log(`ok: key opens the payload, ${d.blocks.length} blocks, ${d.mosaic.length} phrases, all within limits`);
