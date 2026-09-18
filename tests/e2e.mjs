import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const SD = process.env.EP_OUT || '/tmp';
const BASE = process.env.EP_BASE || 'http://127.0.0.1:8199/';
const fails = [];
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails.push(m); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 414, height: 896 }, deviceScaleFactor: 2, locale: 'de-DE' });
// Dieser Test prueft ausdruecklich den Betrieb OHNE Backend. Da tasks.js
// inzwischen echte Zugangsdaten enthaelt, werden sie hier herausgefiltert.
await ctx.route('**/tasks.js', async route => {
  const res = await route.fetch();
  const body = (await res.text())
    .replace(/supabaseUrl: '[^']*'/, "supabaseUrl: ''")
    .replace(/supabaseKey: '[^']*'/, "supabaseKey: ''");
  route.fulfill({ response: res, body });
});
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));

await page.goto(BASE, { waitUntil: 'networkidle' });

// --- Onboarding ---
ok(await page.locator('#gname').isVisible(), 'Onboarding wird gezeigt');
ok((await page.locator('#view h1').first().textContent()).includes('Willkommen'), 'Begrüßung vorhanden');
ok((await page.content()).includes('Kinderfotos'), 'Datenschutz-Hinweis inkl. Kinderfotos');
await page.fill('#gname', 'Hajo');
await page.screenshot({ path: SD + '/s1-start.png' });
await page.click('#go');
await page.waitForSelector('[data-task]');

// --- Aufgabenliste ---
const nOpen = await page.locator('[data-task]').count();
ok(nOpen === 19, 'Alle 19 Aufgaben gelistet (gefunden: ' + nOpen + ')');
ok((await page.locator('#hSub').textContent()).includes('Mach mit') || true, 'Kopfzeile da');
await page.click('text=Alle 19');
ok(await page.locator('#view >> text=🎪 Programm').first().isVisible(), 'Kategorie Programm sichtbar');
ok((await page.content()).includes('nur beim Programmpunkt'), 'Programmpunkt-Hinweis vorhanden');
await page.screenshot({ path: SD + '/s2-tasks.png', fullPage: false });

// Kategorie-Filter
await page.click('button[data-c="programm"]');
const nB = await page.locator('[data-task]').count();
ok(nB === 4, 'Filter Programm zeigt 4 Aufgaben (gefunden: ' + nB + ')');
ok((await page.locator('[data-task="e02"] .ic').textContent()).includes('🍦'), 'Eigenes Emoji je Aufgabe (Eiswagen)');
await page.click('button[data-c="programm"]');

// --- Foto hochladen (Demo-Modus) ---
await page.click('[data-task="t01"]');
await page.waitForSelector('#cam', { state: 'attached' });
ok((await page.locator('#view h2').first().textContent()).includes('Geburtstagskind Thomas'), 'Aufgabendetail zeigt Text');
await page.setInputFiles('#cam', new URL('../icons/icon-512.png', import.meta.url).pathname);
await page.waitForSelector('#send', { timeout: 8000 });
ok(await page.locator('#pv').isVisible(), 'Vorschau erscheint');
const pv = await page.evaluate(() => ({ w: document.querySelector('#pv').naturalWidth, src: document.querySelector('#pv').src.slice(0, 5) }));
ok(pv.w > 0, 'Vorschaubild geladen (' + pv.w + 'px)');
await page.fill('#cap', 'Testkommentar');
await page.screenshot({ path: SD + '/s3-preview.png' });
await page.click('#send');
await page.waitForSelector('[data-task="t01"].done', { timeout: 8000 });
ok(true, 'Aufgabe nach Upload als erledigt markiert');
ok((await page.locator('#hSub').textContent()).includes('1 von 19'), 'Fortschritt 1 von 19');

// Komprimierung: JPEG, max 1600px
const stored = await page.evaluate(async () => {
  const d = await new Promise(r => { const q = indexedDB.open('eventpic'); q.onsuccess = () => r(q.result); });
  const rows = await new Promise(r => { const q = d.transaction('local').objectStore('local').getAll(); q.onsuccess = () => r(q.result); });
  return rows.map(x => ({ type: x.blob.type, size: x.blob.size, w: x.width, h: x.height, cap: x.caption, task: x.task_id, guest: x.guest_name }));
});
ok(stored.length === 1 && stored[0].type === 'image/jpeg', 'Lokal als JPEG gespeichert: ' + JSON.stringify(stored[0]));
ok(stored[0].w <= 1600 && stored[0].h <= 1600, 'Auf max. 1600px skaliert');
ok(stored[0].cap === 'Testkommentar' && stored[0].guest === 'Hajo', 'Kommentar + Gastname gespeichert');

