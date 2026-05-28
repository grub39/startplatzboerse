import type { TrailFormState, UltraFormState } from './runListingBuild';

export function readUltraFormFromDom(): UltraFormState {
  const format = (document.getElementById('ultra-format') as HTMLSelectElement)?.value as UltraFormState['format'];
  const unit = (document.getElementById('ultra-unit') as HTMLSelectElement)?.value as UltraFormState['unit'];
  const extras: string[] = [];
  document.querySelectorAll<HTMLInputElement>('input[name="ultra-extra"]:checked').forEach((el) => {
    if (el.value) extras.push(el.value);
  });
  return {
    format: format || 'distance',
    value: (document.getElementById('ultra-value') as HTMLInputElement)?.value ?? '',
    unit: unit || 'km',
    cutoffTime: (document.getElementById('ultra-cutoff') as HTMLInputElement)?.value ?? '',
    surface: ((document.getElementById('ultra-surface') as HTMLSelectElement)?.value ||
      'road') as UltraFormState['surface'],
    qualificationRequired: !!(document.getElementById('ultra-quali') as HTMLInputElement)?.checked,
    qualificationNote: (document.getElementById('ultra-quali-note') as HTMLInputElement)?.value ?? '',
    extras,
  };
}

export function readTrailFormFromDom(): TrailFormState {
  const gear: string[] = [];
  document.querySelectorAll<HTMLInputElement>('input[name="trail-gear"]:checked').forEach((el) => {
    if (el.value) gear.push(el.value);
  });
  return {
    band: ((document.getElementById('trail-band') as HTMLSelectElement)?.value ||
      'medium') as TrailFormState['band'],
    distanceKm: (document.getElementById('trail-km') as HTMLInputElement)?.value ?? '',
    elevationGainM: (document.getElementById('trail-hm-plus') as HTMLInputElement)?.value ?? '',
    elevationLossM: (document.getElementById('trail-hm-minus') as HTMLInputElement)?.value ?? '',
    itraLevel: (document.getElementById('trail-itra') as HTMLSelectElement)?.value ?? '',
    utmbIndex: (document.getElementById('trail-utmb') as HTMLSelectElement)?.value ?? '',
    gear,
    terrain: ((document.getElementById('trail-terrain') as HTMLSelectElement)?.value ||
      'moderate') as TrailFormState['terrain'],
  };
}

export function syncUltraUnitField() {
  const format = (document.getElementById('ultra-format') as HTMLSelectElement)?.value;
  const unitWrap = document.getElementById('ultra-unit-wrap');
  if (unitWrap) unitWrap.hidden = format !== 'distance';
}
