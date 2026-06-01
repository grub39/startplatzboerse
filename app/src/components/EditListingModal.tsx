import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { colors, radius } from '../theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const NAV_HEIGHT = 74;

type Props = {
  listingId: string;
  onClose: () => void;
  onRefresh: () => void;
};

export function EditListingModal({ listingId, onClose, onRefresh }: Props) {
  const insets = useSafeAreaInsets();

  // Android: StatusBar.currentHeight ist zuverlässiger als insets.top
  const statusBarHeight = Platform.OS === 'android'
    ? (StatusBar.currentHeight ?? 24)
    : insets.top;

  // Exakte Höhe: Screen minus StatusBar minus Tab-Menü (V2.0 Standard)
  const modalHeight = SCREEN_HEIGHT - statusBarHeight - NAV_HEIGHT;

  // Startet komplett oben außerhalb des Screens
  const slideAnim = useRef(new Animated.Value(-SCREEN_HEIGHT)).current;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [street, setStreet] = useState('');
  const [plz, setPlz] = useState('');
  const [location, setLocation] = useState('');
  const [eventUrl, setEventUrl] = useState('');
  const [priceType, setPriceType] = useState<'fixed' | 'vb'>('fixed');
  const [dbItem, setDbItem] = useState<{ price: number; old_price: number | null } | null>(null);

  // Modal von oben einfahren
  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      damping: 22,
      stiffness: 220,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, []);

  // Nach oben rausfahren, dann erst onClose aufrufen
  function handleClose() {
    Animated.timing(slideAnim, {
      toValue: -SCREEN_HEIGHT,
      duration: 260,
      useNativeDriver: true,
    }).start(() => onClose());
  }

  useEffect(() => {
    async function loadListingData() {
      try {
        const { data, error } = await supabase
          .from('listings')
          .select('price, price_type, description, plz, location, event_url, old_price')
          .eq('id', listingId)
          .single();

        if (error) throw error;

        if (data) {
          setPrice(String(data.price));
          setDescription(data.description || '');
          setStreet(data.street || '');
          setPlz(data.plz || '');
          setLocation(data.location || '');
          setEventUrl(data.event_url || '');
          setPriceType(data.price_type === 'vb' ? 'vb' : 'fixed');
          setDbItem({ price: data.price, old_price: data.old_price });
        }
      } catch (err) {
        console.error(err);
        Alert.alert('Fehler', 'Daten konnten nicht geladen werden.');
        handleClose();
      } finally {
        setLoading(false);
      }
    }
    loadListingData();
  }, [listingId]);

  async function handleSave() {
    if (!price.trim() || !plz.trim() || !location.trim()) {
      Alert.alert('Fehler', 'Bitte fülle alle Pflichtfelder (*) aus.');
      return;
    }
    setSaving(true);
    try {
      const newPrice = parseFloat(price.replace(',', '.'));
      if (isNaN(newPrice)) throw new Error('Bitte gib einen gültigen Preis ein.');

      let finalLat = null;
      let finalLng = null;
      try {
        const geoQuery = encodeURIComponent(`${plz.trim()} ${location.trim()}`);
        const geoRes = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${geoQuery}&limit=1`,
          { headers: { 'User-Agent': 'StartplatzboerseApp/1.0 (dustin@startplatzboerse.com)' } }
        );
        const geoData = await geoRes.json();
        if (geoData?.length > 0) {
          finalLat = parseFloat(geoData[0].lat);
          finalLng = parseFloat(geoData[0].lon);
        }
      } catch (geoErr) {
        console.warn('Geocoding failed:', geoErr);
      }

      let oldPriceField: number | null = dbItem?.old_price ?? null;
      if (dbItem) {
        if (!dbItem.old_price) oldPriceField = dbItem.price;
        else if (newPrice >= dbItem.old_price) oldPriceField = null;
      }

      const updatePayload: Record<string, unknown> = {
        price: newPrice,
        old_price: oldPriceField,
        description: description.trim(),
        plz: plz.trim(),
        location: location.trim(),
        event_url: eventUrl.trim() || null,
        price_type: priceType,
      };
      const trimmedStreet = street.trim();
      if (trimmedStreet) {
        updatePayload.street = trimmedStreet;
      }
      if (finalLat && finalLng) {
        updatePayload.lat = finalLat;
        updatePayload.lng = finalLng;
      }

      const { error: updateError } = await supabase
        .from('listings')
        .update(updatePayload)
        .eq('id', listingId);

      if (updateError) throw updateError;
      setShowSuccess(true);
    } catch (err) {
      Alert.alert('Fehler', err instanceof Error ? err.message : 'Speichern fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  }

  // Inline-Style: Startet unter der Statusbar und stoppt präzise über der Tab-Bar unten
  const screenStyle = {
    position: 'absolute' as const,
    top: statusBarHeight,
    left: 0,
    right: 0,
    height: modalHeight,
    backgroundColor: colors.background,
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

  return (
    <Animated.View style={screenStyle}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        {/* HEADER */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Inserat bearbeiten</Text>
          <Pressable style={styles.closeButton} onPress={handleClose}>
            <Text style={styles.closeButtonText}>✕</Text>
          </Pressable>
        </View>

        {/* FORMULAR */}
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={true}
        >
          <View style={styles.formGroup}>
            <Text style={styles.inputLabel}>Preis (€) *</Text>
            <TextInput
              style={styles.input}
              keyboardType="decimal-pad"
              value={price}
              onChangeText={setPrice}
              returnKeyType="next"
            />
            <View style={styles.priceTypeRow}>
              <Pressable
                style={[styles.priceTypePill, priceType === 'fixed' && styles.priceTypePillActive]}
                onPress={() => setPriceType('fixed')}
              >
                <Text style={[styles.priceTypePillText, priceType === 'fixed' && styles.priceTypePillTextActive]}>
                  Festpreis
                </Text>
              </Pressable>
              <Pressable
                style={[styles.priceTypePill, priceType === 'vb' && styles.priceTypePillActive]}
                onPress={() => setPriceType('vb')}
              >
                <Text style={[styles.priceTypePillText, priceType === 'vb' && styles.priceTypePillTextActive]}>
                  VB
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.inputLabel}>Veranstalter-Homepage</Text>
            <TextInput
              style={styles.input}
              keyboardType="url"
              placeholder="https://..."
              placeholderTextColor={colors.muted}
              value={eventUrl}
              onChangeText={setEventUrl}
              autoCapitalize="none"
              returnKeyType="next"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.inputLabel}>Straße & Hausnummer</Text>
            <TextInput
              style={styles.input}
              placeholder="z.B. Feldstraße 4"
              placeholderTextColor={colors.muted}
              value={street}
              onChangeText={setStreet}
              returnKeyType="next"
            />
          </View>

          <View style={styles.row}>
            <View style={[styles.formGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>PLZ *</Text>
              <TextInput
                style={styles.input}
                keyboardType="number-pad"
                value={plz}
                onChangeText={setPlz}
              />
            </View>
            <View style={[styles.formGroup, { flex: 2 }]}>
              <Text style={styles.inputLabel}>Ort *</Text>
              <TextInput
                style={styles.input}
                value={location}
                onChangeText={setLocation}
                returnKeyType="next"
              />
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.inputLabel}>Beschreibung</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              multiline
              numberOfLines={5}
              value={description}
              onChangeText={setDescription}
            />
          </View>

          <Pressable
            style={[styles.primaryButton, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="#000" />
              : <Text style={styles.primaryButtonText}>Änderungen speichern</Text>
            }
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* SUCCESS POPUP */}
      {showSuccess && (
        <View style={styles.successOverlay}>
          <View style={styles.successCard}>
            <FontAwesome5
              name="check-circle"
              size={42}
              color={colors.cyan}
              style={{ marginBottom: 14 }}
            />
            <Text style={styles.successTitle}>Erfolg</Text>
            <Text style={styles.successText}>
              Deine Änderungen wurden erfolgreich im System gespeichert!
            </Text>
            <Pressable
              style={styles.successButton}
              onPress={() => { onRefresh(); handleClose(); }}
            >
              <Text style={styles.successButtonText}>Super</Text>
            </Pressable>
          </View>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    backgroundColor: colors.background,
  },
  headerTitle: { color: colors.text, fontSize: 19, fontWeight: '900' },
  closeButton: { padding: 4 },
  closeButtonText: { color: colors.muted, fontSize: 18, fontWeight: '700' },
  scrollContent: {
    padding: 20,
    paddingBottom: 40, // Genug Puffer, damit das Formular sauber vor der Tab-Bar endet
    gap: 16,
  },
  formGroup: { gap: 6 },
  row: { flexDirection: 'row', gap: 12 },
  inputLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    opacity: 0.8,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    height: 50,
    color: colors.text,
    fontSize: 15,
  },
  priceTypeRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  priceTypePill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 99,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  priceTypePillActive: { borderColor: colors.cyan, backgroundColor: 'rgba(0, 188, 212, 0.12)' },
  priceTypePillText: { color: '#999999', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  priceTypePillTextActive: { color: colors.cyan },
  textArea: {
    height: 110,
    paddingTop: 12,
    paddingBottom: 12,
    textAlignVertical: 'top',
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: radius.md,
    backgroundColor: colors.cyan,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  primaryButtonText: { color: '#000000', fontSize: 16, fontWeight: '900' },
  successOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    zIndex: 99999,
  },
  successCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 24,
    alignItems: 'center',
  },
  successTitle: { color: colors.text, fontSize: 20, fontWeight: '900', marginBottom: 8 },
  successText: {
    color: colors.muted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  successButton: {
    width: '100%',
    height: 48,
    backgroundColor: colors.cyan,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successButtonText: { color: '#000000', fontSize: 15, fontWeight: '900' },
});