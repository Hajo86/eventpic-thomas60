/* ==========================================================================
   app.js — Fotoaufgaben-App „Thomas wird 60"
   Vanilla JS, kein Build. Backend: Supabase REST (optional).
   Ohne Supabase-Zugangsdaten läuft alles im Demo-Modus lokal im Gerät.
   ========================================================================== */
(function () {
  'use strict';

  /* ======================= 1. Hilfsfunktionen ============================ */
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var view = $('#view');

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function uid() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
  var toastTimer = null;
  function toast(msg, ms) {
    var old = $('.toast'); if (old) old.remove();
    var t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg; t.setAttribute('role', 'status');
    document.body.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.remove(); }, ms || 2600);
  }
  function relTime(iso) {
    var d = new Date(iso), s = (Date.now() - d.getTime()) / 1000;
    if (isNaN(s)) return '';
    if (s < 60) return 'gerade eben';
    if (s < 3600) return Math.floor(s / 60) + ' Min.';
    if (s < 86400) return Math.floor(s / 3600) + ' Std.';
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  }
  function clockTime(iso) {
    var d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }
  function safeName(s) {
    return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'Gast';
  }

  /* ======================= 2. Konfiguration ============================== */
  var LS = {
    guest: 'ep.guest', token: 'ep.token', consent: 'ep.consent',
    sb: 'ep.sb', pin: 'ep.pin', cfg: 'ep.cfg', mine: 'ep.mine',
  };
  function lsGet(k, fb) {
    try { var v = localStorage.getItem(k); return v == null ? fb : JSON.parse(v); }
    catch (e) { return fb; }
  }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  var CFG = Object.assign({}, window.EVENT, lsGet(LS.cfg, {}));
  var TASKS = (window.TASKS || []).filter(function (t) { return !t.off; });
  var CATS = window.CATEGORIES || [];
  function cat(id) {
    for (var i = 0; i < CATS.length; i++) if (CATS[i].id === id) return CATS[i];
    return { id: id, label: id, icon: '📷' };
  }
  function task(id) {
    for (var i = 0; i < TASKS.length; i++) if (TASKS[i].id === id) return TASKS[i];
    return null;
  }
  function applyCfg() {
    document.documentElement.style.setProperty('--accent', CFG.accent || '#c8102e');
    var m = document.querySelector('meta[name=theme-color]');
    if (m) m.setAttribute('content', CFG.accent || '#c8102e');
    document.title = (CFG.title || 'Fotoaufgaben') + ' – Fotoaufgaben';
    $('#hTitle').textContent = CFG.title || 'Fotoaufgaben';
  }

  /* ======================= 3. Gast ======================================= */
  var guest = lsGet(LS.guest, '');
  var ownerToken = lsGet(LS.token, '');
  if (!ownerToken) { ownerToken = uid(); lsSet(LS.token, ownerToken); }

  /* ======================= 4. IndexedDB ================================== */
  var DB_NAME = 'eventpic', DB_VER = 1, dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      var r = indexedDB.open(DB_NAME, DB_VER);
      r.onupgradeneeded = function () {
        var d = r.result;
        if (!d.objectStoreNames.contains('queue')) d.createObjectStore('queue', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('local')) d.createObjectStore('local', { keyPath: 'id' });
      };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    return dbp;
  }
  function tx(store, mode, fn) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction(store, mode), s = t.objectStore(store), out;
        out = fn(s);
        t.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); };
        t.onerror = function () { rej(t.error); };
      });
    });
  }
  var idb = {
    put: function (store, obj) { return tx(store, 'readwrite', function (s) { s.put(obj); return obj; }); },
    del: function (store, id) { return tx(store, 'readwrite', function (s) { s.delete(id); }); },
    all: function (store) { return tx(store, 'readonly', function (s) { return s.getAll(); }); },
    get: function (store, id) { return tx(store, 'readonly', function (s) { return s.get(id); }); },
  };

  /* ======================= 5. Supabase (REST) ============================ */
  var SB = lsGet(LS.sb, { url: '', key: '', bucket: 'eventpic' });
  function online() { return !!(SB.url && SB.key); }
  function sbUrl(p) { return String(SB.url).replace(/\/+$/, '') + p; }
  function sbHeaders(extra) {
    return Object.assign({ apikey: SB.key, Authorization: 'Bearer ' + SB.key }, extra || {});
  }
  function publicUrl(path) {
    return sbUrl('/storage/v1/object/public/' + encodeURIComponent(SB.bucket || 'eventpic') + '/' +
      path.split('/').map(encodeURIComponent).join('/'));
  }
  function sbFetch(path, opts) {
    return fetch(sbUrl(path), opts).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error(r.status + ' ' + t.slice(0, 200)); });
      return r.status === 204 ? null : r.json().catch(function () { return null; });
    });
  }
  var api = {
    list: function (limit) {
      var q = '/rest/v1/event_photos?select=*&event_id=eq.' + encodeURIComponent(CFG.eventId) +
        '&hidden=is.false&order=created_at.desc&limit=' + (limit || 400);
      return sbFetch(q, { headers: sbHeaders() });
    },
    insert: function (row) {
      return sbFetch('/rest/v1/event_photos', {
        method: 'POST',
        headers: sbHeaders({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
        body: JSON.stringify(row),
      }).then(function (r) { return Array.isArray(r) ? r[0] : r; });
    },
    upload: function (path, blob) {
      return fetch(sbUrl('/storage/v1/object/' + encodeURIComponent(SB.bucket || 'eventpic') + '/' +
        path.split('/').map(encodeURIComponent).join('/')), {
        method: 'POST',
        headers: sbHeaders({ 'Content-Type': 'image/jpeg', 'x-upsert': 'true', 'cache-control': '3600' }),
        body: blob,
      }).then(function (r) {
        if (!r.ok) return r.text().then(function (t) { throw new Error('Upload ' + r.status + ' ' + t.slice(0, 160)); });
        return true;
      });
    },
    rpc: function (name, args) {
      return sbFetch('/rest/v1/rpc/' + name, {
        method: 'POST',
        headers: sbHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(args || {}),
      });
    },
  };

  /* ======================= 6. Zustand ==================================== */
  var state = {
    photos: [],          // Fotos aus dem Backend (oder lokal im Demo-Modus)
    queue: [],           // wartende Uploads
    mine: lsGet(LS.mine, {}),   // { taskId: anzahl } – für die Fortschrittsanzeige
    urls: {},            // objectURL-Cache für Demo-Fotos
    lastFetch: 0,
    fetchError: '',
    admin: false,
  };
  function myCount(taskId) { return state.mine[taskId] || 0; }
  function markMine(taskId) {
    state.mine[taskId] = (state.mine[taskId] || 0) + 1;
    lsSet(LS.mine, state.mine);
  }
  function doneCount() { return Object.keys(state.mine).filter(function (k) { return state.mine[k] > 0; }).length; }
  function countFor(taskId) {
    var n = 0;
    for (var i = 0; i < state.photos.length; i++) if (state.photos[i].task_id === taskId) n++;
    return n;
  }
  function photoUrl(p) {
    if (p.demo) {
      if (state.urls[p.id]) return state.urls[p.id];
      return '';
    }
    return publicUrl(p.path);
  }

  /* ======================= 7. Fotos laden ================================ */
  function loadDemoPhotos() {
    return idb.all('local').then(function (rows) {
      rows.sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; });
      rows.forEach(function (r) {
        if (!state.urls[r.id] && r.blob) state.urls[r.id] = URL.createObjectURL(r.blob);
      });
      state.photos = rows.map(function (r) {
        return {
          id: r.id, task_id: r.task_id, guest_name: r.guest_name, caption: r.caption,
          created_at: r.created_at, demo: true, path: '',
        };
      });
    });
  }
  function refresh(force) {
    if (!online()) return loadDemoPhotos().then(render);
    if (!force && Date.now() - state.lastFetch < 4000) return Promise.resolve();
    state.lastFetch = Date.now();
    return api.list().then(function (rows) {
      state.photos = rows || [];
      state.fetchError = '';
      render();
    }).catch(function (e) {
      state.fetchError = e.message;
      render();
    });
  }

  /* ======================= 8. Komprimierung ============================== */
  function loadImage(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () {
        return createImageBitmap(file);
      }).catch(fallback);
    }
    return fallback();
    function fallback() {
      return new Promise(function (res, rej) {
        var url = URL.createObjectURL(file), im = new Image();
        im.onload = function () { res(im); };
        im.onerror = function () { URL.revokeObjectURL(url); rej(new Error('Bild konnte nicht gelesen werden.')); };
        im.src = url;
      });
    }
  }
  // Zeichnet neu auf ein Canvas → EXIF (inkl. GPS) ist danach zwangsläufig weg.
  function compress(file) {
    if (!/^image\//.test(file.type || '')) {
      return Promise.reject(new Error('Das ist kein Bild. Bitte ein Foto auswählen.'));
    }
    if (file.size > 40 * 1024 * 1024) {
      return Promise.reject(new Error('Das Bild ist zu groß (über 40 MB).'));
    }
    return loadImage(file).then(function (img) {
      var w = img.width, h = img.height, max = CFG.maxEdge || 1600;
      var scale = Math.min(1, max / Math.max(w, h));
      var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
      var c = document.createElement('canvas');
      c.width = cw; c.height = ch;
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cw, ch);
      ctx.drawImage(img, 0, 0, cw, ch);
      if (img.close) img.close();
      return new Promise(function (res, rej) {
        c.toBlob(function (b) {
          if (!b) return rej(new Error('Foto konnte nicht verarbeitet werden.'));
          res({ blob: b, width: cw, height: ch });
        }, 'image/jpeg', CFG.jpegQuality || 0.82);
      });
    });
  }

  /* ======================= 9. Upload + Warteschlange ===================== */
  function enqueue(item) {
    state.queue.push(item.id);
    return idb.put('queue', item).then(function () { return flush(); });
  }

  var flushing = false;
  function flush() {
    if (flushing) return Promise.resolve();
    flushing = true;
    return idb.all('queue').then(function (items) {
      state.queue = items.map(function (i) { return i.id; });
      if (!items.length) return;
      if (!online()) {
        // Demo-Modus: Warteschlange in die lokale Galerie überführen
        return items.reduce(function (p, it) {
          return p.then(function () {
            return idb.put('local', it).then(function () { return idb.del('queue', it.id); });
          });
        }, Promise.resolve()).then(function () {
          state.queue = [];
          return loadDemoPhotos();
        });
      }
      if (!navigator.onLine) return;
      return items.reduce(function (p, it) {
        return p.then(function () {
          var path = CFG.eventId + '/' + it.task_id + '/' + it.id + '.jpg';
          return api.upload(path, it.blob).then(function () {
            return api.insert({
              id: it.id, event_id: CFG.eventId, task_id: it.task_id,
              guest_name: it.guest_name || null, caption: it.caption || null,
              path: path, owner_token: it.owner_token, width: it.width, height: it.height,
            });
          }).then(function () {
            return idb.del('queue', it.id);
          }).catch(function (e) {
            it.error = e.message; it.tries = (it.tries || 0) + 1;
            return idb.put('queue', it);
          });
        });
      }, Promise.resolve());
    }).then(function () {
      return idb.all('queue');
    }).then(function (rest) {
      state.queue = rest.map(function (i) { return i.id; });
      flushing = false;
      return refresh(true);
    }).catch(function (e) {
      flushing = false;
      console.warn('flush', e);
    });
  }

  window.addEventListener('online', function () { toast('Wieder online – Fotos werden gesendet.'); flush(); });

  /* ======================= 10. Fortschrittsring ========================== */
  function renderRing() {
    var done = doneCount(), total = TASKS.length;
    var pct = total ? done / total : 0, r = 20, c = 2 * Math.PI * r;
    $('#hRing').innerHTML =
      '<svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true">' +
      '<circle cx="24" cy="24" r="' + r + '" fill="none" stroke="var(--line)" stroke-width="5"/>' +
      '<circle cx="24" cy="24" r="' + r + '" fill="none" stroke="var(--accent)" stroke-width="5"' +
      ' stroke-linecap="round" stroke-dasharray="' + c.toFixed(1) + '"' +
      ' stroke-dashoffset="' + (c * (1 - pct)).toFixed(1) + '"/></svg>' +
      '<b>' + done + '/' + total + '</b>';
    $('#hSub').textContent = done === 0
      ? String(CFG.subtitle || 'Mach mit!').replace('{n}', total)
      : done + ' von ' + total + ' Aufgaben erledigt';
  }

  /* ======================= 11. Ansichten ================================= */
  var route = { name: 'tasks', arg: '' };
  var filter = { mode: 'open', cat: '' };

  function statusBanner() {
    var h = '';
    if (!online()) {
      h += '<div class="banner">Demo-Modus: Es sind keine Zugangsdaten hinterlegt. ' +
        'Fotos bleiben nur auf diesem Gerät. <a href="#/admin">Einrichten</a></div>';
    } else if (state.fetchError) {
      h += '<div class="banner">Die Galerie konnte nicht geladen werden. Wir versuchen es weiter.</div>';
    }
    if (state.queue.length) {
      h += '<div class="banner info"><span class="sp"></span> ' + state.queue.length +
        (state.queue.length === 1 ? ' Foto wartet' : ' Fotos warten') + ' auf Versand – das läuft automatisch weiter.</div>';
    }
    return h;
  }

  /* ---- Start / Onboarding ---- */
  function viewStart() {
    view.innerHTML =
      '<div style="padding:22px 0 8px">' +
      '<div class="big-num">60</div>' +
      '<h1 style="margin:10px 0 4px">Willkommen!</h1>' +
      '<p style="color:var(--muted)">Heute feiert <b>' + esc(CFG.honoree || 'unser Geburtstagskind') + '</b> seinen 60. ' +
      'Du bist heute Fotograf:in. Wir haben <b>' + TASKS.length + ' Fotoaufgaben</b> vorbereitet – ' +
      'mach mit, so viel du magst.</p>' +
      '<label class="f" for="gname">Wie heißt du?</label>' +
      '<input id="gname" type="text" autocomplete="given-name" maxlength="24" placeholder="Vorname" value="' + esc(guest) + '">' +
      '<div class="hint">Damit Thomas später sieht, von wem die Fotos sind. Du kannst das Feld auch leer lassen.</div>' +
      '<div class="card" style="padding:14px;margin:18px 0;font-size:.85rem;color:var(--muted)">' +
      '<b style="color:var(--ink)">Kurz zum Datenschutz</b>' +
      '<p>Deine Fotos landen in der Galerie dieses Fests und sind für alle Gäste sichtbar, die den Link haben. ' +
      'Sie sind die Erinnerung für Thomas – und werden nicht weiterverwendet.</p>' +
      '<p>Gespeichert werden nur das Foto, die Aufgabe, dein Vorname und die Uhrzeit. ' +
      'Standortdaten entfernen wir automatisch. Eigene Fotos kannst du jederzeit wieder löschen.</p>' +
      '<p><b style="color:var(--ink)">Kinderfotos</b> bitte nur mit Einverständnis der Eltern hochladen.</p>' +
      '</div>' +
      '<button class="btn" id="go">Los geht\'s</button>' +
      '</div>';
    $('#go').onclick = function () {
      guest = ($('#gname').value || '').trim().slice(0, 24);
      lsSet(LS.guest, guest);
      lsSet(LS.consent, new Date().toISOString());
      go('#/tasks');
    };
  }

  /* ---- Aufgabenliste ---- */
  function viewTasks() {
    var open = TASKS.filter(function (t) { return !myCount(t.id); });
    var h = statusBanner();

    h += '<div class="filters" id="fl">' +
      '<button data-m="open" aria-pressed="' + (filter.mode === 'open') + '">Noch offen</button>' +
      '<button data-m="all" aria-pressed="' + (filter.mode === 'all') + '">Alle ' + TASKS.length + '</button>' +
      '<button data-m="done" aria-pressed="' + (filter.mode === 'done') + '">Von mir</button>' +
      CATS.map(function (c) {
        return '<button data-c="' + c.id + '" aria-pressed="' + (filter.cat === c.id) + '">' +
          c.icon + ' ' + esc(c.label) + '</button>';
      }).join('') +
      '</div>';

    if (open.length) {
      h += '<button class="btn sec2" id="rnd" style="margin:8px 0">🎲 Überrasch mich – zufällige Aufgabe</button>';
    }

    var list = TASKS.filter(function (t) {
      if (filter.cat && t.cat !== filter.cat) return false;
      if (filter.mode === 'open') return !myCount(t.id);
      if (filter.mode === 'done') return myCount(t.id) > 0;
      return true;
    });

    if (!list.length) {
      h += '<div class="empty"><div class="big">🎉</div>' +
        (filter.mode === 'done'
          ? 'Du hast noch keine Aufgabe erledigt. Fang mit einer einfachen an!'
          : 'Hier ist gerade nichts offen. Schau in „Alle" – oder mach einfach noch ein Foto.') +
        '</div>';
    } else {
      var groups = {};
      list.forEach(function (t) { (groups[t.cat] = groups[t.cat] || []).push(t); });
      CATS.forEach(function (c) {
        var g = groups[c.id]; if (!g) return;
        var gdone = g.filter(function (t) { return myCount(t.id); }).length;
        h += '<div class="sec"><h2>' + c.icon + ' ' + esc(c.label) + '</h2>' +
          '<span class="n">' + gdone + '/' + g.length + '</span></div>';
        g.forEach(function (t) { h += taskCard(t, c); });
      });
    }
    h += '<footer class="mini">' + esc(CFG.title || '') +
      ' · <a href="#/info">Info &amp; Datenschutz</a></footer>';
    view.innerHTML = h;

    Array.prototype.forEach.call(view.querySelectorAll('#fl button'), function (b) {
      b.onclick = function () {
        if (b.dataset.m) { filter.mode = b.dataset.m; }
        else { filter.cat = (filter.cat === b.dataset.c) ? '' : b.dataset.c; }
        render();
      };
    });
    var rnd = $('#rnd');
    if (rnd) rnd.onclick = function () { go('#/task/' + open[Math.floor(Math.random() * open.length)].id); };
    bindTaskCards();
  }

  function taskCard(t, c) {
    var mine = myCount(t.id), total = countFor(t.id);
    return '<button class="task' + (mine ? ' done' : '') + '" data-task="' + t.id + '">' +
      '<span class="ic">' + (t.icon || c.icon) + '</span>' +
      '<span class="tx"><span class="t">' + esc(t.text) + '</span>' +
      '<span class="meta">' +
      (c.timed ? '<span class="pill timed">⏱ nur beim Programmpunkt</span>' : '') +
      (total ? '<span class="pill cnt">' + total + ' Foto' + (total === 1 ? '' : 's') + '</span>' : '<span class="pill">noch kein Foto</span>') +
      (mine ? '<span class="pill">von dir: ' + mine + '</span>' : '') +
      '</span></span>' +
      '<span class="chk">' + (mine ? '✓' : '') + '</span>' +
      '</button>';
  }
  function bindTaskCards() {
    Array.prototype.forEach.call(view.querySelectorAll('[data-task]'), function (b) {
      b.onclick = function () { go('#/task/' + b.dataset.task); };
    });
  }

  /* ---- Einzelne Aufgabe: Foto machen ---- */
  var pending = null;   // { blob, width, height, url }
  function viewTask(id) {
    var t = task(id);
    if (!t) { go('#/tasks'); return; }
    var c = cat(t.cat), mine = myCount(t.id);
    var photos = state.photos.filter(function (p) { return p.task_id === id; });

    var h = '<button class="btn ghost" id="back" style="margin:10px 0 0">‹ Alle Aufgaben</button>' +
      '<div class="card" style="padding:18px;margin:8px 0 14px">' +
      '<div class="pill">' + (t.icon || c.icon) + ' ' + esc(c.label) + (c.timed ? ' · nur beim Programmpunkt' : '') + '</div>' +
      '<h2 style="margin:10px 0 0">' + esc(t.text) + '</h2>' +
      (mine ? '<div class="hint">✓ Du hast dazu schon ' + mine + ' Foto' + (mine === 1 ? '' : 's') + ' beigesteuert.</div>' : '') +
      '</div>';

    if (pending) {
      h += '<img class="preview" id="pv" alt="Vorschau deines Fotos">' +
        '<label class="f" for="cap">Kurzer Kommentar (optional)</label>' +
        '<input id="cap" type="text" maxlength="140" placeholder="z.B. „kurz vor dem Anstoßen"">' +
        '<div class="row" style="margin:14px 0 6px">' +
        '<button class="btn sec2" id="drop">Verwerfen</button>' +
        '<button class="btn" id="send">Absenden</button></div>';
    } else {
      h += '<label class="btn" for="cam">📷 Foto aufnehmen</label>' +
        '<input id="cam" type="file" accept="image/*" capture="environment" class="hidden">' +
        '<label class="btn sec2" for="pick" style="margin-top:10px">🖼️ Aus der Galerie wählen</label>' +
        '<input id="pick" type="file" accept="image/*" class="hidden">';
    }

    if (photos.length) {
      h += '<div class="sec"><h2>Schon da</h2><span class="n">' + photos.length + '</span></div><div class="grid">' +
        photos.map(function (p, i) { return figureFor(p, i); }).join('') + '</div>';
    }
    view.innerHTML = h;
    if (photos.length) bindFigures(photos);

    $('#back').onclick = function () { pending = null; go('#/tasks'); };

    if (pending) {
      $('#pv').src = pending.url;
      $('#drop').onclick = function () { clearPending(); render(); };
      $('#send').onclick = function () {
        var btn = this;
        btn.disabled = true; btn.innerHTML = '<span class="sp"></span> Wird gesendet';
        var item = {
          id: uid(), task_id: id, blob: pending.blob, width: pending.width, height: pending.height,
          guest_name: guest || null, caption: ($('#cap').value || '').trim().slice(0, 140) || null,
          owner_token: ownerToken, created_at: new Date().toISOString(), tries: 0,
        };
        clearPending();
        markMine(id);
        enqueue(item).then(function () {
          toast(online() ? 'Danke! Dein Foto ist in der Galerie. 🎉' : 'Foto gespeichert (Demo-Modus).');
          go('#/tasks');
        }).catch(function (e) {
          toast('Konnte nicht gespeichert werden: ' + e.message, 4200);
          render();
        });
      };
    } else {
      ['cam', 'pick'].forEach(function (k) {
        var inp = $('#' + k);
        if (!inp) return;
        inp.onchange = function () {
          var f = inp.files && inp.files[0];
          inp.value = '';
          if (!f) return;
          toast('Foto wird vorbereitet …', 1500);
          compress(f).then(function (r) {
            clearPending();
            pending = { blob: r.blob, width: r.width, height: r.height, url: URL.createObjectURL(r.blob) };
            render();
          }).catch(function (e) { toast(e.message, 4200); });
        };
      });
    }
  }
  function clearPending() {
    if (pending && pending.url) URL.revokeObjectURL(pending.url);
    pending = null;
  }

  /* ---- Galerie ---- */
  var galFilter = { cat: '', guest: '' };
  function viewGallery() {
    var photos = state.photos.filter(function (p) {
      var t = task(p.task_id);
      if (galFilter.cat && (!t || t.cat !== galFilter.cat)) return false;
      if (galFilter.guest && (p.guest_name || 'Anonym') !== galFilter.guest) return false;
      return true;
    });
    var guests = {};
    state.photos.forEach(function (p) { guests[p.guest_name || 'Anonym'] = (guests[p.guest_name || 'Anonym'] || 0) + 1; });
    var names = Object.keys(guests).sort(function (a, b) { return guests[b] - guests[a]; });

    var h = statusBanner() +
      '<div class="sec"><h2>Live-Galerie</h2><span class="n">' + state.photos.length + ' Fotos</span></div>' +
      '<div class="filters" id="gf">' +
      '<button data-c="" aria-pressed="' + (!galFilter.cat) + '">Alle</button>' +
      CATS.map(function (c) {
        return '<button data-c="' + c.id + '" aria-pressed="' + (galFilter.cat === c.id) + '">' + c.icon + ' ' + esc(c.label) + '</button>';
      }).join('') + '</div>';

    if (names.length > 1) {
      h += '<div class="filters" id="gg">' +
        '<button data-g="" aria-pressed="' + (!galFilter.guest) + '">Alle Gäste</button>' +
        names.slice(0, 24).map(function (n) {
          return '<button data-g="' + esc(n) + '" aria-pressed="' + (galFilter.guest === n) + '">' + esc(n) + ' · ' + guests[n] + '</button>';
        }).join('') + '</div>';
    }

    if (!photos.length) {
      h += '<div class="empty"><div class="big">📷</div>Noch keine Fotos in dieser Auswahl.<br>Sei der erste!</div>';
    } else {
      h += '<div class="grid">' + photos.map(function (p, i) { return figureFor(p, i); }).join('') + '</div>';
    }
    if (CFG.showLeaderboard && names.length > 1) {
      h += '<div class="sec"><h2>🏅 Fleißigste Fotografen</h2></div><div class="list">' +
        names.slice(0, 10).map(function (n, i) {
          return '<div class="it"><div style="width:24px;text-align:center;font-weight:800;color:var(--muted)">' + (i + 1) + '</div>' +
            '<div class="g"><div class="t">' + esc(n) + '</div><div class="m">' + guests[n] + ' Fotos</div></div></div>';
        }).join('') + '</div>';
    }
    h += '<footer class="mini"><a href="#/slideshow">Slideshow für den Fernseher</a> · <a href="#/info">Info</a></footer>';
    view.innerHTML = h;

    Array.prototype.forEach.call(view.querySelectorAll('#gf button'), function (b) {
      b.onclick = function () { galFilter.cat = b.dataset.c; render(); };
    });
    Array.prototype.forEach.call(view.querySelectorAll('#gg button'), function (b) {
      b.onclick = function () { galFilter.guest = b.dataset.g; render(); };
    });
    bindFigures(photos);
  }

  /* ---- Meine Fotos ---- */
  function viewMe() {
    // Im Demo-Modus liegen ohnehin nur die eigenen Fotos auf dem Gerät.
    var mine = state.photos.filter(function (p) { return p.demo || p.owner_token === ownerToken; });
    var h = statusBanner() +
      '<div class="sec"><h2>Meine Fotos</h2><span class="n">' + mine.length + '</span></div>';
    h += '<div class="card" style="padding:14px;margin:6px 0 12px">' +
      '<div style="display:flex;align-items:center;gap:12px">' +
      '<div style="flex:1"><b>' + esc(guest || 'Anonym') + '</b>' +
      '<div class="hint" style="margin:2px 0 0">' + doneCount() + ' von ' + TASKS.length + ' Aufgaben erledigt</div></div>' +
      '<button class="btn sm sec2" id="rename">Name ändern</button></div>' +
      '<div class="prog"><i style="width:' + Math.round(100 * doneCount() / Math.max(1, TASKS.length)) + '%"></i></div>' +
      '</div>';
    if (!mine.length) {
      h += '<div class="empty"><div class="big">🙂</div>Noch kein Foto von dir.<br>' +
        '<a href="#/tasks">Zu den Aufgaben</a></div>';
    } else {
      h += '<div class="list">' + mine.map(function (p) {
        var t = task(p.task_id);
        return '<div class="it"><img loading="lazy" src="' + esc(photoUrl(p)) + '" alt="">' +
          '<div class="g"><div class="t">' + esc(t ? t.text : p.task_id) + '</div>' +
          '<div class="m">' + clockTime(p.created_at) + (p.caption ? ' · ' + esc(p.caption) : '') + '</div></div>' +
          '<button class="btn sm sec2" data-del="' + esc(p.id) + '">Löschen</button></div>';
      }).join('') + '</div>';
    }
    h += '<footer class="mini"><a href="#/info">Info &amp; Datenschutz</a> · <a href="#/admin">Gastgeber</a></footer>';
    view.innerHTML = h;

    $('#rename').onclick = function () {
      var n = prompt('Wie heißt du?', guest || '');
      if (n != null) { guest = n.trim().slice(0, 24); lsSet(LS.guest, guest); render(); }
    };
    Array.prototype.forEach.call(view.querySelectorAll('[data-del]'), function (b) {
      b.onclick = function () {
        if (!confirm('Dieses Foto wirklich löschen?')) return;
        deleteOwn(b.dataset.del);
      };
    });
  }
  function deleteOwn(id) {
    var p = state.photos.filter(function (x) { return x.id === id; })[0];
    var after = function () {
      if (p && state.mine[p.task_id]) {
        state.mine[p.task_id]--;
        if (state.mine[p.task_id] <= 0) delete state.mine[p.task_id];
        lsSet(LS.mine, state.mine);
      }
      toast('Foto gelöscht.');
      refresh(true);
    };
    if (!online()) {
      idb.del('local', id).then(function () {
        if (state.urls[id]) { URL.revokeObjectURL(state.urls[id]); delete state.urls[id]; }
        return loadDemoPhotos();
      }).then(after);
      return;
    }
    api.rpc('ep_delete_own_photo', { p_id: id, p_token: ownerToken }).then(after).catch(function (e) {
      toast('Löschen fehlgeschlagen: ' + e.message, 4200);
    });
  }

  /* ---- Info ---- */
  function viewInfo() {
    view.innerHTML =
      '<button class="btn ghost" id="back" style="margin:10px 0">‹ Zurück</button>' +
      '<h2>' + esc(CFG.title || 'Fotoaufgaben') + '</h2>' +
      '<p>Diese Seite sammelt die Fotos aller Gäste an einem Ort – als Geschenk für ' +
      esc(CFG.honoree || 'das Geburtstagskind') + '.</p>' +
      '<div class="card" style="padding:16px;margin:14px 0">' +
      '<h3>So funktioniert es</h3>' +
      '<p>1. Aufgabe aussuchen · 2. Foto machen · 3. Absenden. Fertig.</p>' +
      '<p>Du musst nichts installieren und dich nicht anmelden. Kein Netz? Kein Problem – ' +
      'dein Foto wird gespeichert und automatisch nachgesendet.</p>' +
      '</div>' +
      '<div class="card" style="padding:16px;margin:14px 0">' +
      '<h3>Datenschutz in Kurzform</h3>' +
      '<p>Gespeichert werden: das Foto, die Aufgabe, dein Vorname (freiwillig), ein optionaler ' +
      'Kommentar und die Uhrzeit. Sonst nichts – keine Adresse, keine E-Mail, kein Tracking.</p>' +
      '<p>Standort- und Kameradaten (EXIF) werden bereits auf deinem Handy entfernt, bevor das ' +
      'Foto gesendet wird.</p>' +
      '<p>Die Galerie ist nicht öffentlich: erreichbar nur über den Link bzw. QR-Code dieses Fests, ' +
      'und für Suchmaschinen gesperrt.</p>' +
      '<p>Eigene Fotos kannst du unter „Meine Fotos" jederzeit löschen. Nach dem Fest werden ' +
      'die Fotos an ' + esc(CFG.honoree || 'das Geburtstagskind') + ' übergeben und hier gelöscht.</p>' +
      '<p><b>Kinderfotos</b> bitte nur mit Einverständnis der Eltern hochladen. Wer nicht ' +
      'fotografiert werden möchte, sagt es einfach – das wird respektiert.</p>' +
      '</div>' +
      '<footer class="mini"><a href="#/admin">Bereich für den Gastgeber</a></footer>';
    $('#back').onclick = function () { history.length > 1 ? history.back() : go('#/tasks'); };
  }

  /* ---- Lightbox ---- */
  function figureFor(p, i) {
    var t = task(p.task_id);
    return '<figure data-i="' + i + '">' +
      '<img loading="lazy" decoding="async" src="' + esc(photoUrl(p)) + '" alt="' + esc(t ? t.text : '') + '">' +
      '<figcaption class="who">' + esc(p.guest_name || 'Anonym') + '</figcaption></figure>';
  }
  function bindFigures(arr) {
    Array.prototype.forEach.call(view.querySelectorAll('figure[data-i]'), function (f) {
      f.onclick = function () { lightbox(arr, +f.dataset.i); };
    });
  }
  function lightbox(arr, idx) {
    var box = document.createElement('div');
    box.className = 'lb';
    document.body.appendChild(box);
    var i = idx;
    function draw() {
      var p = arr[i], t = task(p.task_id);
      box.innerHTML =
        '<button class="x" aria-label="Schließen">✕</button>' +
        '<div class="im"><img src="' + esc(photoUrl(p)) + '" alt="' + esc(t ? t.text : '') + '"></div>' +
        (i > 0 ? '<button class="nav l" aria-label="Vorheriges">‹</button>' : '') +
        (i < arr.length - 1 ? '<button class="nav r" aria-label="Nächstes">›</button>' : '') +
        '<div class="bar"><div class="t">' + esc(t ? t.text : p.task_id) + '</div>' +
        '<div class="m">' + esc(p.guest_name || 'Anonym') + ' · ' + relTime(p.created_at) +
        (p.caption ? ' · „' + esc(p.caption) + '"' : '') + '</div>' +
        '<div class="row" style="margin-top:10px">' +
        '<button class="btn sm sec2" data-share>Teilen / Speichern</button>' +
        (p.owner_token === ownerToken || p.demo ? '<button class="btn sm sec2" data-del>Löschen</button>' : '') +
        (state.admin ? '<button class="btn sm sec2" data-hide>Verbergen</button>' : '') +
        '</div></div>';
      box.querySelector('.x').onclick = close;
      var l = box.querySelector('.nav.l'), r = box.querySelector('.nav.r');
      if (l) l.onclick = function () { i--; draw(); };
      if (r) r.onclick = function () { i++; draw(); };
      box.querySelector('[data-share]').onclick = function () { sharePhoto(p); };
      var d = box.querySelector('[data-del]');
      if (d) d.onclick = function () { if (confirm('Dieses Foto löschen?')) { close(); deleteOwn(p.id); } };
      var hd = box.querySelector('[data-hide]');
      if (hd) hd.onclick = function () { close(); adminHide(p.id, true); };
    }
    function close() { document.removeEventListener('keydown', key); box.remove(); }
    function key(e) {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft' && i > 0) { i--; draw(); }
      if (e.key === 'ArrowRight' && i < arr.length - 1) { i++; draw(); }
    }
    document.addEventListener('keydown', key);
    // Wischen
    var x0 = null;
    box.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    box.addEventListener('touchend', function (e) {
      if (x0 == null) return;
      var dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (dx < -50 && i < arr.length - 1) { i++; draw(); }
      if (dx > 50 && i > 0) { i--; draw(); }
    }, { passive: true });
    draw();
  }
  function sharePhoto(p) {
    var url = photoUrl(p);
    if (p.demo) {
      var a = document.createElement('a');
      a.href = url; a.download = 'foto.jpg'; a.click();
      return;
    }
    if (navigator.share) {
      navigator.share({ title: CFG.title, url: url }).catch(function () {});
    } else {
      window.open(url, '_blank');
    }
  }

  /* ---- Slideshow ---- */
  var slide = { timer: null, i: -1, lock: null, shown: [] };
  function viewSlideshow() {
    document.body.classList.add('slideshow');
    $('#appHeader').classList.add('hidden');
    $('#tabs').classList.add('hidden');
    var host = document.createElement('div');
    host.id = 'slideshow';
    host.innerHTML =
      '<div class="stage"><img id="sA" alt=""><img id="sB" alt=""></div>' +
      '<div class="cap"><div class="txt"><div class="t" id="sT">Warte auf Fotos …</div>' +
      '<div class="m" id="sM"></div></div>' +
      '<div class="brand">' + esc(CFG.title || '') + (CFG.dateLabel ? ' · ' + esc(CFG.dateLabel) : '') + '</div></div>';
    document.body.appendChild(host);
    host.onclick = function () { if (confirm('Slideshow beenden?')) go('#/gallery'); };

    if (navigator.wakeLock && navigator.wakeLock.request) {
      navigator.wakeLock.request('screen').then(function (l) { slide.lock = l; }).catch(function () {});
    }
    var which = true;
    function step() {
      if (!state.photos.length) return;
      slide.i = (slide.i + 1) % state.photos.length;
      var p = state.photos[slide.i], t = task(p.task_id);
      var a = $('#sA'), b = $('#sB');
      var cur = which ? a : b, other = which ? b : a;
      which = !which;
      cur.onload = function () { cur.classList.add('on'); other.classList.remove('on'); };
      cur.src = photoUrl(p);
      var fresh = (Date.now() - new Date(p.created_at).getTime()) < 120000;
      $('#sT').innerHTML = esc(t ? t.text : '') + (fresh ? '<span class="fresh">neu</span>' : '');
      $('#sM').textContent = 'Foto von ' + (p.guest_name || 'Anonym') + ' · ' + clockTime(p.created_at);
    }
    step();
    slide.timer = setInterval(step, Math.max(2, CFG.slideshowSeconds || 6) * 1000);
  }
  function leaveSlideshow() {
    document.body.classList.remove('slideshow');
    $('#appHeader').classList.remove('hidden');
    $('#tabs').classList.remove('hidden');
    var h = $('#slideshow'); if (h) h.remove();
    clearInterval(slide.timer); slide.timer = null; slide.i = -1;
    if (slide.lock) { try { slide.lock.release(); } catch (e) {} slide.lock = null; }
  }

  /* ---- Admin ---- */
  var adminRows = null;
  function viewAdmin() {
    var h = '<button class="btn ghost" id="back" style="margin:10px 0">‹ Zurück zur App</button>' +
      '<h2>Gastgeber-Bereich</h2>' +
      '<p class="hint">Nur für dich. Alles hier bleibt in diesem Browser gespeichert – ' +
      'es landet nichts im Repository.</p>';

    /* Verbindung */
    h += '<div class="card" style="padding:16px;margin:14px 0">' +
      '<h3>1 · Verbindung</h3>' +
      '<label class="f" for="sbu">Supabase Projekt-URL</label>' +
      '<input id="sbu" type="text" placeholder="https://xxxx.supabase.co" value="' + esc(SB.url) + '">' +
      '<label class="f" for="sbk">Anon-Key (public)</label>' +
      '<input id="sbk" type="password" placeholder="eyJ…" value="' + esc(SB.key) + '">' +
      '<label class="f" for="sbb">Storage-Bucket</label>' +
      '<input id="sbb" type="text" value="' + esc(SB.bucket || 'eventpic') + '">' +
      '<div class="row" style="margin-top:14px"><button class="btn" id="save">Speichern &amp; prüfen</button></div>' +
      '<div class="hint">Status: ' + (online() ? '✅ verbunden mit ' + esc(SB.url) : '⚠️ Demo-Modus (nur lokal)') +
      (state.fetchError ? '<br>Letzter Fehler: ' + esc(state.fetchError) : '') + '</div>' +
      '<div class="banner" style="margin-top:12px">Bitte ein <b>eigenes</b> Supabase-Projekt nur für dieses Fest ' +
      'verwenden – nicht das einer anderen App. Der Anon-Key liegt bei jedem Gast im Browser und gilt für das ' +
      'ganze Projekt: alles, was dort für <code>anon</code> offen ist, wäre für die Gäste offen.</div>' +
      '</div>';

    /* QR */
    var link = location.href.split('#')[0];
    h += '<div class="card" style="padding:16px;margin:14px 0">' +
      '<h3>2 · QR-Code für die Gäste</h3>' +
      '<div class="qr" style="margin:12px 0"><canvas id="qrc"></canvas></div>' +
      '<div class="hint" style="word-break:break-all">' + esc(link) + '</div>' +
      '<div class="row" style="margin-top:12px">' +
      '<button class="btn sec2 sm" id="qrdl">QR als Bild speichern</button>' +
      '<button class="btn sec2 sm" id="cplink">Link kopieren</button></div>' +
      '<div class="hint">Erzeugt direkt im Browser – die Adresse wird an keinen Dienst geschickt. ' +
      'Bitte einmal mit der Handykamera testen, bevor du ihn aufhängst.</div>' +
      '</div>';

    /* Zahlen */
    var guests = {}, withPhoto = {};
    state.photos.forEach(function (p) {
      guests[p.guest_name || 'Anonym'] = 1; withPhoto[p.task_id] = (withPhoto[p.task_id] || 0) + 1;
    });
    var openTasks = TASKS.filter(function (t) { return !withPhoto[t.id]; });
    var top = Object.keys(withPhoto).sort(function (a, b) { return withPhoto[b] - withPhoto[a]; })[0];
    h += '<div class="card" style="padding:16px;margin:14px 0">' +
      '<h3>3 · Live-Zahlen</h3><div class="stats">' +
      '<div class="stat"><b>' + state.photos.length + '</b><span>Fotos</span></div>' +
      '<div class="stat"><b>' + Object.keys(guests).length + '</b><span>Gäste mit Foto</span></div>' +
      '<div class="stat"><b>' + (TASKS.length - openTasks.length) + '/' + TASKS.length + '</b><span>Aufgaben mit Foto</span></div>' +
      '<div class="stat"><b>' + state.queue.length + '</b><span>wartende Uploads</span></div>' +
      '</div>' +
      (top ? '<div class="hint">Beliebteste Aufgabe: „' + esc((task(top) || {}).text || top) + '" (' + withPhoto[top] + ')</div>' : '') +
      (openTasks.length ? '<div class="hint">Noch ohne Foto: ' +
        openTasks.slice(0, 6).map(function (t) { return '„' + esc(t.text.slice(0, 38)) + '…"'; }).join(', ') +
        (openTasks.length > 6 ? ' … (+' + (openTasks.length - 6) + ')' : '') + '</div>' : '') +
      '</div>';

    /* Werkzeuge */
    h += '<div class="card" style="padding:16px;margin:14px 0">' +
      '<h3>4 · Fotos sichern</h3>' +
      '<button class="btn" id="zip">Alle Fotos als ZIP herunterladen</button>' +
      '<div class="hint" id="zipst">Dateinamen: <code>Aufgabe_Gast_Uhrzeit.jpg</code>. ' +
      'Bei vielen Fotos dauert das einen Moment – Seite offen lassen.</div>' +
      '<div class="row" style="margin-top:14px">' +
      '<button class="btn sec2 sm" id="slide">▶ Slideshow starten</button>' +
      '<button class="btn sec2 sm" id="reload">↻ Neu laden</button></div>' +
      '</div>';

    /* Moderation */
    h += '<div class="card" style="padding:16px;margin:14px 0">' +
      '<h3>5 · Moderation</h3>' +
      '<label class="f" for="pin">Admin-PIN (aus dem Supabase-Setup)</label>' +
      '<input id="pin" type="password" value="' + esc(lsGet(LS.pin, '')) + '" placeholder="PIN">' +
      '<div class="row" style="margin-top:12px"><button class="btn sec2" id="mod">Alle Fotos laden (inkl. verborgene)</button></div>' +
      '<div id="modlist"></div></div>';

    /* Einstellungen */
    h += '<div class="card" style="padding:16px;margin:14px 0">' +
      '<h3>6 · Event-Einstellungen</h3>' +
      '<label class="f" for="cTitle">Titel</label><input id="cTitle" type="text" value="' + esc(CFG.title || '') + '">' +
      '<label class="f" for="cHon">Name des Geburtstagskinds</label><input id="cHon" type="text" value="' + esc(CFG.honoree || '') + '">' +
      '<label class="f" for="cDate">Datum (Anzeige)</label><input id="cDate" type="text" value="' + esc(CFG.dateLabel || '') + '">' +
      '<label class="f" for="cAcc">Akzentfarbe</label><input id="cAcc" type="text" value="' + esc(CFG.accent || '') + '">' +
      '<label class="f" for="cSec">Slideshow-Intervall (Sekunden)</label><input id="cSec" type="number" min="2" max="60" value="' + (CFG.slideshowSeconds || 6) + '">' +
      '<label class="f"><input type="checkbox" id="cLb" style="width:auto"' + (CFG.showLeaderboard ? ' checked' : '') + '> Spaß-Rangliste anzeigen</label>' +
      '<div class="row" style="margin-top:14px"><button class="btn" id="csave">Einstellungen speichern</button>' +
      '<button class="btn sec2" id="creset">Zurücksetzen</button></div>' +
      '<div class="hint">Gilt nur für dieses Gerät. Für alle Gäste: Werte in <code>tasks.js</code> ändern und hochladen.</div>' +
      '</div>';

    h += '<footer class="mini">Aufgaben: ' + TASKS.length + ' · Event-ID: ' + esc(CFG.eventId) + '</footer>';
    view.innerHTML = h;

    $('#back').onclick = function () { go('#/tasks'); };

    $('#save').onclick = function () {
      SB = { url: ($('#sbu').value || '').trim().replace(/\/+$/, ''), key: ($('#sbk').value || '').trim(), bucket: ($('#sbb').value || 'eventpic').trim() };
      lsSet(LS.sb, SB);
      state.fetchError = '';
      if (!online()) { toast('Zugangsdaten gelöscht – Demo-Modus.'); render(); return; }
      api.list(1).then(function () {
        toast('Verbindung steht ✅');
        return flush();
      }).then(function () { return refresh(true); })
        .catch(function (e) { toast('Verbindung fehlgeschlagen: ' + e.message, 5000); state.fetchError = e.message; render(); });
    };

    try { window.QR.toCanvas(link, $('#qrc'), { scale: 7, dark: '#000', light: '#fff' }); }
    catch (e) { $('#qrc').parentNode.innerHTML = '<div class="hint">QR konnte nicht erzeugt werden: ' + esc(e.message) + '</div>'; }
    $('#qrdl').onclick = function () {
      var a = document.createElement('a');
      a.href = $('#qrc').toDataURL('image/png');
      a.download = 'qr-' + CFG.eventId + '.png';
      a.click();
    };
    $('#cplink').onclick = function () {
      if (navigator.clipboard) navigator.clipboard.writeText(link).then(function () { toast('Link kopiert.'); });
      else toast(link, 6000);
    };

    $('#slide').onclick = function () { go('#/slideshow'); };
    $('#reload').onclick = function () { refresh(true).then(function () { toast('Aktualisiert.'); }); };
    $('#zip').onclick = function () { downloadZip(this); };

    $('#mod').onclick = function () {
      var pin = ($('#pin').value || '').trim();
      lsSet(LS.pin, pin);
      if (!online()) { toast('Moderation braucht eine Verbindung.'); return; }
      api.rpc('ep_admin_list', { p_pin: pin, p_event: CFG.eventId }).then(function (rows) {
        state.admin = true;
        adminRows = rows || [];
        renderModList();
        toast(adminRows.length + ' Fotos geladen.');
      }).catch(function (e) { toast('PIN falsch oder Setup fehlt: ' + e.message, 5000); });
    };
    if (adminRows) renderModList();

    $('#csave').onclick = function () {
      var over = {
        title: $('#cTitle').value.trim(), honoree: $('#cHon').value.trim(),
        dateLabel: $('#cDate').value.trim(), accent: $('#cAcc').value.trim() || '#c8102e',
        slideshowSeconds: Math.max(2, Math.min(60, +$('#cSec').value || 6)),
        showLeaderboard: $('#cLb').checked,
      };
      lsSet(LS.cfg, over);
      CFG = Object.assign({}, window.EVENT, over);
      applyCfg(); toast('Gespeichert.'); render();
    };
    $('#creset').onclick = function () {
      localStorage.removeItem(LS.cfg);
      CFG = Object.assign({}, window.EVENT);
      applyCfg(); toast('Zurückgesetzt.'); render();
    };
  }

  function renderModList() {
    var box = $('#modlist'); if (!box) return;
    if (!adminRows || !adminRows.length) { box.innerHTML = '<div class="hint">Keine Fotos.</div>'; return; }
    box.innerHTML = '<div class="list">' + adminRows.map(function (p) {
      var t = task(p.task_id);
      return '<div class="it"><img loading="lazy" src="' + esc(publicUrl(p.path)) + '" alt="">' +
        '<div class="g"><div class="t">' + esc(t ? t.text.slice(0, 44) : p.task_id) + '</div>' +
        '<div class="m">' + esc(p.guest_name || 'Anonym') + ' · ' + clockTime(p.created_at) +
        (p.hidden ? ' · <b>verborgen</b>' : '') + '</div></div>' +
        '<button class="btn sm sec2" data-h="' + esc(p.id) + '" data-v="' + (p.hidden ? '0' : '1') + '">' +
        (p.hidden ? 'Zeigen' : 'Verbergen') + '</button>' +
        '<button class="btn sm sec2" data-x="' + esc(p.id) + '">Löschen</button></div>';
    }).join('') + '</div>';
    Array.prototype.forEach.call(box.querySelectorAll('[data-h]'), function (b) {
      b.onclick = function () { adminHide(b.dataset.h, b.dataset.v === '1'); };
    });
    Array.prototype.forEach.call(box.querySelectorAll('[data-x]'), function (b) {
      b.onclick = function () {
        if (!confirm('Foto endgültig löschen?')) return;
        api.rpc('ep_admin_delete', { p_pin: lsGet(LS.pin, ''), p_id: b.dataset.x }).then(function () {
          adminRows = adminRows.filter(function (r) { return r.id !== b.dataset.x; });
          renderModList(); refresh(true); toast('Gelöscht.');
        }).catch(function (e) { toast('Fehler: ' + e.message, 4200); });
      };
    });
  }
  function adminHide(id, hide) {
    api.rpc('ep_admin_set_hidden', { p_pin: lsGet(LS.pin, ''), p_id: id, p_hidden: hide }).then(function () {
      if (adminRows) adminRows.forEach(function (r) { if (r.id === id) r.hidden = hide; });
      renderModList(); refresh(true);
      toast(hide ? 'Foto verborgen.' : 'Foto wieder sichtbar.');
    }).catch(function (e) { toast('Fehler: ' + e.message, 4200); });
  }

  function downloadZip(btn) {
    var rows = (adminRows && adminRows.length ? adminRows : state.photos).filter(function (p) { return !p.demo; });
    var st = $('#zipst');
    if (!rows.length) {
      if (state.photos.length) { toast('Im Demo-Modus gibt es keinen ZIP-Download.'); return; }
      toast('Noch keine Fotos.'); return;
    }
    btn.disabled = true;
    var files = [], i = 0;
    (function next() {
      if (i >= rows.length) {
        var blob = window.ZIP.build(files);
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = (CFG.eventId || 'event') + '-fotos.zip';
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 30000);
        st.textContent = files.length + ' Fotos gepackt.';
        btn.disabled = false;
        return;
      }
      var p = rows[i++];
      st.innerHTML = '<span class="sp"></span> Lade ' + i + ' von ' + rows.length + ' …';
      fetch(publicUrl(p.path)).then(function (r) { return r.arrayBuffer(); }).then(function (buf) {
        var t = task(p.task_id);
        var name = safeName((t ? t.text.slice(0, 34) : p.task_id)) + '_' +
          safeName(p.guest_name || 'Anonym') + '_' + clockTime(p.created_at).replace(':', '-') + '_' +
          String(i).padStart(3, '0') + '.jpg';
        files.push({ data: new Uint8Array(buf), name: name, date: new Date(p.created_at) });
      }).catch(function () { /* fehlendes Foto überspringen */ }).then(next);
    })();
  }

  /* ======================= 12. Router ==================================== */
  function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }

  function parse() {
    var h = (location.hash || '').replace(/^#\/?/, '');
    var parts = h.split('/');
    var name = parts[0] || '';
    if (!name) name = lsGet(LS.consent, '') ? 'tasks' : 'start';
    return { name: name, arg: parts[1] || '' };
  }

  function render() {
    var was = route.name;
    route = parse();
    if (was === 'slideshow' && route.name !== 'slideshow') leaveSlideshow();

    var chrome = ['tasks', 'gallery', 'me'].indexOf(route.name) >= 0;
    $('#tabs').classList.toggle('hidden', !chrome);
    $('#appHeader').classList.toggle('hidden', route.name === 'slideshow' || route.name === 'start');
    Array.prototype.forEach.call($('#tabs').children, function (b) {
      if (b.dataset.go === '#/' + route.name) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    renderRing();

    if (route.name !== 'slideshow' && $('#slideshow')) leaveSlideshow();
    view.classList.toggle('hidden', route.name === 'slideshow');

    switch (route.name) {
      case 'start': viewStart(); break;
      case 'task': viewTask(route.arg); break;
      case 'gallery': viewGallery(); break;
      case 'me': viewMe(); break;
      case 'info': viewInfo(); break;
      case 'admin': viewAdmin(); break;
      case 'slideshow': if (!$('#slideshow')) viewSlideshow(); break;
      default: viewTasks();
    }
    if (route.name !== 'task') clearPending();
    window.scrollTo(0, route.name === was ? window.scrollY : 0);
  }

  window.addEventListener('hashchange', render);
  Array.prototype.forEach.call($('#tabs').children, function (b) {
    b.onclick = function () { go(b.dataset.go); };
  });

  /* ======================= 13. Start ===================================== */
  applyCfg();
  render();
  refresh(true);
  flush();

  // Regelmäßig aktualisieren – häufiger, wenn gerade zugeschaut wird.
  setInterval(function () {
    if (document.hidden) return;
    var fast = route.name === 'gallery' || route.name === 'slideshow';
    if (fast || Date.now() - state.lastFetch > 30000) refresh(true);
  }, 8000);
  setInterval(function () { if (!document.hidden) flush(); }, 20000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { refresh(true); flush(); } });

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }

  // Debug-Zugriff für den Gastgeber (Konsole)
  window.EP = { state: state, refresh: refresh, flush: flush, cfg: function () { return CFG; } };
})();
