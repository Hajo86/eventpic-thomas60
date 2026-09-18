# Lastenheft — Fotoaufgaben-App „Thomas wird 60"

Stand: 2026-09-18 · Auftraggeber: Hajo · Vorbild: [eventpic.eu](https://eventpic.eu/)

---

## 1. Ausgangslage & Zielsetzung

### 1.1 Anlass
Thomas feiert seinen **60. Geburtstag**. Gefeiert wird als Gartenfest/Hoffest mit
**Blasorchester**, **Eiswagen**, **Hüpfburg** und **Gulaschkanone**; anwesend sind Familie
(inkl. **Enkelkinder**), Freunde und langjährige Bekannte über mehrere Generationen.

### 1.2 Problem
Auf einem solchen Fest entstehen hunderte Fotos — verteilt über 40+ Handys. Nach dem Fest
passiert typischerweise: nichts. Einzelne schicken etwas per WhatsApp, der Rest bleibt in
fremden Kamerarollen. Dem Geburtstagskind fehlen am Ende genau die Momente, die es selbst
nicht miterleben konnte.

### 1.3 Ziel
Eine **Web-App ohne Installation und ohne Registrierung**, die
1. Gäste über **Fotoaufgaben** aktiv zum Fotografieren anregt (statt passiv „macht mal Fotos"),
2. alle Fotos **an einem Ort** sammelt,
3. sie **live** für alle sichtbar macht (Galerie am Handy, Slideshow auf TV/Beamer),
4. Thomas nach dem Fest **ein komplettes Download-Paket** hinterlässt.

### 1.4 Erfolgskriterien (messbar)
| Kriterium | Zielwert |
|---|---|
| Zeit von QR-Scan bis erstes Foto hochgeladen | < 60 Sekunden |
| Anteil der Gäste, die mindestens 1 Foto hochladen | ≥ 50 % |
| Gesammelte Fotos am Ende des Fests | ≥ 150 |
| Support-Rückfragen an den Gastgeber („wie geht das?") | ≈ 0 |
| Kosten für Hosting + Speicher | 0 € (Free Tier) |

---

## 2. Abgrenzung des Lieferumfangs

### 2.1 In Scope
- Lauffähige **PWA** (QR → Aufgabenliste → Foto → Upload → Live-Galerie → Slideshow → Admin)
- **Fertiger Aufgabenkatalog** für dieses Fest, personalisiert auf Thomas und das Programm
- **Supabase-Backend** (Postgres + Storage) inkl. Schema, Policies und Setup-Anleitung
- **Offline-Warteschlange** (Upload läuft nach, wenn das WLAN/Netz zickt)
- **Download aller Fotos** als ZIP für den Gastgeber
- **QR-Code-Generator** in der App (offline, keine Fremddienste)

### 2.2 Explizit Out of Scope
- **Kein Druck-Deliverable** — keine Tischkarten-PDFs, keine Aufgabenkärtchen zum Ausschneiden
  (auf ausdrücklichen Wunsch des Auftraggebers). Der QR-Code kann natürlich ausgedruckt werden,
  ist aber kein gestaltetes Printprodukt.
- Keine Benutzerkonten, keine Passwörter für Gäste
- Keine KI-Bildbearbeitung, keine Filter, kein Beauty-Retusche
- Keine Videos (nur Standbilder) — bewusst, wegen Upload-Dauer und Speicher
- Keine native App in App Store / Play Store
- Keine Gesichtserkennung / kein automatisches Personen-Tagging (DSGVO-Risiko, unnötig)

---

## 3. Rollen

| Rolle | Wer | Rechte |
|---|---|---|
| **Gast** | jeder mit QR-Code/Link | Aufgaben sehen, Fotos hochladen, Galerie sehen, eigene Fotos löschen |
| **Gastgeber / Admin** | Hajo | alles vom Gast + Slideshow, Moderation (Foto verbergen/löschen), Konfiguration, ZIP-Download, QR-Code |
| **Geburtstagskind** | Thomas | wie Gast (soll nicht mit Technik behelligt werden) |

---

## 4. Funktionale Anforderungen

Priorisierung: **M** = Muss, **S** = Soll, **K** = Kann.

### 4.1 Zugang
| ID | Prio | Anforderung |
|---|---|---|
| F-01 | M | Zugang ausschließlich über URL/QR-Code. Kein App-Download, keine Registrierung, kein Login. |
| F-02 | M | Beim ersten Öffnen fragt die App **nur nach dem Vornamen** des Gasts (für die Zuordnung „von wem ist das Foto"). Überspringbar → Uploads laufen dann als „Anonym". |
| F-03 | M | Der Name wird lokal gespeichert; beim zweiten Öffnen landet der Gast direkt in der Aufgabenliste. |
| F-04 | S | Die App ist als PWA installierbar („Zum Home-Bildschirm"), funktioniert aber vollständig im normalen Browser-Tab. |
| F-05 | M | Funktioniert auf iOS Safari und Android Chrome in aktuellen Versionen; Mobile-First, Ein-Hand-Bedienung. |

### 4.2 Fotoaufgaben
| ID | Prio | Anforderung |
|---|---|---|
| F-10 | M | Die App zeigt den Aufgabenkatalog als Liste von Karten, gruppiert in thematische Kategorien. |
| F-11 | M | Jede Aufgabe hat: Titel/Aufgabentext, Kategorie, Status (offen / erledigt), Anzahl bereits hochgeladener Fotos zu dieser Aufgabe (fest-weit). |
| F-12 | M | Fortschrittsanzeige für den einzelnen Gast: „7 von 19 Aufgaben erledigt". |
| F-13 | S | Filter: „Alle" / „Noch offen" / „Von mir erledigt" + Kategorie-Filter. |
| F-14 | S | Button **„Überrasch mich"** → springt zu einer zufälligen, für diesen Gast noch offenen Aufgabe. |
| F-15 | M | Aufgaben sind **keine Pflicht und keine Reihenfolge** — jeder macht, was er will, so oft er will. |
| F-16 | K | Mehrere Fotos pro Aufgabe pro Gast erlaubt. |
| F-17 | M | Der Aufgabenkatalog ist in einer eigenen Datei gepflegt und ohne Code-Kenntnisse änderbar (Text ergänzen/streichen). |
| F-18 | S | Aufgaben, die eine Programmkomponente betreffen (Blasorchester, Eiswagen, Hüpfburg, Gulaschkanone), sind als solche erkennbar, damit Gäste sie zur richtigen Zeit einlösen. |

### 4.3 Fotografieren & Hochladen
| ID | Prio | Anforderung |
|---|---|---|
| F-20 | M | Aus einer Aufgabe heraus öffnet ein Tap direkt die **Kamera** (oder alternativ die Galerie des Geräts). |
| F-21 | M | Vorschau vor dem Absenden, mit Möglichkeit, das Foto zu verwerfen. |
| F-22 | S | Optionaler kurzer Kommentar (max. 140 Zeichen) zum Foto. |
| F-23 | M | Fotos werden **im Browser komprimiert** (längste Kante ≤ 1600 px, JPEG ~0,8) → ~200–400 KB statt 4 MB. Spart Datenvolumen, Speicher und Wartezeit. |
| F-24 | M | EXIF-Daten (insbesondere **GPS**) werden beim Komprimieren entfernt. |
| F-25 | M | Upload-Status ist sichtbar (läuft / fertig / fehlgeschlagen mit Wiederholen-Button). |
| F-26 | M | **Offline-Warteschlange**: Bei fehlendem Netz wird das Foto lokal (IndexedDB) zwischengespeichert und automatisch nachgeladen, sobald wieder Verbindung besteht. Der Gast darf die Seite dazwischen schließen. |
| F-27 | S | Mehrere Fotos in Folge hochladen ohne Zwischenschritte („noch eins"). |
| F-28 | S | Der Gast kann **eigene** Fotos wieder löschen (Reue-Funktion), ohne Admin. |

### 4.4 Live-Galerie
| ID | Prio | Anforderung |
|---|---|---|
| F-30 | M | Galerie-Ansicht mit allen freigegebenen Fotos, neueste zuerst, als Raster mit Thumbnails. |
| F-31 | M | Die Galerie aktualisiert sich **automatisch** (Polling), ohne dass der Gast neu laden muss. |
| F-32 | M | Vollbild-Ansicht (Lightbox) mit Aufgabentext, Gastname, Kommentar, Wischen/Blättern. |
| F-33 | S | Galerie filterbar nach Aufgabe, Kategorie und Gast. |
| F-34 | S | Einzelnes Foto herunterladen bzw. via System-Teilen-Dialog weitergeben. |
| F-35 | K | Spaß-Rangliste „wer hat die meisten Aufgaben erledigt" — abschaltbar, keine Preise, kein Druck. |

### 4.5 Slideshow (TV / Beamer)
| ID | Prio | Anforderung |
|---|---|---|
| F-40 | M | Separater Vollbild-Modus für einen großen Bildschirm, aufrufbar über eigenen Link/Hash. |
| F-41 | M | Automatischer Wechsel (Intervall einstellbar, Standard 6 s), neue Fotos werden automatisch eingemischt. |
| F-42 | S | Einblendung von Aufgabentext + „Foto von \<Name\>" sowie dem Event-Titel. |
| F-43 | S | Läuft dauerhaft ohne Bedienung (kein Dialog, kein Timeout, Bildschirm bleibt wach). |
| F-44 | K | „Frisch eingetroffen"-Hinweis, wenn ein Foto < 2 Minuten alt ist. |

### 4.6 Admin / Gastgeber
| ID | Prio | Anforderung |
|---|---|---|
| F-50 | M | Admin-Bereich über eigenen Hash-Link + lokal gespeicherten Admin-Code erreichbar; für Gäste nicht sichtbar verlinkt. |
| F-51 | M | Eingabe und lokale Speicherung der Supabase-Zugangsdaten (Projekt-URL + Anon-Key). **Keine Schlüssel im Repository.** |
| F-52 | M | **QR-Code-Generator** in der App: erzeugt den QR zur Gast-URL direkt im Browser, als Bild speicherbar. Ohne externen Dienst — die URL verlässt das Gerät nicht. |
| F-53 | M | **Moderation**: einzelnes Foto verbergen oder endgültig löschen (für den Fall, dass jemand Unpassendes hochlädt). |
| F-54 | M | **Alle Fotos als ZIP herunterladen**, Dateinamen sprechend (`Aufgabe_Gast_Zeit.jpg`). |
| F-55 | S | Live-Zahlen: Fotos gesamt, aktive Gäste, erledigte Aufgaben, beliebteste Aufgabe, Aufgaben ohne Foto. |
| F-56 | S | Event-Konfiguration (Titel, Name des Geburtstagskinds, Datum, Akzentfarbe, Slideshow-Intervall) ohne Code-Änderung. |
| F-57 | K | „Testdaten löschen" / Event zurücksetzen vor dem echten Fest. |

### 4.7 Betrieb ohne Backend
| ID | Prio | Anforderung |
|---|---|---|
| F-60 | M | Ohne konfigurierte Supabase-Zugangsdaten startet die App im **Demo-Modus**: Aufgaben und Ablauf voll bedienbar, Fotos bleiben lokal im Gerät. So ist die App vorab testbar und fällt bei Backend-Ausfall nicht komplett aus. |
| F-61 | M | Der Modus ist für den Gastgeber klar erkennbar (Hinweisbanner), ohne Gäste zu verunsichern. |

---

## 5. Nichtfunktionale Anforderungen

### 5.1 Technik
| ID | Anforderung |
|---|---|
| N-01 | **Vanilla JS, kein Build-Schritt** — konsistent mit den übrigen Projekten des Auftraggebers. Statisches Hosting (GitHub Pages) genügt. |
| N-02 | Keine npm-Laufzeitabhängigkeiten, keine CDN-Abhängigkeit zur Laufzeit. Alles, was die App braucht, liegt im Repo (inkl. QR-Erzeugung und ZIP-Erstellung). |
| N-03 | Auslieferung über **HTTPS** (Pflicht für Kamera + Service Worker). |
| N-04 | Service Worker cacht die App-Shell → schneller Start, funktioniert bei wackligem Gartenfest-WLAN. |
| N-05 | Backend: Supabase Free Tier (Postgres + Storage + REST). Zugriff über plain `fetch` auf die REST-API, ohne SDK. |

### 5.2 Performance
| ID | Anforderung |
|---|---|
| N-10 | Erster sinnvoller Inhalt < 2 s im Mobilfunknetz. |
| N-11 | Upload eines Fotos < 5 s bei durchschnittlichem LTE. |
| N-12 | Galerie mit 500 Fotos bleibt flüssig scrollbar (Lazy Loading der Bilder). |

### 5.3 Bedienbarkeit
| ID | Anforderung |
|---|---|
| N-20 | Zielgruppe ist **explizit nicht technikaffin** und reicht bis 80+. Keine Fachbegriffe, keine Einstellungen im Gast-Flow, Schrift ausreichend groß, Tap-Flächen ≥ 44 px. |
| N-21 | Der Gast muss nie etwas lesen, was länger als ein Satz ist. |
| N-22 | Vollständig deutschsprachig, Duzen, freundlich-festlicher Ton. |
| N-23 | Bei Fehlern: verständlicher Klartext („Das Foto konnte noch nicht gesendet werden — wir versuchen es automatisch weiter"), keine technischen Codes. |
| N-24 | Kontraste nach WCAG AA; bedienbar in hellem Sonnenlicht im Garten (heller Modus als Standard, dunkler Modus für die Slideshow). |

### 5.4 Datenschutz & Recht
| ID | Anforderung |
|---|---|
| N-30 | Datensparsamkeit: gespeichert werden nur Foto, Aufgaben-ID, Vorname (freiwillig), optionaler Kommentar, Zeitstempel. **Keine** E-Mail, keine Telefonnummer, keine Accounts, kein Tracking, keine Analytics, keine Cookies von Dritten. |
| N-31 | GPS/EXIF wird clientseitig entfernt (siehe F-24). |
| N-32 | Kurzer, verständlicher Hinweistext beim ersten Öffnen: wofür die Fotos verwendet werden (privates Fest, Galerie für die Gäste, Erinnerung für Thomas), dass sie für alle Gäste sichtbar sind und dass eigene Fotos jederzeit gelöscht werden können. |
| N-33 | **Fotos von Kindern**: Hinweis, dass Kinderfotos nur mit Einverständnis der Eltern hochgeladen werden. |
| N-34 | Nicht-öffentliche Galerie: erreichbar nur über den Event-Link mit unratbarer Event-Kennung; keine Suchmaschinen-Indexierung (`noindex`). |
| N-35 | Löschfrist: Der Gastgeber löscht Bucket und Tabelle nach Übergabe des Fotopakets (dokumentierter Schritt, kein Automatismus). |
| N-36 | Speicherort der Daten: Supabase-Region **EU (Frankfurt)** wählen. |

### 5.5 Robustheit
| ID | Anforderung |
|---|---|
| N-40 | Netzausfall darf niemals zu Datenverlust führen (Offline-Queue, F-26). |
| N-41 | Doppeltes Antippen darf kein Foto doppelt hochladen (Idempotenz über lokale Upload-ID). |
| N-42 | Fehlerhafte/riesige Bilddateien dürfen die App nicht blockieren (Guard + verständliche Meldung). |
| N-43 | Die App muss auch dann funktionieren, wenn ein einzelnes Foto im Storage fehlt (Platzhalter statt kaputte Galerie). |

---

## 6. Aufgabenkatalog (inhaltliche Anforderung)

Der Katalog wurde vom Auftraggeber vorgegeben. Er umfasst **19 Aufgaben** in fünf
Kategorien — bewusst knapp gehalten, damit jeder Gast den Katalog komplett überblickt
und keine Aufgabe „übrig" bleibt.

| Kategorie | Anzahl | Inhalt |
|---|---|---|
| 🎉 **Thomas** | 2 | Selfie mit dem Geburtstagskind, Moment mit den Enkelkindern |
| 👥 **Gäste & Gruppen** | 8 | September-Geburtstagskinder, „alle 29", drei Generationen, 20 Jahre Freundschaft, verrücktes Gruppenfoto, Tanzen, Tischnachbar, Anstoßfoto |
| 6️⃣ **60 & Zahlen** | 2 | Gruppenfoto „alle mindestens 60", jemand mit der Zahl 60 |
| 🎪 **Programm** | 4 | Gulaschkanone, Blasorchester, Eiswagen, Hüpfburg — als Programmpunkt markiert |
| 📸 **Deko & Momente** | 3 | schönste Dekoration, „das schaut Thomas mit 70 noch gerne an", persönlicher Lieblingsmoment |

Anforderungen an den Katalog:
- **A-01** Jede Aufgabe ist in **einem Satz** formuliert, im Du, ohne Fachsprache.
- **A-02** Jede Aufgabe ist **lösbar ohne Absprache** mit dem Gastgeber.
- **A-03** Keine Aufgabe zwingt zu Alkohol, Körperkontakt, Peinlichkeit oder Mutproben.
- **A-04** Keine Aufgabe setzt voraus, dass man Thomas gut kennt — auch entfernte Bekannte
  müssen mitmachen können.
- **A-05** Aufgaben sind über den ganzen Tag verteilt lösbar (Ankunft, Essen, Programm, Abend).
- **A-06** Der Katalog ist erweiterbar, ohne dass Uploads zu bestehenden Aufgaben verloren gehen
  (stabile IDs). Aufgaben, die eine frühere Fassung schon enthielt, haben ihre ID behalten.
- **A-07** Mehrere Aufgaben funktionieren zusätzlich als **Gesprächsanlass** (wer hat im
  September Geburtstag, wer kennt sich seit 20 Jahren) — das ist gewollt: sie bringen Gäste
  ins Gespräch, die sich sonst nicht ansprechen würden.

## 7. Abnahmekriterien

Die Lieferung gilt als abgenommen, wenn:

1. **Gast-Flow**: Auf einem fremden Handy führt der QR-Scan ohne Erklärung binnen 60 Sekunden
   zu einem hochgeladenen Foto, das in der Galerie eines zweiten Geräts erscheint.
2. **Offline**: Im Flugmodus aufgenommenes Foto erscheint nach Wiederherstellung der Verbindung
   automatisch in der Galerie — auch nach Schließen des Browsers.
3. **Slideshow**: Läuft auf einem TV/Laptop 30 Minuten unbeaufsichtigt und zeigt neue Fotos
   ohne Neuladen.
4. **Admin**: QR-Code erzeugbar, Foto verbergbar/löschbar, ZIP-Download enthält alle Fotos mit
   sprechenden Dateinamen.
5. **Datenschutz**: Ein hochgeladenes Foto enthält keine GPS-Daten mehr (nachweisbar per
   EXIF-Prüfung).
6. **Demo-Modus**: Ohne Supabase-Konfiguration ist die App vollständig bedienbar.
7. **Inhalt**: Der vollständige vorgegebene Aufgabenkatalog (19 Aufgaben) ist enthalten,
   kategorisiert, mit stabilen IDs.
8. **Betriebskosten**: 0 € (GitHub Pages + Supabase Free Tier).

---

## 8. Risiken & Gegenmaßnahmen

| Risiko | Wirkung | Gegenmaßnahme |
|---|---|---|
| Gartenfest-WLAN/Mobilfunk schwach | Uploads scheitern, Frust | Offline-Queue (F-26), starke Client-Komprimierung (F-23) |
| Supabase Free-Tier-Limit (Storage) | Uploads brechen ab | Komprimierung, Kalkulation: 500 Fotos × 350 KB ≈ 175 MB, Limit 1 GB → passt |
| Ältere Gäste kommen nicht klar | geringe Beteiligung | radikal reduzierter Gast-Flow (N-20/21), ein Ausdruck mit QR + einem Satz Erklärung auf den Tischen |
| Unpassendes Foto landet in der Slideshow | peinlicher Moment | Moderation (F-53), Slideshow zeigt nur freigegebene Fotos |
| Niemand nutzt die App, weil sie niemand kennt | Projekt wirkungslos | QR sichtbar an Eingang, Tischen, Buffet; kurze Ansage durchs Blasorchester-Mikro |
| Anon-Key im Client einsehbar | theoretisch Fremd-Uploads | RLS: nur INSERT + SELECT für anon, kein UPDATE/DELETE; unratbare Event-ID; Moderation |
| Gast lädt Video hoch | Speicher voll, Upload hängt | Uploads auf Bilddateien beschränkt (F-Out-of-Scope), klare Meldung |

---

## 9. Offene Punkte (Entscheidung Auftraggeber)

| Nr. | Frage | Status |
|---|---|---|
| O-1 | Eigenes GitHub-Repository: Diese Session darf keins anlegen (fehlende Berechtigung der GitHub-App). Auftraggeber legt ein leeres, öffentliches Repo an, dann wird dieser Stand dorthin gepusht. | **offen** |
| O-2 | Supabase-Projekt (Region EU/Frankfurt) anlegen und Projekt-URL + Anon-Key im Admin-Bereich eintragen. | **offen** |
| O-3 | Exakter Wortlaut des Datenschutz-Hinweises — Vorschlag liegt in der App, bitte gegenlesen. | **offen** |
| O-4 | Soll die Spaß-Rangliste (F-35) an oder aus sein? Standard: **aus**. | **offen** |
| O-5 | Eigene Domain statt `github.io`-URL? (kürzerer QR, hübscherer Link) | **offen** |
