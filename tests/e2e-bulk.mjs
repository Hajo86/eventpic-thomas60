/* Mehrfachauswahl in der Moderation: einzelne Fotos auswaehlen, verbergen,
   loeschen — und alle auf einmal loeschen (mit Tipp-Bestaetigung).
   Ausserdem: Vorschaubilder werden hochgeladen und in der Galerie genutzt. */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const BASE = process.env.EP_BASE || 'http://127.0.0.1:8199/';
const API = process.env.EP_API || 'http://127.0.0.1:8300';
const fails = [];
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails.push(m); };

await fetch(API + '/__reset').catch(() => {});
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 414, height: 1200 }, locale: 'de-DE' });
await ctx.route('**/tasks.js', async route => {
  const res = await route.fetch();
  const body = (await res.text())
    .replace(/supabaseUrl: '[^']*'/, `supabaseUrl: '${API}'`)
    .replace(/supabaseKey: '[^']*'/, "supabaseKey: 'sb_publishable_TEST'");
  route.fulfill({ response: res, body });
});
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => {
  localStorage.setItem('ep.consent', JSON.stringify('x'));
  localStorage.setItem('ep.guest', JSON.stringify('Gerd'));
});
const PHOTO = new URL('../icons/icon-512.png', import.meta.url).pathname;

// Drei Fotos hochladen
await p.goto(BASE, { waitUntil: 'networkidle' });
await p.click('text=Alle 19');
for (const id of ['t01', 'g10', 'd01']) {
  await p.click(`[data-task="${id}"]`);
  await p.waitForSelector('#cam', { state: 'attached' });
  await p.setInputFiles('#cam', PHOTO);
  await p.waitForSelector('#send');
  await p.click('#send');
  await p.waitForSelector('[data-task]', { timeout: 10000 });
}
await p.waitForFunction(() => window.EP && window.EP.state.photos.length === 3, null, { timeout: 15000 });
ok(true, 'Drei Fotos hochgeladen');

// Vorschaubilder muessen mit hochgeladen worden sein
const sizes = await p.evaluate(async (api) => {
  const p0 = window.EP.state.photos[0];
  const url = (u) => api + '/storage/v1/object/public/eventpic/' + u;
  const a = await fetch(url(p0.path));
  const b = await fetch(url(p0.path.replace(/\.jpg$/, '_t.jpg')));
  return { full: a.ok ? (await a.blob()).size : 0, thumb: b.ok ? (await b.blob()).size : 0 };
}, API);
ok(sizes.thumb > 0, 'Vorschaubild liegt im Speicher (' + sizes.thumb + ' B)');
ok(sizes.thumb < sizes.full, 'Vorschaubild ist kleiner als das Original (' +
  sizes.thumb + ' B < ' + sizes.full + ' B)');

// Galerie nutzt das Vorschaubild
await p.goto(BASE + '#/gallery');
await p.waitForSelector('.grid img');
await p.waitForFunction(() => {
  const im = document.querySelector('.grid img');
  return im && im.complete && im.naturalWidth > 0;
}, null, { timeout: 10000 });
const src = await p.getAttribute('.grid img', 'src');
ok(/_t\.jpg$/.test(src), 'Galerie laedt das Vorschaubild: ' + src.split('/').pop());
const shown = await p.evaluate(() => document.querySelector('.grid img').naturalWidth);
ok(shown <= 420, 'Geladenes Bild ist klein (' + shown + 'px statt 512px)');

// Moderation: eines auswaehlen und verbergen
await p.goto(BASE + '#/admin');
await p.fill('#pin', 'Hajo86');
await p.click('#mod');
await p.waitForSelector('#modlist [data-sel]', { timeout: 10000 });
ok(await p.locator('#modlist [data-sel]').count() === 3, 'Drei Zeilen mit Auswahlkaestchen');
await p.locator('[data-sel]').first().check();
await p.waitForTimeout(300);
ok((await p.textContent('#mDel')).includes('1 löschen'), 'Knopf zeigt die Anzahl: ' + await p.textContent('#mDel'));
await p.click('#mHide');
await p.waitForTimeout(1500);
ok((await p.locator('#modlist .it b', { hasText: 'verborgen' }).count()) === 1, 'Ein Foto verborgen');
const vis = await p.evaluate(() => window.EP.state.photos.length);
ok(vis === 2, 'Galerie zeigt nur noch zwei (' + vis + ')');

// Auswahl loeschen
await p.click('#mAll');
await p.waitForTimeout(300);
ok((await p.textContent('#mDel')).includes('3 löschen'), '"Alle auswählen" wählt alle');
await p.locator('[data-sel]').first().uncheck();
await p.waitForTimeout(300);
p.once('dialog', d => d.accept());
await p.click('#mDel');
await p.waitForTimeout(2500);
ok(await p.locator('#modlist [data-sel]').count() === 1, 'Zwei geloescht, eines uebrig');

// Alles loeschen — falsche Eingabe bricht ab
p.once('dialog', d => d.accept('nein'));
await p.click('#mAllDel');
await p.waitForTimeout(800);
ok(await p.locator('#modlist [data-sel]').count() === 1, 'Falsches Bestaetigungswort loescht nichts');

p.once('dialog', d => d.accept('loeschen'));
await p.click('#mAllDel');
await p.waitForTimeout(2500);
ok((await p.textContent('#modlist')).includes('Keine Fotos'), 'Alles geloescht');

console.log('\nSeitenfehler:', errs.length ? errs : 'keine');
await b.close();
console.log(fails.length ? '\n❌ ' + fails.join(' | ') : '\n✅ Mehrfachauswahl und Vorschaubilder in Ordnung.');
process.exit(fails.length ? 1 : 0);
