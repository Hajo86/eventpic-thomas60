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
| 🔑 **Gastgeber-Bereich** | QR-Code-Generator, Live-Zahlen, Moderation, ZIP-Download aller Fotos |
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
1. Auf [supabase.com](https://supabase.com) kostenloses Projekt erstellen —
   **Region: EU (Frankfurt)**.
2. Im **SQL Editor** den kompletten Inhalt von [`schema.sql`](schema.sql) einfügen und ausführen.
   Dabei in Abschnitt 3 die Zeile
   ```sql
   values ('thomas60-2026', 'BITTE-AENDERN-0000')
   ```
   auf eine eigene **Admin-PIN** ändern.
3. Unter **Project Settings → API** notieren: **Project URL** und **anon public key**.

> **Du hast schon ein Supabase-Projekt (RSS-Akquise)?** Technisch passt das Schema daneben:
> alle Objekte heißen `event_photos`, `ep_*`, `eventpic_private` und Bucket `eventpic` — es
> kollidiert nichts mit `leads` / `lead-photos`, und es wird nichts verändert oder gelöscht.
>
> **Trotzdem: nimm für das Fest ein zweites, eigenes Projekt** (Free Tier, 5 Minuten).
> Grund: Der Anon-Key steckt bei *jedem Partygast* im Browser und gilt immer für das
> **ganze Projekt**. In der RSS-Datenbank ist `leads` per `using (true)` für `anon` voll
> lesbar *und* schreibbar — jeder Gast mit dem QR-Code hätte damit Zugriff auf den
> kompletten Lead-Pool. Ein getrenntes Projekt löst das sauber und kostet nichts.

### 3 · App verbinden
`#/admin` aufrufen (Link steht unten in „Meine Fotos" und in der Info-Seite),
Projekt-URL + Anon-Key eintragen → **Speichern & prüfen**. Es muss „Verbindung steht ✅"
erscheinen. Die Daten bleiben **nur in diesem Browser** — im Repository liegen keine Schlüssel.

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

# Kompletter Gast-Flow im echten Chromium (Playwright)
npx http-server -p 8199 -s . &
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tests/e2e.mjs
```

Geprüft wurden u.a.: Onboarding, 19 Aufgaben, Kategoriefilter, Foto-Upload mit
Komprimierung auf JPEG ≤1600 px, Galerie, Lightbox, Slideshow, QR-Zeichnung,
Live-Zahlen, Einstellungen, Löschen eigener Fotos, Abweisen von Nicht-Bildern.

---

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
