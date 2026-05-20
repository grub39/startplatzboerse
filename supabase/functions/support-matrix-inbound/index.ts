import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type MatrixEvent = {
  event_id: string;
  type: string;
  sender: string;
  origin_server_ts?: number;
  content: Record<string, unknown>;
};

const MAX_MESSAGE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function extractReplyText(content: Record<string, unknown>): string {
  const newContent = content['m.new_content'] as { body?: string } | undefined;
  if (typeof newContent?.body === 'string' && newContent.body.trim()) {
    return newContent.body.trim();
  }

  const body = typeof content.body === 'string' ? content.body : '';
  const withoutQuotes = body
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('>'))
    .join('\n')
    .trim();

  return withoutQuotes || body.trim();
}

function isBotOutboundTemplate(text: string) {
  return /\[T-[A-F0-9]{8}\]/i.test(text) && /Support/i.test(text) && /Von:/i.test(text);
}

function parseTicketRef(text: string): string | null {
  const match = text.match(/\[T-([A-F0-9]{8})\]/i);
  return match?.[1]?.toLowerCase() ?? null;
}

function getInReplyToEventIds(content: Record<string, unknown>): string[] {
  const relates = content['m.relates_to'] as Record<string, unknown> | undefined;
  if (!relates) return [];

  const ids: string[] = [];
  const inReply = relates['m.in_reply_to'] as { event_id?: string } | undefined;
  if (inReply?.event_id) ids.push(inReply.event_id);

  if (typeof relates.event_id === 'string') {
    ids.push(relates.event_id);
  }

  return [...new Set(ids)];
}

async function fetchMatrixEvent(
  homeserver: string,
  accessToken: string,
  roomId: string,
  eventId: string,
): Promise<MatrixEvent | null> {
  const url =
    `${homeserver}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/event/${encodeURIComponent(eventId)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) return null;
  return data as MatrixEvent;
}

async function fetchRecentRoomMessages(
  homeserver: string,
  accessToken: string,
  roomId: string,
  limit = 50,
): Promise<MatrixEvent[]> {
  const url =
    `${homeserver}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages?dir=b&limit=${limit}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error ?? data?.errcode ?? `Matrix messages (${res.status})`);
  }
  return (data.chunk ?? []) as MatrixEvent[];
}

async function ticketIdFromRefPrefix(
  supabase: ReturnType<typeof createClient>,
  prefix: string,
): Promise<string | null> {
  const { data: tickets, error } = await supabase
    .from('support_tickets')
    .select('id')
    .in('status', ['open', 'answered'])
    .order('updated_at', { ascending: false })
    .limit(100);

  if (error || !tickets?.length) return null;

  const match = tickets.find((ticket) =>
    ticket.id.replace(/-/g, '').toLowerCase().startsWith(prefix)
  );
  return match?.id ?? null;
}

async function latestActiveTicketId(
  supabase: ReturnType<typeof createClient>,
): Promise<string | null> {
  const { data: row } = await supabase
    .from('support_messages')
    .select('ticket_id')
    .eq('sender_type', 'user')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return row?.ticket_id ?? null;
}

