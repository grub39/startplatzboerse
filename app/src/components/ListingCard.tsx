import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { formatListingDistance } from '../lib/listings';
import { colors, radius } from '../theme';
import type { Listing } from '../types';
import { formatCurrency, formatDate } from '../utils/format';

type Props = {
  listing: Listing;
  saved: boolean;
  onOpen: () => void;
  onSave: () => void;
};

export function ListingCard({ listing, saved, onOpen, onSave }: Props) {
  return (
    <Pressable style={styles.card} onPress={onOpen}>
      
      {/* ================= PURISTISCHE APPLE-ECKE ================= */}
      <Pressable
        style={[styles.steveHeartCorner, saved && styles.steveHeartCornerActive]}
        onPress={(event) => {
          event.stopPropagation();
          onSave();
        }}
      >
        <FontAwesome5
          name="heart"
          size={14}
          color={saved ? colors.cyan : 'rgba(255,255,255,0.18)'}
          solid={saved}
        />
      </Pressable>
      {/* ========================================================== */}

      <View style={styles.cardTop}>
        <View style={styles.cardTitleWrap}>
          <Text style={styles.cardTitle}>{listing.event_name}</Text>
          <View style={styles.locationRow}>
            <Text style={styles.cardMeta}>{listing.location || 'Ort offen'}</Text>
            {typeof listing._distanceKm === 'number' ? (
              <Text style={styles.distanceBadge}>~{listing._distanceKm} km entfernt</Text>
            ) : null}
          </View>
        </View>
      </View>

      <View style={styles.cardMid}>
        <Text style={styles.badge}>{listing.category || 'Event'}</Text>
        <Text style={styles.cardMeta}>{formatDate(listing.event_date)}</Text>
      </View>

      <View style={styles.cardBottom}>
        <Text style={styles.distanceText}>{formatListingDistance(listing)}</Text>
        <View style={styles.priceWrap}>
          <Text style={styles.priceText}>{formatCurrency(listing.price)}</Text>
          <Text style={styles.priceType}>{listing.price_type === 'vb' ? 'VB' : 'Festpreis'}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderColor: colors.border,
    borderWidth: 1,
    padding: 16,
    gap: 14,
    overflow: 'hidden',
    position: 'relative',
  },
  
  steveHeartCorner: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 50,
    height: 50,
    borderBottomLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    transform: [
      { translateX: -3 },
      { translateY: 3 }
    ],
  },
  steveHeartCornerActive: {
    backgroundColor: 'rgba(255,255,255,0.02)', 
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },

  cardTop: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingRight: 40,
  },
  cardTitleWrap: {
    flex: 1,
    gap: 5,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 21,
  },
  cardMeta: {
    color: colors.muted,
    fontSize: 12,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  distanceBadge: {
    color: colors.cyan,
    backgroundColor: colors.cyanSoft,
    borderRadius: radius.sm,
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 2,
    fontSize: 10,
    fontWeight: '900',
  },
  cardMid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badge: {
    color: colors.cyan,
    backgroundColor: colors.cyanSoft,
    borderRadius: radius.sm,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  cardBottom: {
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 16,
  },
  distanceText: {
    flex: 1,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  priceWrap: { alignItems: 'flex-end', gap: 2 },
  priceText: {
    color: colors.cyan,
    fontSize: 22,
    fontWeight: '900',
  },
  priceType: {
    color: '#777',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});