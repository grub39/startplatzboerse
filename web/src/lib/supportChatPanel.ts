import type { RealtimeChannel, Session } from '@supabase/supabase-js';
import { getSupabase } from './watchlist';
import { forwardSupportMessageToMatrix, syncSupportMessagesFromMatrix } from './supportMatrix';
import {
    createSupportTicket,
    fetchActiveSupportTicket,
    isActiveSupportTicketStatus,
    type ActiveSupportTicket,
} from './supportTicket';

type SupportMessage = {
    id: string;
    ticket_id: string;
    sender_type: 'user' | 'admin' | 'system';
    sender_id: string | null;
    message_text: string;
    created_at: string;
};

export type SupportChatPanelOptions = {
    loginPath?: string;
};

export function initSupportChatPanel(
    root: HTMLElement,
    options: SupportChatPanelOptions = {},
) {
    const loginPath = options.loginPath ?? '/login?redirect=/kontakt';

    const guestEl = root.querySelector<HTMLElement>('[data-support-guest]');
    const cardEl = root.querySelector<HTMLElement>('[data-support-card]');
    const backBtn = root.querySelector<HTMLButtonElement>('[data-support-back]');
    const messagesEl = root.querySelector<HTMLElement>('[data-support-messages]');
    const loadingEl = root.querySelector<HTMLElement>('[data-support-loading]');
    const inputEl = root.querySelector<HTMLTextAreaElement>('[data-support-input]');
    const sendBtn = root.querySelector<HTMLButtonElement>('[data-support-send]');
    const matrixHintEl = root.querySelector<HTMLElement>('[data-support-matrix-hint]');
    const loginLink = root.querySelector<HTMLAnchorElement>('[data-support-login]');

    if (loginLink) loginLink.href = loginPath;

    let session: Session | null = null;
    let active = false;
    let ticket: ActiveSupportTicket | null = null;
    let messages: SupportMessage[] = [];
    let loading = false;
    let sending = false;
    let syncTimer: ReturnType<typeof setInterval> | null = null;
    let statusChannel: RealtimeChannel | null = null;
    let messagesChannel: RealtimeChannel | null = null;

    function setMatrixHint(text: string | null) {
        if (!matrixHintEl) return;
        if (text) {
            matrixHintEl.textContent = text;
            matrixHintEl.hidden = false;
        } else {
            matrixHintEl.hidden = true;
            matrixHintEl.textContent = '';
        }
    }

    function scrollMessages() {
        if (!messagesEl) return;
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function renderView() {
        const loggedIn = !!session?.user?.id;
        if (guestEl) guestEl.hidden = loggedIn;
        if (cardEl) cardEl.hidden = !loggedIn;
    }

    function escapeHtml(text: string) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function renderMessages() {
        if (!messagesEl) return;

        if (loading) {
            messagesEl.innerHTML = '';
            return;
        }

        if (messages.length === 0) {
            messagesEl.innerHTML =
                '<p class="support-chat-empty">Stell uns deine Frage – z.&nbsp;B. zu Inseraten, Konto oder Zahlung.</p>';
            return;
        }

        messagesEl.innerHTML = messages
            .map((item) => {
                const mine = item.sender_type === 'user';
                const time = new Date(item.created_at).toLocaleTimeString('de-DE', {
                    hour: '2-digit',
                    minute: '2-digit',
                });
                return `
                <div class="support-msg-row ${mine ? 'is-mine' : 'is-other'}">
                    ${mine ? '' : '<span class="support-msg-label">Support</span>'}
                    <div class="support-msg-bubble">
                        <p>${escapeHtml(item.message_text)}</p>
                    </div>
                    <span class="support-msg-time">${time}</span>
                </div>`;
            })
            .join('');

        scrollMessages();
    }

    function setLoading(value: boolean) {
        loading = value;
        if (loadingEl) {
            loadingEl.hidden = !value;
            loadingEl.setAttribute('aria-hidden', value ? 'false' : 'true');
        }
        if (inputEl) inputEl.disabled = value || sending;
        if (sendBtn) sendBtn.disabled = value || sending || !inputEl?.value.trim();
        renderMessages();
    }

    function clearSubscriptions() {
        const supabase = getSupabase();
        if (statusChannel) {
            supabase.removeChannel(statusChannel);
            statusChannel = null;
        }
        if (messagesChannel) {
            supabase.removeChannel(messagesChannel);
            messagesChannel = null;
        }
        if (syncTimer) {
            clearInterval(syncTimer);
            syncTimer = null;
        }
    }

    /** Nur bei Logout oder geschlossenem Ticket – nicht beim Tab-Wechsel. */
    function resetChatState() {
        ticket = null;
        messages = [];
        setMatrixHint(null);
        clearSubscriptions();
        sessionStorage.removeItem('kontakt_support_chat');
        renderView();
        renderMessages();
    }

    async function loadMessages(ticketId: string) {
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from('support_messages')
            .select('id, ticket_id, sender_type, sender_id, message_text, created_at')
            .eq('ticket_id', ticketId)
            .order('created_at', { ascending: true });

        if (error) throw error;
        messages = (data ?? []) as SupportMessage[];
        renderMessages();
    }

    /** Matrix-Sync im Hintergrund – blockiert UI nicht (wie App, aber ohne Spinner). */
    async function syncFromMatrixInBackground(ticketId: string) {
        try {
            const sync = await syncSupportMessagesFromMatrix();
            if (sync.hint) {
                console.warn('Support sync:', sync.hint);
            }
            await loadMessages(ticketId);
        } catch (err) {
            console.warn('Support Matrix sync:', err);
        }
    }

    function subscribeToTicket(ticketId: string) {
        const supabase = getSupabase();
        clearSubscriptions();

        statusChannel = supabase
            .channel(`support-ticket-web-${ticketId}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'support_tickets',
                    filter: `id=eq.${ticketId}`,
                },
                (payload) => {
                    const status = (payload.new as ActiveSupportTicket).status;
                    if (!isActiveSupportTicketStatus(status)) {
                        resetChatState();
                    }
                },
            )
            .on(
                'postgres_changes',
                {
                    event: 'DELETE',
                    schema: 'public',
                    table: 'support_tickets',
                    filter: `id=eq.${ticketId}`,
                },
                () => resetChatState(),
            )
            .subscribe();

        messagesChannel = supabase
            .channel(`support-chat-web-${ticketId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'support_messages',
                    filter: `ticket_id=eq.${ticketId}`,
                },
                (payload) => {
                    const msg = payload.new as SupportMessage;
                    if (messages.some((item) => item.id === msg.id)) return;
                    messages = [...messages, msg];
                    renderMessages();
                },
            )
            .subscribe();

        syncTimer = setInterval(() => {
            if (!ticket?.id) return;
            syncFromMatrixInBackground(ticket.id);
        }, 15000);
    }

    /** Ticket + Nachrichten aus DB laden (beim Öffnen des Chat-Tabs). */
    async function refreshChat() {
        if (!session?.user?.id) {
            resetChatState();
            return;
        }

        setLoading(true);

        try {
            const activeTicket = await fetchActiveSupportTicket(session.user.id);
            if (!activeTicket) {
                ticket = null;
                messages = [];
                clearSubscriptions();
                renderMessages();
                return;
            }

            const ticketChanged = ticket?.id !== activeTicket.id;
            ticket = activeTicket;

            if (ticketChanged || !messagesChannel) {
                subscribeToTicket(activeTicket.id);
            }

            await loadMessages(activeTicket.id);
            syncFromMatrixInBackground(activeTicket.id);
        } catch (err) {
            console.error('Support-Chat laden fehlgeschlagen:', err);
        } finally {
            setLoading(false);
            renderView();
            if (ticket?.id) {
                sessionStorage.setItem('kontakt_support_chat', '1');
            }
        }
    }

    async function sendMessage() {
        const content = inputEl?.value.trim() ?? '';
        if (!content || !session?.user?.id || sending) return;

        if (inputEl) inputEl.value = '';
        sending = true;
        if (sendBtn) sendBtn.disabled = true;

        let activeTicket = ticket;
        if (!activeTicket?.id) {
            try {
                const existing = await fetchActiveSupportTicket(session.user.id);
                activeTicket = existing ?? (await createSupportTicket(session.user.id));
                ticket = activeTicket;
                subscribeToTicket(activeTicket.id);
                renderView();
            } catch (err) {
                sending = false;
                if (inputEl) inputEl.value = content;
                if (sendBtn) sendBtn.disabled = false;
                console.warn('Support-Ticket anlegen:', err);
                return;
            }
        }

        const supabase = getSupabase();
        const { data, error } = await supabase
            .from('support_messages')
            .insert({
                ticket_id: activeTicket.id,
                sender_type: 'user',
                sender_id: session.user.id,
                message_text: content,
            })
            .select('id, ticket_id, sender_type, sender_id, message_text, created_at, matrix_event_id')
            .single();

        if (error) {
            sending = false;
            if (inputEl) inputEl.value = content;
            if (sendBtn) sendBtn.disabled = false;
            console.warn('Support senden:', error.message);
            return;
        }

        if (data) {
            if (!messages.some((item) => item.id === data.id)) {
                messages = [...messages, data as SupportMessage];
            }
            renderMessages();
            setTimeout(scrollMessages, 80);

            try {
                const forward = await forwardSupportMessageToMatrix(data);
                setMatrixHint(forward.ok ? null : (forward.error ?? null));
            } catch (err) {
                const hint = err instanceof Error ? err.message : 'Matrix-Weiterleitung fehlgeschlagen';
                setMatrixHint(hint);
            }
        }

        sending = false;
        if (sendBtn) sendBtn.disabled = !inputEl?.value.trim();
    }

    backBtn?.addEventListener('click', () => {
        root.dispatchEvent(new CustomEvent('support-chat-back', { bubbles: true }));
    });

    sendBtn?.addEventListener('click', () => {
        sendMessage().catch(() => undefined);
    });

    inputEl?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage().catch(() => undefined);
        }
    });

    inputEl?.addEventListener('input', () => {
        if (sendBtn) sendBtn.disabled = loading || sending || !inputEl.value.trim();
    });

    const supabase = getSupabase();

    const {
        data: { subscription: authSubscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        session = nextSession;

        if (!session?.user?.id) {
            active = false;
            resetChatState();
            return;
        }

        renderView();
        refreshChat();
    });

    supabase.auth.getSession().then(({ data }) => {
        session = data.session;
        renderView();
        if (session?.user?.id) {
            refreshChat();
        } else {
            setLoading(false);
        }
    });

    function destroy() {
        authSubscription.unsubscribe();
        clearSubscriptions();
        active = false;
    }

    return {
        refreshChat,
        setActive(isActive: boolean) {
            active = isActive;
            if (!session?.user?.id) return;
            if (!isActive) return;
            if (!ticket?.id || messages.length === 0) {
                refreshChat();
                return;
            }
            syncFromMatrixInBackground(ticket.id);
        },
        destroy,
    };
}
