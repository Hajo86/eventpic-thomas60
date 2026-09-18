/* Foto-Upload muss auch dann funktionieren, wenn IndexedDB blockiert ist
   (privater Modus, voller Speicher, eingebetteter Browser). */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const BASE = process.env.EP_BASE, API = process.env.EP_API;
const fails = [];
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails.push(m); };

await fetch(API + '/__reset').catch(() => {});   // Mock-Zustand leeren
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 414, height: 896 }, locale: 'de-DE' })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));

await p.addInitScript(([api]) => {
  // IndexedDB komplett lahmlegen
  Object.defineProperty(window, 'indexedDB', {
    get() { return { open() { throw new Error('IndexedDB ist in diesem Modus gesperrt'); } }; },
  });
  localStorage.setItem('ep.sb', JSON.stringify({ url: api, key: 'sb_publishable_X', bucket: 'eventpic' }));
  localStorage.setItem('ep.guest', JSON.stringify('Clara'));
  localStorage.setItem('ep.consent', JSON.stringify('x'));
}, [API]);

await p.goto(BASE, { waitUntil: 'networkidle' });
await p.waitForSelector('[data-task]');
ok(true, 'App startet trotz gesperrtem IndexedDB');

await p.click('text=Alle 19');
await p.click('[data-task="g10"]');
await p.waitForSelector('#cam', { state: 'attached' });
await p.setInputFiles('#cam', new URL('../icons/icon-512.png', import.meta.url).pathname);
await p.waitForSelector('#send');
await p.evaluate(() => document.querySelectorAll('.toast').forEach(el => el.remove()));
await p.click('#send');
await p.waitForSelector('.toast', { timeout: 10000 });
const t = await p.locator('.toast').textContent();
ok(/Galerie/.test(t), 'Erfolgsmeldung statt Fehler: ' + t.slice(0, 90));
ok(/privater Modus/.test(t), 'Hinweis auf fehlenden Zwischenspeicher wird gezeigt');

await p.waitForFunction(() => window.EP && window.EP.state.photos.length === 1, null, { timeout: 10000 });
const ph = await p.evaluate(() => window.EP.state.photos[0]);
ok(ph.guest_name === 'Clara' && ph.task_id === 'g10', 'Foto ist wirklich auf dem Server gelandet');
await p.waitForFunction(() => window.EP.state.queue.length === 0, null, { timeout: 8000 });
ok(true, 'Warteschlange danach leer');

await p.goto(BASE + '#/admin');
await p.waitForSelector('#sbu');
ok((await p.content()).includes('nicht nutzbar'), 'Admin zeigt den Zustand des Zwischenspeichers');

console.log('\nSeitenfehler:', errs.length ? errs : 'keine');
await b.close();
console.log(fails.length ? '\n❌ ' + fails.join(' | ') : '\n✅ Upload ohne IndexedDB funktioniert.');
process.exit(fails.length ? 1 : 0);
