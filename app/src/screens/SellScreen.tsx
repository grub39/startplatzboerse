import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { colors, radius } from '../theme';
import { ToastPopup } from '../components/ToastPopup'; // <-- Importiert die neue Shared Component
import { RunDistanceDetailForm } from '../components/RunDistanceDetailForm';
import { FadeHorizontalScroll, pillStyles } from '../components/FadeHorizontalScroll';
import { LISTING_DISTANCE_OPTIONS, SPORT_CATEGORY_OPTIONS } from '../constants/listingOptions';
import {
  buildTrailListing,
  buildUltraListing,
  emptyTrailForm,
  emptyUltraForm,
  validateTrailForm,
  validateUltraForm,
  type TrailFormState,
  type UltraFormState,
} from '../lib/runListingBuild';

type Props = {
  session: Session | null;
  onGoLogin: () => void;
  onConsumeAndroidBackPress?: (handler: (() => boolean) | null) => void;
};

const CATEGORIES = SPORT_CATEGORY_OPTIONS.map(({ id, label }) => ({ id, name: label }));
const DISTANCES_BY_CATEGORY = LISTING_DISTANCE_OPTIONS;
const LAUFEN_SPECIAL_DISTANCES = ['Ultra', 'Trail'] as const;
type LaufenSpecial = (typeof LAUFEN_SPECIAL_DISTANCES)[number];

const LAUFEN_SPECIAL_COPY: Record<LaufenSpecial, { subtitle: string; stepHint: string; stepTitle: string }> = {
  Ultra: {
    subtitle: 'Distanz- oder Zeitläufe ab Marathon',
    stepHint: 'Details werden auf Seite 2 eingegeben.',
    stepTitle: 'Ultra — Details',
  },
  Trail: {
    subtitle: 'Geländelauf mit Höhenmetern',
    stepHint: 'Details werden auf Seite 2 eingegeben.',
    stepTitle: 'Trail — Details',
  },
};

function standardDistancesForCategory(cat: string): string[] {
  const all = DISTANCES_BY_CATEGORY[cat] ?? [];
  if (cat !== 'Laufen') return all;
  return all.filter((d) => !LAUFEN_SPECIAL_DISTANCES.includes(d as (typeof LAUFEN_SPECIAL_DISTANCES)[number]));
}

