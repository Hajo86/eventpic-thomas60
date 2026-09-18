/* Der Gastgeber muss aus jedem Bereich zurueckkommen, und der Selbsttest muss
   sagen, ob Verbindung, Upload, Datenbank und oeffentlicher Abruf stimmen.   */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const BASE = process.env.EP_BASE || 'http://127.0.0.1:8199/';
const API = process.env.EP_API || 'http://127.0.0.1:8300';
const fails = [];
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails.push(m); };

await fetch(API + '/__reset').catch(() => {});
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 414, height: 896 }, locale: 'de-DE' });
await ctx.route('**/tasks.js', async route => {
  const res = await route.fetch();
  const body = (await res.text())
    .replace(/supabaseUrl: '[^']*'/, `supabaseUrl: '${API}'`)
    .replace(/supabaseKey: '[^']*'/, "supabaseKey: 'sb_publishable_TEST'");
  route.fulfill({ response: res, body });
});
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => localStorage.setItem('ep.consent', JSON.stringify('x')));

// --- Navigation: Fussleiste ueberall ---
for (const [hash, name] of [['#/admin', 'Gastgeber'], ['#/print', 'Aushang'], ['#/info', 'Info']]) {
  await p.goto(BASE + hash);
  await p.waitForTimeout(400);
  ok(await p.locator('nav.tabs').isVisible(), 'Fussleiste sichtbar im Bereich ' + name);
}
await p.click('nav.tabs button[data-go="#/tasks"]');
await p.waitForSelector('[data-task]');
ok(true, 'Ueber die Fussleiste zurueck zu den Aufgaben');

await p.goto(BASE + '#/admin');
await p.waitForSelector('#back');
await p.click('#back');
await p.waitForSelector('[data-task]');
ok(true, 'Zurueck-Knopf im Gastgeber-Bereich funktioniert');

// --- Selbsttest ---
await p.goto(BASE + '#/admin');
await p.waitForSelector('#selftest');
await p.click('#selftest');
await p.waitForSelector('#stout .it:nth-child(7)', { timeout: 20000 });
const rows = await p.locator('#stout .it .t').allTextContents();
const icons = await p.locator('#stout .it > div:first-child').allTextContents();
rows.forEach((r, i) => console.log('      ' + icons[i] + ' ' + r));
ok(icons.filter(i => i.includes('✅')).length === 6, 'Alle sechs Schritte gruen');
ok(icons.some(i => i.includes('🎉')), 'Abschlussmeldung "festbereit"');

// Der Testeintrag darf nicht in der Galerie liegenbleiben
await p.goto(BASE + '#/gallery');
await p.waitForTimeout(1500);
ok(await p.locator('.grid figure').count() === 0, 'Selbsttest raeumt hinter sich auf');

// --- Zuruecksetzen auf App-Werte ---
await p.goto(BASE + '#/admin');
await p.fill('#sbu', 'https://falsch.example.com');
await p.click('#save');
await p.waitForTimeout(600);
await p.goto(BASE + '#/admin');
await p.click('#sbreset');
await p.waitForTimeout(600);
ok(await p.evaluate(() => !localStorage.getItem('ep.sb')), 'Zuruecksetzen entfernt die Geraete-Werte');

console.log('\nSeitenfehler:', errs.length ? errs : 'keine');
await b.close();
console.log(fails.length ? '\n❌ ' + fails.join(' | ') : '\n✅ Navigation und Selbsttest in Ordnung.');
process.exit(fails.length ? 1 : 0);
