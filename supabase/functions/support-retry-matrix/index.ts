/**
 * Stellt fehlgeschlagene Support→Matrix-Weiterleitungen nach.
 * Aufruf (nur Service Role): POST /functions/v1/support-retry-matrix
 * Optional: { "hours": 48, "limit": 30 }
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const allowedOrigin = Deno.env.get('ALLOWED_ORIGIN') ?? 'https://startplatzboerse.de';
const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !serviceKey) {
      throw new Error('SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt');
    }

    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const internalToken = Deno.env.get('SUPPORT_INTERNAL_TOKEN') ?? '';
    const authHeader = req.headers.get('Authorization') ?? '';
    const validBearers = [serviceKey, internalToken].filter(Boolean);
    if (!validBearers.some((t) => authHeader === `Bearer ${t}`)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    let hours = 72;
    let limit = 40;
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        if (typeof body.hours === 'number' && body.hours > 0) hours = body.hours;
        if (typeof body.limit === 'number' && body.limit > 0) limit = Math.min(body.limit, 100);
      } catch {
        /* leerer Body ist ok */
      }
    }

    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: pending, error: fetchError } = await supabase
      .from('support_messages')
      .select('id, ticket_id, sender_type, sender_id, message_text, created_at, matrix_event_id')
      .eq('sender_type', 'user')
      .is('matrix_event_id', null)
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (fetchError) throw fetchError;

    const notifyUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/support-notify-matrix`;
    const retried: { id: string; ok: boolean; error?: string; matrix_event_id?: string | null }[] = [];

    for (const record of pending ?? []) {
      const res = await fetch(notifyUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ record }),
      });

      let json: { success?: boolean; error?: string; matrix_event_id?: string | null } = {};
      try {
        json = await res.json();
      } catch {
        json = { success: false, error: `Ungültige Antwort (HTTP ${res.status})` };
      }

      retried.push({
        id: record.id,
        ok: json.success === true && !!json.matrix_event_id,
        error: json.error,
        matrix_event_id: json.matrix_event_id ?? null,
      });
    }

    const okCount = retried.filter((r) => r.ok).length;

    return new Response(
      JSON.stringify({
        success: true,
        since,
        pending: pending?.length ?? 0,
        retried_ok: okCount,
        retried_failed: retried.length - okCount,
        results: retried,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('support-retry-matrix error:', message);
    return new Response(JSON.stringify({ success: false, error: message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  }
});
