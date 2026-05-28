export type NominatimPlace = {
    display_name?: string;
    address?: {
        city?: string;
        town?: string;
        village?: string;
        municipality?: string;
        hamlet?: string;
        suburb?: string;
        state?: string;
        country?: string;
    };
};

const NOMINATIM_HEADERS = {
    'Accept-Language': 'de',
    'User-Agent': 'startplatzboerse.com (inserieren)',
};

export function isPostalCodeReadyForLookup(code: string): boolean {
    const val = code.trim();
    if (val.length < 4) return false;

    const digitCount = (val.match(/\d/g) || []).length;
    if (digitCount >= 3) return true;

    return /^[A-Za-z]{1,2}\d[A-Za-z\d]?(\s*\d[A-Za-z]{0,2})?$/i.test(val) && val.length >= 5;
}

export function extractPlaceLabel(place: NominatimPlace): string {
    const address = place.address;
    if (address) {
        const name =
            address.city ||
            address.town ||
            address.village ||
            address.municipality ||
            address.hamlet ||
            address.suburb;
        if (name) return name.trim();
    }

    if (place.display_name) {
        return place.display_name.split(',')[0].trim();
    }

    return '';
}

/** Eindeutiger Vorschlag oder häufigster Ort; bei Mehrdeutigkeit null (nur Datalist). */
export function pickSuggestedCity(places: NominatimPlace[]): string | null {
    const labels = places.map(extractPlaceLabel).filter(Boolean);
    if (!labels.length) return null;
    if (labels.length === 1) return labels[0];

    const unique = new Set(labels.map((l) => l.toLowerCase()));
    if (unique.size === 1) return labels[0];

    const counts = new Map<string, { label: string; count: number }>();
    for (const label of labels) {
        const key = label.toLowerCase();
        const entry = counts.get(key);
        if (entry) entry.count += 1;
        else counts.set(key, { label, count: 1 });
    }

    const sorted = [...counts.values()].sort((a, b) => b.count - a.count);
    const best = sorted[0];
    if (!best) return null;

    if (best.count >= Math.ceil(labels.length / 2)) return best.label;
    return null;
}

export function collectPlaceOptions(places: NominatimPlace[]): string[] {
    const seen = new Set<string>();
    const options: string[] = [];

    for (const place of places) {
        const label = extractPlaceLabel(place);
        if (!label) continue;
        const key = label.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        options.push(label);
    }

    return options;
}

export async function lookupPlacesByPostalCode(postalCode: string): Promise<NominatimPlace[]> {
    const query = postalCode.trim();
    if (!isPostalCodeReadyForLookup(query)) return [];

    const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&postalcode=${encodeURIComponent(query)}&limit=8`;

    const res = await fetch(url, { headers: NOMINATIM_HEADERS });
    if (!res.ok) return [];

    const data = await res.json();
    return Array.isArray(data) ? data : [];
}
