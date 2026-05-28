import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const PENDING_WATCHLIST_KEY = 'spb_pending_watchlist';

export async function readPendingWatchlistIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_WATCHLIST_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string' && id.length > 0));
  } catch {
    return new Set();
  }
}

async function writePendingWatchlistIds(ids: Set<string>) {
  if (ids.size === 0) {
    await AsyncStorage.removeItem(PENDING_WATCHLIST_KEY);
    return;
  }
  await AsyncStorage.setItem(PENDING_WATCHLIST_KEY, JSON.stringify([...ids]));
}

export async function addPendingWatchlistId(listingId: string) {
  const ids = await readPendingWatchlistIds();
  ids.add(listingId);
  await writePendingWatchlistIds(ids);
}

export async function removePendingWatchlistId(listingId: string) {
  const ids = await readPendingWatchlistIds();
  ids.delete(listingId);
  await writePendingWatchlistIds(ids);
}

/** Nach Login/Registrierung: lokale Merk-Vormerkungen in Supabase übernehmen. */
export async function flushPendingWatchlist(): Promise<number> {
  const pending = await readPendingWatchlistIds();
  if (pending.size === 0) return 0;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  const rows = [...pending].map((listing_id) => ({
    user_id: user.id,
    listing_id,
  }));

  const { error } = await supabase
    .from('watchlist')
    .upsert(rows, { onConflict: 'user_id,listing_id', ignoreDuplicates: true });

  if (error) {
    console.error('Merkliste synchronisieren fehlgeschlagen:', error.message);
    return 0;
  }

  await writePendingWatchlistIds(new Set());
  return rows.length;
}
