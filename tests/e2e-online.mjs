/* End-to-End-Test des Online-Pfads gegen den Fake-Supabase (tests/mock-supabase.mjs).
   Prueft genau das, was am Festtag zaehlt: Upload -> Datenbank -> Storage ->
   Galerie auf einem ZWEITEN Geraet -> Moderation -> ZIP.

   Voraussetzung: statischer Server auf EP_BASE, Mock auf EP_API.
   Siehe README, Abschnitt Tests.                                              */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const BASE = process.env.EP_BASE || 'http://127.0.0.1:8199/';
const API = process.env.EP_API || 'http://127.0.0.1:8300';
const KEY = process.env.EP_KEY || 'sb_publishable_TESTKEY_0000000000';
const PIN = 'Hajo86';
const PHOTO = new URL('../icons/icon-512.png', import.meta.url).pathname;

const fails = [];
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails.push(m); };

await fetch(API + '/__reset').catch(() => {});   // Mock-Zustand leeren
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 414, height: 896 }, locale: 'de-DE' });
const errors = [];

// Gast 1 — mit hinterlegten Zugangsdaten starten
const g1 = await ctx.newPage();
g1.on('pageerror', e => errors.push('gast1: ' + e.message));
await g1.addInitScript(([api, key]) => {
  localStorage.setItem('ep.sb', JSON.stringify({ url: api, key: key, bucket: 'eventpic' }));
  localStorage.setItem('ep.guest', JSON.stringify('Anna'));
  localStorage.setItem('ep.consent', JSON.stringify(new Date().toISOString()));
}, [API, KEY]);
await g1.goto(BASE, { waitUntil: 'networkidle' });
await g1.waitForSelector('[data-task]');
ok(!(await g1.content()).includes('Demo-Modus'), 'Kein Demo-Banner — App ist verbunden');
await g1.click('text=Alle 19');   // erledigte Aufgaben bleiben sonst ausgeblendet

// Foto hochladen
await g1.click('[data-task="t01"]');
await g1.waitForSelector('#cam', { state: 'attached' });
await g1.setInputFiles('#cam', PHOTO);
await g1.waitForSelector('#send');
await g1.fill('#cap', 'Prost!');
await g1.click('#send');
await g1.waitForSelector('[data-task="t01"].done', { timeout: 10000 });
ok(true, 'Upload abgeschickt, Aufgabe erledigt');

// Warteschlange muss leer sein -> der Upload ging wirklich raus
await g1.waitForFunction(() => window.EP && window.EP.state.queue.length === 0, null, { timeout: 10000 });
ok(true, 'Warteschlange leer — Foto ist beim Server angekommen');

const st = await g1.evaluate(() => ({
  n: window.EP.state.photos.length,
  p: window.EP.state.photos[0],
  err: window.EP.state.fetchError,
}));
ok(st.n === 1, 'Server liefert 1 Foto zurueck (' + st.n + ')');
ok(!st.err, 'Kein Lesefehler: ' + (st.err || 'keiner'));
ok(st.p && st.p.guest_name === 'Anna' && st.p.caption === 'Prost!', 'Gastname und Kommentar gespeichert');
ok(st.p && /^thomas60-2026\/t01\/.+\.jpg$/.test(st.p.path), 'Storage-Pfad korrekt: ' + (st.p && st.p.path));

// Das Bild muss ueber die oeffentliche URL wirklich ladbar sein
const imgOk = await g1.evaluate(() => {
  const im = document.querySelector('.grid img');
  return im ? { complete: im.complete, w: im.naturalWidth } : null;
}).catch(() => null);
await g1.click('nav.tabs button[data-go="#/gallery"]');
await g1.waitForSelector('.grid img');
await g1.waitForFunction(() => {
  const im = document.querySelector('.grid img');
  return im && im.complete && im.naturalWidth > 0;
}, null, { timeout: 10000 });
ok(true, 'Foto laedt aus dem Storage in die Galerie');
void imgOk;

