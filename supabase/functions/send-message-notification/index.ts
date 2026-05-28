import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type SupportRecord = {
  id: string;
  ticket_id: string;
  sender_type: string;
  message_text: string;
};

type ChatRecord = {
  content: string;
  conversation_id: string;
  sender_id: string;
};

function isSupportRecord(record: Record<string, unknown>): record is SupportRecord {
  return (
    record.sender_type === 'admin' &&
    typeof record.ticket_id === 'string' &&
    typeof record.message_text === 'string'
  );
}

function isChatRecord(record: Record<string, unknown>): record is ChatRecord {
  return (
    typeof record.content === 'string' &&
    typeof record.conversation_id === 'string' &&
    typeof record.sender_id === 'string'
  );
}

/** Gleicher Expo-Aufruf wie bei Startplatz-Chats (bewährt). */
async function sendExpoPush(
  token: string,
  title: string,
  body: string,
  data: Record<string, unknown>,
) {
  const previewText = body.length > 80 ? `${body.substring(0, 80)}...` : body;

  const pushResponse = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Accept-encoding': 'gzip, deflate',
    },
    body: JSON.stringify({
      to: token,
      sound: 'default',
      title,
      body: previewText,
      data,
    }),
  });

  const pushResult = await pushResponse.json();
  console.log('Expo Push Antwort:', token.slice(0, 24), pushResult);
  return pushResult;
}

async function pushToUserDevices(
  supabase: SupabaseClient,
  userId: string,
  title: string,
  body: string,
  data: Record<string, unknown>,
) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('push_new_messages')
    .eq('id', userId)
    .single();

  if (!profile?.push_new_messages) {
    console.log('Push übersprungen: push_new_messages aus');
    return { sent: 0, skipped: 'push disabled' as const };
  }

  const { data: devices, error: devicesError } = await supabase
    .from('device_tokens')
    .select('token, provider')
    .eq('user_id', userId);

  if (devicesError || !devices?.length) {
    console.log('Push übersprungen: keine device_tokens');
    return { sent: 0, skipped: 'no device tokens' as const };
  }

  let sent = 0;
  for (const device of devices) {
    if (device.provider === 'expo' && device.token) {
      await sendExpoPush(device.token, title, body, data);
      sent += 1;
    }
  }

  return { sent };
}

async function handleSupportPush(supabase: SupabaseClient, record: SupportRecord) {
  if (!record.id) {
    throw new Error('Support-Nachrichten-ID fehlt');
  }

  const { data: existing } = await supabase
    .from('support_messages')
    .select('push_notified_at')
    .eq('id', record.id)
    .single();

  if (existing?.push_notified_at) {
    return new Response(JSON.stringify({ skipped: true, reason: 'already notified' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  }

  const { data: ticket, error: ticketError } = await supabase
    .from('support_tickets')
    .select('id, user_id')
    .eq('id', record.ticket_id)
    .single();

  if (ticketError || !ticket) {
    throw new Error('Support-Ticket nicht gefunden');
  }

  console.log('Support-Push für User:', ticket.user_id);

  const pushResult = await pushToUserDevices(
    supabase,
    ticket.user_id,
    'Neue Support-Antwort',
    record.message_text,
    {
      type: 'support',
      ticket_id: ticket.id,
      screen: 'support',
      /** Zusätzlich für isMessageNotification-Fallback in älteren App-Builds */
      conversation_id: ticket.id,
    },
  );

  if (pushResult.sent > 0) {
    await supabase
      .from('support_messages')
      .update({ push_notified_at: new Date().toISOString() })
      .eq('id', record.id)
      .is('push_notified_at', null);
  }

  return new Response(JSON.stringify({ success: true, kind: 'support', ...pushResult }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  });
}

async function handleChatNotification(supabase: SupabaseClient, record: ChatRecord) {
  console.log('Chat-Benachrichtigung für Nachricht:', record.content);

  const { data: convo, error: convoError } = await supabase
    .from('conversations')
    .select('buyer_id, seller_id, listings(event_name)')
    .eq('id', record.conversation_id)
    .single();

  if (convoError || !convo) {
    console.error('Fehler: Konversation nicht gefunden', convoError);
    throw new Error('Konversation nicht gefunden');
  }

  const recipientId =
    record.sender_id === convo.buyer_id ? convo.seller_id : convo.buyer_id;
  console.log('Empfänger-ID:', recipientId);

  const { data: userData, error: userError } = await supabase.auth.admin.getUserById(
    recipientId,
  );
  if (userError || !userData.user?.email) {
    console.error('E-Mail konnte nicht abgerufen werden', userError);
    throw new Error('Empfänger-Email nicht gefunden');
  }

  const recipientEmail = userData.user.email;
  const eventName = (convo.listings as { event_name?: string })?.event_name ?? 'Startplatz';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: 'Startplatzbörse <info@startplatzboerse.com>',
      to: recipientEmail,
      subject: `Neue Nachricht zu: ${eventName}`,
      html: `
          <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #00bcd4;">Neue Nachricht erhalten!</h2>
            <p>Hallo,</p>
            <p>du hast eine neue Nachricht bezüglich des Events <strong>${eventName}</strong> erhalten:</p>
            <div style="background: #f9f9f9; padding: 15px; border-left: 4px solid #00bcd4; font-style: italic; margin: 20px 0;">
              "${record.content}"
            </div>
            <p>Klicke auf den Button, um direkt zu antworten:</p>
            <a href="https://startplatzboerse.vercel.app/chat?id=${record.conversation_id}"
               style="background: #00bcd4; color: black; padding: 12px 25px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; margin-top: 10px;">
               Zum Chat wechseln
            </a>
            <p style="font-size: 0.8rem; color: #999; margin-top: 30px; border-top: 1px solid #eee; padding-top: 10px;">
              Dies ist eine automatische Benachrichtigung von startplatzboerse.com
            </p>
          </div>
        `,
    }),
  });

  const resData = await res.json();
  console.log('Resend API Antwort:', resData);

  const pushResult = await pushToUserDevices(
    supabase,
    recipientId,
    `Neue Nachricht: ${eventName}`,
    record.content,
    {
      conversation_id: record.conversation_id,
      screen: 'messages',
    },
  );

  return new Response(JSON.stringify({ success: true, kind: 'chat', resend: resData, ...pushResult }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const record = (body.record ?? body) as Record<string, unknown>;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    if (isSupportRecord(record)) {
      return await handleSupportPush(supabase, record);
    }

    if (isChatRecord(record)) {
      return await handleChatNotification(supabase, record);
    }

    throw new Error('Unbekannter Benachrichtigungstyp');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('send-message-notification:', message);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
