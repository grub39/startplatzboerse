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
import type { Listing } from '../types';

export type UltraFormState = {
  format: UltraFormatId;
  value: string;
  unit: 'km' | 'mi' | 'h';
  elevationGainM: string;
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
  elevationGainM: '',
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
      : 'Bitte die Distanz in Kilometern angeben.';
  }
  if (state.format === 'time' || state.format === 'backyard') {
    if (value > 72) return 'Zeitangabe: maximal 72 Stunden.';
  } else if (value < 42.2 || value > 5000) {
    return 'Ultra-Distanz: zwischen 42,2 km und 5000 km.';
  }
  if (state.format === 'distance' && state.elevationGainM.trim()) {
    const gain = parseNum(state.elevationGainM);
    if (gain === null || gain < 0) return 'Höhenmeter: gültige Zahl oder leer lassen.';
    if (gain > 50000) return 'Höhenmeter: maximal 50.000 m.';
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

  if (!state.gear.length) return 'Bitte die Pflichtausrüstung wählen.';
  return null;
}

function kmFromUltra(state: UltraFormState, value: number): number {
  if (state.format === 'distance') return value;
  return 0;
}

function formatUltraDistanceDetail(
  run: UltraListingMeta,
  distanceKm: number | null | undefined,
): string {
  if (run.format === 'distance') {
    if (distanceKm == null) return '—';
    const rounded = Math.abs(distanceKm - Math.round(distanceKm)) < 0.05 ? Math.round(distanceKm) : distanceKm;
    return `${rounded} km`;
  }
  if (run.format === 'backyard') return `Backyard · ${run.value} h`;
  return `${run.value} h`;
}

export function buildUltraListing(state: UltraFormState): RunListingBuildResult {
  const value = parseNum(state.value)!;
  const unit = state.format === 'distance' ? 'km' : 'h';
  const elevationRaw = state.elevationGainM.trim();
  const elevationGainM =
    state.format === 'distance' && elevationRaw ? parseNum(elevationRaw) ?? null : null;

  const cutoffRaw = state.cutoffTime.trim();
  const cutoffH = cutoffRaw ? parseCutoffTime(cutoffRaw) ?? undefined : undefined;

  const run: UltraListingMeta = {
    kind: 'ultra',
    format: state.format,
    unit,
    surface: state.surface,
    qualification_required: false,
    extras: [],
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
    elevation_gain_m: elevationGainM,
    elevation_loss_m: null,
    listing_meta: { run },
  };
}

export function buildTrailListing(state: TrailFormState): RunListingBuildResult {
  const distanceKm = parseNum(state.distanceKm)!;
  const elevationGainM = parseNum(state.elevationGainM)!;

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
    elevation_loss_m: null,
    listing_meta: { run },
  };
}

export function getListingMeta(listing: Listing): ListingMeta | null {
  const raw = listing.listing_meta;
  if (!raw || typeof raw !== 'object') return null;
  return raw as ListingMeta;
}

export type ListingWithRunMeta = Pick<
  Listing,
  'listing_meta' | 'distance_km' | 'elevation_gain_m' | 'elevation_loss_m'
>;

export type RunMetaHighlight = {
  key: string;
  icon: string;
  label: string;
};

function formatKm(value: number): string {
  const rounded = Math.abs(value - Math.round(value)) < 0.05 ? Math.round(value) : value;
  return `${rounded} km`;
}

function surfaceIcon(surface: UltraListingMeta['surface']): string {
  if (surface === 'track') return 'running';
  if (surface === 'loop') return 'sync-alt';
  return 'road';
}

function extraIcon(extraId: string): string {
  if (extraId === 'depot') return 'apple-alt';
  if (extraId === 'medal_engraving') return 'medal';
  if (extraId === 'finisher_shirt') return 'tshirt';
  return 'check-circle';
}

