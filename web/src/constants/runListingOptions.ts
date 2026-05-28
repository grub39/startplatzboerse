/** Optionen für Laufen Ultra & Trail — identisch mit der App. */

export const ULTRA_FORMAT_OPTIONS = [
  { id: 'distance', label: 'Distanz-basiert' },
  { id: 'time', label: 'Zeit-basiert' },
  { id: 'backyard', label: 'Backyard Ultra' },
] as const;

export type UltraFormatId = (typeof ULTRA_FORMAT_OPTIONS)[number]['id'];

export const ULTRA_VALUE_UNIT_OPTIONS: Record<UltraFormatId, { id: string; label: string }[]> = {
  distance: [
    { id: 'km', label: 'Kilometer' },
    { id: 'mi', label: 'Meilen' },
  ],
  time: [{ id: 'h', label: 'Stunden' }],
  backyard: [{ id: 'h', label: 'Stunden (Runden)' }],
};

export const ULTRA_SURFACE_OPTIONS = [
  { id: 'road', label: 'Straße / Asphalt' },
  { id: 'track', label: 'Bahn (400 m-Schleife)' },
  { id: 'loop', label: 'Rundkurs (flach, gemischt)' },
] as const;

export const ULTRA_EXTRA_OPTIONS = [
  { id: 'depot', label: 'Eigenverpflegung-Depot' },
  { id: 'medal_engraving', label: 'Medaillengravur' },
  { id: 'finisher_shirt', label: 'Finisher-Shirt' },
] as const;

export const TRAIL_BAND_OPTIONS = [
  { id: 'sprint', label: 'Trail-Sprint (< 15 km)' },
  { id: 'medium', label: 'Trail / Medium (15–41 km)' },
  { id: 'ultra_trail', label: 'Ultra-Trail (≥ 42 km)' },
] as const;

export const TRAIL_UTMB_OPTIONS = [
  { id: '', label: 'Keine Angabe' },
  { id: '20K', label: 'UTMB 20K' },
  { id: '50K', label: 'UTMB 50K' },
  { id: '100K', label: 'UTMB 100K' },
  { id: '100M', label: 'UTMB 100M' },
] as const;

export const TRAIL_GEAR_OPTIONS = [
  { id: 'none', label: 'Keine' },
  { id: 'basic', label: 'Basis (Decke, Pfeife, min. 0,5 l Wasser)' },
  { id: 'extended', label: 'Erweitert (Stöcke, Regenjacke, Stirnlampe)' },
] as const;

export const TRAIL_TERRAIN_OPTIONS = [
  { id: 'easy', label: 'Leicht (Waldwege, breite Pfade)' },
  { id: 'moderate', label: 'Moderat (Singletrails, Wurzeln)' },
  { id: 'technical', label: 'Technisch / Alpin' },
] as const;

export const ITRA_LEVEL_OPTIONS = [
  { id: '', label: 'Keine Angabe' },
  ...Array.from({ length: 7 }, (_, i) => ({ id: String(i), label: `ITRA ${i}` })),
];
