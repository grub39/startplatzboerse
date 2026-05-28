import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { colors } from '../theme';

type ToastPopupProps = {
  visible: boolean;
  type: 'error' | 'info' | 'success' | 'warning' | 'destructive';
  title: string;
  text: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  showCancel?: boolean;
};

export function ToastPopup({
  visible,
  type = 'info',
  title,
  text,
  confirmText,
  cancelText,
  onConfirm,
  onCancel,
  showCancel = false,
}: ToastPopupProps) {
  if (!visible) return null;

  // Gedeckte, harmonische System-Farben
  const systemColors = {
    success: colors?.cyan || '#00bcd4',
    info: colors?.cyan || '#00bcd4',
    warning: '#ffd60a',
    error: '#ff9f0a',
    destructive: '#ff453a',
  };

  const activeColor = systemColors[type] || '#8e8e93';
  const isDestructive = type === 'destructive';

  return (
    <Modal transparent visible={visible} animationType="fade" statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.popupCard}>
          
          {/* Einziges Icon im sanften Circle-Glow */}
          <View style={[styles.iconCircle, { backgroundColor: activeColor + '14' }]}>
            {type === 'success' && <FontAwesome5 name="check" size={20} color={activeColor} />}
            {type === 'error' && <FontAwesome5 name="exclamation-circle" size={20} color={activeColor} />}
            {type === 'warning' && <FontAwesome5 name="exclamation-triangle" size={18} color={activeColor} />}
            {type === 'destructive' && <FontAwesome5 name="trash-alt" size={18} color={activeColor} />}
            {type === 'info' && <FontAwesome5 name="info" size={18} color={activeColor} />}
          </View>

          {/* Cleane Texte ohne Emoji-Zusätze */}
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.text}>{text}</Text>

          <View style={styles.buttonContainer}>
            {showCancel && onCancel ? (
              <Pressable style={styles.cancelButton} onPress={onCancel}>
                <Text style={styles.cancelText}>{cancelText || 'Abbrechen'}</Text>
              </Pressable>
            ) : null}

            <Pressable
              style={[styles.confirmButton, { backgroundColor: activeColor + '1A' }]}
              onPress={onConfirm}
            >
              <Text style={[styles.confirmText, { color: activeColor }]}>
                {confirmText || (isDestructive ? 'Löschen' : 'OK')}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  popupCard: {
    backgroundColor: '#1e1e1e',
    borderRadius: 20,
    width: '100%',
    maxWidth: 320,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  iconCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  text: {
    fontSize: 14,
    lineHeight: 20,
    color: '#98989f',
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  buttonContainer: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#2c2c2e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButton: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    color: '#8e8e93',
    fontSize: 15,
    fontWeight: '600',
  },
  confirmText: {
    fontSize: 15,
    fontWeight: '700',
  },
});