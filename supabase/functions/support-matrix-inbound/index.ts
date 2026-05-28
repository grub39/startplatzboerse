import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  extractReplyText,
  fetchRecentRoomMessages,
  getMatrixConfig,
  isBotOutboundTemplate,
  isMatrixUserOutbound,
  matrixWhoami,
} from '../_shared/matrixSupport.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_MESSAGE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type SupportMessageRow = {
  id: string;
  ticket_id: string;
  sender_type: string;
  message_text: string;
};

/** Expo-Push (admin → Nutzer); Trigger kann parallel laufen — Dedupe via push_notified_at. */
async function invokeSupportPush(record: SupportMessageRow) {
  const baseUrl = Deno.env.get('SUPABASE_URL')?.replace(/\/$/, '');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!baseUrl || !serviceKey) return;

  try {
    const res = await fetch(`${baseUrl}/functions/v1/send-message-notification`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ record }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn('support push invoke HTTP', res.status, text.slice(0, 200));
    }
  } catch (err) {
    console.warn('support push invoke:', err);
  }
}

async function importRoomMessages(
  supabase: ReturnType<typeof createClient>,
  botUserId: string,
  ticketId: string,
  roomId: string,
  matrixConfig: ReturnType<typeof getMatrixConfig>,
) {
  const chunk = await fetchRecentRoomMessages(matrixConfig, roomId, 50);

  let imported = 0;
  let skipped = 0;
  const skipReasons: Record<string, number> = {};
  const errors: string[] = [];
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

    if (event.sender === botUserId || isMatrixUserOutbound(event.content)) {
      skip('user_outbound');
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

    const { data: existing } = await supabase
      .from('support_messages')
      .select('id')
      .eq('matrix_event_id', event.event_id)
      .maybeSingle();

    if (existing) {
      skip('already_imported');
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

    await invokeSupportPush(inserted as SupportMessageRow);

    imported += 1;
  }

  return { imported, skipped, skipReasons, errors, scanned: chunk.length };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const matrixConfig = getMatrixConfig();
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const botUserId = await matrixWhoami(
      matrixConfig.homeserver,
      matrixConfig.botAccessToken,
    );

    const { data: tickets, error: ticketsError } = await supabase
      .from('support_tickets')
      .select('id, matrix_room_id')
      .not('matrix_room_id', 'is', null)
      .in('status', ['open', 'answered'])
      .order('updated_at', { ascending: false })
      .limit(80);

    if (ticketsError) throw ticketsError;

    let totalImported = 0;
    let totalSkipped = 0;
    let roomsScanned = 0;
    const allErrors: string[] = [];
    const skipReasons: Record<string, number> = {};
    let encryptedRooms = 0;

    for (const ticket of tickets ?? []) {
      const roomId = ticket.matrix_room_id?.trim();
      if (!roomId) continue;

      roomsScanned += 1;

      try {
        const result = await importRoomMessages(
          supabase,
          botUserId,
          ticket.id,
          roomId,
          matrixConfig,
        );

        totalImported += result.imported;
        totalSkipped += result.skipped;
        allErrors.push(...result.errors);

        for (const [key, count] of Object.entries(result.skipReasons)) {
          skipReasons[key] = (skipReasons[key] ?? 0) + count;
          if (key === 'encrypted') encryptedRooms += 1;
        }
      } catch (roomErr) {
        const msg = roomErr instanceof Error ? roomErr.message : String(roomErr);
        allErrors.push(`${ticket.id}: ${msg}`);
      }
    }

    const hint = encryptedRooms > 0
      ? 'Mindestens ein Ticket-Raum ist E2EE-verschlüsselt — Antworten können nicht importiert werden.'
      : roomsScanned === 0
      ? 'Noch keine Ticket-Räume (matrix_room_id). Neue Nachrichten legen Räume automatisch an.'
      : null;

    return new Response(
      JSON.stringify({
        success: true,
        imported: totalImported,
        skipped: totalSkipped,
        rooms_scanned: roomsScanned,
        botUserId,
        skipReasons,
        hint,
        errors: allErrors.slice(0, 12),
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
