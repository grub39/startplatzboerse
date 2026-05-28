import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
  Dimensions,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import type { Session } from '@supabase/supabase-js';
import { formatListingDistance } from '../lib/listings';
import { buildRunMetaHighlights } from '../lib/runListingBuild';
import { supabase } from '../lib/supabase';
import { ListingHighlights } from '../components/ListingHighlights';
import { colors, radius } from '../theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const NAV_HEIGHT = 74;
const SITE_BASE_URL = 'https://startplatzboerse.com';
const LISTING_SHARE_BASE_URL = `${SITE_BASE_URL}/listing`;

const BG_MAIN = '#2e2e2e';
const BG_CARD = '#383838';
const BG_INPUT = '#242424';

type Props = {
  listingId: string;
  session: Session | null;
  onClose: () => void;
};

type ListingDetail = {
  id: string;
  event_name: string;
  event_date: string;
  location: string;
  plz: string | null;
  price: number;
  old_price: number | null;
  category: string;
  distance: string | null;
  distance_km: number | null;
  elevation_gain_m?: number | null;
  elevation_loss_m?: number | null;
  listing_meta?: Record<string, unknown> | null;
  swim_dist: number | null;
  bike_dist: number | null;
  run_dist: number | null;
  description: string | null;
  event_url: string | null;
  user_id: string;
};

type Seller = {
  nickname: string | null;
  updated_at: string | null;
};

