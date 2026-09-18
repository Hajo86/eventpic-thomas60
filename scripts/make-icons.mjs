// Erzeugt die PWA-Icons ohne Bildbibliothek: rohes PNG aus RGBA-Pixeln.
// Aufruf:  node scripts/make-icons.mjs
import { deflateSync } from 'zlib';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'icons');
mkdirSync(out, { recursive: true });

const ACCENT = [200, 16, 46, 255];      // #c8102e
const WHITE = [255, 255, 255, 255];

const GLYPH = {
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  '0': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
};

function crc32(buf) {
  let c, table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xFFFFFFFF;
  for (const b of buf) crc = table[(crc ^ b) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}
function icon(size, { radius = 0.22, pad = 0.14 } = {}) {
  const px = Buffer.alloc(size * size * 4);
  const set = (x, y, c) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = c[3];
  };
  const r = size * radius;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    // abgerundetes Quadrat
    const cx = Math.min(Math.max(x, r), size - r), cy = Math.min(Math.max(y, r), size - r);
    const inside = (x - cx) ** 2 + (y - cy) ** 2 <= r * r + 0.5;
    set(x, y, inside ? ACCENT : [0, 0, 0, 0]);
  }
  // "60" zentriert
  const glyphs = ['6', '0'];
  const gw = 5, gh = 7, gap = 1;
  const totalW = glyphs.length * gw + (glyphs.length - 1) * gap;
  const scale = Math.floor((size * (1 - 2 * pad)) / totalW);
  const w = totalW * scale, h = gh * scale;
  const ox = Math.round((size - w) / 2), oy = Math.round((size - h) / 2);
  glyphs.forEach((g, gi) => {
    GLYPH[g].forEach((row, ry) => {
      [...row].forEach((ch, rx) => {
        if (ch !== '#') return;
        const bx = ox + (gi * (gw + gap) + rx) * scale, by = oy + ry * scale;
        for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) set(bx + dx, by + dy, WHITE);
      });
    });
  });
  return png(size, px);
}

writeFileSync(join(out, 'icon-192.png'), icon(192));
writeFileSync(join(out, 'icon-512.png'), icon(512));
writeFileSync(join(out, 'icon-maskable.png'), icon(512, { radius: 0.5, pad: 0.26 }));
console.log('Icons geschrieben nach', out);
