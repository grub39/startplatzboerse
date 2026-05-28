const NICKNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;
const NAME_REGEX = /^[\p{L}\p{M}'\-\s.]{2,30}$/u;

import {
  emptyTrailForm,
  emptyUltraForm,
  validateTrailForm,
  validateUltraForm,
  type TrailFormState,
  type UltraFormState,
} from './runListingBuild';

const DISTANCE_KM_MIN = 0.1;
const DISTANCE_KM_MAX = 5000;
const PRICE_MIN = 1;
const PRICE_MAX = 9999;
const EVENT_NAME_MIN = 2;
const EVENT_NAME_MAX = 100;
const LOCATION_MIN = 2;
const LOCATION_MAX = 80;
const POSTAL_CODE_MIN = 2;
const POSTAL_CODE_MAX = 12;

/** Erlaubte Zeichen während der Eingabe (international). */
export function sanitizePostalCodeInput(raw: string): string {
    return raw.replace(/[^A-Za-z0-9\s\-]/g, '').slice(0, POSTAL_CODE_MAX);
}

/** Speicherformat: getrimmt, einheitliche Leerzeichen, Großbuchstaben (z. B. SW1A 1AA, L-1234). */
export function normalizePostalCode(raw: string): string {
    return raw.trim().replace(/\s+/g, ' ').toUpperCase();
}

export function validatePostalCode(raw: string): string | null {
    const code = normalizePostalCode(raw);
    if (!code) return 'Bitte Postleitzahl eingeben.';

    if (code.length < POSTAL_CODE_MIN || code.length > POSTAL_CODE_MAX) {
        return `Postleitzahl: ${POSTAL_CODE_MIN}–${POSTAL_CODE_MAX} Zeichen (z. B. 10115, 1010, 75001, L-1234).`;
    }

    if (!/^[A-Z0-9][A-Z0-9\s\-]*[A-Z0-9]$/.test(code)) {
        return 'Postleitzahl: nur Buchstaben, Zahlen, Leerzeichen und Bindestriche.';
    }

    const hasDigit = /\d/.test(code);
    const ukStyle = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/.test(code);

    if (!hasDigit && !ukStyle) {
        return 'Bitte gültige Postleitzahl eingeben (z. B. 10115, 1010, 75001 oder SW1A 1AA).';
    }

    return null;
}

export function normalizeUrl(url: string): string {
    const trimmed = url.trim();
    if (!trimmed) return '';
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function validateEmail(email: string): string | null {
    const trimmed = email.trim();
    if (!trimmed) return 'Bitte E-Mail eingeben.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return 'Bitte gültige E-Mail eingeben.';
    if (trimmed.length > 50) return 'E-Mail ist zu lang (max. 50 Zeichen).';
    return null;
}

export function validateOtp(code: string): string | null {
    if (!/^\d{6}$/.test(code.trim())) return 'Bitte den 6-stelligen Code eingeben.';
    return null;
}

export function validateProfile(input: {
    vorname: string;
    nachname: string;
    nickname: string;
}): string | null {
    const vorname = input.vorname.trim();
    const nachname = input.nachname.trim();
    const nickname = input.nickname.trim();

    if (!vorname) return 'Bitte Vornamen eingeben.';
    if (!nachname) return 'Bitte Nachnamen eingeben.';
    if (!NAME_REGEX.test(vorname)) return 'Vorname: 2–30 Zeichen, Buchstaben und übliche Sonderzeichen.';
    if (!NAME_REGEX.test(nachname)) return 'Nachname: 2–30 Zeichen, Buchstaben und übliche Sonderzeichen.';
    if (!NICKNAME_REGEX.test(nickname)) {
        return 'Nickname ungültig: 3–20 Zeichen, nur Buchstaben, Zahlen und Unterstrich.';
    }
    return null;
}

export type ListingStep2Input = {
  category: string;
  eventName: string;
  eventDate: string;
  distance: string;
  eventUrl?: string;
  customKm?: string;
  swimKm?: string;
  bikeKm?: string;
  runKm?: string;
  ultra?: UltraFormState;
  trail?: TrailFormState;
};

function validateDistanceKm(value: string | undefined, label: string): string | null {
    const raw = value?.trim().replace(',', '.') ?? '';
    if (!raw) return `Bitte ${label} in km angeben.`;
    const n = parseFloat(raw);
    if (!Number.isFinite(n)) return `${label}: Bitte eine gültige Zahl eingeben.`;
    if (n < DISTANCE_KM_MIN) return `${label}: mindestens ${DISTANCE_KM_MIN} km.`;
    if (n > DISTANCE_KM_MAX) return `${label}: maximal ${DISTANCE_KM_MAX} km.`;
    return null;
}

export function validateOptionalUrl(raw: string): string | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    let parsed: URL;
    try {
        parsed = new URL(normalizeUrl(trimmed));
    } catch {
        return 'Bitte eine gültige Homepage-URL eingeben (z.B. https://veranstalter.de).';
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
        return 'Die URL muss mit http:// oder https:// beginnen.';
    }
    if (!parsed.hostname || !parsed.hostname.includes('.')) {
        return 'Bitte eine vollständige Domain angeben (z.B. https://berlin-marathon.de).';
    }
    if (trimmed.length > 255) return 'URL ist zu lang (max. 255 Zeichen).';
    return null;
}

export function validateEventDate(eventDate: string): string | null {
    if (!eventDate) return 'Bitte Datum wählen.';

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const chosen = new Date(eventDate + 'T00:00:00');
    if (Number.isNaN(chosen.getTime())) return 'Ungültiges Datum.';

    if (chosen < today) return 'Das Eventdatum muss heute oder in der Zukunft liegen.';

    const max = new Date(today);
    max.setFullYear(max.getFullYear() + 3);
    if (chosen > max) return 'Das Datum liegt zu weit in der Zukunft (max. 3 Jahre).';

    return null;
}

export function validateListingStep2(input: ListingStep2Input): string | null {
    if (!input.category) return 'Bitte Sportart wählen.';

    const eventName = input.eventName.trim();
    if (eventName.length < EVENT_NAME_MIN) {
        return `Eventname: mindestens ${EVENT_NAME_MIN} Zeichen.`;
    }
    if (eventName.length > EVENT_NAME_MAX) {
        return `Eventname: maximal ${EVENT_NAME_MAX} Zeichen.`;
    }

    const dateError = validateEventDate(input.eventDate);
    if (dateError) return dateError;

    if (!input.distance) return 'Bitte Distanz / Kategorie wählen.';

    const urlError = validateOptionalUrl(input.eventUrl ?? '');
    if (urlError) return urlError;

    if (input.category === 'Radrennen') {
        return validateDistanceKm(input.customKm, 'Strecke');
    }

    if (input.category === 'Laufen' && input.distance === 'Ultra') {
        return validateUltraForm(input.ultra ?? emptyUltraForm());
    }

    if (input.category === 'Laufen' && input.distance === 'Trail') {
        return validateTrailForm(input.trail ?? emptyTrailForm());
    }

    if (input.distance === 'Freie Distanz') {
        if (input.category === 'Triathlon') {
            const swimErr = validateDistanceKm(input.swimKm, 'Schwimmen');
            if (swimErr) return swimErr;
            const bikeErr = validateDistanceKm(input.bikeKm, 'Rad');
            if (bikeErr) return bikeErr;
            const runErr = validateDistanceKm(input.runKm, 'Laufen');
            if (runErr) return runErr;
        } else {
            return validateDistanceKm(input.customKm, 'Distanz');
        }
    }

    return null;
}

export function validateListingStep3(postalCode: string, location: string): string | null {
    const postalError = validatePostalCode(postalCode);
    if (postalError) return postalError;

    const loc = location.trim();
    if (loc.length < LOCATION_MIN) return `Ort: mindestens ${LOCATION_MIN} Zeichen.`;
    if (loc.length > LOCATION_MAX) return `Ort: maximal ${LOCATION_MAX} Zeichen.`;
    if (/^\d+$/.test(loc)) return 'Bitte einen gültigen Ortsnamen eingeben.';

    return null;
}

export function validatePrice(price: string): string | null {
    const raw = price.trim().replace(',', '.');
    if (!raw) return 'Bitte einen Preis eingeben.';

    const n = parseFloat(raw);
    if (!Number.isFinite(n)) return 'Bitte einen gültigen Preis eingeben.';
    if (n < PRICE_MIN) return `Preis: mindestens ${PRICE_MIN} €.`;
    if (n > PRICE_MAX) return `Preis: maximal ${PRICE_MAX.toLocaleString('de-DE')} €.`;
    if (!/^\d+(\.\d{1,2})?$/.test(raw)) return 'Preis: maximal 2 Nachkommastellen.';

    return null;
}

export function getListingStep2Payload(form: {
    category: string;
    eventName: string;
    eventDate: string;
    distance: string;
    eventUrl: string;
    customKm: string;
    swimKm: string;
    bikeKm: string;
    runKm: string;
}): ListingStep2Input {
    return {
        category: form.category,
        eventName: form.eventName,
        eventDate: form.eventDate,
        distance: form.distance,
        eventUrl: form.eventUrl,
        customKm: form.customKm,
        swimKm: form.swimKm,
        bikeKm: form.bikeKm,
        runKm: form.runKm,
    };
}
