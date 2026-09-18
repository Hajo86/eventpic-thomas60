/* ==========================================================================
   qr.js — minimaler QR-Code-Encoder (Byte-Modus, ECC-Level M, Version 1–6)
   --------------------------------------------------------------------------
   Reicht für URLs bis 106 Zeichen. Keine Abhängigkeiten, kein Fremddienst:
   die Event-URL verlässt das Gerät nicht.

   window.QR.matrix(text) -> { size, modules: boolean[size][size], version }
   window.QR.toCanvas(text, canvas, opts)
   ========================================================================== */
(function () {
  'use strict';

  // Gesamt-Codewörter und Blockaufteilung für ECC-Level M, Version 1..6.
  // [ [blockCount, codewordsPerBlock, dataCodewordsPerBlock], ... ]
  var SPEC = {
    1: { total: 26,  blocks: [[1, 26, 16]] },
    2: { total: 44,  blocks: [[1, 44, 28]] },
    3: { total: 70,  blocks: [[1, 70, 44]] },
    4: { total: 100, blocks: [[2, 50, 32]] },
    5: { total: 134, blocks: [[2, 67, 43]] },
    6: { total: 172, blocks: [[4, 43, 27]] },
  };
  // Restbits nach den Codewörtern (Tabelle der Norm): V1 = 0, V2..V6 = 7.
  var REMAINDER = { 1: 0, 2: 7, 3: 7, 4: 7, 5: 7, 6: 7 };
  // Format-Information (15 Bit, BCH-kodiert + maskiert) für Level M, Maske 0..7.
  var FORMAT_M = [0x5412, 0x5125, 0x5E7C, 0x5B4B, 0x45F9, 0x40CE, 0x4F97, 0x4AA0];

  /* ---------------------------- GF(256) --------------------------------- */
  var EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  (function initGF() {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      EXP[i] = x; LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11D;              // primitives Polynom x^8+x^4+x^3+x^2+1
    }
    for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
  })();
  function gmul(a, b) { return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]]; }

  // Generatorpolynom für n EC-Codewörter
  function genPoly(n) {
    var g = [1];
    for (var i = 0; i < n; i++) {
      var next = new Array(g.length + 1).fill(0);
      for (var j = 0; j < g.length; j++) {
        next[j] ^= g[j];
        next[j + 1] ^= gmul(g[j], EXP[i]);
      }
      g = next;
    }
    return g;
  }

  function ecCodewords(data, n) {
    var g = genPoly(n);
    var rem = new Array(n).fill(0);
    for (var i = 0; i < data.length; i++) {
      var factor = data[i] ^ rem[0];
      rem.shift(); rem.push(0);
      for (var j = 0; j < n; j++) rem[j] ^= gmul(g[j + 1], factor);
    }
    return rem;
  }

  /* --------------------------- Bitstream -------------------------------- */
  function utf8Bytes(str) {
    var out = [], enc = new TextEncoder().encode(str);
    for (var i = 0; i < enc.length; i++) out.push(enc[i]);
    return out;
  }

  function pickVersion(len) {
    for (var v = 1; v <= 6; v++) {
      var dataCw = SPEC[v].blocks.reduce(function (s, b) { return s + b[0] * b[2]; }, 0);
      if (Math.floor((dataCw * 8 - 12) / 8) >= len) return v;
    }
    throw new Error('Text zu lang für QR Version 6 (max. 106 Zeichen).');
  }

  function buildCodewords(bytes, version) {
    var dataCw = SPEC[version].blocks.reduce(function (s, b) { return s + b[0] * b[2]; }, 0);
    var bits = [];
    function push(val, n) { for (var i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); }
    push(0b0100, 4);              // Modus: Byte
    push(bytes.length, 8);        // Längenfeld (Version 1–9, Byte-Modus: 8 Bit)
    for (var i = 0; i < bytes.length; i++) push(bytes[i], 8);
    // Terminator
    var cap = dataCw * 8;
    for (var t = 0; t < 4 && bits.length < cap; t++) bits.push(0);
    while (bits.length % 8 !== 0) bits.push(0);
    var cws = [];
    for (var k = 0; k < bits.length; k += 8) {
      var b = 0;
      for (var m = 0; m < 8; m++) b = (b << 1) | bits[k + m];
      cws.push(b);
    }
    var pads = [0xEC, 0x11], p = 0;
    while (cws.length < dataCw) cws.push(pads[p++ % 2]);

    // In Blöcke teilen, EC berechnen, verschränken
    var dBlocks = [], eBlocks = [], pos = 0;
    SPEC[version].blocks.forEach(function (spec) {
      for (var n = 0; n < spec[0]; n++) {
        var d = cws.slice(pos, pos + spec[2]); pos += spec[2];
        dBlocks.push(d);
        eBlocks.push(ecCodewords(d, spec[1] - spec[2]));
      }
    });
    var out = [], maxD = Math.max.apply(null, dBlocks.map(function (b) { return b.length; }));
    for (var i2 = 0; i2 < maxD; i2++)
      dBlocks.forEach(function (b) { if (i2 < b.length) out.push(b[i2]); });
    var maxE = Math.max.apply(null, eBlocks.map(function (b) { return b.length; }));
    for (var i3 = 0; i3 < maxE; i3++)
      eBlocks.forEach(function (b) { if (i3 < b.length) out.push(b[i3]); });
    return out;
  }

  /* ---------------------------- Matrix ---------------------------------- */
  function emptyMatrix(size) {
    var m = [], f = [];
    for (var r = 0; r < size; r++) {
      m.push(new Array(size).fill(false));
      f.push(new Array(size).fill(false));
    }
    return { m: m, f: f };
  }

  function drawFunctionPatterns(M, size, version) {
    var m = M.m, f = M.f, i, j;
    function set(r, c, dark) { m[r][c] = dark; f[r][c] = true; }

    // Suchmuster + Trennlinien (8x8-Bereiche in drei Ecken)
    [[0, 0], [0, size - 7], [size - 7, 0]].forEach(function (o) {
      for (i = -1; i <= 7; i++) for (j = -1; j <= 7; j++) {
        var r = o[0] + i, c = o[1] + j;
        if (r < 0 || c < 0 || r >= size || c >= size) continue;
        var d = (i >= 0 && i <= 6 && (j === 0 || j === 6)) ||
                (j >= 0 && j <= 6 && (i === 0 || i === 6)) ||
                (i >= 2 && i <= 4 && j >= 2 && j <= 4);
        set(r, c, d);
      }
    });

    // Taktmuster
    for (i = 8; i < size - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }

    // Ausrichtungsmuster (Version 2–6: genau eines, unten rechts)
    if (version >= 2) {
      var cr = size - 7, cc = size - 7;
      for (i = -2; i <= 2; i++) for (j = -2; j <= 2; j++) {
        var mx = Math.max(Math.abs(i), Math.abs(j));
        set(cr + i, cc + j, mx !== 1);
      }
    }

    // Dunkles Modul + reservierter Formatbereich
    set(size - 8, 8, true);
    for (i = 0; i <= 8; i++) { if (!f[8][i]) set(8, i, false); if (!f[i][8]) set(i, 8, false); }
    for (i = size - 8; i < size; i++) { if (!f[8][i]) set(8, i, false); if (!f[i][8]) set(i, 8, false); }
  }

  function placeData(M, size, codewords, remainder) {
    var m = M.m, f = M.f;
    var bits = [];
    codewords.forEach(function (cw) { for (var i = 7; i >= 0; i--) bits.push((cw >>> i) & 1); });
    for (var r0 = 0; r0 < remainder; r0++) bits.push(0);

    var idx = 0, up = true;
    for (var col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--;                       // Taktspalte überspringen
      for (var k = 0; k < size; k++) {
        var row = up ? size - 1 - k : k;
        for (var c = 0; c < 2; c++) {
          var cc = col - c;
          if (!f[row][cc]) m[row][cc] = idx < bits.length ? bits[idx++] === 1 : false;
        }
      }
      up = !up;
    }
    return idx;
  }

  var MASKS = [
    function (i, j) { return (i + j) % 2 === 0; },
    function (i) { return i % 2 === 0; },
    function (i, j) { return j % 3 === 0; },
    function (i, j) { return (i + j) % 3 === 0; },
    function (i, j) { return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0; },
    function (i, j) { return ((i * j) % 2) + ((i * j) % 3) === 0; },
    function (i, j) { return (((i * j) % 2) + ((i * j) % 3)) % 2 === 0; },
    function (i, j) { return (((i + j) % 2) + ((i * j) % 3)) % 2 === 0; },
  ];

  function applyMask(M, size, maskNo) {
    for (var r = 0; r < size; r++) for (var c = 0; c < size; c++)
      if (!M.f[r][c] && MASKS[maskNo](r, c)) M.m[r][c] = !M.m[r][c];
  }

  function penalty(m, size) {
    var score = 0, r, c, run, i;
    // Regel 1: Läufe von 5+ gleichen Modulen
    function runs(get) {
      var s = 0;
      for (r = 0; r < size; r++) {
        run = 1;
        for (c = 1; c < size; c++) {
          if (get(r, c) === get(r, c - 1)) { run++; }
          else { if (run >= 5) s += 3 + (run - 5); run = 1; }
        }
        if (run >= 5) s += 3 + (run - 5);
      }
      return s;
    }
    score += runs(function (a, b) { return m[a][b]; });
    score += runs(function (a, b) { return m[b][a]; });
    // Regel 2: 2x2-Blöcke gleicher Farbe
    for (r = 0; r < size - 1; r++) for (c = 0; c < size - 1; c++) {
      var v = m[r][c];
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
    }
    // Regel 3: suchmusterähnliche Sequenzen
    var pat = [true, false, true, true, true, false, true];
    function hasPat(get, a, b) {
      for (i = 0; i < 7; i++) if (get(a, b + i) !== pat[i]) return false;
      return true;
    }
    function clear(get, a, b, len) {
      for (i = 0; i < len; i++) { if (b + i < 0 || b + i >= size) continue; if (get(a, b + i)) return false; }
      return true;
    }
    [function (a, b) { return m[a][b]; }, function (a, b) { return m[b][a]; }].forEach(function (get) {
      for (r = 0; r < size; r++) for (c = 0; c <= size - 7; c++) {
        if (!hasPat(get, r, c)) continue;
        if (clear(get, r, c - 4, 4) || clear(get, r, c + 7, 4)) score += 40;
      }
    });
    // Regel 4: Abweichung vom 50%-Dunkelanteil
    var dark = 0;
    for (r = 0; r < size; r++) for (c = 0; c < size; c++) if (m[r][c]) dark++;
    var pct = (dark * 100) / (size * size);
    score += Math.floor(Math.abs(pct - 50) / 5) * 10;
    return score;
  }

  function placeFormat(M, size, maskNo) {
    var bits = FORMAT_M[maskNo], i;
    function bit(n) { return ((bits >>> n) & 1) === 1; }
    function set(r, c, d) { M.m[r][c] = d; M.f[r][c] = true; }
    for (i = 0; i <= 5; i++) set(i, 8, bit(i));
    set(7, 8, bit(6));
    set(8, 8, bit(7));
    set(8, 7, bit(8));
    for (i = 9; i < 15; i++) set(8, 14 - i, bit(i));
    for (i = 0; i < 8; i++) set(8, size - 1 - i, bit(i));
    for (i = 8; i < 15; i++) set(size - 15 + i, 8, bit(i));
    set(size - 8, 8, true);
  }

  function matrix(text) {
    var bytes = utf8Bytes(text);
    var version = pickVersion(bytes.length);
    var size = version * 4 + 17;
    var codewords = buildCodewords(bytes, version);

    var best = null;
    for (var mask = 0; mask < 8; mask++) {
      var M = emptyMatrix(size);
      drawFunctionPatterns(M, size, version);
      placeData(M, size, codewords, REMAINDER[version]);
      applyMask(M, size, mask);
      placeFormat(M, size, mask);
      var p = penalty(M.m, size);
      if (!best || p < best.p) best = { p: p, M: M, mask: mask };
    }
    return { size: size, modules: best.M.m, version: version, mask: best.mask, codewords: codewords };
  }

  function toCanvas(text, canvas, opts) {
    opts = opts || {};
    var scale = opts.scale || 8, quiet = opts.quiet == null ? 4 : opts.quiet;
    var q = matrix(text), px = (q.size + quiet * 2) * scale;
    canvas.width = px; canvas.height = px;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = opts.light || '#ffffff';
    ctx.fillRect(0, 0, px, px);
    ctx.fillStyle = opts.dark || '#000000';
    for (var r = 0; r < q.size; r++) for (var c = 0; c < q.size; c++)
      if (q.modules[r][c]) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
    return q;
  }

  var api = { matrix: matrix, toCanvas: toCanvas, _spec: SPEC, _format: FORMAT_M, _remainder: REMAINDER };
  if (typeof window !== 'undefined') window.QR = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
