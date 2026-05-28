import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
import type { Conversation, Message } from '../types';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const NAV_HEIGHT = 74;

const BG_MAIN = '#2e2e2e';
const BG_CARD = '#383838';
const BG_INPUT = '#242424';

type Props = {
  conversation: Conversation;
  userId: string;
  refreshNonce?: number;
  onMessagesRead?: () => void;
  onBack: () => void;
};

export function ChatWindow({ conversation, userId, refreshNonce = 0, onMessagesRead, onBack }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<Message>>(null);
  
  const isSeller = conversation.seller_id === userId;
  const partnerName = isSeller ? conversation.buyer?.nickname : conversation.seller?.nickname;

  // Höhenberechnung analog zur Detailseite
  const statusBarHeight = Platform.OS === 'android'
    ? (StatusBar.currentHeight ?? 24)
    : insets.top;

  // Exakte Höhe: Screen minus Tab-Menü (Die Statusbar wird unten wieder dazugerechnet, da top: 0)
  const modalHeight = SCREEN_HEIGHT - NAV_HEIGHT;
  const inputBottomPadding = Math.max(insets.bottom, 20) + 10;
  
  // Animation-Ref für den Vorhang-Effekt von oben
  const slideAnim = useRef(new Animated.Value(-SCREEN_HEIGHT)).current;

  // Einfahren von oben nach unten beim Mounten
  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      damping: 22,
      stiffness: 220,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, []);

  // Schließen-Animation nach oben weg
  function handleClose() {
    Animated.timing(slideAnim, {
      toValue: -SCREEN_HEIGHT,
      duration: 260,
      useNativeDriver: true,
    }).start(() => onBack());
  }

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      handleClose();
      return true;
    });

    return () => subscription.remove();
  }, []);

  const loadMessages = useCallback(async () => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: true });

    if (!error) setMessages((data ?? []) as Message[]);
    setLoading(false);

    const { error: readError } = await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('conversation_id', conversation.id)
      .eq('is_read', false)
      .neq('sender_id', userId);

    if (!readError) {
      onMessagesRead?.();
    }
  }, [conversation.id, onMessagesRead, userId]);

  useEffect(() => {
    loadMessages();
    const channel = supabase
      .channel(`mobile-chat-${conversation.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          const msg = payload.new as Message;
          setMessages((current) =>
            current.some((item) => item.id === msg.id) ? current : [...current, msg],
          );

          if (msg.sender_id !== userId) {
            void supabase
              .from('messages')
              .update({ is_read: true })
              .eq('id', msg.id)
              .then(({ error }) => {
                if (!error) {
                  onMessagesRead?.();
                }
              });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversation.id, loadMessages, onMessagesRead, userId]);

  useEffect(() => {
    if (refreshNonce === 0) return;
    loadMessages();
  }, [loadMessages, refreshNonce]);

  useEffect(() => {
    if (loading || messages.length === 0) return;

    const timeout = setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, 80);

    return () => clearTimeout(timeout);
  }, [loading, messages.length]);

  async function sendMessage() {
    const content = text.trim();
    if (!content || sending) return;

    setText('');
    setSending(true);
    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversation.id,
        sender_id: userId,
        content,
        is_read: false,
      })
      .select()
      .single();

    setSending(false);
    if (error) {
      Alert.alert('Nachricht', error.message);
      setText(content);
    } else if (data) {
      setMessages((current) =>
        current.some((item) => item.id === data.id) ? current : [...current, data as Message],
      );
    }
  }

  // V2.0 Fix: Startet bei top: 0 an der absoluten Glaskante, um den Rand-Farbsprung zu eliminieren
  const screenStyle = {
    position: 'absolute' as const,
    top: 0, 
    left: 0,
    right: 0,
    height: modalHeight, // Hört exakt an der Oberkante des Tab-Menüs auf
    backgroundColor: BG_MAIN,
    overflow: 'hidden' as const,
    transform: [{ translateY: slideAnim }],
    zIndex: 100,
  };

  return (
    <Animated.View style={screenStyle}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        {/* HEADER */}
        <View style={[styles.chatHeader, { paddingTop: Platform.OS === 'android' ? statusBarHeight + 12 : 44 }]}>
          <Pressable style={styles.backButton} onPress={handleClose}>
            <FontAwesome5 name="arrow-left" size={16} color="#ffffff" />
          </Pressable>
          <View style={styles.chatHeaderCopy}>
            <Text style={styles.modalBadge}>{conversation.listings?.event_name || 'Event'}</Text>
            <Text style={styles.chatTitle} numberOfLines={1}>{partnerName || 'Dein Partner'}</Text>
          </View>
        </View>

        {/* MESSAGES LIST */}
        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={colors.cyan} size="large" />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.messageList, { paddingBottom: 16 }]}
            showsVerticalScrollIndicator={false}
            automaticallyAdjustKeyboardInsets={true}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
            renderItem={({ item }) => {
              const mine = item.sender_id === userId;
              return (
                <View style={[styles.messageRow, mine ? styles.messageRowMine : styles.messageRowOther]}>
                  <View style={[styles.messageBubble, mine ? styles.messageBubbleMine : styles.messageBubbleOther]}>
                    <Text style={[styles.messageText, mine && styles.messageTextMine]}>{item.content}</Text>
                  </View>
                  <Text style={styles.messageTime}>
                    {new Date(item.created_at).toLocaleTimeString('de-DE', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
              );
            }}
          />
        )}

        {/* INPUT BAR */}
        <View style={[styles.chatInputBar, { paddingBottom: inputBottomPadding }]}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Nachricht schreiben..."
            placeholderTextColor="#666"
            style={styles.chatInput}
            multiline
          />
          <Pressable style={styles.sendButton} onPress={sendMessage} disabled={sending}>
            {sending ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.sendButtonText}>Senden</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  // HEADER (Notch-Sicher durch dynamisches Padding im JSX)
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: BG_MAIN,
    gap: 12,
  },
  backButton: { padding: 4 },
  chatHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  modalBadge: {
    color: colors.cyan,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  chatTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '900',
  },

  // LISTE
  messageList: {
    padding: 20,
    gap: 12,
  },
  messageRow: {
    gap: 4,
    marginBottom: 4,
  },
  messageRowMine: {
    alignItems: 'flex-end',
  },
  messageRowOther: {
    alignItems: 'flex-start',
  },
  messageBubble: {
    maxWidth: '78%',
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  messageBubbleMine: {
    backgroundColor: colors.cyan,
  },
  messageBubbleOther: {
    backgroundColor: BG_CARD,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  messageText: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
  },
  messageTextMine: {
    color: '#000',
  },
  messageTime: {
    color: '#666',
    fontSize: 11,
    fontWeight: '700',
    marginHorizontal: 4,
  },

  // INPUT BAR (V2.0 Fix: Zusätzliches paddingBottom hebt die Elemente über das App-Menü)
  chatInputBar: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: BG_MAIN,
    alignItems: 'flex-end',
  },
  chatInput: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    backgroundColor: BG_INPUT,
    color: '#fff',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
  },
  sendButton: {
    height: 48,
    paddingHorizontal: 20,
    borderRadius: radius.md,
    backgroundColor: colors.cyan,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '900',
  },
});