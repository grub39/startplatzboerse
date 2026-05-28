/** Distanz-Optionen beim Inserieren — identisch mit der App. */
export const LISTING_DISTANCE_OPTIONS: Record<string, string[]> = {
  Laufen: ['5 km', '10 km', '21,1 km Halbmarathon', '42,2 km Marathon', 'Ultra', 'Trail', 'Freie Distanz'],
  Radrennen: ['Freie Distanz'],
  Triathlon: [
    'Sprint (0,75/20/5 km)',
    'Olympisch (1,5/40/10 km)',
    '70.3 Mitteldistanz (1,9/90/21 km)',
    '140.6 Langdistanz (3,8/180/42 km)',
    'Freie Distanz',
  ],
  Hyrox: ['Open Men/Women', 'Pro Men/Women', 'Doubles', 'Relay'],
};

export const LAUFEN_SPECIAL_DISTANCES = ['Ultra', 'Trail'] as const;
export type LaufenSpecial = (typeof LAUFEN_SPECIAL_DISTANCES)[number];

export function standardDistancesForCategory(cat: string): string[] {
  const all = LISTING_DISTANCE_OPTIONS[cat] ?? [];
  if (cat !== 'Laufen') return all;
  return all.filter((d) => !LAUFEN_SPECIAL_DISTANCES.includes(d as LaufenSpecial));
}

export type SearchDistanceChip = {
  label: string;
  targetKm?: number;
  range?: { min?: number; max?: number };
  matchTerms?: string[];
};

export const SEARCH_DISTANCE_CHIPS: Record<string, SearchDistanceChip[]> = {
  Laufen: [
    { label: '5 km', targetKm: 5, matchTerms: ['5 km'] },
    { label: '10 km', targetKm: 10, matchTerms: ['10 km'] },
    { label: 'Halbmarathon', targetKm: 21.1, matchTerms: ['halbmarathon', '21,1'] },
    { label: 'Marathon', targetKm: 42.2, matchTerms: ['marathon', '42,2'] },
    { label: 'Ultra', matchTerms: ['ultra', 'backyard'] },
    { label: 'Trail', matchTerms: ['trail', 'hm+', 'hm−', 'itra'] },
  ],
  Radrennen: [
    { label: 'Kurzstrecke', targetKm: 60, matchTerms: ['kurzstrecke'] },
    { label: 'Jedermann', targetKm: 100, matchTerms: ['jedermann'] },
    { label: 'Gran Fondo', targetKm: 160, matchTerms: ['gran fondo', 'granfondo'] },
    { label: 'Radmarathon', targetKm: 200, matchTerms: ['radmarathon'] },
  ],
  Triathlon: [
    { label: 'Sprint', targetKm: 26, matchTerms: ['sprint'] },
    { label: 'Olympisch', targetKm: 52, matchTerms: ['olympisch', 'kurz'] },
    { label: 'Mitteldistanz', targetKm: 113, matchTerms: ['mitteldistanz', '70.3', '70,3'] },
    { label: 'Langdistanz', targetKm: 226, matchTerms: ['langdistanz', '140.6', '140,6'] },
  ],
};

export const DISTANCE_TOLERANCE_KM = 7;

type ListingDistanceFields = {
  distance?: string | null;
  distance_km?: number | null;
};

function normalizeDistanceText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function distanceTextMatches(distance: string | null | undefined, terms: string[] | undefined) {
  if (!terms?.length || !distance) return false;
  const haystack = normalizeDistanceText(distance);
  return terms.some((term) => haystack.includes(normalizeDistanceText(term)));
}

export function listingMatchesDistanceChip(
  listing: ListingDistanceFields,
  chip: SearchDistanceChip
): boolean {
  if (chip.range && typeof listing.distance_km === 'number') {
    const aboveMin = chip.range.min === undefined || listing.distance_km >= chip.range.min;
    const belowMax = chip.range.max === undefined || listing.distance_km <= chip.range.max;
    return aboveMin && belowMax;
  }

  if (typeof chip.targetKm === 'number' && typeof listing.distance_km === 'number') {
    if (Math.abs(listing.distance_km - chip.targetKm) <= DISTANCE_TOLERANCE_KM) {
      return true;
    }
  }

  return distanceTextMatches(listing.distance, chip.matchTerms);
}

export function getSearchDistanceChip(category: string, label: string | null): SearchDistanceChip | undefined {
  if (!label) return undefined;
  return SEARCH_DISTANCE_CHIPS[category]?.find((chip) => chip.label === label);
}