async function resolveTicketId(
  supabase: ReturnType<typeof createClient>,
  homeserver: string,
  accessToken: string,
  roomId: string,
  event: MatrixEvent,
  bodyText: string,
): Promise<string | null> {
  const refInBody = parseTicketRef(bodyText);
  if (refInBody) {
    const fromRef = await ticketIdFromRefPrefix(supabase, refInBody);
    if (fromRef) return fromRef;
  }

  const toVisit = [...getInReplyToEventIds(event.content)];
  const visited = new Set<string>();

  while (toVisit.length > 0) {
    const replyTo = toVisit.shift()!;
    if (visited.has(replyTo)) continue;
    visited.add(replyTo);

    const { data } = await supabase
      .from('support_messages')
      .select('ticket_id')
      .eq('matrix_event_id', replyTo)
      .maybeSingle();

    if (data?.ticket_id) return data.ticket_id;

    const parent = await fetchMatrixEvent(homeserver, accessToken, roomId, replyTo);
    if (!parent) continue;

    const parentText =
      typeof parent.content?.body === 'string' ? parent.content.body : '';
    const parentRef = parseTicketRef(parentText);
    if (parentRef) {
      const fromParent = await ticketIdFromRefPrefix(supabase, parentRef);
      if (fromParent) return fromParent;
    }

    for (const nestedId of getInReplyToEventIds(parent.content ?? {})) {
      if (!visited.has(nestedId)) toVisit.push(nestedId);
    }
  }

  if (getInReplyToEventIds(event.content).length > 0) {
    const latest = await latestActiveTicketId(supabase);
    if (latest) return latest;
  }

  const { data: newestTicket } = await supabase
    .from('support_tickets')
    .select('id')
    .in('status', ['open', 'answered'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return newestTicket?.id ?? null;
}

async function ensureBotInRoom(homeserver: string, accessToken: string, roomId: string) {
  const joinUrl =
    `${homeserver}/_matrix/client/v3/join/${encodeURIComponent(roomId)}`;
  const res = await fetch(joinUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  const data = await res.json();
  if (!res.ok && data.errcode !== 'M_ALREADY_IN_ROOM') {
    console.warn('Matrix join:', data);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const homeserver = Deno.env.get('MATRIX_HOMESERVER')?.replace(/\/$/, '');
    const accessToken = Deno.env.get('MATRIX_BOT_ACCESS_TOKEN');
    const roomId = Deno.env.get('MATRIX_SUPPORT_ROOM_ID')?.trim();

    if (!homeserver || !accessToken || !roomId) {
      throw new Error('Matrix-Secrets fehlen');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const whoamiRes = await fetch(`${homeserver}/_matrix/client/v3/account/whoami`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const whoami = await whoamiRes.json();
    if (!whoamiRes.ok) {
      throw new Error(whoami?.error ?? 'Matrix whoami fehlgeschlagen');
    }
    const botUserId = whoami.user_id as string;

    await ensureBotInRoom(homeserver, accessToken, roomId);

    const chunk = await fetchRecentRoomMessages(homeserver, accessToken, roomId, 50);

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];
    const skipReasons: Record<string, number> = {};
    const humanSamples: Array<{ sender: string; preview: string }> = [];

    const minTs = Date.now() - MAX_MESSAGE_AGE_MS;

    const skip = (reason: string) => {
      skipped += 1;
      skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
    };

    for (const event of chunk) {
      if (event.origin_server_ts && event.origin_server_ts < minTs) {
        skip('too_old');
        continue;
      }

      if (event.type !== 'm.room.message') {
        skip(event.type === 'm.room.encrypted' ? 'encrypted' : 'not_message');
        continue;
      }

      if (event.sender === botUserId) {
        skip('bot_sender');
        continue;
      }

      const msgtype = event.content.msgtype;
      if (msgtype && msgtype !== 'm.text' && msgtype !== 'm.notice') {
        skip(`msgtype_${msgtype}`);
        continue;
      }

      const text = extractReplyText(event.content);
      if (!text) {
        skip('empty_text');
        continue;
      }

      if (isBotOutboundTemplate(text)) {
        skip('bot_template');
        continue;
      }

      if (humanSamples.length < 5) {
        humanSamples.push({
          sender: event.sender,
          preview: text.slice(0, 80),
        });
      }

      const { data: existing } = await supabase
        .from('support_messages')
        .select('id')
        .eq('matrix_event_id', event.event_id)
        .maybeSingle();

      if (existing) {
        skip('already_imported');
        continue;
      }

      const ticketId = await resolveTicketId(
        supabase,
        homeserver,
        accessToken,
        roomId,
        event,
        text,
      );

      if (!ticketId) {
        skip('no_ticket');
        errors.push(`Kein Ticket für ${event.event_id}: "${text.slice(0, 40)}"`);
        continue;
      }

      const { data: inserted, error: insertError } = await supabase
        .from('support_messages')
        .insert({
          ticket_id: ticketId,
          sender_type: 'admin',
          sender_id: null,
          message_text: text,
          matrix_event_id: event.event_id,
        })
        .select('id, ticket_id, sender_type, message_text')
        .single();

      if (insertError || !inserted) {
        errors.push(`${event.event_id}: ${insertError?.message ?? 'insert failed'}`);
        continue;
      }

      await supabase
        .from('support_tickets')
        .update({ status: 'answered' })
        .eq('id', ticketId);

      imported += 1;
    }

    const encryptedCount = skipReasons.encrypted ?? 0;
    const hint = encryptedCount > 0
      ? 'Der Matrix-Raum ist verschlüsselt (E2EE). Der Bot kann deine Element-Antworten nicht lesen. Bitte einen unverschlüsselten Support-Raum nutzen und MATRIX_SUPPORT_ROOM_ID anpassen.'
      : humanSamples.length === 0 && imported === 0
      ? 'Keine lesbaren Antworten im Raum. Bot im Raum? Auf Bot-Nachricht antworten?'
      : null;

    return new Response(
      JSON.stringify({
        success: true,
        imported,
        skipped,
        scanned: chunk.length,
        botUserId,
        skipReasons,
        humanSamples,
        hint,
        errors: errors.slice(0, 8),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('support-matrix-inbound error:', message);
    return new Response(JSON.stringify({ success: false, error: message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  }
});
