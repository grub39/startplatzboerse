import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatListingDistance } from '../lib/listings';
import { colors, radius } from '../theme';
import type { Listing } from '../types';
import { formatCurrency, formatDate } from '../utils/format';

type Props = {
  listing: Listing | null;
  onClose: () => void;
};

export function ListingModal({ listing, onClose }: Props) {
  return (
    <Modal animationType="slide" transparent visible={!!listing} onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          {listing && (
            <>
              <View style={styles.modalHandle} />
              <Text style={styles.modalBadge}>{listing.category}</Text>
              <Text style={styles.modalTitle}>{listing.event_name}</Text>
              <Text style={styles.modalMeta}>
                {listing.location || 'Ort offen'} · {formatDate(listing.event_date)}
              </Text>
              <Text style={styles.modalPrice}>{formatCurrency(listing.price)}</Text>
              <Text style={styles.modalSectionTitle}>Distanz</Text>
              <Text style={styles.modalBody}>{formatListingDistance(listing)}</Text>
              {!!listing.description && (
                <>
                  <Text style={styles.modalSectionTitle}>Beschreibung</Text>
                  <Text style={styles.modalBody}>{listing.description}</Text>
                </>
              )}
              <Pressable style={styles.primaryButton} onPress={onClose}>
                <Text style={styles.primaryButtonText}>Schliessen</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    maxHeight: '82%',
    backgroundColor: colors.card,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 22,
    gap: 12,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: colors.faint,
    marginBottom: 8,
  },
  modalBadge: {
    color: colors.cyan,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  modalTitle: {
    color: colors.text,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '900',
  },
  modalMeta: {
    color: colors.muted,
    fontSize: 14,
  },
  modalPrice: {
    color: colors.cyan,
    fontSize: 30,
    fontWeight: '900',
  },
  modalSectionTitle: {
    color: colors.faint,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginTop: 6,
  },
  modalBody: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  primaryButton: {
    minHeight: 50,
    borderRadius: radius.md,
    backgroundColor: colors.cyan,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    marginTop: 12,
  },
  primaryButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '900',
  },
});
