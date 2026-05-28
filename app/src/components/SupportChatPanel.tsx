import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { FontAwesome5 } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import {
  forwardSupportMessageToMatrix,
  syncSupportMessagesFromMatrix,
  type SupportMessageRecord,
} from '../lib/supportMatrix';
import {
  createSupportTicket,
  fetchActiveSupportTicket,
  isActiveSupportTicketStatus,
} from '../lib/supportTicket';
import { colors, radius } from '../theme';

type SupportTicket = {
  id: string;
  status: string;
};

type SupportMessage = {
  id: string;
  ticket_id: string;
  sender_type: 'user' | 'admin' | 'system';
  sender_id: string | null;
  message_text: string;
  created_at: string;
};

type Props = {
  session: Session | null;
  /** Ticket/Matrix erst nach „Support-Chat starten“. */
  started: boolean;
  /** Volle Höhe mit Eingabe am unteren Rand (KeyboardAvoidingView außen). */
  expanded?: boolean;
  onGoLogin?: () => void;
  isScreenActive?: boolean;
  refreshNonce?: number;
  onTicketClosed?: () => void;
};

/** Chat-Karte in der Support-ScrollView (Nachrichtenbereich scrollt intern). */
const CARD_HEIGHT = 320;


function MessageBubble({ item }: { item: SupportMessage }) {
  const mine = item.sender_type === 'user';

  return (
    <View style={[styles.messageRow, mine ? styles.messageRowMine : styles.messageRowOther]}>
      {!mine ? <Text style={styles.senderLabel}>Support</Text> : null}
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
        <Text style={[styles.messageText, mine && styles.messageTextMine]}>
          {item.message_text}
        </Text>
      </View>
      <Text style={styles.messageTime}>
        {new Date(item.created_at).toLocaleTimeString('de-DE', {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </Text>
    </View>
  );
}

export function SupportChatPanel({
  session,
  started,
  expanded = false,
  onGoLogin,
  isScreenActive = true,
  refreshNonce = 0,
  onTicketClosed,
}: Props) {
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [matrixDeliveryHint, setMatrixDeliveryHint] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const scrollToBottom = useCallback((animated = true) => {
    scrollRef.current?.scrollToEnd({ animated });
  }, []);

  const closeChatUi = useCallback(() => {
    setTicket(null);
    setMessages([]);
    setMatrixDeliveryHint(null);
    onTicketClosed?.();
  }, [onTicketClosed]);

  const loadMessages = useCallback(async (ticketId: string) => {
    const { data, error: fetchError } = await supabase
      .from('support_messages')
      .select('id, ticket_id, sender_type, sender_id, message_text, created_at')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    if (fetchError) throw fetchError;
    setMessages((data ?? []) as SupportMessage[]);
  }, []);

  const refreshFromMatrix = useCallback(
    async (ticketId: string) => {
      const sync = await syncSupportMessagesFromMatrix();
      if (sync.hint) {
        console.warn('Support sync:', sync.hint);
      }
      await loadMessages(ticketId);
    },
    [loadMessages],
  );

  const bootstrap = useCallback(async () => {
    if (!started || !session?.user?.id) {
      setTicket(null);
      setMessages([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const activeTicket = await fetchActiveSupportTicket(session.user.id);
      if (!activeTicket) {
        // Neuer Chat: Ticket entsteht erst beim ersten Senden — UI bleibt offen.
        setTicket(null);
        setMessages([]);
        return;
      }
      setTicket(activeTicket);
      await refreshFromMatrix(activeTicket.id);
    } catch (err) {
      console.error('Support-Chat laden fehlgeschlagen:', err);
    } finally {
      setLoading(false);
    }
  }, [closeChatUi, refreshFromMatrix, session?.user?.id, started]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (!started || !ticket?.id || loading || !isScreenActive) return;

    const interval = setInterval(() => {
      refreshFromMatrix(ticket.id).catch((err) => {
        console.warn('Support Matrix sync:', err);
      });
    }, 15000);

    return () => clearInterval(interval);
  }, [started, ticket?.id, loading, isScreenActive, refreshFromMatrix]);

  useEffect(() => {
    if (!started || !isScreenActive || !ticket?.id) return;
    refreshFromMatrix(ticket.id).catch(() => undefined);
  }, [isScreenActive, ticket?.id, refreshFromMatrix]);

  useEffect(() => {
    if (!ticket?.id || refreshNonce === 0) return;
    refreshFromMatrix(ticket.id).catch(() => undefined);
  }, [refreshNonce, ticket?.id, refreshFromMatrix]);

  useEffect(() => {
    if (!ticket?.id) return;

    const statusChannel = supabase
      .channel(`support-ticket-${ticket.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'support_tickets',
          filter: `id=eq.${ticket.id}`,
        },
        (payload) => {
          const status = (payload.new as SupportTicket).status;
          if (!isActiveSupportTicketStatus(status)) {
            closeChatUi();
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'support_tickets',
          filter: `id=eq.${ticket.id}`,
        },
        () => {
          closeChatUi();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(statusChannel);
    };
  }, [closeChatUi, ticket?.id]);

  useEffect(() => {
    if (!ticket?.id) return;

    const channel = supabase
      .channel(`support-chat-${ticket.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'support_messages',
          filter: `ticket_id=eq.${ticket.id}`,
        },
        (payload) => {
          const msg = payload.new as SupportMessage;
          setMessages((current) =>
            current.some((item) => item.id === msg.id) ? current : [...current, msg],
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ticket?.id]);

  useEffect(() => {
    if (loading) return;
    const timeout = setTimeout(() => scrollToBottom(messages.length > 0), 80);
    return () => clearTimeout(timeout);
  }, [loading, messages, scrollToBottom]);

  async function sendMessage() {
    const content = text.trim();
    if (!content || !session?.user?.id || sending) return;

    setText('');
    setSending(true);

    let activeTicket = ticket;
    if (!activeTicket?.id) {
      try {
        const existing = await fetchActiveSupportTicket(session.user.id);
        activeTicket = existing ?? (await createSupportTicket(session.user.id));
        setTicket(activeTicket);
      } catch (err) {
        setSending(false);
        setText(content);
        console.warn('Support-Ticket anlegen:', err);
        return;
      }
    }

    const { data, error: sendError } = await supabase
      .from('support_messages')
      .insert({
        ticket_id: activeTicket.id,
        sender_type: 'user',
        sender_id: session.user.id,
        message_text: content,
      })
      .select('id, ticket_id, sender_type, sender_id, message_text, created_at, matrix_event_id')
      .single();

    if (sendError) {
      setSending(false);
      setText(content);
      console.warn('Support senden:', sendError.message);
      return;
    }

    if (data) {
      setMessages((current) =>
        current.some((item) => item.id === data.id) ? current : [...current, data as SupportMessage],
      );

      setTimeout(() => scrollToBottom(true), 80);

      try {
        const forward = await forwardSupportMessageToMatrix(data as SupportMessageRecord);
        if (forward.ok) {
          setMatrixDeliveryHint(null);
        } else {
          const hint = forward.error ?? 'Nachricht nicht an Matrix/Element übermittelt.';
          setMatrixDeliveryHint(hint);
          console.warn('Support → Matrix:', hint, forward.matrixRoomId ?? '');
        }
      } catch (err) {
        const hint = err instanceof Error ? err.message : 'Matrix-Weiterleitung fehlgeschlagen';
        setMatrixDeliveryHint(hint);
        console.warn('Support → Matrix:', hint);
      }
    }

    setSending(false);
  }

  if (!started || !session) {
    return null;
  }

  return (
    <View style={[styles.card, expanded ? styles.cardExpanded : styles.cardInline]}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>Support-Chat</Text>
          <Text style={styles.cardSub}>Wir antworten dir hier im Chat</Text>
          {matrixDeliveryHint ? (
            <Text style={styles.matrixHint}>{matrixDeliveryHint}</Text>
          ) : null}
        </View>
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>Live</Text>
        </View>
      </View>

      <View style={styles.chatBody}>
        <View style={styles.messagesPane}>
          {loading ? (
            <View style={styles.centerState}>
              <ActivityIndicator color={colors.cyan} size="large" />
            </View>
          ) : (
            <ScrollView
              ref={scrollRef}
              style={styles.messageList}
              contentContainerStyle={[
                styles.messageListContent,
                messages.length === 0 && styles.messageListEmpty,
              ]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              nestedScrollEnabled
              automaticallyAdjustKeyboardInsets
              onContentSizeChange={() => scrollToBottom(false)}
            >
              {messages.length === 0 ? (
                <Text style={styles.emptyText}>
                  Stell uns deine Frage – z. B. zu Inseraten, Konto oder Zahlung.
                </Text>
              ) : (
                messages.map((item) => <MessageBubble key={item.id} item={item} />)
              )}
            </ScrollView>
          )}
        </View>

        <View style={styles.inputRow}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Nachricht an den Support…"
            placeholderTextColor="#666"
            style={styles.input}
            multiline
            maxLength={2000}
            editable={!loading && !sending}
          />
          <Pressable
            style={[styles.sendButton, (!text.trim() || sending || loading) && styles.sendButtonDisabled]}
            onPress={sendMessage}
            disabled={!text.trim() || sending || loading}
          >
            {sending ? (
              <ActivityIndicator color="#000" size="small" />
            ) : (
              <FontAwesome5 name="paper-plane" size={14} color="#000" solid />
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    overflow: 'hidden',
    marginBottom: 8,
    flexDirection: 'column',
  },
  cardInline: {
    height: CARD_HEIGHT,
    marginTop: 4,
  },
  cardExpanded: {
    flex: 1,
    minHeight: CARD_HEIGHT,
    marginTop: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
  },
  cardSub: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  matrixHint: {
    color: '#f59e0b',
    fontSize: 11,
    marginTop: 6,
    lineHeight: 15,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.cyanSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.cyan,
  },
  liveText: {
    color: colors.cyan,
    fontSize: 11,
    fontWeight: '800',
  },
  chatBody: {
    flex: 1,
    minHeight: 200,
    backgroundColor: '#1c1c1c',
  },
  messagesPane: {
    flex: 1,
    minHeight: 0,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageList: {
    flex: 1,
  },
  messageListContent: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 8,
    gap: 10,
  },
  messageListEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  messageRow: {
    gap: 4,
    marginBottom: 2,
  },
  messageRowMine: {
    alignItems: 'flex-end',
  },
  messageRowOther: {
    alignItems: 'flex-start',
  },
  senderLabel: {
    color: colors.cyan,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginLeft: 4,
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleMine: {
    backgroundColor: colors.cyan,
    borderBottomRightRadius: 6,
  },
  bubbleOther: {
    backgroundColor: '#383838',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    borderBottomLeftRadius: 6,
  },
  messageText: {
    color: '#ffffff',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '500',
  },
  messageTextMine: {
    color: '#000000',
    fontWeight: '600',
  },
  messageTime: {
    color: '#666',
    fontSize: 10,
    marginHorizontal: 4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: '#242424',
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 88,
    borderRadius: 22,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    color: '#ffffff',
    fontSize: 15,
    lineHeight: 20,
    paddingHorizontal: 14,
    paddingTop: Platform.OS === 'ios' ? 12 : 10,
    paddingBottom: Platform.OS === 'ios' ? 12 : 10,
    textAlignVertical: 'center',
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.cyan,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sendButtonDisabled: {
    opacity: 0.45,
  },
  guestState: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 28,
    gap: 10,
  },
  guestTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '900',
  },
  guestText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  loginButton: {
    marginTop: 8,
    height: 44,
    paddingHorizontal: 18,
    borderRadius: radius.md,
    backgroundColor: colors.cyan,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginButtonText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '900',
  },
});
