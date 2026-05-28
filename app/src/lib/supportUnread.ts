import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { fetchActiveSupportTicket } from './supportTicket';

function storageKey(userId: string) {
  return `support_last_seen_${userId}`;
}

export async function getSupportLastSeenAt(userId: string): Promise<string | null> {
  return AsyncStorage.getItem(storageKey(userId));
}

export async function markSupportMessagesSeen(userId: string, seenAt = new Date().toISOString()) {
  await AsyncStorage.setItem(storageKey(userId), seenAt);
}

/** Admin-Nachrichten im offenen Ticket, die nach dem letzten „gelesen“ eingegangen sind. */
export async function countUnreadSupportMessages(userId: string): Promise<number> {
  const ticket = await fetchActiveSupportTicket(userId);
  if (!ticket) return 0;

  const lastSeen = await getSupportLastSeenAt(userId);

  let query = supabase
    .from('support_messages')
    .select('id', { count: 'exact', head: true })
    .eq('ticket_id', ticket.id)
    .eq('sender_type', 'admin');

  if (lastSeen) {
    query = query.gt('created_at', lastSeen);
  }

  const { count, error } = await query;
  if (error) {
    console.warn('Support-Unread zählen:', error.message);
    return 0;
  }

  return count ?? 0;
}