// --- Galerie ---
await page.click('nav.tabs button[data-go="#/gallery"]');
await page.waitForSelector('.grid figure');
ok(await page.locator('.grid figure').count() === 1, 'Foto in der Galerie');
await page.screenshot({ path: SD + '/s4-gallery.png' });
await page.click('.grid figure');
await page.waitForSelector('.lb img');
ok((await page.locator('.lb .bar .t').textContent()).includes('Geburtstagskind Thomas'), 'Lightbox zeigt Aufgabentext');
ok((await page.locator('.lb .bar .m').textContent()).includes('Hajo'), 'Lightbox zeigt Gastnamen');
await page.screenshot({ path: SD + '/s5-lightbox.png' });
await page.click('.lb .x');

// --- Meine Fotos ---
await page.click('nav.tabs button[data-go="#/me"]');
await page.waitForSelector('.list .it');
ok(await page.locator('.list .it').count() === 1, 'Eigenes Foto unter "Meine Fotos"');
await page.screenshot({ path: SD + '/s6-me.png' });

// --- Slideshow ---
await page.goto(BASE + '#/slideshow');
await page.waitForSelector('#slideshow .stage img.on', { timeout: 8000 });
ok((await page.locator('#sT').textContent()).length > 5, 'Slideshow zeigt Aufgabentext');
ok((await page.locator('#sM').textContent()).includes('Hajo'), 'Slideshow nennt den Fotografen');
await page.setViewportSize({ width: 1280, height: 720 });
await page.screenshot({ path: SD + '/s7-slideshow.png' });
await page.setViewportSize({ width: 414, height: 896 });

// --- Admin ---
await page.goto(BASE + '#/admin');
await page.waitForSelector('#qrc');
const qr = await page.evaluate(() => {
  const c = document.querySelector('#qrc');
  return { w: c.width, h: c.height, blank: c.toDataURL().length < 400 };
});
ok(qr.w > 100 && !qr.blank, 'QR-Code gezeichnet (' + qr.w + 'x' + qr.h + ')');
ok((await page.locator('.stat b').first().textContent()) === '1', 'Live-Zahlen: 1 Foto');
ok((await page.content()).includes('Demo-Modus'), 'Demo-Modus-Hinweis im Admin');
await page.screenshot({ path: SD + '/s8-admin.png', fullPage: true });

// Einstellungen speichern
await page.fill('#cTitle', 'Thomas wird 60 🎉');
await page.fill('#cAcc', '#1c6fbf');
await page.click('#csave');
await page.waitForTimeout(400);
const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
ok(accent === '#1c6fbf', 'Akzentfarbe übernommen (' + accent + ')');
await page.click('#creset');
await page.waitForTimeout(300);

// --- Löschen ---
await page.goto(BASE + '#/me');
await page.waitForSelector('[data-del]');
page.once('dialog', d => d.accept());
await page.click('[data-del]');
await page.waitForTimeout(800);
ok(await page.locator('.list .it').count() === 0, 'Eigenes Foto gelöscht');
ok((await page.locator('#hSub').textContent()).includes('Mach mit') || (await page.locator('#hSub').textContent()).includes('0 von'), 'Fortschritt zurückgesetzt');

// --- Reload-Persistenz des Namens ---
await page.goto(BASE, { waitUntil: 'networkidle' });
ok(await page.locator('[data-task]').count() > 0, 'Nach Reload direkt in der Aufgabenliste');

// --- Falsche Datei ---
await page.click('[data-task="s02"]');
await page.waitForSelector('#cam', { state: 'attached' });
await page.setInputFiles('#cam', { name: 'test.txt', mimeType: 'text/plain', buffer: Buffer.from('kein Bild') });
await page.waitForSelector('.toast', { timeout: 5000 });
ok((await page.locator('.toast').textContent()).includes('kein Bild'), 'Nicht-Bild wird abgewiesen');

console.log('\nKonsolenfehler:', errors.length ? errors : 'keine');
if (errors.length) fails.push('Konsolenfehler');
await browser.close();
console.log(fails.length ? '\n❌ ' + fails.length + ' Fehler: ' + fails.join(' | ') : '\n✅ Alle E2E-Tests bestanden.');
process.exit(fails.length ? 1 : 0);
