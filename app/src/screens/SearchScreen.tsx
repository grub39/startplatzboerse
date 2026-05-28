import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import {
  addPendingWatchlistId,
  readPendingWatchlistIds,
  removePendingWatchlistId,
} from '../lib/watchlist';
import { ListingCard } from '../components/ListingCard';
import { EmptyDashboard } from '../components/DashboardComponents';
import { ToastPopup } from '../components/ToastPopup';
import { colors } from '../theme';
import { FontAwesome5, MaterialCommunityIcons } from '@expo/vector-icons';
import type { Listing } from '../types';
import {
  getSearchDistanceChip,
  listingMatchesDistanceChip,
  SEARCH_DISTANCE_CHIPS,
  SPORT_CATEGORY_OPTIONS,
} from '../constants/listingOptions';

type Props = {
  session: Session | null;
  onOpenListing: (id: string) => void;
  onGoLogin: () => void;
};

const CATEGORIES = [
  { id: 'Laufen', name: 'Lauf', iconType: 'fa5' as const, icon: 'running' },
  { id: 'Radrennen', name: 'Rad', iconType: 'fa5' as const, icon: 'biking' },
  { id: 'Triathlon', name: 'Triathlon', iconType: 'fa5' as const, icon: 'swimmer' },
  { id: 'Hyrox', name: 'Hyrox', iconType: 'mci' as const, icon: 'weight-lifter' },
];

const RADIUS_OPTIONS = [25, 50, 100, 200];
const FULL_TEXT_LOCATION_RADIUS_KM = 50;

const CATEGORY_SEARCH_TERMS: Record<string, string[]> = {
  Laufen: ['lauf', 'laufen', 'running', 'run', 'marathon', 'halbmarathon'],
  Radrennen: ['rad', 'radrennen', 'radfahren', 'bike', 'biking', 'fahrrad', 'rennrad', 'radmarathon'],
  Triathlon: ['triathlon', 'tri', 'sprintdistanz', 'kurzdistanz', 'mitteldistanz', 'langdistanz'],
  Hyrox: ['hyrox', 'fitness', 'functional fitness'],
};

