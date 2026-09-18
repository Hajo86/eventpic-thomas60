/* Ein Gast darf NICHTS einrichten muessen: die Zugangsdaten stehen in
   tasks.js und gelten fuer alle. Der Gastgeber kann sie pro Geraet
   ueberschreiben — und mit zwei leeren Feldern wieder zuruecknehmen.     */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const BASE = process.env.EP_BASE || 'http://127.0.0.1:8199/';
const API = process.env.EP_API || 'http://127.0.0.1:8300';
const fails = [];
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails.push(m); };

await fetch(API + '/__reset').catch(() => {});
const b = await chromium.launch();

// --- Gast: frisches Geraet, nichts im Speicher, tasks.js liefert die Werte ---
const ctx = await b.newContext({ viewport: { width: 414, height: 896 }, locale: 'de-DE' });
const g = await ctx.newPage();
const errs = []; g.on('pageerror', e => errs.push(e.message));
// tasks.js so ausliefern, als haette der Gastgeber die Werte eingetragen
await ctx.route('**/tasks.js', async route => {
  const res = await route.fetch();
  let body = await res.text();
  body = body.replace("supabaseKey: ''", `supabaseKey: 'sb_publishable_TEST'`)
             .replace(/supabaseUrl: '[^']*'/, `supabaseUrl: '${API}'`);
  route.fulfill({ response: res, body });
});
await g.goto(BASE, { waitUntil: 'networkidle' });
ok(await g.locator('#gname').isVisible(), 'Gast sieht die Begruessung');
await g.fill('#gname', 'Emil');
await g.click('#go');
await g.waitForSelector('[data-task]');
ok(!(await g.content()).includes('nur auf diesem Gerät'), 'Kein Einrichtungs-Hinweis fuer den Gast');
ok(await g.evaluate(() => !localStorage.getItem('ep.sb')), 'Gast hat nichts eingetragen');

await g.click('text=Alle 19');
await g.click('[data-task="g11"]');
await g.waitForSelector('#cam', { state: 'attached' });
await g.setInputFiles('#cam', new URL('../icons/icon-512.png', import.meta.url).pathname);
await g.waitForSelector('#send');
await g.evaluate(() => document.querySelectorAll('.toast').forEach(el => el.remove()));
await g.click('#send');
await g.waitForSelector('.toast', { timeout: 10000 });
ok(/Galerie/.test(await g.locator('.toast').textContent()), 'Foto geht ohne Einrichtung raus');
await g.waitForFunction(() => window.EP && window.EP.state.photos.length === 1, null, { timeout: 10000 });
const ph = await g.evaluate(() => window.EP.state.photos[0]);
ok(ph.guest_name === 'Emil', 'Foto liegt mit Namen auf dem Server');

// --- Gastgeber: eigene Werte, dann zuruecksetzen ---
await g.goto(BASE + '#/admin');
await g.waitForSelector('#sbu');
ok((await g.content()).includes('gilt für alle Gäste'), 'Admin zeigt die Quelle der Werte');
await g.fill('#sbu', 'https://anderes-projekt.supabase.co');
await g.fill('#sbk', 'sb_publishable_ANDERS');
await g.click('#save');
await g.waitForTimeout(800);
ok(await g.evaluate(() => !!localStorage.getItem('ep.sb')), 'Eigene Werte werden geraetelokal gespeichert');
await g.goto(BASE + '#/admin');
await g.fill('#sbu', '');
await g.fill('#sbk', '');
await g.click('#save');
await g.waitForTimeout(800);
ok(await g.evaluate(() => !localStorage.getItem('ep.sb')), 'Beide Felder leeren nimmt die Aenderung zurueck');
ok((await g.inputValue('#sbu')).includes('127.0.0.1') || (await g.inputValue('#sbu')).includes('supabase'),
   'Danach stehen wieder die Werte aus tasks.js: ' + await g.inputValue('#sbu'));

console.log('\nSeitenfehler:', errs.length ? errs : 'keine');
await b.close();
console.log(fails.length ? '\n❌ ' + fails.join(' | ') : '\n✅ Gast muss nichts einrichten.');
process.exit(fails.length ? 1 : 0);
