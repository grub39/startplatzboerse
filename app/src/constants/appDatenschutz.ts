/** Abschnitte der App-spezifischen Datenschutzerklärung (Stand: Mai 2026). */
export type LegalSection = {
  title: string;
  paragraphs: string[];
  bullets?: string[];
};

export const APP_DATENSCHUTZ_INTRO =
  'Diese Datenschutzerklärung gilt ausschließlich für die mobile App „Startplatzbörse“ (iOS und Android). ' +
  'Für unsere Website und weitere Online-Angebote gelten ergänzend die Hinweise unter startplatzboerse.com/datenschutz.';

export const APP_DATENSCHUTZ_SECTIONS: LegalSection[] = [
  {
    title: '1. Verantwortlicher',
    paragraphs: [
      'Dustin Rose · startplatzboerse.com · Lindenplan 26, 39120 Magdeburg',
      'E-Mail: info@startplatzboerse.com',
    ],
  },
  {
    title: '2. Welche Daten wir in der App verarbeiten',
    paragraphs: [
      'Zur Nutzung der App verarbeiten wir insbesondere folgende personenbezogene Daten:',
    ],
    bullets: [
      'E-Mail-Adresse und Anmeldedaten (Einmalcode per E-Mail über Supabase Auth)',
      'Profildaten: Nickname, Profilbild, Einstellungen (z. B. Push-Optionen)',
      'Inseratsdaten: Event, Ort, Datum, Preis, Kategorie, Beschreibung',
      'Merkliste und Chat-Nachrichten zwischen Nutzern zu Inseraten',
      'Support-Chat: Nachrichteninhalte, Ticket-Status, technische Zuordnung zum Support-Team',
      'Geräte-Push-Token (sofern du Push-Benachrichtigungen aktivierst)',
      'Technische Verbindungsdaten beim Zugriff auf unsere Server (z. B. Zeitpunkt, API-Anfragen)',
    ],
  },
  {
    title: '3. Zwecke und Rechtsgrundlagen',
    paragraphs: [
      'Die Verarbeitung erfolgt zur Bereitstellung der App, zur Abwicklung von Inseraten und Kommunikation sowie zur Bearbeitung von Support-Anfragen.',
    ],
    bullets: [
      'Art. 6 Abs. 1 lit. b DSGVO – Vertragserfüllung / Nutzung der Plattform',
      'Art. 6 Abs. 1 lit. a DSGVO – Push-Benachrichtigungen (nur nach deiner Einwilligung im Betriebssystem und in den App-Einstellungen)',
      'Art. 6 Abs. 1 lit. f DSGVO – IT-Sicherheit, Stabilität, Missbrauchsprävention',
    ],
  },
  {
    title: '4. Berechtigungen auf deinem Gerät',
    paragraphs: [
      'Die App kann dich um folgende Berechtigungen bitten. Du kannst sie in den Systemeinstellungen jederzeit widerrufen:',
    ],
    bullets: [
      'Internet – für Login, Inserate, Chat und Support (erforderlich)',
      'Foto-Mediathek / Galerie – optional, nur wenn du ein Profilbild aus deinen Fotos wählst',
      'Benachrichtigungen – optional, für Push zu neuen Chat-Nachrichten und Support-Antworten',
      'Vibration – bei Push-Benachrichtigungen auf Android',
    ],
  },
  {
    title: '5. Push-Benachrichtigungen (Expo)',
    paragraphs: [
      'Wenn du Push-Benachrichtigungen aktivierst, erzeugt die App über den Dienst Expo (Expo Application Services) einen gerätebezogenen Push-Token. Dieser wird in unserer Datenbank (Supabase, Tabelle device_tokens) mit deiner Nutzer-ID, Plattform (iOS/Android) und dem Anbieter „expo“ gespeichert, solange die Funktion aktiv ist.',
      'Push-Nachrichten werden nur für von dir ausgelöste oder von dir gewünschte Ereignisse versendet (z. B. neue Chat-Nachrichten, Support-Antworten), nicht zu Werbezwecken. Du kannst Push in den App-Einstellungen unter „Benachrichtigungen“ sowie in den Geräteeinstellungen deaktivieren.',
      'Rechtsgrundlage: Art. 6 Abs. 1 lit. a DSGVO (Einwilligung).',
    ],
  },
  {
    title: '6. Datenbank, Authentifizierung & Speicherung (Supabase)',
    paragraphs: [
      'Konten, Inserate, Chats, Support-Tickets und Profildaten werden bei Supabase (Cloud-Datenbank) gespeichert. Profilbilder liegen im Supabase Storage. Die Übertragung erfolgt verschlüsselt (HTTPS/TLS).',
      'Speicherdauer: Daten bleiben gespeichert, solange dein Konto besteht bzw. der jeweilige Inhalt (Inserat, Nachricht) nicht gelöscht wird. Support-Verläufe werden zur Bearbeitung deiner Anfrage vorgehalten; abgeschlossene Tickets können archiviert werden.',
    ],
  },
  {
    title: '7. Support-Chat & Matrix',
    paragraphs: [
      'Der In-App-Support-Chat wird in unserer Datenbank geführt. Zur Bearbeitung durch unser Team können Nachrichten über eine sichere Schnittstelle an ein Matrix-basiertes Team-Postfach (Element) übermittelt werden. Dabei werden Inhalt der Nachricht, Zeitstempel und Ticket-Zuordnung verarbeitet – nicht dein gesamtes Nutzerprofil.',
      'Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Support im Rahmen der Nutzung).',
    ],
  },
  {
    title: '8. Nutzer-zu-Nutzer-Chat',
    paragraphs: [
      'Nachrichten zwischen Käufern und Verkäufern zu einem Inserat werden in Supabase gespeichert, damit beide Parteien den Verlauf in der App sehen können. Andere Nutzer haben keinen Zugriff auf eure Unterhaltung.',
    ],
  },
  {
    title: '9. Analyse, Tracking & Werbung in der App',
    paragraphs: [
      'In der mobilen App setzen wir derzeit keine Werbe-Tracker, kein Cross-App-Tracking und keine Analyse-SDKs (z. B. Google Analytics, Facebook SDK) ein.',
      'Wir erfassen keine Standortdaten über GPS. Es findet kein Profiling zu Werbezwecken statt.',
      'Technische Protokolle (z. B. Fehlermeldungen in der Konsole bei Entwicklung) dienen ausschließlich der Fehlerbehebung und werden nicht zu Marketingzwecken ausgewertet.',
      'Hinweis: Unsere Website kann – unabhängig von der App – datenschutzfreundliche Reichweitenmessung nutzen (siehe Web-Datenschutzerklärung).',
    ],
  },
  {
    title: '10. App-Updates (Expo)',
    paragraphs: [
      'Für Over-the-Air-Updates nutzen wir Expo Updates. Der Dienst kann beim Start kurz technische Metadaten (z. B. App-Version, Laufzeit-Version) abrufen, um zu prüfen, ob ein Update bereitsteht. Personenbezogene Inhalte werden dabei nicht zu Analysezwecken ausgewertet. Updates über den App Store bzw. Play Store unterliegen den Richtlinien von Apple bzw. Google.',
    ],
  },
  {
    title: '11. Datenübermittlung in Drittländer',
    paragraphs: [
      'Supabase und Expo können Daten in Ländern außerhalb der EU/des EWR verarbeiten (u. a. USA). Die Übermittlung erfolgt auf Grundlage geeigneter Garantien gemäß Art. 46 DSGVO, insbesondere Standardvertragsklauseln der EU-Kommission, soweit vom Anbieter angeboten.',
    ],
  },
  {
    title: '12. Deine Rechte',
    paragraphs: ['Du hast jederzeit folgende Rechte gegenüber uns:'],
    bullets: [
      'Auskunft (Art. 15 DSGVO)',
      'Berichtigung (Art. 16 DSGVO)',
      'Löschung (Art. 17 DSGVO)',
      'Einschränkung der Verarbeitung (Art. 18 DSGVO)',
      'Datenübertragbarkeit (Art. 20 DSGVO)',
      'Widerspruch (Art. 21 DSGVO)',
      'Widerruf erteilter Einwilligungen (z. B. Push) mit Wirkung für die Zukunft',
      'Beschwerde bei einer Aufsichtsbehörde',
    ],
  },
  {
    title: '13. Kontakt & Änderungen',
    paragraphs: [
      'Bei Fragen zum Datenschutz in der App: info@startplatzboerse.com',
      'Wir passen diese Erklärung an, wenn sich Funktionen der App oder Rechtslage ändern. Es gilt die in der App angezeigte Fassung.',
    ],
  },
];

export const APP_DATENSCHUTZ_STAND = 'Mai 2026';
