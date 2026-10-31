// usage: node tools/prep.mjs  (run once, on the release day, after tools/rotate.mjs)
// Sets the link-preview tags in index.html and prints the publishing steps.
import fs from 'node:fs';
import crypto from 'node:crypto';
import readline from 'node:readline';

const rl = readline.createInterface({ input: process.stdin });
const lines = rl[Symbol.asyncIterator]();
const ask = async (q) => { process.stdout.write(q); const r = await lines.next(); return (r.value ?? '').trim(); };
const title = process.argv[2] ?? await ask('OG title: ');
const desc = process.argv[3] ?? await ask('OG description: ');
rl.close();

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const re = /<!-- og:start -->[\s\S]*?<!-- og:end -->/;
const html = fs.readFileSync('index.html', 'utf8');
if (!re.test(html)) { console.error('og markers not found, nothing changed'); process.exit(1); }

const block = '<!-- og:start -->\n' +
  '<meta property="og:type" content="website">\n' +
  `<meta property="og:title" content="${esc(title)}">\n` +
  `<meta property="og:description" content="${esc(desc)}">\n` +
  '<!-- og:end -->';
fs.writeFileSync('index.html', html.replace(re, () => block));

const name = 'lab-' + crypto.randomBytes(2).toString('hex');
console.log('\nDone. Next steps:');
console.log('1. GitHub Desktop: File > Add local repository > pick this folder > "create a repository".');
console.log(`   Name: ${name}   Commit message: chore: add module`);
console.log('2. Publish repository (untick "Keep this code private").');
console.log('3. github.com > the repo > Settings > Pages > Deploy from a branch > main / (root) > Save.');
console.log(`4. Wait 1-2 min. URL: https://<your-user>.github.io/${name}/`);
console.log('5. Append #<key> to the end of the URL before sending.');
