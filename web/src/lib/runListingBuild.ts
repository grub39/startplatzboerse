import {
  TRAIL_BAND_OPTIONS,
  TRAIL_GEAR_OPTIONS,
  TRAIL_TERRAIN_OPTIONS,
  TRAIL_UTMB_OPTIONS,
  ULTRA_EXTRA_OPTIONS,
  ULTRA_FORMAT_OPTIONS,
  ULTRA_SURFACE_OPTIONS,
  type UltraFormatId,
} from '../constants/runListingOptions';
import type { ListingMeta, TrailListingMeta, UltraListingMeta } from '../types/listingMeta';

export type ListingWithMeta = {
  listing_meta?: Record<string, unknown> | null;
  distance_km?: number | null;
  elevation_gain_m?: number | null;
  elevation_loss_m?: number | null;
};

export type UltraFormState = {
  format: UltraFormatId;
  value: string;
  unit: 'km' | 'mi' | 'h';
  cutoffTime: string;
  surface: 'road' | 'track' | 'loop';
  qualificationRequired: boolean;
  qualificationNote: string;
  extras: string[];
};

export type TrailFormState = {
  band: 'sprint' | 'medium' | 'ultra_trail';
  distanceKm: string;
  elevationGainM: string;
  elevationLossM: string;
  itraLevel: string;
  utmbIndex: string;
  gear: string[];
  terrain: 'easy' | 'moderate' | 'technical';
};

export type RunListingBuildResult = {
  displayDist: string;
  distance_km: number;
  elevation_gain_m: number | null;
  elevation_loss_m: number | null;
  listing_meta: ListingMeta;
};

export const emptyUltraForm = (): UltraFormState => ({
  format: 'distance',
  value: '',
  unit: 'km',
  cutoffTime: '',
  surface: 'road',
  qualificationRequired: false,
  qualificationNote: '',
  extras: [],
});

export const emptyTrailForm = (): TrailFormState => ({
  band: 'medium',
  distanceKm: '',
  elevationGainM: '',
  elevationLossM: '',
  itraLevel: '',
  utmbIndex: '',
  gear: [],
  terrain: 'moderate',
});

function parseNum(raw: string): number | null {
  const n = parseFloat(raw.replace(',', '.').trim());
  return Number.isFinite(n) ? n : null;
}

function parseCutoffTime(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.includes(':')) {
    const [hStr, mStr] = trimmed.split(':');
    const hours = parseInt(hStr, 10);
    const minutes = parseInt(mStr ?? '0', 10);
    if (!Number.isFinite(hours) || hours < 0 || !Number.isFinite(minutes) || minutes < 0 || minutes >= 60) {
      return null;
    }
    return hours + minutes / 60;
  }
  return parseNum(trimmed);
}

function formatCutoffHours(hours: number): string {
  const whole = Math.floor(hours);
  const minutes = Math.round((hours - whole) * 60);
  if (minutes === 0) return `${whole} h`;
  return `${whole}:${String(minutes).padStart(2, '0')} h`;
}

function labelFor<T extends { id: string; label: string }>(options: readonly T[], id: string) {
  return options.find((o) => o.id === id)?.label ?? id;
}

export function validateUltraForm(state: UltraFormState): string | null {
  const value = parseNum(state.value);
  if (value === null || value <= 0) {
    return state.format === 'time' || state.format === 'backyard'
      ? 'Bitte die Dauer in Stunden angeben.'
      : 'Bitte die Distanz angeben.';
  }
  if (state.format === 'time' || state.format === 'backyard') {
    if (value > 72) return 'Zeitangabe: maximal 72 Stunden.';
  } else if (state.unit === 'km' && (value < 42.2 || value > 5000)) {
    return 'Ultra-Distanz: zwischen 42,2 km und 5000 km.';
  } else if (state.unit === 'mi' && (value < 26.2 || value > 3100)) {
    return 'Ultra-Distanz: zwischen 26,2 und 3100 Meilen.';
  }
  if (state.qualificationRequired && !state.qualificationNote.trim()) {
    return 'Bitte kurz beschreiben, welcher Qualifikationsnachweis nötig ist.';
  }
  if (state.cutoffTime.trim()) {
    const cutoff = parseCutoffTime(state.cutoffTime);
    if (cutoff === null || cutoff <= 0) return 'Cut-off-Zeit: gültige Stundenangabe (z. B. 12 oder 6:30).';
    if (cutoff > 72) return 'Cut-off-Zeit: maximal 72 Stunden.';
  }
  return null;
}

export function validateTrailForm(state: TrailFormState): string | null {
  const km = parseNum(state.distanceKm);
  if (km === null || km <= 0) return 'Bitte die Streckenlänge in km angeben.';
  if (km > 5000) return 'Streckenlänge: maximal 5000 km.';

  const gain = parseNum(state.elevationGainM);
  if (gain === null || gain < 0) return 'Bitte die Höhenmeter (Aufstieg) angeben.';
  if (gain > 50000) return 'Höhenmeter: maximal 50.000 m.';

  if (state.elevationLossM.trim()) {
    const loss = parseNum(state.elevationLossM);
    if (loss === null || loss < 0) return 'Abstieg: gültige Zahl oder leer lassen.';
    if (loss > 50000) return 'Abstieg: maximal 50.000 m.';
  }

  if (!state.gear.length) return 'Bitte die Pflichtausrüstung wählen.';
  return null;
}

function kmFromUltra(state: UltraFormState, value: number): number {
  if (state.format === 'distance') {
    return state.unit === 'mi' ? value * 1.60934 : value;
  }
  return 0;
}

