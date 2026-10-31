// usage:
//   node tools/crypt.mjs encrypt <plain.json> <out.json> <key>
//   node tools/crypt.mjs decrypt <in.json> <key>
import fs from 'node:fs';
import crypto from 'node:crypto';

const [, , cmd, a, b, c] = process.argv;
const ITER = 200000;
const derive = (key, salt, iter) => crypto.pbkdf2Sync(key, salt, iter, 32, 'sha256');
const b64 = (s) => Buffer.from(s, 'base64');

function encrypt(plain, key) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', derive(key, salt, ITER), iv);
  const ct = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  return { v: 1, kdf: 'PBKDF2-SHA256', iter: ITER, salt: salt.toString('base64'), iv: iv.toString('base64'), ct: ct.toString('base64') };
}

function decrypt(p, key) {
  const raw = b64(p.ct);
  const d = crypto.createDecipheriv('aes-256-gcm', derive(key, b64(p.salt), p.iter), b64(p.iv));
  d.setAuthTag(raw.subarray(raw.length - 16));
  return Buffer.concat([d.update(raw.subarray(0, raw.length - 16)), d.final()]);
}

if (cmd === 'encrypt' && a && b && c) {
  fs.writeFileSync(b, JSON.stringify(encrypt(fs.readFileSync(a), c), null, 1));
} else if (cmd === 'decrypt' && a && b) {
  process.stdout.write(decrypt(JSON.parse(fs.readFileSync(a, 'utf8')), b));
} else {
  console.error('usage: crypt.mjs encrypt <plain> <out> <key> | decrypt <in> <key>');
  process.exit(1);
}
