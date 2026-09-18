/* ==========================================================================
   zip.js — minimaler ZIP-Writer (Methode "stored", ohne Kompression)
   --------------------------------------------------------------------------
   JPEGs sind schon komprimiert; erneutes Deflaten bringt nichts und würde
   nur eine Bibliothek erfordern. Erzeugt ein normales .zip, das Windows,
   macOS und Linux ohne Zusatzsoftware öffnen.

   window.ZIP.build([{name, data: Uint8Array, date?: Date}]) -> Blob
   ========================================================================== */
(function () {
  'use strict';

  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(buf) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function dosTime(d) {
    var time = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() / 2) & 31);
    var date = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
    return { time: time, date: date };
  }

  function u8(str) { return new TextEncoder().encode(str); }

  function w16(arr, v) { arr.push(v & 0xFF, (v >>> 8) & 0xFF); }
  function w32(arr, v) { arr.push(v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF); }

  function build(files) {
    var parts = [], central = [], offset = 0;

    files.forEach(function (f) {
      var name = u8(f.name);
      var data = f.data;
      var crc = crc32(data);
      var dt = dosTime(f.date || new Date());

      var lh = [];
      w32(lh, 0x04034b50);           // Local file header signature
      w16(lh, 20);                   // Version needed
      w16(lh, 0x0800);               // Flags: UTF-8 Dateinamen
      w16(lh, 0);                    // Methode: stored
      w16(lh, dt.time); w16(lh, dt.date);
      w32(lh, crc);
      w32(lh, data.length);          // compressed size
      w32(lh, data.length);          // uncompressed size
      w16(lh, name.length);
      w16(lh, 0);                    // extra length
      var lhBuf = new Uint8Array(lh);
      parts.push(lhBuf, name, data);

      var cd = [];
      w32(cd, 0x02014b50);           // Central directory signature
      w16(cd, 20);                   // Version made by
      w16(cd, 20);                   // Version needed
      w16(cd, 0x0800);
      w16(cd, 0);
      w16(cd, dt.time); w16(cd, dt.date);
      w32(cd, crc);
      w32(cd, data.length);
      w32(cd, data.length);
      w16(cd, name.length);
      w16(cd, 0); w16(cd, 0);        // extra, comment
      w16(cd, 0);                    // disk number
      w16(cd, 0);                    // internal attrs
      w32(cd, 0);                    // external attrs
      w32(cd, offset);               // relative offset of local header
      central.push(new Uint8Array(cd), name);

      offset += lhBuf.length + name.length + data.length;
    });

    var cdSize = central.reduce(function (s, p) { return s + p.length; }, 0);
    var eocd = [];
    w32(eocd, 0x06054b50);
    w16(eocd, 0); w16(eocd, 0);
    w16(eocd, files.length); w16(eocd, files.length);
    w32(eocd, cdSize);
    w32(eocd, offset);
    w16(eocd, 0);

    return new Blob(parts.concat(central, [new Uint8Array(eocd)]), { type: 'application/zip' });
  }

  var api = { build: build, crc32: crc32 };
  if (typeof window !== 'undefined') window.ZIP = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
