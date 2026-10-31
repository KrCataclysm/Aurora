// usage: node tools/rotate.mjs <old-key> [payload.enc.json]
// Re-encrypts the payload with a fresh random key and prints the new key once.
import fs from 'node:fs';
import crypto from 'node:crypto';

const [, , oldKey, file = 'payload.enc.json'] = process.argv;
if (!oldKey) { console.error('usage: node tools/rotate.mjs <old-key> [file]'); process.exit(1); }

const b64 = (s) => Buffer.from(s, 'base64');
const derive = (key, salt, iter) => crypto.pbkdf2Sync(key, salt, iter, 32, 'sha256');

function decrypt(p, key) {
  const raw = b64(p.ct);
  const tag = raw.subarray(raw.length - 16);
  const body = raw.subarray(0, raw.length - 16);
  const d = crypto.createDecipheriv('aes-256-gcm', derive(key, b64(p.salt), p.iter), b64(p.iv));
  d.setAuthTag(tag);
  return Buffer.concat([d.update(body), d.final()]);
}

function encrypt(plain, key, iter) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', derive(key, salt, iter), iv);
  const ct = Buffer.concat([c.update(plain), c.final(), c.getAuthTag()]);
  return { v: 1, kdf: 'PBKDF2-SHA256', iter, salt: salt.toString('base64'), iv: iv.toString('base64'), ct: ct.toString('base64') };
}

let current;
try { current = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { console.error('cannot read payload'); process.exit(1); }

let plain;
try { plain = decrypt(current, oldKey); } catch { console.error('wrong key, nothing changed'); process.exit(1); }

const newKey = crypto.randomBytes(15).toString('base64url');
const next = encrypt(plain, newKey, current.iter);

try { decrypt(next, newKey); } catch { console.error('self-check failed, nothing changed'); process.exit(1); }

fs.writeFileSync(file + '.tmp', JSON.stringify(next, null, 1));
fs.renameSync(file + '.tmp', file);
console.log(newKey);
