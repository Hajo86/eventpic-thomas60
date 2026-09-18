/* Regressionstest: Admin loescht ein Foto. Supabase verbietet das Loeschen in
   storage.objects per SQL — die Funktion darf es deshalb nicht versuchen.
   Die Datenbankzeile muss weg sein, die Bilddatei raeumt die App per
   Storage-API nach (und darf daran scheitern, ohne den Vorgang zu kippen).  */
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
await p.addInitScript(() => {
  localStorage.setItem('ep.consent', JSON.stringify('x'));
  localStorage.setItem('ep.guest', JSON.stringify('Frieda'));
});

// Foto hochladen
await p.goto(BASE, { waitUntil: 'networkidle' });
await p.click('text=Alle 19');
await p.click('[data-task="d01"]');
await p.waitForSelector('#cam', { state: 'attached' });
await p.setInputFiles('#cam', new URL('../icons/icon-512.png', import.meta.url).pathname);
await p.waitForSelector('#send');
await p.click('#send');
await p.waitForFunction(() => window.EP && window.EP.state.photos.length === 1, null, { timeout: 10000 });
ok(true, 'Foto liegt in der Galerie');

// Admin loescht es
await p.goto(BASE + '#/admin');
await p.fill('#pin', 'Hajo86');
await p.click('#mod');
await p.waitForSelector('#modlist [data-sel]', { timeout: 10000 });
// Seit der Mehrfachauswahl laeuft Loeschen ueber Kaestchen + "Auswahl loeschen"
await p.locator('[data-sel]').first().check();
await p.waitForTimeout(300);
p.once('dialog', d => d.accept());
await p.evaluate(() => document.querySelectorAll('.toast').forEach(el => el.remove()));
await p.click('#mDel');
await p.waitForSelector('.toast', { timeout: 10000 });
const t = await p.locator('.toast').textContent();
ok(/gelöscht/i.test(t), 'Erfolgsmeldung: ' + t.slice(0, 60));
ok(!/42501|storage tables/i.test(t), 'Keine Storage-Fehlermeldung mehr');

await p.waitForTimeout(1200);
const left = await p.evaluate(() => window.EP.state.photos.length);
ok(left === 0, 'Foto ist aus der Galerie verschwunden (' + left + ')');

console.log('\nSeitenfehler:', errs.length ? errs : 'keine');
await b.close();
console.log(fails.length ? '\n❌ ' + fails.join(' | ') : '\n✅ Admin-Loeschen funktioniert.');
process.exit(fails.length ? 1 : 0);
