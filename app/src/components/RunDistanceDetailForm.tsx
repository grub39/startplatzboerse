import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import {
  ITRA_LEVEL_OPTIONS,
  TRAIL_BAND_OPTIONS,
  TRAIL_GEAR_OPTIONS,
  TRAIL_TERRAIN_OPTIONS,
  TRAIL_UTMB_OPTIONS,
  ULTRA_SURFACE_OPTIONS,
} from '../constants/runListingOptions';
import type { TrailFormState, UltraFormState } from '../lib/runListingBuild';
import { FadeHorizontalScroll, pillStyles } from './FadeHorizontalScroll';
import { colors, radius } from '../theme';

const ULTRA_FORMAT_APP_OPTIONS = [
  { id: 'distance', label: 'Distanz-basiert' },
  { id: 'time', label: 'Zeit-basiert' },
] as const;

type Props =
  | { mode: 'ultra'; state: UltraFormState; onChange: (next: UltraFormState) => void; variant?: 'default' | 'clean' }
  | { mode: 'trail'; state: TrailFormState; onChange: (next: TrailFormState) => void; variant?: 'default' | 'clean' };

function ChoiceCard({
  options,
  value,
  onSelect,
}: {
  options: readonly { id: string; label: string }[];
  value: string;
  onSelect: (id: string) => void;
}) {
  return (
    <View style={styles.choiceCard}>
      {options.map((opt, index) => {
        const active = value === opt.id;
        return (
          <Pressable
            key={opt.id || 'empty'}
            style={[styles.choiceRow, index > 0 && styles.choiceRowBorder, active && styles.choiceRowActive]}
            onPress={() => onSelect(opt.id)}
          >
            <Text style={[styles.choiceLabel, active && styles.choiceLabelActive]} numberOfLines={2}>
              {opt.label}
            </Text>
            {active ? <FontAwesome5 name="check" size={13} color={colors.cyan} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function MultiChoiceCard({
  options,
  values,
  onToggle,
}: {
  options: readonly { id: string; label: string }[];
  values: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <View style={styles.choiceCard}>
      {options.map((opt, index) => {
        const active = values.includes(opt.id);
        return (
          <Pressable
            key={opt.id}
            style={[styles.choiceRow, index > 0 && styles.choiceRowBorder, active && styles.choiceRowActive]}
            onPress={() => onToggle(opt.id)}
          >
            <Text style={[styles.choiceLabel, active && styles.choiceLabelActive]} numberOfLines={3}>
              {opt.label}
            </Text>
            <View style={[styles.multiCheck, active && styles.multiCheckActive]}>
              {active ? <FontAwesome5 name="check" size={11} color="#000" /> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function ScrollPills({
  options,
  value,
  onSelect,
}: {
  options: readonly { id: string; label: string }[];
  value: string;
  onSelect: (id: string) => void;
}) {
  return (
    <FadeHorizontalScroll>
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <Pressable
            key={opt.id || 'empty'}
            style={[pillStyles.pill, active && pillStyles.pillActive]}
            onPress={() => onSelect(opt.id)}
          >
            <Text style={[pillStyles.pillText, active && pillStyles.pillTextActive]} numberOfLines={1}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </FadeHorizontalScroll>
  );
}

export function RunDistanceDetailForm(props: Props) {
  const blockStyle = props.variant === 'clean' ? styles.blockClean : styles.block;

  if (props.mode === 'ultra') {
    const { state, onChange } = props;

    const setFormat = (format: 'distance' | 'time') => {
      onChange({
        ...state,
        format,
        unit: format === 'distance' ? 'km' : 'h',
        elevationGainM: format === 'distance' ? state.elevationGainM : '',
      });
    };

    return (
      <View style={blockStyle}>
        <Text style={styles.inputLabel}>Art des Ultralaufs</Text>
        <ChoiceCard
          options={ULTRA_FORMAT_APP_OPTIONS}
          value={state.format === 'backyard' ? 'time' : state.format}
          onSelect={(id) => setFormat(id as 'distance' | 'time')}
        />

        {state.format === 'distance' ? (
          <>
            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Strecke (km) *</Text>
              <TextInput
                style={styles.input}
                placeholder="z. B. 100"
                placeholderTextColor="#444"
                keyboardType="decimal-pad"
                value={state.value}
                onChangeText={(value) => onChange({ ...state, value })}
                cursorColor={colors.cyan}
                selectionColor={colors.cyan}
              />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Höhenmeter (optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="z. B. 3500"
                placeholderTextColor="#444"
                keyboardType="number-pad"
                value={state.elevationGainM}
                onChangeText={(elevationGainM) => onChange({ ...state, elevationGainM })}
                cursorColor={colors.cyan}
                selectionColor={colors.cyan}
              />
            </View>
          </>
        ) : (
          <View style={styles.formGroup}>
            <Text style={styles.inputLabel}>Dauer (Std.) *</Text>
            <TextInput
              style={styles.input}
              placeholder="z. B. 24"
              placeholderTextColor="#444"
              keyboardType="decimal-pad"
              value={state.value}
              onChangeText={(value) => onChange({ ...state, value })}
              cursorColor={colors.cyan}
              selectionColor={colors.cyan}
            />
          </View>
        )}

        <View style={styles.formGroup}>
          <Text style={styles.inputLabel}>Cut-off-Zeit (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="z. B. 12 oder 6:30"
            placeholderTextColor="#444"
            keyboardType="numbers-and-punctuation"
            value={state.cutoffTime}
            onChangeText={(cutoffTime) => onChange({ ...state, cutoffTime })}
            cursorColor={colors.cyan}
            selectionColor={colors.cyan}
          />
        </View>

        <Text style={styles.inputLabel}>Untergrund / Modus</Text>
        <ChoiceCard
          options={ULTRA_SURFACE_OPTIONS}
          value={state.surface}
          onSelect={(surface) => onChange({ ...state, surface: surface as UltraFormState['surface'] })}
        />
      </View>
    );
  }

  const { state, onChange } = props;

  return (
    <View style={blockStyle}>
      <Text style={styles.inputLabel}>Distanz-Kategorie (optional)</Text>
      <ChoiceCard
        options={TRAIL_BAND_OPTIONS}
        value={state.band}
        onSelect={(band) => onChange({ ...state, band: band as TrailFormState['band'] })}
      />

      <View style={styles.formGroup}>
        <Text style={styles.inputLabel}>Strecke (km) *</Text>
        <TextInput
          style={styles.input}
          placeholder="z. B. 30"
          placeholderTextColor="#444"
          keyboardType="decimal-pad"
          value={state.distanceKm}
          onChangeText={(distanceKm) => onChange({ ...state, distanceKm })}
          cursorColor={colors.cyan}
          selectionColor={colors.cyan}
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.inputLabel}>Höhenmeter *</Text>
        <TextInput
          style={styles.input}
          placeholder="z. B. 2000"
          placeholderTextColor="#444"
          keyboardType="number-pad"
          value={state.elevationGainM}
          onChangeText={(elevationGainM) => onChange({ ...state, elevationGainM })}
          cursorColor={colors.cyan}
          selectionColor={colors.cyan}
        />
      </View>

      <Text style={styles.inputLabel}>ITRA-Punkte</Text>
      <ScrollPills options={ITRA_LEVEL_OPTIONS} value={state.itraLevel} onSelect={(itraLevel) => onChange({ ...state, itraLevel })} />

      <Text style={styles.inputLabel}>UTMB-Index</Text>
      <ScrollPills options={TRAIL_UTMB_OPTIONS} value={state.utmbIndex} onSelect={(utmbIndex) => onChange({ ...state, utmbIndex })} />

      <Text style={styles.inputLabel}>Pflichtausrüstung *</Text>
      <MultiChoiceCard
        options={TRAIL_GEAR_OPTIONS}
        values={state.gear}
        onToggle={(id) => {
          if (id === 'none') {
            onChange({ ...state, gear: ['none'] });
            return;
          }
          let gear = state.gear.filter((g) => g !== 'none');
          gear = gear.includes(id) ? gear.filter((x) => x !== id) : [...gear, id];
          onChange({ ...state, gear });
        }}
      />

      <Text style={styles.inputLabel}>Gelände / Technik</Text>
      <ChoiceCard
        options={TRAIL_TERRAIN_OPTIONS}
        value={state.terrain}
        onSelect={(terrain) => onChange({ ...state, terrain: terrain as TrailFormState['terrain'] })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 10, marginTop: 4 },
  blockClean: { gap: 16 },
  formGroup: { gap: 6 },
  inputLabel: { color: '#ffffff', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', opacity: 0.8 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    height: 50,
    color: '#ffffff',
    fontSize: 15,
  },
  choiceCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  choiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 15,
    minHeight: 54,
  },
  choiceRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  choiceRowActive: {
    backgroundColor: 'rgba(0, 188, 212, 0.07)',
  },
  choiceLabel: { flex: 1, color: '#888888', fontSize: 15, fontWeight: '600', lineHeight: 21 },
  choiceLabelActive: { color: '#ffffff', fontWeight: '700' },
  multiCheck: {
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  multiCheckActive: { backgroundColor: colors.cyan, borderColor: colors.cyan },
});
