import Constants from 'expo-constants';

/** Aus app.json – bei neuem Release hier Eintrag in RELEASE_NOTES ergänzen. */
export const APP_VERSION = Constants.expoConfig?.version ?? '–';

export type ReleaseNotesEntry = {
  changes: string[];
  fixes: string[];
};

/**
 * Änderungen pro App-Version (per eas update auslieferbar).
 * Bei jeder sichtbaren Version hier pflegen.
 */
export const RELEASE_NOTES: Record<string, ReleaseNotesEntry> = {
  '1.0.0': {
    changes: [
      'Hilfe & Support-Chat in den Einstellungen',
      'Push bei neuen Chat-Nachrichten und Support-Antworten',
      'Profilbild in „Profil & Konto“ und in den Einstellungen',
      'E-Mail wird beim App-Onboarding im Profil gespeichert',
    ],
    fixes: [
      'Support: Tastatur verdeckt die Eingabe nicht mehr',
      'Support: FAQ/E-Mail blenden sich bei geöffneter Tastatur aus',
      'Profilbilder: zuverlässigerer Upload und Anzeige',
      'Größere Tap-Flächen in den Einstellungen',
    ],
  },
};

export function getReleaseNotesForVersion(version: string = APP_VERSION) {
  const notes = RELEASE_NOTES[version];
  return {
    version,
    changes: notes?.changes ?? [],
    fixes: notes?.fixes ?? [],
    hasDetails: Boolean(notes && (notes.changes.length > 0 || notes.fixes.length > 0)),
  };
}

export function formatAppVersionLabel(version: string = APP_VERSION) {
  return version === '–' ? '–' : `v${version}`;

}
