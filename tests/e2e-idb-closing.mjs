/* Regressionstest fuer den iOS-Fall: waehrend die Kamera offen ist, friert
   Safari die Seite ein und schliesst die IndexedDB-Verbindung. Die naechste
   Transaktion scheitert dann mit "The database connection is closing".
   Die App muss sich neu verbinden, statt das Foto zu verlieren.            */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const BASE = process.env.EP_BASE || 'http://127.0.0.1:8199/';
const API = process.env.EP_API || 'http://127.0.0.1:8300';
const fails = [];
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails.push(m); };

await fetch(API + '/__reset').catch(() => {});   // Mock-Zustand leeren
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 414, height: 896 }, locale: 'de-DE' })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));

await p.addInitScript(([api]) => {
  // Die erste Transaktion nach dem Kameragang schlaegt fehl — wie auf dem iPhone.
  let armed = false;
  const orig = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function () {
    if (armed) {
      armed = false;
      const e = new Error("Failed to execute 'transaction' on 'IDBDatabase': The database connection is closing.");
      e.name = 'InvalidStateError';
      throw e;
    }
    return orig.apply(this, arguments);
  };
  window.__armIdbFailure = () => { armed = true; };
  localStorage.setItem('ep.sb', JSON.stringify({ url: api, key: 'sb_publishable_X', bucket: 'eventpic' }));
  localStorage.setItem('ep.guest', JSON.stringify('Dora'));
  localStorage.setItem('ep.consent', JSON.stringify('x'));
}, [API]);

await p.goto(BASE, { waitUntil: 'networkidle' });
await p.waitForSelector('[data-task]');
await p.click('text=Alle 19');
await p.click('[data-task="t01"]');
await p.waitForSelector('#cam', { state: 'attached' });
await p.setInputFiles('#cam', new URL('../icons/icon-512.png', import.meta.url).pathname);
await p.waitForSelector('#send');

await p.evaluate(() => window.__armIdbFailure());   // Kameragang simulieren
await p.evaluate(() => document.querySelectorAll('.toast').forEach(el => el.remove()));
await p.click('#send');

await p.waitForSelector('.toast', { timeout: 10000 });
const t = await p.locator('.toast').textContent();
ok(/Galerie/.test(t), 'Erfolg statt "connection is closing": ' + t.slice(0, 70));
ok(!/closing/i.test(t), 'Keine technische Fehlermeldung mehr');

await p.waitForFunction(() => window.EP && window.EP.state.photos.length === 1, null, { timeout: 10000 });
ok(true, 'Foto liegt auf dem Server');
await p.waitForFunction(() => window.EP.state.queue.length === 0, null, { timeout: 8000 });
ok(true, 'Warteschlange leer');
const done = await p.textContent('#hSub');
ok(/1 von 19/.test(done), 'Fortschritt zaehlt genau einmal: ' + done);

console.log('\nSeitenfehler:', errs.length ? errs : 'keine');
await b.close();
console.log(fails.length ? '\n❌ ' + fails.join(' | ') : '\n✅ Verbindungsabbruch wird abgefangen.');
process.exit(fails.length ? 1 : 0);