export function ListingDetailScreen({ listingId, session, onClose }: Props) {
  const insets = useSafeAreaInsets();

  const statusBarHeight = Platform.OS === 'android'
    ? (StatusBar.currentHeight ?? 24)
    : insets.top;

  // Exakte Höhe: Screen minus Tab-Menü (Die Statusbar wird unten wieder dazugerechnet, da top: 0)
  const modalHeight = SCREEN_HEIGHT - NAV_HEIGHT;

  const slideAnim = useRef(new Animated.Value(-SCREEN_HEIGHT)).current;

  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [seller, setSeller]   = useState<Seller | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaved, setIsSaved] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  // Einfahren von oben
  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      damping: 22,
      stiffness: 220,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, []);

  function handleClose() {
    Animated.timing(slideAnim, {
      toValue: -SCREEN_HEIGHT,
      duration: 260,
      useNativeDriver: true,
    }).start(() => onClose());
  }

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      handleClose();
      return true;
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const { data, error } = await supabase
          .from('listings')
          .select(
            'id, event_name, event_date, location, plz, price, old_price, category, distance, distance_km, elevation_gain_m, elevation_loss_m, listing_meta, swim_dist, bike_dist, run_dist, description, event_url, user_id'
          )
          .eq('id', listingId)
          .single();

        if (error) throw error;
        setListing(data);

        if (data.user_id) {
          const { data: sellerData } = await supabase
            .from('profiles')
            .select('nickname, updated_at')
            .eq('id', data.user_id)
            .single();
          setSeller(sellerData);
        }

        if (session?.user?.id) {
          const { data: wl } = await supabase
            .from('watchlist')
            .select('listing_id')
            .eq('user_id', session.user.id)
            .eq('listing_id', listingId)
            .maybeSingle();
          setIsSaved(!!wl);
        }
      } catch (err) {
        console.error(err);
        Alert.alert('Fehler', 'Inserat konnte nicht geladen werden.');
        handleClose();
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [listingId]);

  async function handleShare() {
    if (!listing) return;

    const eventDate = new Date(listing.event_date).toLocaleDateString('de-DE');
    const url = `${LISTING_SHARE_BASE_URL}/${listing.id}`;
    const shareMessage = `Guck mal, welchen Startplatz ich entdeckt habe\n${listing.event_name} · ${listing.price} €`;

    try {
      await Share.share(
        Platform.OS === 'ios'
          ? { message: `${shareMessage}\n${url}`, url }
          : { message: `${shareMessage}\n${url}`, title: 'Startplatzbörse' },
      );
    } catch {
      /* Abbruch durch Nutzer */
    }
  }

  async function toggleSave() {
    if (!session?.user?.id) {
      Alert.alert('Hinweis', 'Bitte logge dich ein, um Startplätze zu merken.');
      return;
    }
    if (isSaved) {
      setIsSaved(false);
      await supabase
        .from('watchlist')
        .delete()
        .eq('user_id', session.user.id)
        .eq('listing_id', listingId);
    } else {
      setIsSaved(true);
      await supabase
        .from('watchlist')
        .insert({ user_id: session.user.id, listing_id: listingId });
    }
  }

  async function handleSendMessage() {
    if (!message.trim()) {
      Alert.alert('Hinweis', 'Bitte schreib eine Nachricht.');
      return;
    }
    if (!session?.user?.id) {
      Alert.alert('Hinweis', 'Bitte logge dich ein, um Nachrichten zu senden.');
      return;
    }
    if (!listing) return;
    if (session.user.id === listing.user_id) {
      Alert.alert('Hinweis', 'Du kannst dir nicht selbst schreiben.');
      return;
    }

    setSending(true);
    try {
      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .eq('listing_id', listingId)
        .eq('buyer_id', session.user.id)
        .maybeSingle();

      let chatId = existing?.id;

      if (!chatId) {
        const { data: nc, error: ne } = await supabase
          .from('conversations')
          .insert({
            listing_id: listingId,
            buyer_id: session.user.id,
            seller_id: listing.user_id,
          })
          .select()
          .single();
        if (ne) throw ne;
        chatId = nc.id;
      }

      const { error: me } = await supabase.from('messages').insert({
        conversation_id: chatId,
        sender_id: session.user.id,
        content: message.trim(),
      });

      if (me) throw me;
      setMessage('');
      Alert.alert('Gesendet! ✓', 'Deine Nachricht wurde erfolgreich gesendet.');
    } catch (err) {
      Alert.alert('Fehler', 'Nachricht konnte nicht gesendet werden.');
    } finally {
      setSending(false);
    }
  }

  function getDistanceLabel(): string {
    if (!listing) return 'K.A.';
    if (listing.distance === 'Freie Distanz') {
      if (
        listing.category === 'Triathlon' &&
        (listing.swim_dist || listing.bike_dist || listing.run_dist)
      ) {
        return `Schwimmen ${listing.swim_dist ?? '?'} km · Rad ${listing.bike_dist ?? '?'} km · Laufen ${listing.run_dist ?? '?'} km`;
      }
      return listing.distance_km
        ? `Freie Distanz (${listing.distance_km} km)`
        : 'Freie Distanz';
    }
    return formatListingDistance({
      ...listing,
      category: listing.category as import('../types').SportCategory,
      status: 'active',
      approved: true,
    });
  }

  const runMetaHighlights = listing
    ? buildRunMetaHighlights({
        listing_meta: listing.listing_meta,
        distance_km: listing.distance_km,
        elevation_gain_m: listing.elevation_gain_m,
        elevation_loss_m: listing.elevation_loss_m,
      })
    : [];

  // V2.0 Fix: Startet bei top: 0 an der absoluten Glaskante, um den Rand-Farbsprung zu eliminieren
  const screenStyle = {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    height: modalHeight,
    backgroundColor: BG_MAIN,
    overflow: 'hidden' as const,
    transform: [{ translateY: slideAnim }],
    zIndex: 100,
  };

  if (loading) {
    return (
      <Animated.View style={screenStyle}>
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.cyan} size="large" />
        </View>
      </Animated.View>
    );
  }

  if (!listing) return null;

  const eventDate = new Date(listing.event_date).toLocaleDateString('de-DE');
  const memberSince = seller?.updated_at
    ? new Date(seller.updated_at).toLocaleDateString('de-DE', {
        month: 'long',
        year: 'numeric',
      })
    : null;

  return (
    <Animated.View style={screenStyle}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        {/* HEADER (Mit Notch-Ausgleich genau wie beim Chat) */}
        <View style={[styles.header, { paddingTop: Platform.OS === 'android' ? statusBarHeight + 12 : 44 }]}>
          <Pressable style={styles.backButton} onPress={handleClose}>
            <FontAwesome5 name="arrow-left" size={16} color="#ffffff" />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {listing.event_name}
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* SCROLLBARER INHALT */}
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={true}
        >
          {/* BADGE + TITEL + PREIS */}
          <View style={styles.titleSection}>
            <View style={styles.categoryRow}>
              <Text style={styles.badge}>{listing.category}</Text>
              <View style={styles.actionRow}>
                <Pressable
                  style={[styles.actionButton, isSaved && styles.actionButtonActive]}
                  onPress={toggleSave}
                  accessibilityLabel={isSaved ? 'Von Merkliste entfernen' : 'Startplatz merken'}
                >
                  <FontAwesome5
                    name="heart"
                    size={18}
                    color={isSaved ? colors.cyan : '#e2e8f0'}
                    solid={isSaved}
                  />
                  <Text style={[styles.actionLabel, isSaved && styles.actionLabelActive]}>
                    Merken
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.actionButton}
                  onPress={handleShare}
                  accessibilityLabel="Startplatz teilen"
                >
                  <FontAwesome5 name="share-alt" size={18} color={colors.cyan} />
                  <Text style={styles.actionLabel}>Teilen</Text>
                </Pressable>
              </View>
            </View>
            <Text style={styles.eventTitle}>{listing.event_name}</Text>
            <View style={styles.priceRow}>
              <Text style={styles.mainPrice}>{listing.price} €</Text>
              {listing.old_price && (
                <Text style={styles.oldPrice}>{listing.old_price} €</Text>
              )}
            </View>
          </View>

          {/* INFO GRID */}
          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Datum</Text>
              <Text style={styles.infoValue}>{eventDate}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Ort</Text>
              <Text style={styles.infoValue}>
                {listing.location}{listing.plz ? ` (${listing.plz})` : ''}
              </Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Distanz</Text>
              <Text style={styles.infoValue}>
                {runMetaHighlights.length
                  ? listing.distance === 'Ultra'
                    ? 'Ultra'
                    : listing.distance === 'Trail'
                      ? 'Trail'
                      : getDistanceLabel()
                  : getDistanceLabel()}
              </Text>
            </View>
            {listing.event_url && (
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Website</Text>
                <Text
                  style={[styles.infoValue, styles.link]}
                  onPress={() => Linking.openURL(listing.event_url!)}
                  numberOfLines={1}
                >
                  {listing.event_url}
                </Text>
              </View>
            )}
          </View>

          {runMetaHighlights.length > 0 ? <ListingHighlights items={runMetaHighlights} /> : null}

          {/* BESCHREIBUNG */}
          {listing.description ? (
            <View style={styles.descriptionBox}>
              <Text style={styles.infoLabel}>Zusatzinfos</Text>
              <Text style={styles.descriptionText}>{listing.description}</Text>
            </View>
          ) : null}

          {/* VERKÄUFER */}
          {seller && (
            <View style={styles.sellerCard}>
              <View style={styles.sellerAvatar}>
                <FontAwesome5 name="user" size={20} color={colors.cyan} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sellerName}>{seller.nickname ?? 'Anonym'}</Text>
                {memberSince && (
                  <Text style={styles.sellerMeta}>Mitglied seit {memberSince}</Text>
                )}
              </View>
            </View>
          )}

          {/* KONTAKT */}
          <View style={styles.contactCard}>
            <Text style={styles.contactTitle}>Verkäufer kontaktieren</Text>
            <Text style={styles.contactSubtitle}>
              Sende eine Nachricht, um Details oder die Übergabe zu klären.
            </Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder="Hallo, ich habe Interesse an deinem Startplatz..."
              placeholderTextColor="#666"
              multiline
              numberOfLines={4}
              style={styles.messageInput}
              textAlignVertical="top"
            />
            <Pressable
              style={[styles.sendButton, sending && { opacity: 0.6 }]}
              onPress={handleSendMessage}
              disabled={sending}
            >
              {sending
                ? <ActivityIndicator color="#000" />
                : <Text style={styles.sendButtonText}>Nachricht senden</Text>
              }
            </Pressable>
            <Text style={styles.secureNote}>🔒 Sicherer Chat via Startplatzbörse</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // HEADER
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: BG_MAIN,
    gap: 12,
  },
  backButton: { padding: 4 },
  headerTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  headerSpacer: { width: 28 },

  scrollContent: {
    padding: 20,
    paddingBottom: 48,
    gap: 16,
  },

  // TITEL + PREIS
  titleSection: { gap: 6 },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  badge: {
    flex: 1,
    color: colors.cyan,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: BG_CARD,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  actionButtonActive: {
    borderColor: 'rgba(0,188,212,0.45)',
    backgroundColor: 'rgba(0,188,212,0.12)',
  },
  actionLabel: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '800',
  },
  actionLabelActive: {
    color: colors.cyan,
  },
  eventTitle: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '900',
    lineHeight: 30,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
    marginTop: 4,
  },
  mainPrice: { color: colors.cyan, fontSize: 32, fontWeight: '900' },
  oldPrice: {
    color: '#555',
    fontSize: 18,
    fontWeight: '700',
    textDecorationLine: 'line-through',
  },

  // INFO CARDS
  infoGrid: {
    backgroundColor: BG_INPUT,
    borderRadius: radius.lg,
    padding: 16,
    gap: 14,
  },
  infoItem: { gap: 3 },
  infoLabel: {
    color: '#888',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoValue: { color: '#fff', fontSize: 15, fontWeight: '700' },
  infoItemFull: { width: '100%' },
  infoValueMultiline: { color: '#fff', fontSize: 14, fontWeight: '600', lineHeight: 20 },
  link: { color: colors.cyan },

  descriptionBox: {
    backgroundColor: BG_INPUT,
    borderRadius: radius.lg,
    padding: 16,
    gap: 8,
  },
  descriptionText: { color: '#bbb', fontSize: 15, lineHeight: 22 },

  // VERKÄUFER
  sellerCard: {
    backgroundColor: BG_INPUT,
    borderRadius: radius.lg,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  sellerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(0,188,212,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellerName: { color: '#fff', fontSize: 15, fontWeight: '900' },
  sellerMeta: {
    color: '#888',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },

  // KONTAKT
  contactCard: {
    backgroundColor: BG_INPUT,
    borderRadius: radius.lg,
    padding: 16,
    gap: 12,
  },
  contactTitle: { color: '#fff', fontSize: 17, fontWeight: '900' },
  contactSubtitle: { color: '#888', fontSize: 13, lineHeight: 18 },
  messageInput: {
    backgroundColor: BG_MAIN,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 14,
    color: '#fff',
    fontSize: 15,
    height: 110,
  },
  sendButton: {
    height: 52,
    backgroundColor: colors.cyan,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonText: { color: '#000', fontSize: 15, fontWeight: '900' },
  secureNote: {
    color: '#555',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
});