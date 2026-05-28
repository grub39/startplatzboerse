import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons'; 
import { colors } from '../theme';

type Props = {
  active: boolean;
  label: string;
  badgeCount?: number;
  onPress: () => void;
};

export function TabButton({ active, label, badgeCount = 0, onPress }: Props) {
  // Piktogramm-Zuordnung anhand deines labels
  const getIconName = () => {
    switch (label) {
      case 'Suchen':     return 'search';       // Lupe für die Suche
      case 'Merkliste':  return 'heart';        // Herz für Favoriten
      case 'Inserieren': return 'plus-circle';  // Plus im Kreis für neue Inserate
      case 'Chats':      return 'comment-alt';  // Sprechblase für Nachrichten
      case 'Dashboard':  return 'user';        
      default:           return 'circle';
    }
  };

  return (
    <Pressable style={styles.tabButton} onPress={onPress}>
      <View>
        <FontAwesome5
          name={getIconName()}
          size={22} 
          color={active ? colors.cyan : colors.muted || '#888888'}
          solid={active && (label === 'Merkliste' || label === 'Dashboard')} // Füllt Herz & Männchen aus, wenn aktiv
        />
        {badgeCount > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badgeCount > 99 ? '99+' : badgeCount}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tabButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -8,
    right: -12,
    minWidth: 18,
    height: 18,
    borderRadius: 999,
    paddingHorizontal: 5,
    backgroundColor: colors.cyan,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#000000',
    fontSize: 10,
    fontWeight: '900',
  },
});