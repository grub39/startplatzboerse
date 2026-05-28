/** Inhalt wie web/src/components/Faq.astro */
export type FaqItem = {
  question: string;
  answerHtml: string;
};

export const FAQ_ITEMS: FaqItem[] = [
  {
    question: 'Was ist Startplatzboerse.com?',
    answerHtml:
      'Wir sind eine Community-Plattform von Sportlern für Sportler. Hier kannst du Startplätze für Läufe, Radrennen, Triathlon und HYROX ganz einfach verkaufen oder übernehmen – schnell, unkompliziert und komplett gebührenfrei.',
  },
  {
    question: 'Kostet die Nutzung wirklich nichts?',
    answerHtml:
      'Ja. Keine Gebühren, keine Provisionen, keine Werbung. Stöbern geht ohne Konto – wer einen Platz anbieten oder Nachrichten schreiben möchte, legt einmalig ein kostenloses Profil an.\n\nDie Startplatzbörse ist ein privates Herzensprojekt. Wir wollen es so lange wie möglich kostenlos und werbefrei betreiben. Sollten die Kosten irgendwann deutlich steigen, sind wir möglicherweise gezwungen, Wege zu finden, den Betrieb zu finanzieren. Das werden wir offen kommunizieren – niemand wird überrumpelt.',
  },
  {
    question: 'Wie kann ich einen Startplatz verkaufen?',
    answerHtml:
      'Ganz einfach in 3 Schritten:\n1. Fülle das Formular „Platz inserieren“ aus.\n2. Dein Angebot erscheint nach kurzer Prüfung online.\n3. Interessenten melden sich direkt bei dir.\n\nDu entscheidest selbst, an wen du verkaufst.',
  },
  {
    question: 'Wie kaufe ich einen Startplatz?',
    answerHtml:
      'Wähle dein Event aus der Liste und schreibe eine Nachricht an den Verkäufer. Du füllst ein kurzes Formular mit deinem Namen und deiner E-Mail aus, damit wir wissen wer du bist. Diese Daten werden direkt an den Verkäufer gesendet, damit ihr alles Weitere klären könnt.',
  },
  {
    question: 'Ist der Kauf sicher?',
    answerHtml:
      'Da der Verkauf direkt von Privat an Privat läuft, empfehlen wir sichere Bezahlmethoden wie PayPal (Waren & Dienstleistungen). Klärt vorher, ob eine Umschreibung beim Veranstalter möglich ist. Bei unsicheren Gefühlen kannst du uns jederzeit kontaktieren.',
  },
  {
    question: 'Fallen Ummeldegebühren an?',
    answerHtml:
      'Das hängt allein vom Veranstalter des Events ab. Manche verlangen eine kleine Gebühr für die Namensänderung, manche machen es kostenlos. Bitte prüft das kurz auf der Webseite des Veranstalters, bevor ihr den Deal macht.',
  },
  {
    question: 'Welche Events finde ich hier?',
    answerHtml:
      'Aktuell fokussieren wir uns auf:\n• Lauf-Events (5 km bis Marathon)\n• Radrennen\n• Triathlon (Sprint bis Langdistanz)\n• HYROX-Events',
  },
  {
    question: 'Ich habe noch eine Frage.',
    answerHtml:
      'Kein Problem! Schreib uns einfach eine E-Mail oder nutze den Support-Chat in den Einstellungen. Da dies ein Ein-Mann-Projekt ist, antworte ich so schnell ich kann – meistens abends.',
  },
];

export function faqAnswerToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
