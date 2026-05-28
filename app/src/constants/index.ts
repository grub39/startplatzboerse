import type { DistancePreset, SportCategory } from '../types';
import { DISTANCE_TOLERANCE_KM, SEARCH_DISTANCE_CHIPS, SPORT_CATEGORY_OPTIONS } from './listingOptions';

export const categories: { label: string; value: SportCategory }[] = [
  { label: 'Alle', value: '' },
  ...SPORT_CATEGORY_OPTIONS.map(({ id, label }) => ({ label, value: id })),
];

/** Legacy-Helfer (z. B. falls später wieder in Filtern genutzt). */
export const distancePresets: Record<string, DistancePreset[]> = Object.fromEntries(
  Object.entries(SEARCH_DISTANCE_CHIPS).map(([category, chips]) => [
    category,
    chips
      .filter((chip) => typeof chip.targetKm === 'number')
      .map((chip) => ({
        label: chip.label,
        value: chip.targetKm as number,
        tolerance: DISTANCE_TOLERANCE_KM,
      })),
  ]),
);