/* Gemeldet: Der Gastgeber loescht die Fotos, aber auf den Geraeten der Gaeste
   bleiben die Aufgaben abgehakt. Der Fortschritt lag nur lokal. Jetzt gilt der
   Server: keine eigenen Fotos mehr -> keine Haken mehr.                      */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const BASE = process.env.EP_BASE || 'http://127.0.0.1:8199/';
const API = process.env.EP_API || 'http://127.0.0.1:8300';
const PIN = 'Hajo86';
const fails = [];
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails.push(m); };

await fetch(API + '/__reset').catch(() => {});
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 414, height: 900 }, locale: 'de-DE' });
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
  localStorage.setItem('ep.guest', JSON.stringify('Heidi'));
});

// Zwei Fotos hochladen
await p.goto(BASE, { waitUntil: 'networkidle' });
await p.click('text=Alle 19');
for (const id of ['t01', 'g11']) {
  await p.click(`[data-task="${id}"]`);
  await p.waitForSelector('#cam', { state: 'attached' });
  await p.setInputFiles('#cam', new URL('../icons/icon-512.png', import.meta.url).pathname);
  await p.waitForSelector('#send');
  await p.click('#send');
  await p.waitForSelector('[data-task]', { timeout: 10000 });
}
await p.waitForFunction(() => window.EP && window.EP.state.photos.length === 2, null, { timeout: 15000 });
await p.click('text=Alle 19');
ok((await p.textContent('#hSub')).includes('2 von 19'), 'Fortschritt: ' + await p.textContent('#hSub'));
ok(await p.locator('[data-task="t01"].done').count() === 1, 'Aufgabe t01 ist abgehakt');

// Der Fortschritt muss einen Neustart der App ueberleben
await p.reload({ waitUntil: 'networkidle' });
await p.waitForSelector('[data-task]');
ok((await p.textContent('#hSub')).includes('2 von 19'), 'Nach Neuladen weiter 2 von 19');

// Gastgeber loescht beide Fotos (wie im Gastgeber-Bereich)
const rows = await (await fetch(API + '/rest/v1/event_photos?select=*&event_id=eq.thomas60-2026', {
  headers: { apikey: 'x' } })).json();
ok(rows.length === 2, 'Server hat zwei Fotos');
for (const r of rows) {
  await fetch(API + '/rest/v1/rpc/ep_admin_delete', {
    method: 'POST', headers: { apikey: 'x', 'content-type': 'application/json' },
    body: JSON.stringify({ p_pin: PIN, p_id: r.id }),
  });
}

// Beim naechsten Abgleich muessen die Haken verschwinden
await p.evaluate(() => window.EP.refresh(true));
await p.waitForFunction(() => window.EP.state.photos.length === 0, null, { timeout: 10000 });
await p.waitForTimeout(600);
await p.click('text=Alle 19');
ok(await p.locator('[data-task="t01"].done').count() === 0, 'Haken bei t01 ist weg');
ok(await p.locator('[data-task].done').count() === 0, 'Kein einziger Haken mehr');
const sub = await p.textContent('#hSub');
ok(/Mach mit|0 von/.test(sub), 'Kopfzeile zurueckgesetzt: ' + sub);
ok(await p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('ep.mine') || '{}')).length === 0),
   'Auch der lokale Stand ist geleert');

// Und nach einem Neuladen bleibt es dabei
await p.reload({ waitUntil: 'networkidle' });
await p.waitForSelector('[data-task]');
ok(await p.locator('[data-task].done').count() === 0, 'Nach Neuladen weiterhin keine Haken');

console.log('\nSeitenfehler:', errs.length ? errs : 'keine');
await b.close();
console.log(fails.length ? '\n❌ ' + fails.join(' | ') : '\n✅ Fortschritt folgt dem Server.');
process.exit(fails.length ? 1 : 0);
