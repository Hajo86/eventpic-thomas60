/* ==========================================================================
   tasks.js — Event-Konfiguration + Fotoaufgaben
   --------------------------------------------------------------------------
   Diese Datei darfst du ohne Programmierkenntnisse bearbeiten.

   Aufgabe ändern   : Text hinter "text:" anpassen.
   Aufgabe streichen: Zeile löschen ODER "off: true" ergänzen (behält die ID).
   Aufgabe ergänzen : neue Zeile nach dem gleichen Muster, mit NEUER id.

   ⚠️ Die "id" ist der Schlüssel, unter dem die Fotos gespeichert werden.
      Nie eine id nachträglich ändern — sonst verlieren bereits hochgeladene
      Fotos ihre Aufgabe. Neue Aufgaben bekommen einfach die nächste freie id.
   ========================================================================== */

window.EVENT = {
  // Unratbare Kennung dieses Fests. Trennt die Fotos von anderen Events
  // in derselben Datenbank. Nur ändern, wenn du bei Null anfangen willst.
  eventId: 'thomas60-2026',

  title: 'Thomas wird 60',
  subtitle: 'Mach mit: {n} Fotoaufgaben für den schönsten Tag',  // {n} = Anzahl
  honoree: 'Thomas',
  dateLabel: '',            // z.B. '13. Juni 2026' — leer = wird nicht angezeigt
  accent: '#c8102e',        // Akzentfarbe der App
  slideshowSeconds: 6,      // Bildwechsel in der Slideshow
  showLeaderboard: false,   // Spaß-Rangliste (siehe Lastenheft F-35)
  maxEdge: 1600,            // längste Bildkante nach Komprimierung (px)
  jpegQuality: 0.82,
};

/* Kategorien: id, Label, Emoji.
   "timed: true" markiert Programmpunkte, die nur zu bestimmten Zeiten
   fotografierbar sind (Blasorchester, Eiswagen, Hüpfburg, Gulaschkanone). */
window.CATEGORIES = [
  { id: 'thomas',  label: 'Thomas',          icon: '🎉' },
  { id: 'guests',  label: 'Gäste & Gruppen', icon: '👥' },
  { id: 'sixty',   label: '60 & Zahlen',     icon: '6️⃣' },
  { id: 'programm', label: 'Programm',       icon: '🎪', timed: true },
  { id: 'moments', label: 'Deko & Momente',  icon: '📸' },
];

/* Optionales "icon" pro Aufgabe überschreibt das Kategorie-Emoji. */
window.TASKS = [
  // ---- Thomas ------------------------------------------------------------
  { id: 't01', cat: 'thomas',   text: 'Fotografiere dich mit dem Geburtstagskind Thomas.' },
  { id: 't06', cat: 'thomas',   text: 'Fotografiere einen besonderen Moment zwischen Thomas und seinen Enkelkindern.', icon: '👶' },

  // ---- Gäste & Gruppen ---------------------------------------------------
  { id: 'g12', cat: 'guests',   text: 'Fotografiere dich mit mindestens zwei September-Geburtstagskindern.', icon: '🎂' },
  { id: 'g13', cat: 'guests',   text: 'Mache ein Gruppenfoto von Frauen, die alle 29 sind.', icon: '💃' },
  { id: 'k01', cat: 'guests',   text: 'Mache ein Foto mit drei Generationen.', icon: '👨‍👩‍👧' },
  { id: 'g01', cat: 'guests',   text: 'Fotografiere zwei Gäste, die sich schon mindestens 20 Jahre lang kennen.' },
  { id: 'g03', cat: 'guests',   text: 'Mache ein möglichst verrücktes Gruppenfoto.', icon: '🤪' },
  { id: 'g11', cat: 'guests',   text: 'Fotografiere jemanden beim Tanzen.', icon: '🕺' },
  { id: 'g14', cat: 'guests',   text: 'Fotografiere dich mit deinem Tischnachbarn.' },
  { id: 'g10', cat: 'guests',   text: 'Mache ein kreatives Anstoßfoto.', icon: '🥂' },

  // ---- 60 & Zahlen -------------------------------------------------------
  { id: 's04', cat: 'sixty',    text: 'Mache ein Gruppenfoto von Personen, die alle mindestens 60 sind.' },
  { id: 's02', cat: 'sixty',    text: 'Fotografiere jemanden mit der Zahl 60.' },

  // ---- Programm ----------------------------------------------------------
  { id: 'u01', cat: 'programm', text: 'Fotografiere dich mit der Gulaschkanone.', icon: '🍲' },
  { id: 'm02', cat: 'programm', text: 'Mache ein Foto von einem Musiker oder einer Musikerin des Blasorchesters in Aktion.', icon: '🎺' },
  { id: 'e02', cat: 'programm', text: 'Mache ein lustiges oder kreatives Foto am Eiswagen.', icon: '🍦' },
  { id: 'h01', cat: 'programm', text: 'Fotografiere die Hüpfburg mit möglichst viel Action.', icon: '🤸' },

  // ---- Deko & Momente ----------------------------------------------------
  { id: 'd01', cat: 'moments',  text: 'Fotografiere die schönste Partydekoration.', icon: '✨' },
  { id: 'p04', cat: 'moments',  text: 'Mache ein Foto, das Thomas auch an seinem 70. Geburtstag noch gerne anschauen wird.', icon: '🕰️' },
  { id: 'p05', cat: 'moments',  text: 'Fotografiere deinen persönlichen Lieblingsmoment des Tages.', icon: '❤️' },
];
