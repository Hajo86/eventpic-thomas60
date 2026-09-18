/* Minimaler Nachbau der Supabase-REST- und Storage-Endpunkte, die die App nutzt.
   Nur für Tests: alles im Speicher, keine Persistenz, keine echte Sicherheit.

   Start:  node tests/mock-supabase.mjs [port] [--reject-auth]
   --reject-auth simuliert Schluessel, die den Authorization-Header ablehnen
   (401), damit der Fallback der App geprueft werden kann.                     */
import { createServer } from 'http';

const PORT = Number(process.argv[2]) || 8300;
const REJECT_AUTH = process.argv.includes('--reject-auth');
const PIN = 'Hajo86';

const rows = [];                 // Datenbankzeilen
const objects = new Map();       // Storage: path -> Buffer

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'access-control-allow-headers': 'apikey,authorization,content-type,prefer,x-upsert,cache-control',
  'access-control-expose-headers': 'content-range',
};
const json = (res, code, body) => {
  res.writeHead(code, { ...CORS, 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};
const body = req => new Promise(r => {
  const c = []; req.on('data', d => c.push(d)); req.on('end', () => r(Buffer.concat(c)));
});

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const path = decodeURIComponent(url.pathname);

  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }

  // Oeffentlicher Bucket: ohne Schluessel lesbar. Muss so sein, denn ein
  // <img src="..."> kann keine Header mitschicken.
  const isPublicRead = req.method === 'GET' && path.startsWith('/storage/v1/object/public/');

  // Schluesselpruefung
  if (!isPublicRead && !req.headers.apikey) {
    return json(res, 401, { message: 'No API key found in request' });
  }
  if (!isPublicRead && REJECT_AUTH && req.headers.authorization) {
    return json(res, 401, { message: 'Invalid authorization header for this key type' });
  }

  // ---- Storage: oeffentlich lesen ----
  if (req.method === 'GET' && path.startsWith('/storage/v1/object/public/')) {
    const key = path.replace('/storage/v1/object/public/eventpic/', '');
    const buf = objects.get(key);
    if (!buf) { res.writeHead(404, CORS); return res.end('Not found'); }
    res.writeHead(200, { ...CORS, 'content-type': 'image/jpeg', 'content-length': buf.length });
    return res.end(buf);
  }

  // ---- Storage: hochladen ----
  if (req.method === 'POST' && path.startsWith('/storage/v1/object/eventpic/')) {
    const key = path.replace('/storage/v1/object/eventpic/', '');
    objects.set(key, await body(req));
    return json(res, 200, { Key: 'eventpic/' + key });
  }

  // ---- REST: Zeile einfuegen ----
  if (req.method === 'POST' && path === '/rest/v1/event_photos') {
    const row = JSON.parse((await body(req)).toString() || '{}');
    row.hidden = false;
    row.created_at = new Date().toISOString();
    rows.push(row);
    return json(res, 201, [row]);
  }

  // ---- REST: Zeilen lesen ----
  if (req.method === 'GET' && path === '/rest/v1/event_photos') {
    const ev = (url.searchParams.get('event_id') || '').replace('eq.', '');
    const limit = Number(url.searchParams.get('limit') || 400);
    const out = rows
      .filter(r => r.event_id === ev && !r.hidden)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .slice(0, limit);
    return json(res, 200, out);
  }

  // ---- RPC ----
  if (req.method === 'POST' && path.startsWith('/rest/v1/rpc/')) {
    const fn = path.replace('/rest/v1/rpc/', '');
    const a = JSON.parse((await body(req)).toString() || '{}');
    const needPin = () => {
      if (a.p_pin !== PIN) { json(res, 400, { message: 'PIN falsch' }); return false; }
      return true;
    };
    if (fn === 'ep_delete_own_photo') {
      const i = rows.findIndex(r => r.id === a.p_id && r.owner_token === a.p_token);
      if (i >= 0) rows.splice(i, 1);
      return json(res, 200, i >= 0 ? 1 : 0);
    }
    if (fn === 'ep_admin_list') {
      if (!needPin()) return;
      return json(res, 200, rows.filter(r => r.event_id === a.p_event));
    }
    if (fn === 'ep_admin_set_hidden') {
      if (!needPin()) return;
      rows.forEach(r => { if (r.id === a.p_id) r.hidden = a.p_hidden; });
      return json(res, 200, null);
    }
    if (fn === 'ep_admin_delete') {
      if (!needPin()) return;
      const i = rows.findIndex(r => r.id === a.p_id);
      if (i >= 0) { objects.delete(rows[i].path); rows.splice(i, 1); }
      return json(res, 200, null);
    }
    return json(res, 404, { message: 'Could not find the function ' + fn });
  }

  json(res, 404, { message: 'not found: ' + req.method + ' ' + path });
});

server.listen(PORT, () => {
  console.log('mock-supabase auf http://127.0.0.1:' + PORT +
    (REJECT_AUTH ? '  (lehnt Authorization-Header ab)' : ''));
});
