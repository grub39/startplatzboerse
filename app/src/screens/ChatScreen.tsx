import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { ChatCard, EmptyDashboard } from '../components/DashboardComponents';
import { ChatWindow } from './ChatWindow';
import { colors } from '../theme';
import type { Conversation } from '../types';

type Props = {
  session: Session | null;
  initialConversationId?: string | null;
  onInitialConversationHandled?: () => void;
  onActiveConversationChange?: (conversationId: string | null) => void;
  notificationConversationId?: string | null;
  notificationNonce?: number;
  onUnreadStateChange?: () => void;
  // bottomInset wurde entfernt, da die App.tsx die Abstände jetzt zentral regelt
};

export function ChatScreen({
  session,
  initialConversationId,
  onInitialConversationHandled,
  onActiveConversationChange,
  notificationConversationId,
  notificationNonce = 0,
  onUnreadStateChange,
}: Props) {
  const insets = useSafeAreaInsets();
  
  const [chats, setChats] = useState<Conversation[]>([]);
  const [selectedChat, setSelectedChat] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadChats = useCallback(async () => {
    if (!session?.user?.id) return;
    
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('conversations')
        .select(
          `id, updated_at, seller_id, buyer_id, listings(event_name), messages(is_read, sender_id), seller:profiles!conversations_seller_id_fkey(nickname), buyer:profiles!conversations_buyer_id_fkey(nickname)`
        )
        .or(`buyer_id.eq.${session.user.id},seller_id.eq.${session.user.id}`)
        .order('updated_at', { ascending: false });

      if (fetchError) throw fetchError;

      const normalizedChats = ((data ?? []) as any[]).map((chat) => ({
        ...chat,
        listings: Array.isArray(chat.listings) ? chat.listings[0] : chat.listings,
        seller: Array.isArray(chat.seller) ? chat.seller[0] : chat.seller,
        buyer: Array.isArray(chat.buyer) ? chat.buyer[0] : chat.buyer,
        messages: chat.messages ?? [],
      })) as Conversation[];

      setChats(normalizedChats);
    } catch (err) {
      console.error('Chats laden fehlgeschlagen:', err);
      setError('Nachrichten konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  const handleMessagesRead = useCallback(() => {
    loadChats();
    onUnreadStateChange?.();
  }, [loadChats, onUnreadStateChange]);

  useEffect(() => {
    loadChats();
  }, [loadChats]);

  useEffect(() => {
    onActiveConversationChange?.(selectedChat?.id ?? null);
  }, [onActiveConversationChange, selectedChat?.id]);

  useEffect(() => {
    if (!session?.user?.id) return;

    const channel = supabase
      .channel(`mobile-chat-overview-${session.user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        () => {
          loadChats();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadChats, session?.user?.id]);

  useEffect(() => {
    if (!initialConversationId || chats.length === 0) return;

    const matchingChat = chats.find((chat) => chat.id === initialConversationId);
    if (matchingChat) {
      setSelectedChat(matchingChat);
    }
    onInitialConversationHandled?.();
  }, [chats, initialConversationId, onInitialConversationHandled]);

  useEffect(() => {
    if (notificationNonce === 0) return;
    loadChats();
  }, [loadChats, notificationNonce]);

  // Ansonsten zeigen wir die Inbox (Liste der Chats)
  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scrollStyle}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* --- HEADER --- */}
        <View style={[styles.header, { paddingTop: Math.max(insets.top + 10, 40) }]}>
          <Text style={styles.headerTitle}>Nachrichten</Text>
        </View>

        {/* --- CHAT LISTE --- */}
        <View style={styles.listContainer}>
          {error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : loading ? (
            <ActivityIndicator color={colors.cyan} size="large" style={{ marginTop: 40 }} />
          ) : !session ? (
            <EmptyDashboard text="Bitte logge dich ein, um deine Nachrichten zu sehen." />
          ) : chats.length === 0 ? (
            <EmptyDashboard text="Du hast noch keine aktiven Chats." />
          ) : (
            chats.map((chat) => (
              <ChatCard
                key={chat.id}
                chat={chat}
                userId={session.user.id}
                onPress={() => setSelectedChat(chat)}
              />
            ))
          )}
        </View>
      </ScrollView>

      {/* --- FIX: DAS CHATFENSTER ALS FREIE EBENE RENDERN ---
          Kein natives Modal mehr, das die Richtungen diktiert! Das Fenster
          nutzt jetzt seine eigenen Animations-Kräfte aus der ChatWindow.tsx.
      */}
      {selectedChat && session?.user?.id && (
        <ChatWindow
          conversation={selectedChat}
          userId={session.user.id}
          refreshNonce={!notificationConversationId || notificationConversationId === selectedChat.id ? notificationNonce : 0}
          onMessagesRead={handleMessagesRead}
          onBack={() => {
            setSelectedChat(null);
            loadChats(); // Aktualisiert die Inbox ("ungelesen" Badges) beim Schließen
            onUnreadStateChange?.();
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollStyle: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 0,
    paddingBottom: 120,
  },
  header: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 19,
    fontWeight: '900',
  },
  listContainer: {
    paddingHorizontal: 20,
    gap: 12,
  },
  errorText: {
    color: '#ff4444',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 20,
  },
});