function formatKm(value: number): string {
  const rounded = Math.abs(value - Math.round(value)) < 0.05 ? Math.round(value) : value;
  return `${rounded} km`;
}

function formatUltraDistanceDetail(
  run: UltraListingMeta,
  distanceKm: number | null | undefined,
): string {
  if (run.format === 'distance') {
    if (distanceKm == null) return '—';
    if (run.unit === 'mi') {
      const miles = distanceKm / 1.60934;
      const rounded = Math.abs(miles - Math.round(miles)) < 0.05 ? Math.round(miles) : Math.round(miles * 10) / 10;
      return `${rounded} Meilen`;
    }
    const rounded = Math.abs(distanceKm - Math.round(distanceKm)) < 0.05 ? Math.round(distanceKm) : distanceKm;
    return `${rounded} km`;
  }
  if (run.format === 'backyard') return `Backyard · ${run.value} h`;
  return `${run.value} h`;
}

export function buildUltraListing(state: UltraFormState): RunListingBuildResult {
  const value = parseNum(state.value)!;
  const cutoffRaw = state.cutoffTime.trim();
  const cutoffH = cutoffRaw ? parseCutoffTime(cutoffRaw) ?? undefined : undefined;
  const run: UltraListingMeta = {
    kind: 'ultra',
    format: state.format,
    unit: state.unit,
    surface: state.surface,
    qualification_required: state.qualificationRequired,
    qualification_note: state.qualificationNote.trim() || undefined,
    extras: state.extras,
  };
  if (state.format === 'time' || state.format === 'backyard') {
    run.value = value;
  }
  if (cutoffH !== undefined) {
    run.cutoff_h = cutoffH;
  }

  const km = kmFromUltra(state, value);
  const displayDist = km > 0 ? `Ultra · ${formatKm(km)}` : 'Ultra';

  return {
    displayDist,
    distance_km: kmFromUltra(state, value),
    elevation_gain_m: null,
    elevation_loss_m: null,
    listing_meta: { run },
  };
}

export function buildTrailListing(state: TrailFormState): RunListingBuildResult {
  const distanceKm = parseNum(state.distanceKm)!;
  const elevationGainM = parseNum(state.elevationGainM)!;
  const lossRaw = state.elevationLossM.trim();
  const elevationLossM = lossRaw ? parseNum(lossRaw) ?? null : null;

  const run: TrailListingMeta = {
    kind: 'trail',
    band: state.band,
    itra_level: state.itraLevel !== '' ? parseInt(state.itraLevel, 10) : undefined,
    utmb_index: state.utmbIndex || undefined,
    gear: state.gear,
    terrain: state.terrain,
  };

  return {
    displayDist: `Trail · ${formatKm(distanceKm)}`,
    distance_km: distanceKm,
    elevation_gain_m: elevationGainM,
    elevation_loss_m: elevationLossM,
    listing_meta: { run },
  };
}

export function getListingMeta(listing: ListingWithMeta): ListingMeta | null {
  const raw = listing.listing_meta;
  if (!raw || typeof raw !== 'object') return null;
  return raw as ListingMeta;
}

export function formatRunMetaDetail(listing: ListingWithMeta): string | null {
  const meta = getListingMeta(listing);
  const run = meta?.run;
  if (!run) return null;

  if (run.kind === 'ultra') {
    const surfaceLabel = labelFor(ULTRA_SURFACE_OPTIONS, run.surface);
    const formatLabel = labelFor(ULTRA_FORMAT_OPTIONS, run.format);
    const valueStr = formatUltraDistanceDetail(run, listing.distance_km);
    const lines = [`${formatLabel}: ${valueStr}`, surfaceLabel];
    if (run.cutoff_h != null && run.cutoff_h > 0) {
      lines.push(`Cut-off: ${formatCutoffHours(run.cutoff_h)}`);
    }
    if (run.qualification_required) {
      lines.push(run.qualification_note ? `Quali: ${run.qualification_note}` : 'Qualifikationsnachweis erforderlich');
    }
    const extras = run.extras.map((id) => labelFor(ULTRA_EXTRA_OPTIONS, id)).filter(Boolean);
    if (extras.length) lines.push(extras.join(' · '));
    return lines.join('\n');
  }

  const gearLabels = run.gear.map((id) => labelFor(TRAIL_GEAR_OPTIONS, id)).filter(Boolean);
  const distanceKm = listing.distance_km ?? run.distance_km;
  const elevationGainM = listing.elevation_gain_m ?? run.elevation_gain_m;
  const elevationLossM = listing.elevation_loss_m ?? run.elevation_loss_m;
  const lines = [
    labelFor(TRAIL_BAND_OPTIONS, run.band),
    distanceKm != null && elevationGainM != null
      ? `${distanceKm} km · ${elevationGainM} hm+` +
        (elevationLossM != null ? ` / ${elevationLossM} hm−` : '')
      : null,
    labelFor(TRAIL_TERRAIN_OPTIONS, run.terrain),
  ].filter(Boolean) as string[];
  if (run.itra_level !== undefined) lines.push(`ITRA ${run.itra_level}`);
  if (run.utmb_index) {
    const u = labelFor(TRAIL_UTMB_OPTIONS, run.utmb_index);
    if (u && u !== 'Keine Angabe') lines.push(u);
  }
  if (gearLabels.length) lines.push(`Ausrüstung: ${gearLabels.join(', ')}`);
  return lines.join('\n');
}
