import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function formatTicketRef(ticketId: string) {
  return `T-${ticketId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

function matrixErrorMessage(data: Record<string, unknown>, status: number) {
  const errcode = typeof data.errcode === 'string' ? data.errcode : '';
  const error = typeof data.error === 'string' ? data.error : '';
  return [errcode, error].filter(Boolean).join(': ') ||
    `Matrix-Anfrage fehlgeschlagen (${status})`;
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
  if (res.ok || data.errcode === 'M_ALREADY_IN_ROOM') return;

  const detail = matrixErrorMessage(data, res.status);
  if (data.errcode === 'M_UNKNOWN_TOKEN') {
    throw new Error(
      `Matrix-Bot-Token ungültig oder abgelaufen (${detail}). Neuen Access Token erzeugen und MATRIX_BOT_ACCESS_TOKEN in Supabase aktualisieren.`,
    );
  }

  throw new Error(
    `Bot kann Support-Raum nicht betreten (${detail}). Bot in Element in den Raum einladen.`,
  );
}

async function sendMatrixMessage(
  homeserver: string,
  accessToken: string,
  roomId: string,
  txnId: string,
  body: string,
) {
  const matrixUrl =
    `${homeserver}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`;

  const matrixRes = await fetch(matrixUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      msgtype: 'm.text',
      body,
    }),
  });

  const matrixData = await matrixRes.json();
  if (!matrixRes.ok) {
    throw new Error(matrixErrorMessage(matrixData, matrixRes.status));
  }

  return matrixData as { event_id?: string };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const record = body.record ?? body;

    if (!record?.ticket_id || !record?.message_text) {
      throw new Error('Ungültiger Payload: ticket_id oder message_text fehlt');
    }

    if (record.sender_type && record.sender_type !== 'user') {
      return new Response(
        JSON.stringify({ skipped: true, reason: 'only user messages are forwarded' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      );
    }

    const homeserver = Deno.env.get('MATRIX_HOMESERVER')?.replace(/\/$/, '');
    const accessToken = Deno.env.get('MATRIX_BOT_ACCESS_TOKEN');
    const roomId = Deno.env.get('MATRIX_SUPPORT_ROOM_ID')?.trim();

    if (!homeserver || !accessToken || !roomId) {
      throw new Error(
        'Matrix-Secrets fehlen (Dashboard → Edge Functions → Secrets): MATRIX_HOMESERVER, MATRIX_BOT_ACCESS_TOKEN, MATRIX_SUPPORT_ROOM_ID',
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: ticket, error: ticketError } = await supabase
      .from('support_tickets')
      .select('id, user_id, subject, status')
      .eq('id', record.ticket_id)
      .single();

    if (ticketError || !ticket) {
      throw new Error(`Ticket nicht gefunden (${record.ticket_id})`);
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('nickname')
      .eq('id', ticket.user_id)
      .maybeSingle();

    let userEmail = 'unbekannt';
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(
      ticket.user_id,
    );
    if (!userError && userData.user?.email) {
      userEmail = userData.user.email;
    }

    const ticketRef = formatTicketRef(ticket.id);
    const nickname = profile?.nickname?.trim() || 'Nutzer';
    const matrixBody = [
      `[${ticketRef}] Support`,
      `Von: ${nickname} (${userEmail})`,
      `Betreff: ${ticket.subject}`,
      `Status: ${ticket.status}`,
      '---',
      record.message_text,
    ].join('\n');

    const txnId = String(record.id ?? crypto.randomUUID()).replace(/-/g, '');

    await ensureBotInRoom(homeserver, accessToken, roomId);

    let matrixData: { event_id?: string };
    try {
      matrixData = await sendMatrixMessage(
        homeserver,
        accessToken,
        roomId,
        txnId,
        matrixBody,
      );
    } catch (firstError) {
      const message = firstError instanceof Error ? firstError.message : String(firstError);
      if (message.includes('M_FORBIDDEN') || message.includes('not in the room')) {
        await ensureBotInRoom(homeserver, accessToken, roomId);
        matrixData = await sendMatrixMessage(
          homeserver,
          accessToken,
          roomId,
          txnId,
          matrixBody,
        );
      } else {
        throw firstError;
      }
    }

    if (matrixData?.event_id && record.id) {
      await supabase
        .from('support_messages')
        .update({ matrix_event_id: matrixData.event_id })
        .eq('id', record.id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        ticketRef,
        matrix_event_id: matrixData.event_id ?? null,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('support-notify-matrix error:', message);
    return new Response(JSON.stringify({ success: false, error: message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  }
});
