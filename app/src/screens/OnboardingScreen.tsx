import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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

type Props = {
  session: Session;
  onComplete: () => void;
};

export function OnboardingScreen({ session, onComplete }: Props) {
  const insets = useSafeAreaInsets();
  const [submitting, setSubmitting] = useState(false);

  // States für die Profil-Daten
  const [vorname, setVorname] = useState('');
  const [nachname, setNachname] = useState('');
  const [nickname, setNickname] = useState('');
  
  // State für den eleganten Inline-Error
  const [error, setError] = useState<string | null>(null);

  async function handleSaveProfile() {
    if (!vorname.trim() || !nachname.trim() || !nickname.trim()) {
      setError('Bitte fülle alle Pflichtfelder (*) aus.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const profileData = {
        id: session.user.id,
        nickname: nickname.trim(),
        first_name: vorname.trim(),
        last_name: nachname.trim(),
        registered_email: session.user.email?.trim().toLowerCase() ?? null,
        has_completed_onboarding: true,
        updated_at: new Date().toISOString(),
      };

      const { error: profileError } = await supabase
        .from('profiles')
        .upsert(profileData);

      if (profileError) throw profileError;

      onComplete();
    } catch (err: any) {
      // FIX: console.log statt console.error verhindert das Aufpoppen des roten LogBox-Overlays
      console.log('Onboarding DB-Fehler abgefangen:', err);

      // FIX: PostgreSQL Error Code 23505 (Unique Constraint) sauber abfangen und übersetzen
      if (err.code === '23505' || err.message?.includes('profiles_nickname_key')) {
        setError('Dieser Nickname ist leider schon vergeben. Bitte wähle einen anderen.');
      } else {
        setError(err.message || 'Profil konnte nicht gespeichert werden.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {/* ICON & HEADER */}
          <View style={styles.headerArea}>
            <View style={styles.iconCircle}>
              <FontAwesome5 name="user-plus" size={28} color={colors.cyan} />
            </View>
            <Text style={styles.title}>Erstelle dein Profil</Text>
            <Text style={styles.subline}>Damit Käufer und Verkäufer wissen, mit wem sie handeln.</Text>
          </View>

          {/* FORMULAR */}
          <View style={styles.formContainer}>
            
            {/* E-Mail Anzeige (Read-Only) */}
            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Registrierte E-Mail</Text>
              <TextInput
                style={[styles.input, styles.inputDisabled]}
                value={session.user.email}
                editable={false}
                selectTextOnFocus={false}
              />
            </View>

            {/* Vorname & Nachname */}
            <View style={styles.row}>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={styles.inputLabel}>Vorname *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Max"
                  placeholderTextColor="#444"
                  value={vorname}
                  onChangeText={(text) => { setVorname(text); setError(null); }}
                  cursorColor={colors.cyan}
                  selectionColor={colors.cyan}
                  importantForAutofill="no"
                  autoComplete="off"
                  textContentType="none"
                />
              </View>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={styles.inputLabel}>Nachname *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Mustermann"
                  placeholderTextColor="#444"
                  value={nachname}
                  onChangeText={(text) => { setNachname(text); setError(null); }}
                  cursorColor={colors.cyan}
                  selectionColor={colors.cyan}
                  importantForAutofill="no"
                  autoComplete="off"
                  textContentType="none"
                />
              </View>
            </View>

            {/* Public Nickname */}
            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Public Nickname *</Text>
              <TextInput
                style={styles.input}
                placeholder="z.B. Rennschnecke_Magdeburg"
                placeholderTextColor="#444"
                value={nickname}
                onChangeText={(text) => { setNickname(text); setError(null); }}
                cursorColor={colors.cyan}
                selectionColor={colors.cyan}
                importantForAutofill="no"
                autoComplete="off"
                textContentType="none"
              />
              <Text style={styles.hintText}>Dieser Name wird öffentlich bei deinen Inseraten angezeigt.</Text>
            </View>
          </View>

          {/* Edler Inline-Error statt System-Popup */}
          {error && <Text style={styles.errorText}>{error}</Text>}

          {/* SUBMIT BUTTON */}
          <Pressable
            style={[styles.submitButton, submitting && styles.disabledButton]}
            onPress={handleSaveProfile}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#000000" />
            ) : (
              <>
                <Text style={styles.submitButtonText}>Profil bestätigen & starten</Text>
                <FontAwesome5 name="check" size={14} color="#000000" style={{ marginLeft: 8 }} />
              </>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#323232',
  },
  scrollContent: {
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  headerArea: {
    alignItems: 'center',
    marginBottom: 32,
    gap: 12,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(0, 188, 212, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 188, 212, 0.2)',
  },
  title: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
  },
  subline: {
    color: '#aaaaaa',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 10,
  },
  formContainer: {
    gap: 18,
    marginBottom: 24,
  },
  formGroup: {
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  inputLabel: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    opacity: 0.8,
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    height: 52,
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  inputDisabled: {
    opacity: 0.4,
    backgroundColor: '#222222',
    borderColor: '#222222',
    color: '#888888',
  },
  hintText: {
    color: '#666666',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  errorText: {
    color: '#ff4444',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 20,
    textAlign: 'center',
  },
  submitButton: {
    height: 54,
    borderRadius: radius.md,
    backgroundColor: colors.cyan,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    shadowColor: colors.cyan,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '900',
  },
  disabledButton: {
    opacity: 0.6,
  },
});