function normalizeSearchText(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function buildListingSearchText(listing: Listing) {
  const categoryTerms = CATEGORY_SEARCH_TERMS[listing.category ?? ''] ?? [];

  return normalizeSearchText([
    listing.event_name,
    listing.category,
    listing.location,
    listing.plz,
    listing.description,
    listing.distance,
    listing.distance_km,
    listing.swim_dist,
    listing.bike_dist,
    listing.run_dist,
    ...categoryTerms,
  ].join(' '));
}

function matchesFullTextSearch(listing: Listing, normalizedQuery: string) {
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;

  const haystack = buildListingSearchText(listing);
  return terms.every((term) => haystack.includes(term));
}

export function SearchScreen({ session, onOpenListing, onGoLogin }: Props) {
  const insets = useSafeAreaInsets();

  const [allListings, setAllListings]         = useState<Listing[]>([]);
  const [filteredListings, setFilteredListings] = useState<Listing[]>([]);
  const [savedListingIds, setSavedListingIds]   = useState<Set<string>>(new Set());
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [loginPromptVisible, setLoginPromptVisible] = useState(false);

  const [searchQuery, setSearchQuery]       = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeDistance, setActiveDistance] = useState<string | null>(null);
  const [priceFilterOpen, setPriceFilterOpen] = useState(false);
  const [radiusFilterOpen, setRadiusFilterOpen] = useState(false);
  const [maxPrice, setMaxPrice] = useState('');
  const [locationQuery, setLocationQuery] = useState('');
  const [radiusKm, setRadiusKm] = useState<number | null>(null);
  const [locationCoords, setLocationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationLookupFailed, setLocationLookupFailed] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const filterRunId = useRef(0);

  const fetchGlobalData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: listingsData, error: listingsError } = await supabase
        .from('listings')
        .select(
          'id, category, event_name, event_date, location, plz, price, price_type, distance, distance_km, swim_dist, bike_dist, run_dist, description, status, approved, lat, lng'
        )
        .eq('status', 'active')
        .eq('approved', true)
        .order('created_at', { ascending: false });

      if (listingsError) throw listingsError;

      let savedIds = new Set<string>();
      if (session?.user?.id) {
        const { data: watchlistData } = await supabase
          .from('watchlist')
          .select('listing_id')
          .eq('user_id', session.user.id);

        if (watchlistData) {
          savedIds = new Set(watchlistData.map((item) => item.listing_id));
        }
      } else {
        savedIds = await readPendingWatchlistIds();
      }

      setAllListings((listingsData ?? []) as Listing[]);
      setFilteredListings((listingsData ?? []) as Listing[]);
      setSavedListingIds(savedIds);
    } catch (err) {
      console.error('Fehler beim Laden der Inserate:', err);
      setError('Startplätze konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    fetchGlobalData();
  }, [fetchGlobalData]);

  function distanceBetweenKm(lat1: number, lng1: number, lat2: number, lng2: number) {
    const earthRadiusKm = 6371;
    const toRad = (value: number) => (value * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);

    return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  async function geocodeLocation(value: string): Promise<{ lat: number; lng: number } | null> {
    if (!value.trim()) return null;

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(value.trim())}&limit=1&countrycodes=de,at,ch`,
        {
          headers: {
            'Accept-Language': 'de',
            'User-Agent': 'StartplatzboerseApp/1.0',
          },
        }
      );
      if (!response.ok) return null;

      const places = await response.json();
      const firstPlace = places?.[0];
      if (!firstPlace) return null;

      const lat = Number.parseFloat(firstPlace.lat);
      const lng = Number.parseFloat(firstPlace.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

      return { lat, lng };
    } catch {
      return null;
    }
  }

  // Client-Side Filter
  useEffect(() => {
    const runId = filterRunId.current + 1;
    filterRunId.current = runId;

    async function applyFilters() {
      setFiltering(true);
      let result = allListings.map((listing) => {
        const { _distanceKm, ...rest } = listing;
        return rest as Listing;
      });

      if (searchQuery.trim() !== '') {
        const normalizedQuery = normalizeSearchText(searchQuery);
        const textMatches = result.filter((listing) =>
          matchesFullTextSearch(listing, normalizedQuery)
        );

        if (textMatches.length > 0) {
          result = textMatches;
        } else {
          const userCoords = await geocodeLocation(searchQuery);

          if (filterRunId.current !== runId) return;

          if (userCoords) {
            result = result
              .filter((listing) => {
                const listingLat = typeof listing.lat === 'number'
                  ? listing.lat
                  : Number.parseFloat(String(listing.lat ?? ''));
                const listingLng = typeof listing.lng === 'number'
                  ? listing.lng
                  : Number.parseFloat(String(listing.lng ?? ''));

                if (!Number.isFinite(listingLat) || !Number.isFinite(listingLng)) {
                  return false;
                }

                const distanceKm = distanceBetweenKm(
                  userCoords.lat,
                  userCoords.lng,
                  listingLat,
                  listingLng
                );
                listing._distanceKm = Math.round(distanceKm);
                return distanceKm <= FULL_TEXT_LOCATION_RADIUS_KM;
              })
              .sort((a, b) => Number(a._distanceKm ?? 0) - Number(b._distanceKm ?? 0));
          } else {
            result = textMatches;
          }
        }
      }

      if (activeCategory) {
        result = result.filter((l) => l.category === activeCategory);
      }

      if (activeDistance && activeCategory) {
        const chip = getSearchDistanceChip(activeCategory, activeDistance);
        if (chip) {
          result = result.filter((l) => listingMatchesDistanceChip(l, chip));
        }
      }

      const parsedMaxPrice = Number.parseFloat(maxPrice.replace(',', '.'));
      if (Number.isFinite(parsedMaxPrice)) {
        result = result.filter((l) => Number(l.price) <= parsedMaxPrice);
      }

      if (locationQuery.trim()) {
        const normalizedLocation = locationQuery.trim().toLowerCase();
        const userCoords = radiusKm !== null ? await geocodeLocation(locationQuery) : null;

        if (filterRunId.current === runId) {
          setLocationCoords(userCoords);
          setLocationLookupFailed(radiusKm !== null && !userCoords);
        }

        result = result.filter((l) => {
          const listingLat = typeof l.lat === 'number'
            ? l.lat
            : Number.parseFloat(String(l.lat ?? ''));
          const listingLng = typeof l.lng === 'number'
            ? l.lng
            : Number.parseFloat(String(l.lng ?? ''));

          if (radiusKm !== null && userCoords && l.lat && l.lng && Number.isFinite(listingLat) && Number.isFinite(listingLng)) {
            const distanceKm = distanceBetweenKm(
              userCoords.lat,
              userCoords.lng,
              listingLat,
              listingLng
            );
            l._distanceKm = Math.round(distanceKm);
            return distanceKm <= radiusKm;
          }

          delete l._distanceKm;
          return (
            l.location?.toLowerCase().includes(normalizedLocation) ||
            l.plz?.toLowerCase().includes(normalizedLocation) ||
            false
          );
        });
      } else {
        setLocationCoords(null);
        setLocationLookupFailed(false);
      }

      if (filterRunId.current === runId) {
        setFilteredListings(result);
        setFiltering(false);
      }
    }

    applyFilters();
  }, [searchQuery, activeCategory, activeDistance, maxPrice, locationQuery, radiusKm, allListings]);

  const toggleSave = async (listingId: string) => {
    if (!session?.user?.id) {
      const pending = await readPendingWatchlistIds();
      if (pending.has(listingId)) {
        await removePendingWatchlistId(listingId);
        setSavedListingIds((prev) => {
          const next = new Set(prev);
          next.delete(listingId);
          return next;
        });
        return;
      }

      await addPendingWatchlistId(listingId);
      setSavedListingIds((prev) => new Set(prev).add(listingId));
      setLoginPromptVisible(true);
      return;
    }

    const isSaved = savedListingIds.has(listingId);

    setSavedListingIds((prev) => {
      const newSet = new Set(prev);
      if (isSaved) newSet.delete(listingId);
      else newSet.add(listingId);
      return newSet;
    });

    if (isSaved) {
      await supabase
        .from('watchlist')
        .delete()
        .eq('user_id', session.user.id)
        .eq('listing_id', listingId);
    } else {
      await supabase
        .from('watchlist')
        .insert({ user_id: session.user.id, listing_id: listingId });
    }
  };

  const toggleCategory = (catId: string) => {
    setActiveCategory((prev) => {
      const next = prev === catId ? null : catId;
      setActiveDistance(null);
      return next;
    });
  };

  const toggleDistance = (dist: string) => {
    setActiveDistance((prev) => (prev === dist ? null : dist));
  };

  const hasActiveFilters =
    !!searchQuery.trim() ||
    !!activeCategory ||
    !!activeDistance ||
    !!maxPrice.trim() ||
    !!locationQuery.trim();

  const resetFilters = () => {
    setSearchQuery('');
    setActiveCategory(null);
    setActiveDistance(null);
    setPriceFilterOpen(false);
    setRadiusFilterOpen(false);
    setMaxPrice('');
    setLocationQuery('');
    setLocationCoords(null);
    setLocationLookupFailed(false);
    setRadiusKm(null);
  };

  const renderIcon = (sport: (typeof CATEGORIES)[0], isActive: boolean) => {
    const iconColor = isActive ? colors.cyan : '#666666';
    if (sport.iconType === 'mci') {
      return (
        <MaterialCommunityIcons name={sport.icon as any} size={26} color={iconColor} />
      );
    }
    return <FontAwesome5 name={sport.icon} size={22} color={iconColor} />;
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scrollStyle}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* HEADER */}
        <View style={[styles.header, { paddingTop: Math.max(insets.top + 10, 40) }]}>
          <Image
            source={require('../../assets/logo.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
          <Text style={styles.brandTextContainer}>
            <Text style={styles.brandTextMain}>STARTPLATZBOERSE</Text>
            <Text style={styles.brandTextCom}>.COM</Text>
          </Text>
        </View>

        {/* SUCHE */}
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Was suchst du?"
            placeholderTextColor="#888888"
            value={searchQuery}
            onChangeText={setSearchQuery}
            cursorColor={colors.cyan}
            selectionColor={colors.cyan}
          />
        </View>

        {/* KATEGORIEN */}
        <View style={styles.categorySection}>
          <View style={styles.categoryGrid}>
            {CATEGORIES.map((sport) => {
              const isActive = activeCategory === sport.id;
              return (
                <Pressable
                  key={sport.id}
                  style={[styles.categorySquare, isActive && styles.categorySquareActive]}
                  onPress={() => toggleCategory(sport.id)}
                >
                  <View style={styles.iconContainer}>
                    {renderIcon(sport, isActive)}
                  </View>
                  <Text style={[styles.categoryText, isActive && styles.categoryTextActive]}>
                    {sport.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {activeCategory && SEARCH_DISTANCE_CHIPS[activeCategory] ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.distanceScroll}
            >
              {SEARCH_DISTANCE_CHIPS[activeCategory].map((chip) => {
                const dist = chip.label;
                const isActive = activeDistance === dist;
                return (
                  <Pressable
                    key={dist}
                    style={[styles.filterPill, isActive && styles.filterPillActive]}
                    onPress={() => toggleDistance(dist)}
                  >
                    <Text style={[styles.filterText, isActive && styles.filterTextActive]}>
                      {dist}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}
        </View>

        <View style={styles.quickFilterSection}>
          <View style={styles.quickFilterRow}>
            <Pressable
              style={[
                styles.quickFilterTile,
                (priceFilterOpen || maxPrice.trim()) && styles.quickFilterTileActive,
              ]}
              onPress={() => setPriceFilterOpen((open) => !open)}
            >
              <FontAwesome5
                name="euro-sign"
                size={14}
                color={(priceFilterOpen || maxPrice.trim()) ? colors.cyan : '#666666'}
              />
              <Text
                style={[
                  styles.quickFilterText,
                  (priceFilterOpen || maxPrice.trim()) && styles.quickFilterTextActive,
                ]}
              >
                Preis
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.quickFilterTile,
                (radiusFilterOpen || locationQuery.trim()) && styles.quickFilterTileActive,
              ]}
              onPress={() => setRadiusFilterOpen((open) => !open)}
            >
              <FontAwesome5
                name="map-marker-alt"
                size={14}
                color={(radiusFilterOpen || locationQuery.trim()) ? colors.cyan : '#666666'}
              />
              <Text
                style={[
                  styles.quickFilterText,
                  (radiusFilterOpen || locationQuery.trim()) && styles.quickFilterTextActive,
                ]}
              >
                Umkreis
              </Text>
            </Pressable>
          </View>

          {priceFilterOpen ? (
            <View style={styles.filterPanel}>
              <TextInput
                style={styles.filterInput}
                placeholder="Maximaler Preis (€)"
                placeholderTextColor="#666666"
                keyboardType="decimal-pad"
                value={maxPrice}
                onChangeText={setMaxPrice}
                cursorColor={colors.cyan}
                selectionColor={colors.cyan}
              />
            </View>
          ) : null}

          {radiusFilterOpen ? (
            <View style={styles.filterPanel}>
              <TextInput
                style={styles.filterInput}
                placeholder="Ort oder PLZ"
                placeholderTextColor="#666666"
                value={locationQuery}
                onChangeText={setLocationQuery}
                cursorColor={colors.cyan}
                selectionColor={colors.cyan}
              />
              {locationQuery.trim() ? (
                <Text style={styles.filterHint}>
                  {radiusKm === null
                    ? 'Ohne Radius suchen wir nur nach diesem Ort oder dieser PLZ.'
                    : locationCoords
                    ? `Umkreis wird um ${radiusKm} km berechnet.`
                    : locationLookupFailed
                      ? 'Ort nicht eindeutig gefunden, wir suchen nach Ort oder PLZ im Inserat.'
                      : 'Standort wird gesucht...'}
                </Text>
              ) : null}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.radiusOptions}
              >
                {RADIUS_OPTIONS.map((option) => {
                  const isActive = radiusKm === option;
                  return (
                    <Pressable
                      key={option}
                      style={[styles.filterPill, isActive && styles.filterPillActive]}
                      onPress={() => setRadiusKm((current) => current === option ? null : option)}
                    >
                      <Text style={[styles.filterText, isActive && styles.filterTextActive]}>
                        {option} km
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

          {hasActiveFilters ? (
            <Pressable style={styles.resetFiltersButton} onPress={resetFilters}>
              <FontAwesome5 name="times-circle" size={12} color="#888888" />
              <Text style={styles.resetFiltersText}>Alle Filter zurücksetzen</Text>
            </Pressable>
          ) : null}
        </View>

        {/* FEED */}
        <View style={styles.section}>
          <View style={styles.resultsHeader}>
            <Text style={styles.sectionTitle}>
              {searchQuery || activeCategory || activeDistance || maxPrice || locationQuery
                ? 'Suchergebnisse'
                : 'Neueste Inserate'}
            </Text>
            {!loading && !error ? (
              <Text style={styles.resultsCount}>
                {filtering ? 'Suche läuft...' : `${filteredListings.length} Events gefunden`}
              </Text>
            ) : null}
          </View>

          <View style={styles.feedContainer}>
            {error ? (
              <Text style={styles.errorText}>{error}</Text>
            ) : loading || filtering ? (
              <ActivityIndicator
                color={colors.cyan}
                size="large"
                style={{ marginTop: 40 }}
              />
            ) : filteredListings.length === 0 ? (
              <EmptyDashboard text="Keine Startplätze für deine Suchkriterien gefunden." />
            ) : (
              filteredListings.map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  saved={savedListingIds.has(listing.id)}
                  onOpen={() => onOpenListing(listing.id)}
                  onSave={() => toggleSave(listing.id)}
                />
              ))
            )}
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      <ToastPopup
        visible={loginPromptVisible}
        type="info"
        title="Anmelden"
        text="Bitte logge dich ein, um Startplätze zu merken."
        confirmText="Jetzt einloggen"
        cancelText="Abbrechen"
        showCancel
        onConfirm={() => {
          setLoginPromptVisible(false);
          onGoLogin();
        }}
        onCancel={() => setLoginPromptVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollStyle: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 20,
    gap: 12,
  },
  logoImage: {
    width: 42,
    height: 42,
  },
  brandTextContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  brandTextMain: {
    color: '#ffffff',
    fontSize: 19,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  brandTextCom: {
    color: colors.cyan,
    fontSize: 19,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  searchContainer: {
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  searchInput: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    paddingHorizontal: 20,
    height: 54,
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '500',
  },
  section: {
    marginBottom: 20,
  },
  categorySection: {
    marginBottom: 14,
    gap: 10,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
  },
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 12,
    gap: 12,
  },
  resultsCount: {
    color: colors.cyan,
    fontSize: 12,
    fontWeight: '900',
  },
  categoryGrid: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 8,
  },
  categorySquare: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
    gap: 6,
  },
  categorySquareActive: {
    borderColor: colors.cyan,
    backgroundColor: colors.card,
  },
  iconContainer: {
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryText: {
    color: '#666666',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  categoryTextActive: {
    color: colors.cyan,
  },
  quickFilterSection: {
    paddingHorizontal: 20,
    marginBottom: 18,
    gap: 10,
  },
  quickFilterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  quickFilterTile: {
    flex: 1,
    height: 48,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.03)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  quickFilterTileActive: {
    borderColor: colors.cyan,
    backgroundColor: colors.card,
  },
  quickFilterText: {
    color: '#666666',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  quickFilterTextActive: {
    color: colors.cyan,
  },
  filterPanel: {
    gap: 10,
  },
  filterInput: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.03)',
    height: 50,
    paddingHorizontal: 16,
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  filterHint: {
    color: '#777777',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
    paddingHorizontal: 4,
  },
  resetFiltersButton: {
    alignSelf: 'center',
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.04)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 2,
  },
  resetFiltersText: {
    color: '#888888',
    fontSize: 12,
    fontWeight: '700',
  },
  distanceScroll: {
    paddingHorizontal: 20,
    gap: 8,
  },
  radiusOptions: {
    gap: 8,
  },
  filterPill: {
    backgroundColor: colors.card,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  filterPillActive: {
    backgroundColor: colors.card,
    borderColor: colors.cyan,
  },
  filterText: {
    color: '#888888',
    fontSize: 13,
    fontWeight: '700',
  },
  filterTextActive: {
    color: colors.cyan,
    fontWeight: '900',
  },
  feedContainer: {
    paddingHorizontal: 20,
    gap: 12,
  },
  errorText: {
    color: '#ff4444',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 20,
  },
});