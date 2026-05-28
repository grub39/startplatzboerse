import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatListingDistance } from '../lib/listings';
import { colors, radius } from '../theme';
import type { Listing } from '../types';
import { formatCurrency, formatDate } from '../utils/format';

// ─── StatCard ────────────────────────────────────────────────────────────────

type StatCardProps = {
  label: string;
  value: number;
  highlight?: boolean;
};

export function StatCard({ label, value, highlight = false }: StatCardProps) {
  return (
    <View style={[styles.statCard, highlight && styles.statCardHighlight]}>
      <Text style={[styles.statValue, highlight && styles.statValueHighlight]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ─── DashboardTab ─────────────────────────────────────────────────────────────

type DashboardTabProps = {
  label: string;
  active: boolean;
  onPress: () => void;
};

export function DashboardTab({ label, active, onPress }: DashboardTabProps) {
  return (
    <Pressable style={[styles.dashboardTab, active && styles.dashboardTabActive]} onPress={onPress}>
      <Text style={[styles.dashboardTabText, active && styles.dashboardTabTextActive]}>{label}</Text>
    </Pressable>
  );
}

// ─── DashboardPreview ─────────────────────────────────────────────────────────

type DashboardPreviewProps = {
  title: string;
  empty: string;
  children: ReactNode;
};

export function DashboardPreview({ title, empty, children }: DashboardPreviewProps) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children;
  const hasItems = Array.isArray(items) ? items.length > 0 : !!items;
  return (
    <View style={styles.previewBox}>
      <Text style={styles.previewTitle}>{title}</Text>
      {hasItems ? items : <Text style={styles.previewEmpty}>{empty}</Text>}
    </View>
  );
}

// ─── EmptyDashboard ───────────────────────────────────────────────────────────

export function EmptyDashboard({ text }: { text: string }) {
  return (
    <View style={styles.dashboardEmpty}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

// ─── CompactListing ───────────────────────────────────────────────────────────

export function CompactListing({ listing }: { listing: Listing }) {
  return (
    <View style={styles.compactRow}>
      <View style={styles.compactMain}>
        <Text style={styles.compactTitle}>{listing.event_name}</Text>
        <Text style={styles.cardMeta}>
          {listing.location || 'Ort offen'} · {formatDate(listing.event_date)}
        </Text>
      </View>
      <View style={styles.priceStack}>
        <Text style={styles.compactPrice}>{formatCurrency(listing.price)}</Text>
        <Text style={styles.priceType}>{listing.price_type === 'vb' ? 'VB' : 'Festpreis'}</Text>
      </View>
    </View>
  );
}

// ─── DashboardListingCard ─────────────────────────────────────────────────────

type DashboardListingCardProps = {
  listing: Listing;
  actionLabel: string;
  onAction: () => void;
};

export function DashboardListingCard({ listing, actionLabel, onAction }: DashboardListingCardProps) {
  const unavailable = listing.status !== 'active' || !listing.approved;
  return (
    <View style={[styles.card, unavailable && styles.cardMuted]}>
      <View style={styles.cardMid}>
        <Text style={styles.badge}>{listing.category || 'Event'}</Text>
        {unavailable && <Text style={styles.unavailableBadge}>Nicht öffentlich</Text>}
      </View>
      <Text style={styles.cardTitle}>{listing.event_name}</Text>
      <Text style={styles.cardMeta}>
        {listing.location || 'Ort offen'} · {formatDate(listing.event_date)}
      </Text>
      <View style={styles.cardBottom}>
        <Text style={styles.distanceText}>{formatListingDistance(listing)}</Text>
        <View style={styles.priceStack}>
          <Text style={styles.priceText}>{formatCurrency(listing.price)}</Text>
          <Text style={styles.priceType}>{listing.price_type === 'vb' ? 'VB' : 'Festpreis'}</Text>
        </View>
      </View>
      <Pressable style={styles.secondaryButtonInline} onPress={onAction}>
        <Text style={styles.secondaryButtonText}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

// ─── ChatCard ─────────────────────────────────────────────────────────────────

import type { Conversation } from '../types';

type ChatCardProps = {
  chat: Conversation;
  userId: string;
  onPress: () => void;
};

export function ChatCard({ chat, userId, onPress }: ChatCardProps) {
  const isSeller = chat.seller_id === userId;
  const partnerName = isSeller ? chat.buyer?.nickname : chat.seller?.nickname;
  const unread = chat.messages.filter((msg) => !msg.is_read && msg.sender_id !== userId).length;

  return (
    <Pressable style={[styles.chatCard, unread > 0 && styles.chatCardUnread]} onPress={onPress}>
      <View style={styles.chatCardTop}>
        <Text style={[styles.roleBadge, isSeller ? styles.roleSeller : styles.roleBuyer]}>
          {isSeller ? 'Anfrage von' : 'Anfrage an'} {partnerName || 'User'}
        </Text>
        {unread > 0 && <Text style={styles.unreadBadge}>{unread}</Text>}
      </View>
      <Text style={styles.cardTitle}>{chat.listings?.event_name || 'Event'}</Text>
      <Text style={styles.cardMeta}>Stand: {formatDate(chat.updated_at)}</Text>
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderColor: colors.border,
    borderWidth: 1,
    padding: 14,
  },
  statCardHighlight: {
    borderColor: colors.cyan,
    backgroundColor: colors.cyanSoft,
  },
  statValue: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
  },
  statValueHighlight: {
    color: colors.cyan,
  },
  statLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2,
  },
  dashboardTab: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: colors.bgElevated,
    borderColor: colors.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashboardTabActive: {
    backgroundColor: colors.cyan,
    borderColor: colors.cyan,
  },
  dashboardTabText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '900',
  },
  dashboardTabTextActive: {
    color: '#000',
  },
  previewBox: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderColor: colors.border,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  previewTitle: {
    color: colors.faint,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  previewEmpty: {
    color: colors.muted,
    fontSize: 14,
  },
  dashboardEmpty: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  compactMain: {
    flex: 1,
    gap: 3,
  },
  compactTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  compactPrice: {
    color: colors.cyan,
    fontSize: 15,
    fontWeight: '900',
  },
  priceStack: { alignItems: 'flex-end', gap: 1 },
  priceType: {
    color: '#777',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderColor: colors.border,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  cardMuted: {
    opacity: 0.7,
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
  unavailableBadge: {
    color: colors.danger,
    fontSize: 11,
    fontWeight: '900',
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
  priceText: {
    color: colors.cyan,
    fontSize: 22,
    fontWeight: '900',
  },
  secondaryButtonInline: {
    minHeight: 42,
    borderRadius: radius.md,
    backgroundColor: colors.bgElevated,
    borderColor: colors.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  chatCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderColor: colors.border,
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  chatCardUnread: {
    borderColor: colors.cyan,
  },
  chatCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  roleBadge: {
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  roleSeller: {
    color: colors.cyan,
  },
  roleBuyer: {
    color: colors.muted,
  },
  unreadBadge: {
    minWidth: 24,
    minHeight: 24,
    borderRadius: 12,
    overflow: 'hidden',
    color: '#000',
    backgroundColor: colors.cyan,
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
    paddingTop: 4,
  },
});
