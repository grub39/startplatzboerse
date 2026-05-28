import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { ListingCard } from '../components/ListingCard';
import { EmptyDashboard } from '../components/DashboardComponents';
import { colors } from '../theme';
import type { WatchlistEntry } from '../types';

type Props = {
  session: Session | null;
  onOpenListing: (id: string) => void;
  bottomInset?: number;
};

export function WatchlistScreen({ session, onOpenListing, bottomInset }: Props) {
  const insets = useSafeAreaInsets();
  const effectiveBottomInset = bottomInset ?? insets.bottom;
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadWatchlist = useCallback(async () => {
    if (!session?.user?.id) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('watchlist')
        .select(
          `id, listing_id, listings (id, category, event_name, event_date, location, price, distance, distance_km, swim_dist, bike_dist, run_dist, description, status, approved)`
        )
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      // Filtert nur aktive Inserate heraus und normalisiert das Supabase-Array
      const normalized = ((data ?? []) as any[])
        .map((entry) => ({
          ...entry,
          listings: Array.isArray(entry.listings) ? entry.listings[0] : entry.listings,
        }))
        .filter((entry) => entry.listings && entry.listings.status === 'active') as WatchlistEntry[];

      setWatchlist(normalized);
    } catch (err) {
      console.error('Merkliste laden fehlgeschlagen:', err);
      setError('Merkliste konnte nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    loadWatchlist();
  }, [loadWatchlist]);

  // Funktion zum Entmerken direkt aus dem Screen heraus
  const handleRemove = async (listingId: string) => {
    if (!session?.user?.id) return;
    
    // Optimistisches UI-Update für maximale Geschwindigkeit
    setWatchlist((current) => current.filter((entry) => entry.listing_id !== listingId));
    
    await supabase
      .from('watchlist')
      .delete()
      .eq('user_id', session.user.id)
      .eq('listing_id', listingId);
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scrollStyle}
        contentContainerStyle={[styles.contentContainer, { paddingBottom: effectiveBottomInset + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Uniformer Header wie auf den anderen Tab-Seiten */}
        <View style={[styles.header, { paddingTop: Math.max(insets.top + 10, 40) }]}>
          <Text style={styles.headerTitle}>Merkliste</Text>
        </View>

        <View style={styles.listContainer}>
          {error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : loading ? (
            <ActivityIndicator color={colors.cyan} size="large" style={{ marginTop: 40 }} />
          ) : !session ? (
            <EmptyDashboard text="Bitte logge dich ein, um deine gemerkten Startplätze zu sehen." />
          ) : watchlist.length === 0 ? (
            <EmptyDashboard text="Noch keine Startplätze auf deiner Merkliste." />
          ) : (
            watchlist.map((entry) => (
              <ListingCard
                key={entry.id}
                listing={entry.listings}
                saved={true}
                onOpen={() => onOpenListing(entry.listing_id)}
                onSave={() => handleRemove(entry.listing_id)}
              />
            ))
          )}
        </View>
      </ScrollView>

      {/* System-Nav-Schutz für Android */}
      <View style={[styles.systemNavBlocker, { height: effectiveBottomInset }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#323232',
  },
  scrollStyle: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 40,
  },
  header: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 19,
    fontWeight: '900',
  },
  listContainer: {
    paddingHorizontal: 20,
    gap: 12,
  },
  errorText: {
    color: '#ff4444',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 20,
  },
  systemNavBlocker: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1a1a1a',
    zIndex: 9999,
  },
});