export function buildRunMetaHighlights(listing: ListingWithRunMeta): RunMetaHighlight[] {
  const meta = getListingMeta(listing as Listing);
  const run = meta?.run;
  if (!run) return [];

  if (run.kind === 'ultra') {
    const items: RunMetaHighlight[] = [];
    const formatLabel = labelFor(ULTRA_FORMAT_OPTIONS, run.format);

    if (run.format === 'distance') {
      const km = listing.distance_km;
      if (km != null && km > 0) {
        items.push({ key: 'distance', icon: 'route', label: formatKm(km) });
      }
    } else if (run.value != null && run.value > 0) {
      items.push({
        key: 'duration',
        icon: 'stopwatch',
        label: run.format === 'backyard' ? `Backyard · ${run.value} h` : `${run.value} h Laufzeit`,
      });
    }

    const elevationGainM = listing.elevation_gain_m;
    if (elevationGainM != null && elevationGainM > 0) {
      items.push({
        key: 'elevation',
        icon: 'mountain',
        label: `${Math.round(elevationGainM).toLocaleString('de-DE')}+ Höhenmeter`,
      });
    }

    if (run.cutoff_h != null && run.cutoff_h > 0) {
      items.push({
        key: 'cutoff',
        icon: 'clock',
        label: `Cut-off ${formatCutoffHours(run.cutoff_h)}`,
      });
    }

    items.push({
      key: 'format',
      icon: run.format === 'time' || run.format === 'backyard' ? 'hourglass-half' : 'flag-checkered',
      label: formatLabel,
    });

    items.push({
      key: 'surface',
      icon: surfaceIcon(run.surface),
      label: labelFor(ULTRA_SURFACE_OPTIONS, run.surface),
    });

    if (run.qualification_required) {
      items.push({
        key: 'quali',
        icon: 'id-card',
        label: run.qualification_note?.trim() || 'Qualifikationsnachweis erforderlich',
      });
    }

    for (const extraId of run.extras) {
      const extraLabel = labelFor(ULTRA_EXTRA_OPTIONS, extraId);
      if (!extraLabel) continue;
      items.push({ key: `extra-${extraId}`, icon: extraIcon(extraId), label: extraLabel });
    }

    return items;
  }

  const items: RunMetaHighlight[] = [];
  const distanceKm = listing.distance_km ?? run.distance_km;
  const elevationGainM = listing.elevation_gain_m ?? run.elevation_gain_m;
  const elevationLossM = listing.elevation_loss_m ?? run.elevation_loss_m;

  if (distanceKm != null && distanceKm > 0) {
    items.push({ key: 'distance', icon: 'route', label: formatKm(distanceKm) });
  }

  if (elevationGainM != null && elevationGainM > 0) {
    let elevationLabel = `${Math.round(elevationGainM).toLocaleString('de-DE')}+ Höhenmeter`;
    if (elevationLossM != null && elevationLossM > 0) {
      elevationLabel += ` · ${Math.round(elevationLossM).toLocaleString('de-DE')} hm−`;
    }
    items.push({ key: 'elevation', icon: 'mountain', label: elevationLabel });
  }

  items.push({
    key: 'band',
    icon: 'flag',
    label: labelFor(TRAIL_BAND_OPTIONS, run.band),
  });

  items.push({
    key: 'terrain',
    icon: run.terrain === 'technical' ? 'mountain' : 'hiking',
    label: labelFor(TRAIL_TERRAIN_OPTIONS, run.terrain),
  });

  if (run.itra_level !== undefined) {
    items.push({ key: 'itra', icon: 'award', label: `ITRA ${run.itra_level}` });
  }

  if (run.utmb_index) {
    const utmb = labelFor(TRAIL_UTMB_OPTIONS, run.utmb_index);
    if (utmb && utmb !== 'Keine Angabe') {
      items.push({ key: 'utmb', icon: 'trophy', label: utmb });
    }
  }

  for (const gearId of run.gear) {
    if (gearId === 'none') continue;
    const gearLabel = labelFor(TRAIL_GEAR_OPTIONS, gearId);
    if (!gearLabel) continue;
    items.push({ key: `gear-${gearId}`, icon: 'backpack', label: gearLabel });
  }

  return items;
}

export function formatRunMetaDetail(listing: ListingWithRunMeta): string | null {
  const meta = getListingMeta(listing as Listing);
  const run = meta?.run;
  if (!run) return null;

  if (run.kind === 'ultra') {
    const formatLabel = labelFor(ULTRA_FORMAT_OPTIONS, run.format);
    const valueStr = formatUltraDistanceDetail(run, listing.distance_km);
    const surfaceLabel = labelFor(ULTRA_SURFACE_OPTIONS, run.surface);
    const lines = [`${formatLabel}: ${valueStr}`, surfaceLabel];
    const elevationGainM = listing.elevation_gain_m;
    if (elevationGainM != null && elevationGainM > 0) {
      lines.splice(1, 0, `${elevationGainM} hm+`);
    }
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
