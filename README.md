# 🎉 Fotoaufgaben-App „Thomas wird 60"

Nachbau der Idee von [eventpic.eu](https://eventpic.eu/) als eigene, kostenlose PWA:
**QR-Code scannen → Fotoaufgabe aussuchen → Foto machen → landet live in der Galerie.**
Ohne App-Installation, ohne Registrierung, ohne Werbung.

- **Lastenheft:** [`LASTENHEFT.md`](LASTENHEFT.md) — Ziele, Anforderungen, Abnahmekriterien, Risiken
- **Aufgabenkatalog:** [`tasks.js`](tasks.js) — 19 Aufgaben, auf Thomas und das Programm zugeschnitten
- **Datenbank-Setup:** [`schema.sql`](schema.sql) — einmal in Supabase einfügen

---

## Was die App kann

| | |
|---|---|
| 🎯 **19 Fotoaufgaben** | in 5 Kategorien, gruppiert und filterbar; „Überrasch mich" für Unentschlossene |
| 📷 **Foto in 3 Taps** | Aufgabe → Kamera → Absenden. Vorschau + optionaler Kommentar |
| 🗜 **Automatische Komprimierung** | max. 1600 px, ~250 KB statt 4 MB — schont Datenvolumen und Speicher |
| 🛡 **EXIF/GPS wird entfernt** | das Bild wird auf dem Handy neu gerendert, Standortdaten überleben das nicht |
| 📴 **Offline-Warteschlange** | kein Netz im Garten? Foto wird lokal gepuffert und automatisch nachgesendet |
| 🖼 **Live-Galerie** | aktualisiert sich selbst, filterbar nach Kategorie und Gast, Vollbild mit Wischen |
| 📺 **Slideshow** | Vollbildmodus für TV/Beamer, mischt neue Fotos automatisch ein, „neu"-Badge |
| 👤 **Meine Fotos** | jeder Gast kann eigene Fotos selbst wieder löschen |
| 🔄 **Fortschritt folgt dem Server** | löscht der Gastgeber ein Foto, verschwindet das Häkchen beim Gast von allein |
| 🖨 **Aushang zum Ausdrucken** | fertige A4-Seite oder vier Tischkarten, QR und Kurzanleitung, druckfertig aus dem Browser (`#/print`) |
| 🔑 **Gastgeber-Bereich** | QR-Code, Live-Zahlen, Selbsttest, ZIP-Download |
| ☑️ **Moderation mit Mehrfachauswahl** | Fotos ankreuzen → verbergen oder löschen; „alle löschen" mit Tipp-Bestätigung |
| 📉 **Sparsam mit Datenvolumen** | die Galerie lädt 420-px-Vorschaubilder (~15 KB), das Original nur im Vollbild |
| 📦 **0 € Betrieb** | GitHub Pages + Supabase Free Tier |

Kein Build-Schritt, keine npm-Abhängigkeiten, keine CDN-Aufrufe zur Laufzeit —
QR-Erzeugung und ZIP-Packen sind selbst implementiert (`qr.js`, `zip.js`).

---

## Schnellstart (15 Minuten)

### 1 · Seite aufrufen
Lokal testen:
```bash
python3 -m http.server 8000
# → http://localhost:8000
```
Ohne Zugangsdaten läuft die App im **Demo-Modus**: alles bedienbar, Fotos bleiben
nur auf dem Gerät. So kannst du sie in Ruhe ausprobieren.

> Kamera, Service Worker und „Zum Home-Bildschirm" brauchen **https** oder `localhost`.
> `file://` funktioniert nicht.

### 2 · Supabase-Projekt anlegen

1. [supabase.com](https://supabase.com) → **New project**
   - Name: frei (z.B. `thomas60`)
   - **Region: `Central EU (Frankfurt)`** — die Fotos bleiben damit in der EU
   - Datenbank-Passwort setzen und irgendwo sicher notieren (brauchst du hier nicht,
     aber ohne kommst du später nicht mehr an die Datenbank)
   - Plan: **Free**
   - Anlegen dauert ein bis zwei Minuten.

2. Linke Seitenleiste → **SQL Editor** → **New query**.
   Den **kompletten** Inhalt von [`schema.sql`](schema.sql) hineinkopieren.

3. **Eine einzige Zeile ändern** — such nach `BITTE-AENDERN` (die Zeile kommt
   zweimal vor; ändere **beide** oder führ hinterher Abschnitt 8 aus):
   ```sql
   values ('thomas60-2026', 'BITTE-AENDERN-0000')
   ```
   Ersetze `BITTE-AENDERN-0000` durch deine **Admin-PIN** (frei wählbar, z.B. sechs
   Ziffern). Die brauchst du später für die Moderation. Nimm keine PIN, die du
   woanders benutzt — und schreib sie **nicht** ins Repository zurück.

4. **Run** drücken. Am Ende gibt das Skript einen Selbsttest aus. Er muss so aussehen:

   | status | pruefung |
   |---|---|
   | ✅ ok | 1. Tabelle public.event_photos |
   | ✅ ok | 2. Row Level Security aktiv |
   | ✅ ok | 3. Policies für anon (lesen + einfügen) |
   | ✅ ok | 4. Die vier ep_-Funktionen |
   | ✅ ok | 5. Öffentlicher Storage-Bucket „eventpic" |
   | ✅ ok | 6. Admin-PIN geändert |

   Steht irgendwo ❌, ist dieser Teil nicht durchgelaufen — Fehlermeldung oberhalb lesen,
   korrigieren, das Skript einfach noch einmal komplett ausführen. Es ist **wiederholbar**
   (`if not exists` / `create or replace`), zerstört also nichts.

5. **Project Settings → API** (Zahnrad unten links) → notieren:
   - **Project URL** — sieht aus wie `https://abcdefghijkl.supabase.co`
   - **anon public** — der lange Schlüssel, der mit `eyJ…` anfängt
     (**nicht** `service_role` — der darf nie in die App)

> **Du hast schon ein Supabase-Projekt (RSS-Akquise)?** Technisch passt das Schema daneben:
> alle Objekte heißen `event_photos`, `ep_*`, `eventpic_private` und Bucket `eventpic` — es
> kollidiert nichts mit `leads` / `lead-photos`, und es wird nichts verändert oder gelöscht.
>
> **Trotzdem: nimm für das Fest ein zweites, eigenes Projekt** (Free Tier, 5 Minuten).
> Grund: Der Anon-Key steckt bei *jedem Partygast* im Browser und gilt immer für das
> **ganze Projekt**. In der RSS-Datenbank ist `leads` per `using (true)` für `anon` voll
> lesbar *und* schreibbar — jeder Gast mit dem QR-Code hätte damit Zugriff auf den
> kompletten Lead-Pool. Ein getrenntes Projekt löst das sauber und kostet nichts.

### 3 · App verbinden und testen

**Die Zugangsdaten gehören in [`tasks.js`](tasks.js), nicht in den Admin-Bereich.**
Nur dort gelten sie für *alle* Gäste. Sonst müsste sie jeder auf seinem Handy
selbst eintragen — genau das soll niemand tun:

```js
supabaseUrl: 'https://xxxxxxxxxxxx.supabase.co',
supabaseKey: 'sb_publishable_…',      // bzw. der anon-public-Key
supabaseBucket: 'eventpic',
```

Ändern, committen, pushen — fertig. Dass der Schlüssel damit öffentlich im
Repository steht, ist **so vorgesehen**: Er landet ohnehin im Browser jedes
Gasts. Geschützt wird nicht der Schlüssel, sondern die Datenbank — per Row
Level Security darf er nur sichtbare Fotos lesen und neue einfügen (siehe
[`schema.sql`](schema.sql)). Ein `service_role`- oder `secret`-Schlüssel darf
dort **niemals** stehen.

Der Admin-Bereich überschreibt die Werte nur **für dein eigenes Gerät** —
praktisch zum Ausprobieren eines zweiten Projekts. Beide Felder leeren und
speichern nimmt die Änderung zurück.

1. App öffnen, hinten an die Adresse `#/admin` hängen
   (der Link steht auch unten unter „Meine Fotos" und auf der Info-Seite).
2. Status prüfen: Es muss „Verbindung steht ✅" und „Quelle: `tasks.js` —
   gilt für alle Gäste" dastehen.
3. **Selbsttest** im Gastgeber-Bereich drücken (🔎). Er prüft in sechs Schritten
   Lesen, Upload, Datenbankeintrag und öffentlichen Abruf — und räumt hinter sich
   auf. Der erste rote Schritt sagt, woran es liegt.
4. **Echter Durchlauf** — das ist der eigentliche Test:
   - Eine Aufgabe öffnen, Foto machen, absenden.
   - Tab **Galerie**: Das Foto muss da sein.
   - **Zweites Gerät** (oder privates Fenster) mit derselben Adresse öffnen: Das Foto muss
     auch dort erscheinen. Erst dann läuft die Cloud wirklich.
   - Admin → **PIN eintragen → „Alle Fotos laden"**: Liste muss kommen, „Verbergen"
     muss das Foto aus der Galerie nehmen.
   - Admin → **„Alle Fotos als ZIP herunterladen"**: Datei muss sich öffnen lassen.
5. Vor dem Fest die Testfotos wegräumen: Admin → PIN → „Alle Fotos laden" → jedes Foto
   **Löschen**.

#### Wenn etwas nicht geht

| Meldung / Symptom | Ursache | Lösung |
|---|---|---|
| `401` oder „Invalid API key" | falscher oder abgeschnittener Key | Anon-Key neu kopieren, keine Leerzeichen, kein Zeilenumbruch |
| `404` / „relation … does not exist" | `schema.sql` nicht (vollständig) gelaufen | SQL Editor, Skript komplett erneut ausführen, Selbsttest prüfen |
| „Could not find the function" | REST-API kennt die neuen Funktionen noch nicht | `notify pgrst, 'reload schema';` im SQL Editor ausführen, 30 s warten |
| `42501` / „row-level security policy" | Policies fehlen | Selbsttest Zeile 3 prüfen, Skript erneut ausführen |
| „Bucket not found" beim Upload | Bucket fehlt oder heißt anders | Storage → Bucket `eventpic` muss existieren und **public** sein; im Admin-Feld „Storage-Bucket" muss derselbe Name stehen |
| „PIN falsch" trotz richtiger PIN | PIN im Skript nicht geändert oder anderes Event | Selbsttest Zeile 6 prüfen |
| Foto bleibt in „wartet auf Versand" | kein Netz oder Upload scheitert | Seite offen lassen, Queue läuft automatisch weiter; Fehler steht im Admin-Status |

### 4 · QR-Code holen
Im Admin-Bereich unter „2 · QR-Code für die Gäste": **QR als Bild speichern**.
Der Code wird lokal im Browser gerechnet, die Adresse wird an keinen Dienst geschickt.

> ⚠️ **Einmal mit der Handykamera testscannen**, bevor du ihn vervielfältigst.

### 5 · Fest
- QR sichtbar aufhängen: Eingang, Tische, Buffet, Gulaschkanone, Eiswagen.
- Eine kurze Ansage („Handy raus, Code scannen, Aufgaben abarbeiten") bringt mehr
  Beteiligung als jedes Plakat.
- Slideshow auf TV/Beamer: `#/slideshow` — läuft ohne weitere Bedienung.

### 6 · Danach
1. Admin-Bereich → **Alle Fotos als ZIP herunterladen** → an Thomas übergeben.
2. Aufräumen: die beiden `delete`-Zeilen am Ende von [`schema.sql`](schema.sql) ausführen
   oder das Supabase-Projekt löschen.

---

## Aufgaben ändern

Alles in [`tasks.js`](tasks.js), reiner Text:

```js
{ id: 'g12', cat: 'guests', text: 'Fotografiere die beste Grillschürze des Tages.' },
```

- **Text ändern:** einfach überschreiben.
- **Aufgabe raus:** Zeile löschen oder `off: true` ergänzen.
- **Neue Aufgabe:** neue Zeile mit **neuer `id`**.
- ⚠️ **Eine vorhandene `id` nie umbenennen** — daran hängen die bereits hochgeladenen Fotos.

Ebenfalls dort: Titel, Name des Geburtstagskinds, Akzentfarbe, Slideshow-Intervall,
Bildgröße, Rangliste an/aus. Änderungen in `tasks.js` gelten für **alle** Gäste;
die Felder im Admin-Bereich gelten nur für das eigene Gerät.

---

## Dateien

| Datei | Zweck |
|---|---|
| `index.html` | App-Shell + komplettes CSS |
| `app.js` | Logik: Aufgaben, Upload-Queue, Galerie, Slideshow, Admin |
| `tasks.js` | **Inhalte**: Event-Konfiguration + Aufgabenkatalog |
| `qr.js` | QR-Encoder (Byte-Modus, ECC M, Version 1–6), eigenständig |
| `zip.js` | ZIP-Writer (stored) für den Foto-Download |
| `schema.sql` | Supabase: Tabelle, RLS-Policies, Funktionen, Storage-Bucket |
| `sw.js` | Service Worker (App-Shell-Cache, Netz zuerst) |
| `manifest.json` | PWA-Manifest |
| `icons/` | App-Icons, erzeugt von `scripts/make-icons.mjs` |
| `LASTENHEFT.md` | Anforderungen und Abnahmekriterien |

---

## Tests

Die Datei- und Browser-Tests, mit denen diese Version geprüft wurde:

```bash
# QR-Encoder: Rücklesen der Matrix, Reed-Solomon-Syndrome, Strukturprüfung
node tests/qr-test.mjs

# ZIP-Writer: gegen Pythons zipfile geprüft
node tests/zip-test.mjs && python3 -c "import zipfile;print(zipfile.ZipFile('/tmp/eventpic-test.zip').testzip())"

# Online-Pfad gegen einen Fake-Supabase: Upload, Storage, zweites Geraet,
# Moderation, falsche PIN. Zweiter Lauf prueft Schluessel, die den
# Authorization-Header ablehnen (neue "Publishable Keys").
node tests/mock-supabase.mjs 8300 &
node tests/mock-supabase.mjs 8305 --reject-auth &
EP_API=http://127.0.0.1:8300 node tests/e2e-online.mjs
EP_API=http://127.0.0.1:8305 node tests/e2e-online.mjs

# Fortschritt: geloeschte Fotos raeumen die Haken beim Gast weg
EP_API=http://127.0.0.1:8300 node tests/e2e-progress.mjs

# Navigation aus allen Bereichen + Selbsttest im Gastgeber-Bereich
EP_API=http://127.0.0.1:8300 node tests/e2e-selftest.mjs

# Gast muss nichts einrichten (Zugangsdaten kommen aus tasks.js)
EP_API=http://127.0.0.1:8300 node tests/e2e-defaults.mjs

# Zwei Regressionstests fuer echte Geraetefehler:
#  - IndexedDB komplett gesperrt (privater Modus)
#  - Verbindung bricht waehrend des Kameragangs ab (iOS)
EP_API=http://127.0.0.1:8300 node tests/e2e-nostorage.mjs
EP_API=http://127.0.0.1:8300 node tests/e2e-idb-closing.mjs

# Kompletter Gast-Flow im echten Chromium (Playwright)
npx http-server -p 8199 -s . &
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tests/e2e.mjs
```

Geprüft wurden u.a.: Onboarding, 19 Aufgaben, Kategoriefilter, Foto-Upload mit
Komprimierung auf JPEG ≤1600 px, Galerie, Lightbox, Slideshow, QR-Zeichnung,
Live-Zahlen, Einstellungen, Löschen eigener Fotos, Abweisen von Nicht-Bildern.

---

## Design

Farben, Schriftzug und das Ähren-Emblem stammen von der Einladungskarte:
Creme (`#f4f1e4`), dunkles Braun (`#4a3527`), Ähren-Gold (`#b5892a`). Das
Emblem mit der 60 ist als SVG nachgebaut und funktioniert offline.

Der Schriftzug nutzt **Yellowtail** von Google Fonts. Das ist die einzige
externe Abhängigkeit zur Laufzeit und bewusst unkritisch: Mit `display=swap`
erscheint sofort Text, und ohne Netz greift die Systemschrift
(`Snell Roundhand` auf iPhone/Mac, `Segoe Script` auf Windows, sonst Georgia).
Wer auch das vermeiden will, löscht die beiden `<link>`-Zeilen in
`index.html` — das Layout bleibt unverändert.

## Kapazität: was das Supabase-Free-Tier trägt

| Grenze (Free) | Wert | Für dieses Fest |
|---|---|---|
| Speicher (Storage) | **1 GB** | Foto ~400 KB + Vorschau ~15 KB → **etwa 2.400 Fotos** |
| Datenbank | 500 MB | eine Zeile ist ~200 Byte → praktisch unbegrenzt |
| Datenverkehr raus | **5 GB / Monat** | siehe unten — das ist die eigentliche Grenze |
| Gleichzeitige Gäste | kein festes Limit | 40 Handys sind für die REST-API unkritisch |
| Dateigröße | 50 MB | wird nie erreicht (komprimiert auf ~400 KB) |
| Projekt-Pause | nach **7 Tagen ohne Zugriff** | Fotopaket zeitnah herunterladen! |

**Der Datenverkehr ist der Flaschenhals, nicht der Speicher.** Jeder Galerie-Besuch
lädt Bilder herunter. Ohne Vorschaubilder wären das 40 Gäste × 300 Fotos × 400 KB
≈ **4,8 GB** — das Monatslimit wäre am Nachmittag erreicht und die Galerie tot.

Deshalb lädt die Galerie **420-px-Vorschaubilder** (~15 KB). Dieselbe Runde kostet
damit ~180 MB statt 4,8 GB, also **rund 96 % weniger**. Das Original wird nur
geholt, wenn jemand ein Foto im Vollbild öffnet, und für die Slideshow und den
ZIP-Download. Zusätzlich werden die Bilder eine Woche im Browser zwischen-
gespeichert, sodass Zweitbesuche nichts mehr kosten.

## Sicherheit & Grenzen — ehrlich

- Der **Anon-Key** steckt zur Laufzeit im Browser jedes Gasts. Das ist bei Supabase so
  vorgesehen; abgesichert wird über **Row Level Security**: `anon` darf nur *lesen*
  (sichtbare Fotos) und *einfügen*. Ändern und Löschen läuft ausschließlich über
  geprüfte Datenbankfunktionen.
- Wer den Link hat, kann Fotos hochladen. Für ein privates Fest ist das gewollt
  (keine Anmeldung). Gegen Unfug: Moderation im Admin-Bereich (verbergen/löschen).
- Die **Galerie ist nicht öffentlich gelistet** (`noindex`, unratbare Event-ID), aber auch
  nicht passwortgeschützt. Wer den Link weitergibt, gibt die Galerie weiter.
- **Gast löscht eigenes Foto**: die Datenbankzeile verschwindet (Foto ist aus Galerie und
  Slideshow weg). Die Datei im Storage bleibt bis zum Aufräumen nach dem Fest liegen.
- **Admin-PIN** liegt in einem Schema, das die REST-API nicht ausliefert; geprüft wird
  serverseitig. Trotzdem: keine PIN verwenden, die du woanders benutzt.
- Ein **Service-Role-Key** wird nirgends gebraucht und darf nie in die App.

---

## Deployment auf GitHub Pages

```bash
# 1. Auf github.com ein neues, OEFFENTLICHES Repo anlegen (leer, ohne README)
# 2. Dann lokal:
git remote add origin https://github.com/<dein-name>/<repo>.git
git push -u origin main
# 3. Repo -> Settings -> Pages -> Source: "Deploy from a branch", Branch: main / root
```
Nach ein bis zwei Minuten laeuft die App unter `https://<dein-name>.github.io/<repo>/`.
Diese Adresse steckt dann automatisch im QR-Code des Gastgeber-Bereichs.

GitHub Pages braucht fuer kostenloses Hosting ein **oeffentliches** Repo. Der Code ist
damit oeffentlich, die Fotos sind es nicht — die liegen in Supabase hinter der Event-ID,
und im Repo stehen keine Schluessel.
