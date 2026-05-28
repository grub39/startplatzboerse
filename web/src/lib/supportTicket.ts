import { getSupabase } from './watchlist';

export type ActiveSupportTicket = {
    id: string;
    status: string;
};

const ACTIVE_STATUSES = ['open', 'answered'] as const;

export async function fetchActiveSupportTicket(
    userId: string,
): Promise<ActiveSupportTicket | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase
        .from('support_tickets')
        .select('id, status')
        .eq('user_id', userId)
        .in('status', [...ACTIVE_STATUSES])
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    return data as ActiveSupportTicket | null;
}

export function isActiveSupportTicketStatus(status: string) {
    return (ACTIVE_STATUSES as readonly string[]).includes(status);
}

export async function createSupportTicket(userId: string): Promise<ActiveSupportTicket> {
    const supabase = getSupabase();
    const existing = await fetchActiveSupportTicket(userId);
    if (existing) return existing;

    const { data, error } = await supabase
        .from('support_tickets')
        .insert({
            user_id: userId,
            subject: 'Support-Anfrage',
            status: 'open',
        })
        .select('id, status')
        .single();

    if (error) {
        if (error.code === '23505') {
            const raced = await fetchActiveSupportTicket(userId);
            if (raced) return raced;
        }
        throw error;
    }
    return data as ActiveSupportTicket;
}
