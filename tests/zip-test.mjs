import { createRequire } from 'module';
import { writeFileSync } from 'fs';
const require = createRequire(import.meta.url);
// Blob ist in Node 22 global vorhanden
const ZIP = require(new URL('../zip.js', import.meta.url).pathname);
const enc = new TextEncoder();
const files = [
  { name: 'Aufgabe-t01_Anna_1200.txt', data: enc.encode('Hallo Welt – Ümläute\n') },
  { name: 'unterordner/zweites.bin', data: new Uint8Array([0, 1, 2, 250, 255, 128]) },
  { name: 'gross.txt', data: enc.encode('x'.repeat(5000)) },
];
const blob = ZIP.build(files);
const buf = Buffer.from(await blob.arrayBuffer());
writeFileSync('/tmp/eventpic-test.zip', buf);
console.log('ZIP', buf.length, 'Bytes, CRC32("abc")=0x' + ZIP.crc32(enc.encode('abc')).toString(16));