const calStyles = StyleSheet.create({
  navRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  navBtn: { width: 34, height: 34, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  navArrow: { color: '#ffffff', fontSize: 20, fontWeight: '700', lineHeight: 22 },
  monthLabel: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
  weekRow: { flexDirection: 'row', paddingHorizontal: 12, marginBottom: 4 },
  weekDay: { flex: 1, textAlign: 'center', color: '#555555', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', paddingVertical: 4 },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, paddingBottom: 8 },
  dayCell: { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  todayCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  dayText: { color: '#aaaaaa', fontSize: 14, fontWeight: '600' },
  dayTextSelected: { color: colors.cyan, fontWeight: '900' },
  dayTextToday: { color: '#ffffff' },
  dayTextPast: { color: '#333333' },
});

export function SellScreen({ session, onGoLogin, onConsumeAndroidBackPress }: Props) {
  const insets = useSafeAreaInsets();

  const [currentStep, setCurrentStep] = useState<number>(1);
  const [submitting, setSubmitting] = useState(false);

  const [popup, setPopup] = useState<{
    visible: boolean;
    type: 'error' | 'info' | 'success';
    title: string;
    text: string;
  }>({ visible: false, type: 'error', title: '', text: '' });

  const [category, setCategory] = useState('Laufen');
  const [eventName, setEventName] = useState('');

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [eventDate, setEventDate] = useState('');
  const [calViewDate, setCalViewDate] = useState(new Date());

  const [street, setStreet] = useState('');
  const [plz, setPlz] = useState('');
  const [location, setLocation] = useState('');
  const [eventUrl, setEventUrl] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [selectedDistance, setSelectedDistance] = useState('');

  const [customDistanceKm, setCustomDistanceKm] = useState('');
  const [swimDist, setSwimDist] = useState('');
  const [bikeDist, setBikeDist] = useState('');
  const [runDist, setRunDist] = useState('');
  const [ultraForm, setUltraForm] = useState<UltraFormState>(emptyUltraForm);
  const [trailForm, setTrailForm] = useState<TrailFormState>(emptyTrailForm);
  /** Gewählte Lauf-Spezialisierung (Ultra / Trail) — löst 3-Schritte-Flow aus. */
  const [runSpecial, setRunSpecial] = useState<LaufenSpecial | null>(null);

  const [confirmTransfer, setConfirmTransfer] = useState(false);

  const totalSteps = runSpecial ? 3 : 2;
  const isSpecialStep = runSpecial !== null && currentStep === 2;
  const isFinalStep = runSpecial ? currentStep === 3 : currentStep === 2;

  useEffect(() => {
    setRunSpecial(null);
    if (category === 'Radrennen') {
      setSelectedDistance('Freie Distanz');
    } else {
      setSelectedDistance(standardDistancesForCategory(category)[0] || '');
    }
    setUltraForm(emptyUltraForm());
    setTrailForm(emptyTrailForm());
  }, [category]);

  function clearRunSpecial() {
    setRunSpecial(null);
    setUltraForm(emptyUltraForm());
    setTrailForm(emptyTrailForm());
    if (category === 'Laufen') {
      setSelectedDistance(standardDistancesForCategory('Laufen')[0] || '');
    }
    if (currentStep > 1) {
      setCurrentStep(1);
    }
  }

  function selectStandardDistance(dist: string) {
    clearRunSpecial();
    setSelectedDistance(dist);
  }

  function selectRunSpecial(kind: LaufenSpecial) {
    if (runSpecial === kind) {
      clearRunSpecial();
      return;
    }
    if (runSpecial === 'Ultra') setUltraForm(emptyUltraForm());
    else if (runSpecial === 'Trail') setTrailForm(emptyTrailForm());
    setRunSpecial(kind);
    setSelectedDistance(kind);
  }

  function removeRunSpecial() {
    clearRunSpecial();
  }

  const triggerPopup = (type: 'error' | 'info' | 'success', title: string, text: string) => {
    setPopup({ visible: true, type, title, text });
  };

  const handlePopupConfirm = () => {
    if (popup.type === 'success') {
      setEventName('');
      setEventDate('');
      setCalViewDate(new Date());
      setStreet('');
      setPlz('');
      setLocation('');
      setEventUrl('');
      setPrice('');
      setDescription('');
      setCustomDistanceKm('');
      setSwimDist('');
      setBikeDist('');
      setRunDist('');
      setUltraForm(emptyUltraForm());
      setTrailForm(emptyTrailForm());
      setRunSpecial(null);
      setConfirmTransfer(false);
      setCurrentStep(1);
    }
    setPopup({ ...popup, visible: false });
  };

  const handleNextStep = () => {
    if (!eventName.trim() || !eventDate.trim() || !price.trim() || !selectedDistance) {
      triggerPopup('error', 'Fehlende Daten', 'Bitte fülle alle Pflichtfelder (*) aus.');
      return;
    }
    if (selectedDistance === 'Freie Distanz' && category !== 'Triathlon' && category !== 'Radrennen') {
      const km = parseFloat(customDistanceKm.replace(',', '.'));
      if (!Number.isFinite(km) || km <= 0) {
        triggerPopup('error', 'Distanz', 'Bitte Kilometer für die freie Distanz angeben.');
        return;
      }
    }
    setCurrentStep(2);
  };

  const handleSpecialStepNext = () => {
    if (!runSpecial) return;
    const err = runSpecial === 'Ultra' ? validateUltraForm(ultraForm) : validateTrailForm(trailForm);
    if (err) {
      triggerPopup('error', `${runSpecial}-Details`, err);
      return;
    }
    setCurrentStep(3);
  };

  const handleBack = useCallback(() => {
    if (runSpecial ? currentStep === 3 : currentStep === 2) {
      setCurrentStep(runSpecial ? 2 : 1);
      return;
    }
    if (runSpecial && currentStep === 2) {
      setCurrentStep(1);
    }
  }, [currentStep, runSpecial]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const handleAndroidBackPress = () => {
      if (currentStep > 1) {
        handleBack();
        return true;
      }
      return false;
    };

    onConsumeAndroidBackPress?.(handleAndroidBackPress);
    return () => onConsumeAndroidBackPress?.(null);
  }, [currentStep, handleBack, onConsumeAndroidBackPress]);

  async function handleCreateListing() {
    if (!session?.user?.id) {
      triggerPopup('info', 'Hinweis', 'Bitte logge dich zuerst ein.');
      return;
    }

    if (!plz.trim() || !location.trim()) {
      triggerPopup('error', 'Fehlende Daten', 'Bitte gib eine Postleitzahl und einen Ort an.');
      return;
    }

    if (!confirmTransfer) {
      triggerPopup('info', 'Zustimmung fehlt', 'Bestätige bitte kurz die Klärung der Ummeldung.');
      return;
    }

    setSubmitting(true);

    try {
      const parsedPrice = parseFloat(price.replace(',', '.'));
      if (isNaN(parsedPrice)) throw new Error('Bitte gib einen gültigen Preis ein.');

      const { data: profile } = await supabase
        .from('profiles')
        .select('first_name, last_name, nickname')
        .eq('id', session.user.id)
        .single();

      let finalLat = null;
      let finalLng = null;
      try {
        const geoQuery = encodeURIComponent(`${plz.trim()} ${location.trim()}`);
        const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${geoQuery}&limit=1`);
        const geoData = await geoRes.json();
        if (geoData && geoData.length > 0) {
          finalLat = parseFloat(geoData[0].lat);
          finalLng = parseFloat(geoData[0].lon);
        }
      } catch (geoErr) {
        console.warn('Geocoding failed:', geoErr);
      }

      let displayDist = selectedDistance;
      let filterKm = 0;
      let elevationGainM: number | null = null;
      let elevationLossM: number | null = null;
      let listingMeta: Record<string, unknown> = {};
      let finalSwimDist: number | null = null;
      let finalBikeDist: number | null = null;
      let finalRunDist: number | null = null;

      if (category === 'Laufen' && selectedDistance === 'Ultra') {
        const built = buildUltraListing(ultraForm);
        displayDist = built.displayDist;
        filterKm = built.distance_km;
        elevationGainM = built.elevation_gain_m;
        elevationLossM = built.elevation_loss_m;
        listingMeta = built.listing_meta as Record<string, unknown>;
      } else if (category === 'Laufen' && selectedDistance === 'Trail') {
        const built = buildTrailListing(trailForm);
        displayDist = built.displayDist;
        filterKm = built.distance_km;
        elevationGainM = built.elevation_gain_m;
        elevationLossM = built.elevation_loss_m;
        listingMeta = built.listing_meta as Record<string, unknown>;
      } else if (displayDist === 'Freie Distanz') {
        if (category === 'Triathlon') {
          finalSwimDist = swimDist ? parseFloat(swimDist.replace(',', '.')) : null;
          finalBikeDist = bikeDist ? parseFloat(bikeDist.replace(',', '.')) : null;
          finalRunDist = runDist ? parseFloat(runDist.replace(',', '.')) : null;

          const triParts = [];
          if (finalSwimDist !== null) triParts.push(`Schwimmen ${finalSwimDist} km`);
          if (finalBikeDist !== null) triParts.push(`Rad ${finalBikeDist} km`);
          if (finalRunDist !== null) triParts.push(`Laufen ${finalRunDist} km`);

          if (triParts.length > 0) {
            displayDist = `Freie Distanz – ${triParts.join(' · ')}`;
            filterKm = [finalSwimDist, finalBikeDist, finalRunDist].filter(n => n !== null).reduce((sum, n) => sum + (n as number), 0);
          }
        } else {
          const customKm = customDistanceKm ? parseFloat(customDistanceKm.replace(',', '.')) : 0;
          if (customKm > 0) {
            displayDist = `Freie Distanz (${customKm} km)`;
            filterKm = customKm;
          }
        }
      } else {
        switch (displayDist) {
          case '5 km': filterKm = 5; break;
          case '10 km': filterKm = 10; break;
          case '21,1 km Halbmarathon': filterKm = 21.1; break;
          case '42,2 km Marathon': filterKm = 42.2; break;
          case 'Sprint (0,75/20/5 km)':
            finalSwimDist = 0.75; finalBikeDist = 20; finalRunDist = 5; filterKm = 25.75;
            break;
          case 'Olympisch (1,5/40/10 km)':
            finalSwimDist = 1.5; finalBikeDist = 40; finalRunDist = 10; filterKm = 51.5;
            break;
          case '70.3 Mitteldistanz (1,9/90/21 km)':
            finalSwimDist = 1.9; finalBikeDist = 90; finalRunDist = 21; filterKm = 112.9;
            break;
          case '140.6 Langdistanz (3,8/180/42 km)':
            finalSwimDist = 3.8; finalBikeDist = 180; finalRunDist = 42; filterKm = 225.8;
            break;
          default: filterKm = 0; break;
        }
      }

      const insertRow: Record<string, unknown> = {
        user_id: session.user.id,
        seller_email: session.user.email,
        vorname: profile?.first_name || '',
        nachname: profile?.last_name || '',
        category,
        event_name: eventName.trim(),
        description: description.trim() || '',
        distance: displayDist,
        distance_km: filterKm,
        elevation_gain_m: elevationGainM,
        elevation_loss_m: elevationLossM,
        swim_dist: finalSwimDist,
        bike_dist: finalBikeDist,
        run_dist: finalRunDist,
        event_date: eventDate.trim(),
        street: street.trim() || null,
        event_url: eventUrl.trim() || null,
        plz: plz.trim(),
        location: location.trim(),
        lat: finalLat,
        lng: finalLng,
        price: parsedPrice,
        approved: true,
        status: 'active',
      };
      if (listingMeta?.run) {
        insertRow.listing_meta = listingMeta;
      }

      const { error: insertError } = await supabase.from('listings').insert([insertRow]);

      if (insertError) throw insertError;

      triggerPopup('success', 'Inserat live 🎉', 'Dein Startplatz wurde erfolgreich veröffentlicht!');
    } catch (err) {
      triggerPopup('error', 'Fehler', 'Speichern fehlgeschlagen.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!session) {
    return (
      <View style={styles.screen}>
        <View style={[styles.centerState, { paddingTop: Math.max(insets.top + 10, 40) }]}>
          <Text style={styles.headerTitle}>Inserieren</Text>
          <Text style={styles.emptyText}>Du musst eingeloggt sein, um einen Startplatz anzubieten.</Text>
          <Pressable style={styles.loginButton} onPress={onGoLogin}>
            <Text style={styles.loginButtonText}>Jetzt einloggen</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        {/* --- HEADER --- */}
        <View style={[styles.header, { paddingTop: Math.max(insets.top + 10, 40) }]}>
          <View>
            <Text style={styles.headerTitle}>Inserieren</Text>
            <View style={styles.headerSpacer} />
          </View>
          <View style={styles.progressDots}>
            {Array.from({ length: totalSteps }, (_, index) => (
              <View key={index} style={[styles.dot, currentStep >= index + 1 && styles.dotActive]} />
            ))}
          </View>
        </View>

        <ScrollView
          style={styles.screen}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={true}
        >
          {/* ================= SCHRITT 1 ================= */}
          {currentStep === 1 ? (
            <View style={styles.stepContainer}>
              <View style={styles.section}>
                <Text style={styles.inputLabel}>Sportart *</Text>
                <View style={styles.categoryRow}>
                  {CATEGORIES.map((cat) => {
                    const isActive = category === cat.id;
                    return (
                      <Pressable key={cat.id} style={[styles.categoryTab, isActive && styles.categoryTabActive]} onPress={() => setCategory(cat.id)}>
                        <Text style={[styles.categoryTabText, isActive && styles.categoryTabTextActive]}>{cat.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>Name des Events *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="z.B. Berlin Marathon"
                  placeholderTextColor="#444"
                  value={eventName}
                  onChangeText={setEventName}
                  cursorColor={colors.cyan}
                  selectionColor={colors.cyan}
                  importantForAutofill="no"
                  autoComplete="off"
                />
              </View>

              <View style={styles.row}>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Datum *</Text>
                  <Pressable
                    style={[styles.datePickerTrigger, eventDate ? styles.datePickerTriggerActive : null]}
                    onPress={() => setShowDatePicker(true)}
                  >
                    <Text style={[styles.datePickerText, eventDate ? styles.datePickerTextActive : null]}>
                      {eventDate ? new Date(eventDate).toLocaleDateString('de-DE') : 'Datum wählen'}
                    </Text>
                    <FontAwesome5 name="calendar-alt" size={14} color={eventDate ? colors.cyan : '#555'} />
                  </Pressable>
                </View>

                {/* CUSTOM CALENDAR MODAL */}
                <Modal
                  visible={showDatePicker}
                  transparent={true}
                  animationType="slide"
                  onRequestClose={() => setShowDatePicker(false)}
                >
                  <Pressable style={styles.modalOverlay} onPress={() => setShowDatePicker(false)}>
                    <Pressable style={styles.pickerContainer} onPress={e => e.stopPropagation()}>
                      <View style={styles.pickerHeader}>
                        <Text style={styles.pickerHeaderTitle}>Event-Datum wählen</Text>
                        <Pressable style={styles.pickerDoneBtn} onPress={() => setShowDatePicker(false)}>
                          <Text style={styles.pickerDoneBtnText}>Fertig</Text>
                        </Pressable>
                      </View>

                      <View style={calStyles.navRow}>
                        <Pressable style={calStyles.navBtn} onPress={() =>
                          setCalViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))
                        }>
                          <Text style={calStyles.navArrow}>‹</Text>
                        </Pressable>
                        <Text style={calStyles.monthLabel}>
                          {calViewDate.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}
                        </Text>
                        <Pressable style={calStyles.navBtn} onPress={() =>
                          setCalViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))
                        }>
                          <Text style={calStyles.navArrow}>›</Text>
                        </Pressable>
                      </View>

                      <View style={calStyles.weekRow}>
                        {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(d => (
                          <Text key={d} style={calStyles.weekDay}>{d}</Text>
                        ))}
                      </View>

                      <View style={calStyles.daysGrid}>
                        {(() => {
                          const year = calViewDate.getFullYear();
                          const month = calViewDate.getMonth();
                          const firstDay = (new Date(year, month, 1).getDay() + 6) % 7;
                          const daysInMonth = new Date(year, month + 1, 0).getDate();
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          const cells = [];

                          for (let i = 0; i < firstDay; i++) {
                            cells.push(<View key={`e-${i}`} style={calStyles.dayCell} />);
                          }

                          for (let d = 1; d <= daysInMonth; d++) {
                            const thisDate = new Date(year, month, d);
                            const isPast = thisDate < today;
                            const isSelected = eventDate === `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                            const isToday = thisDate.toDateString() === today.toDateString();

                            cells.push(
                              <Pressable
                                key={d}
                                style={calStyles.dayCell}
                                onPress={() => {
                                  if (isPast) return;
                                  const m = String(month + 1).padStart(2, '0');
                                  const dd = String(d).padStart(2, '0');
                                  setEventDate(`${year}-${m}-${dd}`);
                                }}
                                disabled={isPast}
                              >
                                {isToday ? (
                                  <View style={calStyles.todayCircle}>
                                    <Text style={calStyles.dayTextToday}>{d}</Text>
                                  </View>
                                ) : (
                                  <Text style={[
                                    calStyles.dayText,
                                    isSelected && calStyles.dayTextSelected,
                                    isPast && calStyles.dayTextPast,
                                  ]}>{d}</Text>
                                )}
                              </Pressable>
                            );
                          }
                          return cells;
                        })()}
                      </View>
                    </Pressable>
                  </Pressable>
                </Modal>

                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Preis (€) *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="50"
                    placeholderTextColor="#444"
                    keyboardType="decimal-pad"
                    value={price}
                    onChangeText={setPrice}
                    cursorColor={colors.cyan}
                    selectionColor={colors.cyan}
                    importantForAutofill="no"
                    autoComplete="off"
                  />
                </View>
              </View>

              {category === 'Laufen' ? (
                <View style={styles.formGroup}>
                  <Text style={styles.inputLabel}>Spezialisierung</Text>
                  <View style={styles.listCard}>
                    {LAUFEN_SPECIAL_DISTANCES.map((kind, index) => {
                      const active = runSpecial === kind;
                      return (
                        <View key={kind}>
                          {index > 0 ? <View style={styles.listSeparator} /> : null}
                          <Pressable
                            style={[styles.listRow, active && styles.listRowActive]}
                            onPress={() => selectRunSpecial(kind)}
                          >
                            <View style={styles.listRowBody}>
                              <Text style={[styles.listRowTitle, active && styles.listRowTitleActive]}>{kind}</Text>
                              <Text style={styles.listRowSubtitle}>{LAUFEN_SPECIAL_COPY[kind].subtitle}</Text>
                              {active ? (
                                <Text style={styles.specialStepHint}>{LAUFEN_SPECIAL_COPY[kind].stepHint}</Text>
                              ) : null}
                            </View>
                            <FontAwesome5 name="chevron-right" size={12} color={active ? colors.cyan : '#555'} />
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                  {runSpecial ? (
                    <Pressable onPress={removeRunSpecial} hitSlop={8}>
                      <Text style={styles.removeSpecialText}>Spezialisierung entfernen</Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.listFooter}>Optional — für Ultra- oder Trail-Events mit erweiterten Angaben.</Text>
                  )}
                </View>
              ) : null}

              {category !== 'Radrennen' && (
                <View style={[styles.formGroup, runSpecial ? styles.formGroupMuted : null]}>
                  <Text style={styles.inputLabel}>
                    {category === 'Laufen' ? 'Klassische Distanz *' : 'Distanz / Kategorie *'}
                  </Text>
                  {runSpecial ? (
                    <Text style={styles.listFooter}>Deaktiviert, solange {runSpecial} gewählt ist.</Text>
                  ) : null}
                  <FadeHorizontalScroll scrollEnabled={!runSpecial}>
                    {standardDistancesForCategory(category).map((dist) => {
                      const isActive = !runSpecial && selectedDistance === dist;
                      return (
                        <Pressable
                          key={dist}
                          style={[pillStyles.pill, isActive && pillStyles.pillActive, runSpecial && styles.pillDisabled]}
                          onPress={() => selectStandardDistance(dist)}
                          disabled={!!runSpecial}
                        >
                          <Text style={[pillStyles.pillText, isActive && pillStyles.pillTextActive, runSpecial && styles.pillTextDisabled]}>
                            {dist}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </FadeHorizontalScroll>
                </View>
              )}

              {selectedDistance === 'Freie Distanz' && (
                category === 'Triathlon' ? (
                  <View style={styles.triathlonRow}>
                    <View style={[styles.formGroup, { flex: 1 }]}>
                      <Text style={styles.inputLabel}>Schwimmen</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="2"
                        placeholderTextColor="#444"
                        keyboardType="decimal-pad"
                        value={swimDist}
                        onChangeText={setSwimDist}
                        cursorColor={colors.cyan}
                        selectionColor={colors.cyan}
                        importantForAutofill="no"
                        autoComplete="off"
                      />
                    </View>
                    <View style={[styles.formGroup, { flex: 1 }]}>
                      <Text style={styles.inputLabel}>Rad</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="60"
                        placeholderTextColor="#444"
                        keyboardType="decimal-pad"
                        value={bikeDist}
                        onChangeText={setBikeDist}
                        cursorColor={colors.cyan}
                        selectionColor={colors.cyan}
                        importantForAutofill="no"
                        autoComplete="off"
                      />
                    </View>
                    <View style={[styles.formGroup, { flex: 1 }]}>
                      <Text style={styles.inputLabel}>Laufen</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="15"
                        placeholderTextColor="#444"
                        keyboardType="decimal-pad"
                        value={runDist}
                        onChangeText={setRunDist}
                        cursorColor={colors.cyan}
                        selectionColor={colors.cyan}
                        importantForAutofill="no"
                        autoComplete="off"
                      />
                    </View>
                  </View>
                ) : (
                  <View style={styles.formGroup}>
                    <Text style={styles.inputLabel}>Kilometer (km) *</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="z.B. 65"
                      placeholderTextColor="#444"
                      keyboardType="decimal-pad"
                      value={customDistanceKm}
                      onChangeText={setCustomDistanceKm}
                      cursorColor={colors.cyan}
                      selectionColor={colors.cyan}
                      importantForAutofill="no"
                      autoComplete="off"
                    />
                  </View>
                )
              )}

              <View style={styles.stepContainer}>
                <View style={styles.formGroup}>
                  <Text style={styles.inputLabel}>Veranstalter-Homepage (optional)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="https://..."
                    placeholderTextColor="#444"
                    keyboardType="url"
                    value={eventUrl}
                    onChangeText={setEventUrl}
                    autoCapitalize="none"
                    cursorColor={colors.cyan}
                    selectionColor={colors.cyan}
                    importantForAutofill="no"
                    autoComplete="off"
                  />
                </View>
              </View>

              <Pressable style={styles.primaryButton} onPress={handleNextStep}>
                <Text style={styles.primaryButtonText}>Weiter zu Schritt 2</Text>
                <FontAwesome5 name="arrow-right" size={13} color="#000000" style={{ marginLeft: 8 }} />
              </Pressable>
            </View>
          ) : null}

          {/* ================= SCHRITT 2: Ultra / Trail ================= */}
          {isSpecialStep && runSpecial ? (
            <View style={styles.stepContainer}>
              <View style={styles.stepPageHeader}>
                <Text style={styles.stepPageTitle}>{LAUFEN_SPECIAL_COPY[runSpecial].stepTitle}</Text>
                <Text style={styles.stepPageSubtitle}>
                  {runSpecial === 'Ultra'
                    ? 'Distanz oder Dauer, optional Höhenmeter und Untergrund.'
                    : 'Kilometer, Höhenmeter, Gelände und Ausrüstung.'}
                </Text>
              </View>

              {runSpecial === 'Ultra' ? (
                <RunDistanceDetailForm variant="clean" mode="ultra" state={ultraForm} onChange={setUltraForm} />
              ) : (
                <RunDistanceDetailForm variant="clean" mode="trail" state={trailForm} onChange={setTrailForm} />
              )}

              <View style={styles.actionColumn}>
                <Pressable style={styles.stackedPrimaryButton} onPress={handleSpecialStepNext}>
                  <Text style={styles.primaryButtonText}>Weiter zu Schritt 3</Text>
                  <FontAwesome5 name="arrow-right" size={13} color="#000000" style={{ marginLeft: 8 }} />
                </Pressable>
                <Pressable style={styles.stackedSecondaryButton} onPress={handleBack}>
                  <FontAwesome5 name="arrow-left" size={12} color="#888888" style={{ marginRight: 6 }} />
                  <Text style={styles.stackedSecondaryButtonText}>Zurück</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {/* ================= LETZTER SCHRITT: Ort & Veröffentlichen ================= */}
          {isFinalStep ? (
            <View style={styles.stepContainer}>
              <View style={styles.row}>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Postleitzahl *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="10115"
                    placeholderTextColor="#444"
                    keyboardType="number-pad"
                    value={plz}
                    onChangeText={setPlz}
                    cursorColor={colors.cyan}
                    selectionColor={colors.cyan}
                    importantForAutofill="no"
                    autoComplete="off"
                  />
                </View>
                <View style={[styles.formGroup, { flex: 2 }]}>
                  <Text style={styles.inputLabel}>Ort des Events *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="München"
                    placeholderTextColor="#444"
                    value={location}
                    onChangeText={setLocation}
                    cursorColor={colors.cyan}
                    selectionColor={colors.cyan}
                    importantForAutofill="no"
                    autoComplete="off"
                  />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>Straße & Hausnummer (optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="z.B. Unter den Linden 1"
                  placeholderTextColor="#444"
                  value={street}
                  onChangeText={setStreet}
                  cursorColor={colors.cyan}
                  selectionColor={colors.cyan}
                  importantForAutofill="no"
                  autoComplete="off"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>Beschreibung (optional)</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Details zur Ticketübergabe, Ummeldegebühr, Startblock..."
                  placeholderTextColor="#444"
                  multiline
                  numberOfLines={4}
                  maxLength={500}
                  value={description}
                  onChangeText={setDescription}
                  cursorColor={colors.cyan}
                  selectionColor={colors.cyan}
                  importantForAutofill="no"
                  autoComplete="off"
                />
              </View>

              <Pressable style={styles.checkboxContainer} onPress={() => setConfirmTransfer(!confirmTransfer)}>
                <View style={[styles.checkbox, confirmTransfer && styles.checkboxChecked]}>
                  {confirmTransfer && <FontAwesome5 name="check" size={11} color="#000000" />}
                </View>
                <Text style={styles.checkboxLabel}>Ich bestätige, dass ich die Ummeldung vorab mit dem Veranstalter geklärt habe. *</Text>
              </Pressable>

              <View style={styles.actionRow}>
                <Pressable style={styles.secondaryButton} onPress={handleBack} disabled={submitting}>
                  <FontAwesome5 name="arrow-left" size={12} color="#ffffff" style={{ marginRight: 6 }} />
                  <Text style={styles.secondaryButtonText}>Zurück</Text>
                </Pressable>

                <Pressable style={[styles.primaryButton, submitting && styles.disabledButton]} onPress={handleCreateListing} disabled={submitting}>
                  {submitting ? <ActivityIndicator color="#000000" /> : <Text style={styles.primaryButtonText}>Veröffentlichen 🚀</Text>}
                </Pressable>
              </View>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* --- REUSABLE TOAST COMPONENT IN ACTION --- */}
      <ToastPopup
        visible={popup.visible}
        type={popup.type}
        title={popup.title}
        text={popup.text}
        onConfirm={handlePopupConfirm}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#323232' },
  scrollContent: { paddingHorizontal: 20, gap: 16 },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 4 },
  headerTitle: { color: '#ffffff', fontSize: 19, fontWeight: '900' },
  headerSpacer: { height: 16, marginTop: 2 },
  progressDots: { flexDirection: 'row', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#111111' },
  dotActive: { backgroundColor: colors.cyan },
  stepContainer: { gap: 16 },
  emptyText: { color: '#888888', fontSize: 14, textAlign: 'center', lineHeight: 21, marginBottom: 4 },
  section: { marginBottom: 2 },
  formGroup: { gap: 6 },
  formGroupMuted: { opacity: 0.55 },
  listCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 56,
  },
  listRowActive: {
    backgroundColor: 'rgba(0, 188, 212, 0.06)',
  },
  listRowBody: { flex: 1, paddingRight: 8 },
  listRowTitle: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  listRowTitleActive: { color: colors.cyan },
  listRowSubtitle: { color: '#666', fontSize: 13, marginTop: 2, lineHeight: 18 },
  specialStepHint: { color: colors.cyan, fontSize: 13, fontWeight: '700', marginTop: 8, lineHeight: 18 },
  listSeparator: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.08)', marginLeft: 16 },
  listFooter: { color: '#666', fontSize: 12, lineHeight: 17, marginTop: 2 },
  removeSpecialBtn: { alignItems: 'center', paddingVertical: 8 },
  removeSpecialText: { color: colors.cyan, fontSize: 14, fontWeight: '600', textAlign: 'center', marginTop: 4 },
  stepPageHeader: { gap: 6, marginBottom: 4 },
  stepPageTitle: { color: '#ffffff', fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  stepPageSubtitle: { color: '#888', fontSize: 15, lineHeight: 21 },
  pillDisabled: { opacity: 0.35 },
  pillTextDisabled: { color: '#555' },
  row: { flexDirection: 'row', gap: 12 },
  triathlonRow: { flexDirection: 'row', gap: 8 },
  input: { backgroundColor: colors.card, borderWidth: 2, borderColor: colors.card, borderRadius: radius.md, paddingHorizontal: 16, height: 50, color: '#ffffff', fontSize: 15 },
  inputLabel: { color: '#ffffff', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', opacity: 0.8 },

  datePickerTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    height: 50,
  },
  datePickerTriggerActive: { borderColor: colors.cyan },
  datePickerText: { color: '#555555', fontSize: 15, fontWeight: '500' },
  datePickerTextActive: { color: '#ffffff', fontWeight: '700' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  pickerContainer: {
    backgroundColor: '#1c1c1c',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    overflow: 'hidden',
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  pickerHeaderTitle: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
  pickerDoneBtn: {
    backgroundColor: 'rgba(0, 188, 212, 0.1)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.sm,
  },
  pickerDoneBtnText: { color: colors.cyan, fontSize: 13, fontWeight: '900' },

  textArea: { height: 90, paddingTop: 12, paddingBottom: 12, textAlignVertical: 'top' },
  categoryRow: { flexDirection: 'row', backgroundColor: colors.card, padding: 4, borderRadius: radius.md, gap: 4 },
  categoryTab: { flex: 1, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  categoryTabActive: { backgroundColor: colors.cyan, borderRadius: 8 },
  categoryTabText: { color: '#888888', fontSize: 13, fontWeight: '700' },
  categoryTabTextActive: { color: '#000000', fontWeight: '900' },
  horizontalPills: { gap: 8, paddingVertical: 4 },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, backgroundColor: colors.card, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  pillActive: { backgroundColor: colors.cyan, borderColor: colors.cyan },
  pillText: { color: '#888888', fontSize: 13, fontWeight: '700' },
  pillTextActive: { color: '#000000', fontWeight: '900' },

  checkboxContainer: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 6, paddingRight: 10 },
  checkbox: { width: 20, height: 20, borderRadius: 6, backgroundColor: colors.card, borderWidth: 2, borderColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkboxChecked: { backgroundColor: colors.cyan, borderColor: colors.cyan },
  checkboxLabel: { flex: 1, color: '#888888', fontSize: 13, lineHeight: 18, fontWeight: '500' },

  actionRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  actionColumn: { gap: 10, marginTop: 8 },
  stackedPrimaryButton: {
    height: 54,
    borderRadius: radius.md,
    backgroundColor: colors.cyan,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  stackedSecondaryButton: {
    height: 54,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  stackedSecondaryButtonText: { color: '#888888', fontSize: 15, fontWeight: '800' },
  primaryButton: { flex: 1, height: 54, borderRadius: radius.md, backgroundColor: colors.cyan, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', marginTop: 8 },
  primaryButtonText: { color: '#000000', fontSize: 16, fontWeight: '900' },
  secondaryButton: { flex: 1, height: 54, borderRadius: radius.md, backgroundColor: '#111111', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', marginTop: 8 },
  secondaryButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },

  loginButton: { minHeight: 54, paddingHorizontal: 24, backgroundColor: colors.cyan, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  loginButtonText: { color: '#000000', fontSize: 16, fontWeight: '900' },
  disabledButton: { opacity: 0.6 },
});