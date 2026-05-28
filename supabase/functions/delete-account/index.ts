import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function removeAvatarFiles(admin: SupabaseClient, userId: string): Promise<string | null> {
  const bucket = admin.storage.from('avatars');
  const prefix = userId;

  const { data: listed, error: listError } = await bucket.list(prefix, { limit: 100 });
  if (listError) {
    return `avatars.list: ${listError.message}`;
  }

  const paths = (listed ?? [])
    .filter((file) => file.name && !file.name.endsWith('/'))
    .map((file) => `${prefix}/${file.name}`);

  if (paths.length === 0) {
    const fallback = `${prefix}/avatar.jpg`;
    const { error: removeError } = await bucket.remove([fallback]);
    if (removeError && !removeError.message.toLowerCase().includes('not found')) {
      return `avatars.remove: ${removeError.message}`;
    }
    return null;
  }

  const { error: removeError } = await bucket.remove(paths);
  if (removeError) {
    return `avatars.remove: ${removeError.message}`;
  }

  return null;
}

async function deleteUserData(admin: SupabaseClient, userId: string): Promise<string[]> {
  const errors: string[] = [];

  const { data: listings, error: listingsSelectError } = await admin
    .from('listings')
    .select('id')
    .eq('user_id', userId);

  if (listingsSelectError) {
    errors.push(`listings.select: ${listingsSelectError.message}`);
  }

  const listingIds = (listings ?? []).map((row) => row.id as string);

  const { error: sellerConvError } = await admin.from('conversations').delete().eq('seller_id', userId);
  if (sellerConvError) errors.push(`conversations.seller: ${sellerConvError.message}`);

  const { error: buyerConvError } = await admin.from('conversations').delete().eq('buyer_id', userId);
  if (buyerConvError) errors.push(`conversations.buyer: ${buyerConvError.message}`);

  if (listingIds.length > 0) {
    const { error: listingConvError } = await admin
      .from('conversations')
      .delete()
      .in('listing_id', listingIds);
    if (listingConvError) errors.push(`conversations.listing: ${listingConvError.message}`);
  }

  const { error: listingsDeleteError } = await admin.from('listings').delete().eq('user_id', userId);
  if (listingsDeleteError) errors.push(`listings.delete: ${listingsDeleteError.message}`);

  const { error: watchlistError } = await admin.from('watchlist').delete().eq('user_id', userId);
  if (watchlistError) errors.push(`watchlist.delete: ${watchlistError.message}`);

  const { error: deviceTokensError } = await admin.from('device_tokens').delete().eq('user_id', userId);
  if (deviceTokensError) errors.push(`device_tokens.delete: ${deviceTokensError.message}`);

  const { error: supportError } = await admin.from('support_tickets').delete().eq('user_id', userId);
  if (supportError) errors.push(`support_tickets.delete: ${supportError.message}`);

  const { error: profileError } = await admin.from('profiles').delete().eq('id', userId);
  if (profileError) errors.push(`profiles.delete: ${profileError.message}`);

  const avatarError = await removeAvatarFiles(admin, userId);
  if (avatarError) errors.push(avatarError);

  return errors;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !serviceKey || !anonKey) {
    return new Response(JSON.stringify({ ok: false, error: 'Server-Konfiguration unvollständig' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ ok: false, error: 'Nicht angemeldet' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ ok: false, error: 'Sitzung ungültig oder abgelaufen' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const dataErrors = await deleteUserData(admin, user.id);
  if (dataErrors.length > 0) {
    console.error('delete-account data errors:', user.id, dataErrors);
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Kontodaten konnten nicht vollständig gelöscht werden.',
        details: dataErrors,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }

  const { error: authDeleteError } = await admin.auth.admin.deleteUser(user.id);
  if (authDeleteError) {
    console.error('delete-account auth error:', user.id, authDeleteError.message);
    return new Response(
      JSON.stringify({ ok: false, error: 'Auth-Konto konnte nicht gelöscht werden.' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
