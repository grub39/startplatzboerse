export type UltraListingMeta = {
  kind: 'ultra';
  format: 'distance' | 'time' | 'backyard';
  /** Nur bei Zeit/Backyard — Distanz liegt in listings.distance_km */
  value?: number;
  unit: 'km' | 'mi' | 'h';
  surface: 'road' | 'track' | 'loop';
  qualification_required: boolean;
  qualification_note?: string;
  /** Optionale maximale Laufzeit in Stunden (z. B. 12 oder 6,5) */
  cutoff_h?: number;
  extras: string[];
};

export type TrailListingMeta = {
  kind: 'trail';
  band: 'sprint' | 'medium' | 'ultra_trail';
  itra_level?: number;
  utmb_index?: string;
  gear: string[];
  terrain: 'easy' | 'moderate' | 'technical';
  /** Alt-Daten — neue Inserate nutzen listings.distance_km / elevation_* */
  distance_km?: number;
  elevation_gain_m?: number;
  elevation_loss_m?: number;
};

export type ListingMeta = {
  run?: UltraListingMeta | TrailListingMeta;
};
