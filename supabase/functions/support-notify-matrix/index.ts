import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  ensureBotInRoom,
  ensureTicketMatrixRoom,
  formatTicketRef,
  getMatrixConfig,
  sendMatrixUserMessage,
} from '../_shared/matrixSupport.ts';

const allowedOrigin = Deno.env.get('ALLOWED_ORIGIN') ?? 'https://startplatzboerse.de';
const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const internalToken = Deno.env.get('SUPPORT_INTERNAL_TOKEN');
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!internalToken || authHeader !== `Bearer ${internalToken}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
  }

  let messageId: string | null = null;

  try {
    const body = await req.json();
    const record = body.record ?? body;
    messageId = typeof record?.id === 'string' ? record.id : null;

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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    if (record.id) {
      const { data: existingMsg } = await supabase
        .from('support_messages')
        .select('matrix_event_id')
        .eq('id', record.id)
        .maybeSingle();

      if (existingMsg?.matrix_event_id) {
        return new Response(
          JSON.stringify({
            success: true,
            skipped: true,
            matrix_event_id: existingMsg.matrix_event_id,
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          },
        );
      }
    }

    const matrixConfig = getMatrixConfig();

    const { data: ticket, error: ticketError } = await supabase
      .from('support_tickets')
      .select('id, user_id, subject, status, matrix_room_id')
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

    const nickname = profile?.nickname?.trim() || 'Nutzer';
    const ticketRef = formatTicketRef(ticket.id);

    const { roomId } = await ensureTicketMatrixRoom(supabase, matrixConfig, ticket, {
      nickname,
      userEmail,
    });

    const txnId = `sp_${String(record.id ?? crypto.randomUUID()).replace(/-/g, '')}`;

    await ensureBotInRoom(matrixConfig, roomId);

    let matrixData: { event_id?: string };
    try {
      matrixData = await sendMatrixUserMessage(
        matrixConfig,
        roomId,
        txnId,
        record.message_text,
      );
    } catch (firstError) {
      const message = firstError instanceof Error ? firstError.message : String(firstError);
      if (message.includes('M_FORBIDDEN') || message.includes('not in the room')) {
        await ensureBotInRoom(matrixConfig, roomId);
        matrixData = await sendMatrixUserMessage(
          matrixConfig,
          roomId,
          txnId,
          record.message_text,
        );
      } else {
        throw firstError;
      }
    }

    if (!matrixData?.event_id) {
      throw new Error('Matrix hat keine event_id zurückgegeben');
    }

    if (record.id) {
      const { error: updateError } = await supabase
        .from('support_messages')
        .update({
          matrix_event_id: matrixData.event_id,
          matrix_forward_error: null,
        })
        .eq('id', record.id);

      if (updateError) {
        throw new Error(`matrix_event_id speichern: ${updateError.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        ticketRef,
        matrix_room_id: roomId,
        matrix_event_id: matrixData.event_id,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('support-notify-matrix error:', message);

    if (messageId) {
      try {
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        );
        await supabase
          .from('support_messages')
          .update({ matrix_forward_error: message.slice(0, 500) })
          .eq('id', messageId);
      } catch {
        /* ignore */
      }
    }

    return new Response(JSON.stringify({ success: false, error: message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  }
});
