/**
 * @deprecated Support-Push läuft über send-message-notification.
 * Diese Function bleibt nur als Fallback, falls der DB-Trigger noch die alte URL nutzt.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

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

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.replace(/\/$/, '');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: 'Secrets fehlen' }), { status: 500 });
  }

  const body = await req.json();
  const res = await fetch(`${supabaseUrl}/functions/v1/send-message-notification`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