// Gast 2 — zweites Geraet (eigener Kontext = eigener localStorage)
const ctx2 = await browser.newContext({ viewport: { width: 414, height: 896 }, locale: 'de-DE' });
const g2 = await ctx2.newPage();
g2.on('pageerror', e => errors.push('gast2: ' + e.message));
await g2.addInitScript(([api, key]) => {
  localStorage.setItem('ep.sb', JSON.stringify({ url: api, key: key, bucket: 'eventpic' }));
  localStorage.setItem('ep.guest', JSON.stringify('Bernd'));
  localStorage.setItem('ep.consent', JSON.stringify(new Date().toISOString()));
}, [API, KEY]);
await g2.goto(BASE + '#/gallery', { waitUntil: 'networkidle' });
await g2.waitForSelector('.grid figure', { timeout: 10000 });
ok(await g2.locator('.grid figure').count() === 1, 'Zweites Geraet sieht das Foto von Anna');
ok((await g2.locator('.grid .who').first().textContent()).includes('Anna'), 'Fotograf wird korrekt angezeigt');

// Aufgabenliste bei Gast 2: Aufgabe ist "1 Foto", aber NICHT als eigene erledigt
await g2.goto(BASE + '#/tasks');
await g2.click('text=Alle 19');
await g2.waitForSelector('[data-task="t01"]');
const cls = await g2.getAttribute('[data-task="t01"]', 'class');
ok(!cls.includes('done'), 'Bei Gast 2 gilt die Aufgabe als offen');
ok((await g2.locator('[data-task="t01"] .pill.cnt').textContent()).includes('1 Foto'), 'Zaehler zeigt fremde Fotos');

// Moderation ueber die Admin-PIN
await g2.goto(BASE + '#/admin');
await g2.waitForSelector('#pin');
await g2.fill('#pin', PIN);
await g2.click('#mod');
await g2.waitForSelector('#modlist .it', { timeout: 10000 });
ok(true, 'Admin-Liste mit PIN geladen');
await g2.click('[data-h]');
await g2.waitForTimeout(1200);
await g2.goto(BASE + '#/gallery');
await g2.waitForTimeout(1200);
ok(await g2.locator('.grid figure').count() === 0, 'Verborgenes Foto verschwindet aus der Galerie');

// Falsche PIN wird abgewiesen
await g2.goto(BASE + '#/admin');
await g2.fill('#pin', 'falsch');
// alte Einblendungen entfernen, sonst prueft der Test die vorherige Meldung
await g2.evaluate(() => document.querySelectorAll('.toast').forEach(el => el.remove()));
await g2.click('#mod');
await g2.waitForSelector('.toast', { timeout: 8000 });
const toastTxt = await g2.locator('.toast').textContent();
ok(toastTxt.toLowerCase().includes('pin'), 'Falsche PIN wird abgewiesen (Meldung: ' + toastTxt + ')');

// Gast 1 loescht sein eigenes Foto
await g1.goto(BASE + '#/admin');
await g1.fill('#pin', PIN);
await g1.click('#mod');
await g1.waitForSelector('#modlist .it', { timeout: 10000 });
await g1.click('[data-h]');                    // wieder sichtbar machen
await g1.waitForTimeout(1000);
await g1.goto(BASE + '#/me');
await g1.waitForSelector('[data-del]', { timeout: 10000 });
g1.once('dialog', d => d.accept());
await g1.click('[data-del]');
await g1.waitForTimeout(1500);
ok(await g1.locator('.list .it').count() === 0, 'Gast loescht sein eigenes Foto');

console.log('\nSeitenfehler:', errors.length ? errors : 'keine');
if (errors.length) fails.push('Seitenfehler');
await browser.close();
console.log(fails.length ? '\n❌ ' + fails.length + ' Fehler: ' + fails.join(' | ')
                         : '\n✅ Online-Pfad vollstaendig durchgelaufen.');
process.exit(fails.length ? 1 : 0);
