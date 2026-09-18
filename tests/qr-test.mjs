// Unabhängiger Gegen-Test: QR-Matrix wieder auslesen und mit dem Input vergleichen.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const QR = require(new URL('../qr.js', import.meta.url).pathname);

// --- GF(256) für Syndrom-Prüfung (unabhängig implementiert) ---
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
{ let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11D; }
  for (let j = 255; j < 512; j++) EXP[j] = EXP[j - 255]; }
const mul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

// Funktionsmodul-Karte unabhängig aufbauen
function funcMap(size, version) {
  const f = Array.from({ length: size }, () => new Array(size).fill(false));
  const mark = (r, c) => { if (r >= 0 && c >= 0 && r < size && c < size) f[r][c] = true; };
  for (const [or, oc] of [[0, 0], [0, size - 7], [size - 7, 0]])
    for (let i = -1; i <= 7; i++) for (let j = -1; j <= 7; j++) mark(or + i, oc + j);
  for (let i = 0; i < size; i++) { mark(6, i); mark(i, 6); }
  if (version >= 2) for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) mark(size - 7 + i, size - 7 + j);
  for (let i = 0; i <= 8; i++) { mark(8, i); mark(i, 8); }
  for (let i = size - 8; i < size; i++) { mark(8, i); mark(i, 8); }
  return f;
}

const MASKS = [
  (i, j) => (i + j) % 2 === 0, (i) => i % 2 === 0, (i, j) => j % 3 === 0, (i, j) => (i + j) % 3 === 0,
  (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
  (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
  (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0,
  (i, j) => (((i + j) % 2) + ((i * j) % 3)) % 2 === 0,
];

function readFormat(m, size) {
  let bits = 0;
  const get = (r, c) => m[r][c] ? 1 : 0;
  const put = (n, v) => { if (v) bits |= (1 << n); };
  for (let i = 0; i <= 5; i++) put(i, get(i, 8));
  put(6, get(7, 8)); put(7, get(8, 8)); put(8, get(8, 7));
  for (let i = 9; i < 15; i++) put(i, get(8, 14 - i));
  return bits;
}

function readCodewords(m, size, version, mask, f) {
  const bits = [];
  let up = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let k = 0; k < size; k++) {
      const row = up ? size - 1 - k : k;
      for (let c = 0; c < 2; c++) {
        const cc = col - c;
        if (f[row][cc]) continue;
        let v = m[row][cc];
        if (MASKS[mask](row, cc)) v = !v;          // Maske zurücknehmen
        bits.push(v ? 1 : 0);
      }
    }
    up = !up;
  }
  const total = QR._spec[version].total;
  const cws = [];
  for (let i = 0; i + 8 <= bits.length && cws.length < total; i += 8) {
    let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    cws.push(b);
  }
  return cws;
}

function deinterleave(cws, version) {
  const spec = QR._spec[version].blocks;
  const blocks = [];
  spec.forEach(([count, tot, dat]) => {
    for (let n = 0; n < count; n++) blocks.push({ data: [], ec: [], dat, ecn: tot - dat });
  });
  const maxD = Math.max(...blocks.map(b => b.dat));
  let p = 0;
  for (let i = 0; i < maxD; i++) for (const b of blocks) if (i < b.dat) b.data.push(cws[p++]);
  const maxE = Math.max(...blocks.map(b => b.ecn));
  for (let i = 0; i < maxE; i++) for (const b of blocks) if (i < b.ecn) b.ec.push(cws[p++]);
  return blocks;
}

function syndromesZero(block) {
  const code = block.data.concat(block.ec);
  for (let i = 0; i < block.ecn; i++) {
    let s = 0;
    for (let j = 0; j < code.length; j++) s ^= mul(code[j], EXP[(i * (code.length - 1 - j)) % 255]);
    if (s !== 0) return false;
  }
  return true;
}

function decodePayload(blocks) {
  const data = blocks.flatMap(b => b.data);
  const bits = [];
  data.forEach(b => { for (let i = 7; i >= 0; i--) bits.push((b >>> i) & 1); });
  let p = 0;
  const take = n => { let v = 0; for (let i = 0; i < n; i++) v = (v << 1) | bits[p++]; return v; };
  const mode = take(4);
  if (mode !== 0b0100) throw new Error('Modus ' + mode + ' statt Byte-Modus');
  const len = take(8);
  const out = [];
  for (let i = 0; i < len; i++) out.push(take(8));
  return new TextDecoder().decode(new Uint8Array(out));
}

function structureOk(m, size, version) {
  const ok = [];
  // Suchmuster-Mitte dunkel, Ring hell
  for (const [or, oc] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
    ok.push(m[or + 3][oc + 3] === true);
    ok.push(m[or + 1][oc + 1] === false);
    ok.push(m[or][oc] === true && m[or + 6][oc + 6] === true);
  }
  // Taktmuster
  for (let i = 8; i < size - 8; i++) { ok.push(m[6][i] === (i % 2 === 0)); ok.push(m[i][6] === (i % 2 === 0)); }
  // dunkles Modul
  ok.push(m[size - 8][8] === true);
  if (version >= 2) { ok.push(m[size - 7][size - 7] === true); ok.push(m[size - 8][size - 7] === false); }
  return ok.every(Boolean);
}

const samples = [
  'https://hajo86.github.io/rss-akquise/eventpic/',
  'https://hajo86.github.io/rss-akquise/eventpic/#gast',
  'HELLO WORLD',
  'ä ö ü ß – Umlaute im UTF-8-Byte-Modus',
  'A',
  'https://example.com/' + 'x'.repeat(80),
];

let fails = 0;
for (const s of samples) {
  const q = QR.matrix(s);
  const f = funcMap(q.size, q.version);
  const fmt = readFormat(q.modules, q.size);
  const maskFromFormat = QR._format.indexOf(fmt);
  const cws = readCodewords(q.modules, q.size, q.version, q.mask, f);
  const blocks = deinterleave(cws, q.version);
  const rs = blocks.every(syndromesZero);
  let text = '', err = '';
  try { text = decodePayload(blocks); } catch (e) { err = e.message; }
  const struct = structureOk(q.modules, q.size, q.version);
  const cwMatch = JSON.stringify(cws) === JSON.stringify(q.codewords);
  const good = maskFromFormat === q.mask && rs && text === s && struct && cwMatch;
  if (!good) fails++;
  console.log(
    (good ? 'OK  ' : 'FAIL') +
    ` v${q.version} ${q.size}x${q.size} mask=${q.mask} fmt=${maskFromFormat} rs=${rs} struct=${struct} cw=${cwMatch}` +
    ` len=${s.length} text=${text === s ? 'match' : JSON.stringify(text) + ' ' + err}`
  );
}
console.log(fails === 0 ? '\nAlle QR-Tests bestanden.' : `\n${fails} Test(s) fehlgeschlagen.`);
process.exit(fails === 0 ? 0 : 1);
