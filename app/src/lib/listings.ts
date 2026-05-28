import { supabase } from './supabase';
import type { Listing, SportCategory } from '../types';

export type ListingFilters = {
  query: string;
  category: SportCategory;
  maxPrice: string;
  maxDistance: string;
  exactDistance: { value: number; tolerance: number } | null;
};

function parseDistance(value: string) {
  return Number.parseFloat(value.replace(',', '.'));
}

export async function fetchListings(filters: ListingFilters) {
  let query = supabase
    .from('listings')
    .select(
      'id, category, event_name, event_date, location, price, price_type, distance, distance_km, swim_dist, bike_dist, run_dist, description, status, approved',
    )
    .eq('approved', true)
    .eq('status', 'active')
    .order('event_date', { ascending: true });

  if (filters.query.trim()) {
    query = query.ilike('event_name', `%${filters.query.trim()}%`);
  }

  if (filters.category) {
    query = query.eq('category', filters.category);
  }

  const price = Number.parseFloat(filters.maxPrice.replace(',', '.'));
  if (Number.isFinite(price)) {
    query = query.lte('price', price);
  }

  const { data, error } = await query;
  if (error) throw error;

  let rows = (data ?? []) as Listing[];

  if (filters.category && filters.category !== 'Hyrox') {
    if (filters.exactDistance) {
      rows = rows.filter((listing) => {
        if (listing.distance_km === null) return false;
        return Math.abs(listing.distance_km - filters.exactDistance!.value) <= filters.exactDistance!.tolerance;
      });
    } else if (filters.maxDistance.trim()) {
      const distance = parseDistance(filters.maxDistance);
      if (Number.isFinite(distance)) {
        rows = rows.filter((listing) => (listing.distance_km ?? 999999) <= distance);
      }
    }
  }

  return rows;
}

function formatKmShort(km: number): string {
  const rounded = Math.abs(km - Math.round(km)) < 0.05 ? Math.round(km) : km;
  return `${rounded} km`;
}

/** Kartenlabel für Ultra/Trail — nur Typ + Kilometer. */
function formatLaufenSpecialCardDistance(listing: Listing): string | null {
  const raw = listing.distance?.trim();
  if (!raw) return null;

  const kind =
    raw === 'Ultra' || raw.startsWith('Ultra')
      ? 'Ultra'
      : raw === 'Trail' || raw.startsWith('Trail')
        ? 'Trail'
        : null;
  if (!kind) return null;

  const km = listing.distance_km;
  if (typeof km === 'number' && km > 0) {
    return `${kind} · ${formatKmShort(km)}`;
  }

  return kind;
}

/** Kurzlabels für Karten/Detail — DB-Werte bleiben unverändert. */
export function formatListingDistance(listing: Listing) {
  if (listing.category === 'Triathlon' && listing.swim_dist !== null) {
    return `${listing.swim_dist} / ${listing.bike_dist ?? '?'} / ${listing.run_dist ?? '?'} km`;
  }

  const distance = listing.distance?.trim();
  if (!distance) return 'Startplatz';

  if (listing.category === 'Laufen' && distance) {
    return formatLaufenSpecialCardDistance(listing) ?? distance;
  }

  if (listing.category === 'Hyrox') {
    if (/open/i.test(distance)) return 'Open Men/Women';
    if (/pro/i.test(distance)) return 'Pro Men/Women';
    if (/double/i.test(distance)) return 'Doubles';
    if (/relay|staffel/i.test(distance)) return 'Relay';
  }

  return distance;
}
