import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

const SCREEN_BG = '#323232';
const FADE_WIDTH = 28;
const FADE_STEPS = [1, 0.82, 0.58, 0.34, 0.14, 0];

type Props = {
  children: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  scrollEnabled?: boolean;
};

function EdgeFade({ side }: { side: 'left' | 'right' }) {
  return (
    <View pointerEvents="none" style={[styles.fadeEdge, side === 'left' ? styles.fadeLeft : styles.fadeRight]}>
      {FADE_STEPS.map((alpha, index) => (
        <View
          key={`${side}-${index}`}
          style={[
            styles.fadeSlice,
            {
              left: side === 'left' ? index * 5 : undefined,
              right: side === 'right' ? index * 5 : undefined,
              backgroundColor: `rgba(50, 50, 50, ${alpha})`,
            },
          ]}
        />
      ))}
    </View>
  );
}

export function FadeHorizontalScroll({ children, contentContainerStyle, scrollEnabled = true }: Props) {
  return (
    <View style={styles.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEnabled={scrollEnabled}
        decelerationRate="fast"
        contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
      >
        {children}
      </ScrollView>
      <EdgeFade side="left" />
      <EdgeFade side="right" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: -20,
    position: 'relative',
  },
  scrollContent: {
    paddingHorizontal: 20,
    gap: 8,
    paddingVertical: 4,
  },
  fadeEdge: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: FADE_WIDTH,
  },
  fadeLeft: { left: 0 },
  fadeRight: { right: 0 },
  fadeSlice: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 5,
  },
});

export const pillStyles = StyleSheet.create({
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#242424',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  pillActive: {
    backgroundColor: '#00bcd4',
    borderColor: '#00bcd4',
  },
  pillText: { color: '#888888', fontSize: 13, fontWeight: '700' },
  pillTextActive: { color: '#000000', fontWeight: '900' },
});
