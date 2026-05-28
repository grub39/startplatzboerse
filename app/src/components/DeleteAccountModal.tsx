import { useEffect, useMemo, useState } from 'react';
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
import { FontAwesome5 } from '@expo/vector-icons';
import { deleteAccount } from '../lib/deleteAccount';

const CONSEQUENCES = [
  'Dein Profil und alle persönlichen Daten werden entfernt.',
  'Deine Inserate und Chats sind danach nicht mehr erreichbar.',
  'Deine Merkliste geht verloren.',
] as const;

type Props = {
  visible: boolean;
  onClose: () => void;
  onDeleted: () => void;
};

export function DeleteAccountModal({ visible, onClose, onDeleted }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canConfirmDelete = useMemo(
    () => acknowledged && confirmText.trim().toUpperCase() === 'LÖSCHEN',
    [acknowledged, confirmText],
  );

  useEffect(() => {
    if (!visible) {
      setStep(1);
      setAcknowledged(false);
      setConfirmText('');
      setDeleting(false);
      setError(null);
    }
  }, [visible]);

  const handleClose = () => {
    if (deleting) return;
    onClose();
  };

  const handleFinalDelete = async () => {
    if (!canConfirmDelete || deleting) return;

    setDeleting(true);
    setError(null);

    const result = await deleteAccount();
    setDeleting(false);

    if (!result.ok) {
      setError(result.error ?? 'Konto konnte nicht gelöscht werden.');
      return;
    }

    onDeleted();
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        <View style={styles.card}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.cardContent}
          >
            {step === 1 ? (
              <>
                <View style={styles.iconCircle}>
                  <FontAwesome5 name="exclamation-triangle" size={20} color="#ff453a" />
                </View>
                <Text style={styles.title}>Konto löschen?</Text>
                <Text style={styles.lead}>Diese Aktion kann nicht rückgängig gemacht werden.</Text>
                <View style={styles.list}>
                  {CONSEQUENCES.map((item) => (
                    <View key={item} style={styles.listRow}>
                      <Text style={styles.bullet}>•</Text>
                      <Text style={styles.listText}>{item}</Text>
                    </View>
                  ))}
                </View>
                <View style={styles.actions}>
                  <Pressable style={styles.secondaryBtn} onPress={handleClose} disabled={deleting}>
                    <Text style={styles.secondaryBtnText}>Abbrechen</Text>
                  </Pressable>
                  <Pressable
                    style={styles.dangerBtn}
                    onPress={() => {
                      setError(null);
                      setStep(2);
                    }}
                    disabled={deleting}
                  >
                    <Text style={styles.dangerBtnText}>Weiter</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <View style={styles.iconCircle}>
                  <FontAwesome5 name="trash-alt" size={18} color="#ff453a" />
                </View>
                <Text style={styles.title}>Wirklich löschen?</Text>
                <Text style={styles.lead}>
                  Gib zur Bestätigung <Text style={styles.leadStrong}>LÖSCHEN</Text> ein und bestätige die
                  Folgen.
                </Text>

                <Pressable
                  style={styles.checkboxRow}
                  onPress={() => setAcknowledged((v) => !v)}
                  disabled={deleting}
                >
                  <FontAwesome5
                    name={acknowledged ? 'check-square' : 'square'}
                    size={20}
                    color={acknowledged ? '#ff6b6b' : '#666'}
                  />
                  <Text style={styles.checkboxLabel}>
                    Ich verstehe, dass mein Konto und alle zugehörigen Daten unwiderruflich gelöscht werden.
                  </Text>
                </Pressable>

                <Text style={styles.fieldLabel}>Bestätigung</Text>
                <TextInput
                  style={styles.input}
                  value={confirmText}
                  onChangeText={setConfirmText}
                  placeholder="LÖSCHEN"
                  placeholderTextColor="#666"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  editable={!deleting}
                />

                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                <View style={styles.actions}>
                  <Pressable
                    style={styles.secondaryBtn}
                    onPress={() => {
                      setError(null);
                      setStep(1);
                    }}
                    disabled={deleting}
                  >
                    <Text style={styles.secondaryBtnText}>Zurück</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.dangerBtn, !canConfirmDelete && styles.dangerBtnDisabled]}
                    onPress={handleFinalDelete}
                    disabled={!canConfirmDelete || deleting}
                  >
                    {deleting ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.dangerBtnText}>Konto endgültig löschen</Text>
                    )}
                  </Pressable>
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: '#1e1e1e',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    maxHeight: '88%',
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  cardContent: {
    padding: 24,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255, 69, 58, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  lead: {
    fontSize: 14,
    lineHeight: 20,
    color: '#98989f',
    textAlign: 'center',
    marginBottom: 18,
  },
  leadStrong: {
    color: '#ff8a8a',
    fontWeight: '800',
  },
  list: {
    marginBottom: 22,
    gap: 10,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  bullet: {
    color: '#bbb',
    fontSize: 14,
    lineHeight: 20,
  },
  listText: {
    flex: 1,
    color: '#ccc',
    fontSize: 14,
    lineHeight: 20,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 16,
  },
  checkboxLabel: {
    flex: 1,
    color: '#ccc',
    fontSize: 14,
    lineHeight: 20,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.06,
    color: '#666',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 16,
    marginBottom: 12,
  },
  errorText: {
    color: '#ff8a8a',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  secondaryBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#2c2c2e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    color: '#8e8e93',
    fontSize: 15,
    fontWeight: '700',
  },
  dangerBtn: {
    flex: 1.2,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#ff4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerBtnDisabled: {
    opacity: 0.4,
  },
  dangerBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
});
