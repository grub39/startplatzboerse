import { StyleSheet, Text, View } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import type { RunMetaHighlight } from '../lib/runListingBuild';
import { colors, radius } from '../theme';

type Props = {
  items: RunMetaHighlight[];
};

export function ListingHighlights({ items }: Props) {
  if (!items.length) return null;

  return (
    <View style={styles.container}>
      {items.map((item) => (
        <View key={item.key} style={styles.row}>
          <View style={styles.iconWrap}>
            <FontAwesome5 name={item.icon as any} size={17} color={colors.cyan} />
          </View>
          <Text style={styles.label}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#242424',
    borderRadius: radius.lg,
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 188, 212, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  label: {
    flex: 1,
    color: '#f0f0f0',
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 21,
  },
});
