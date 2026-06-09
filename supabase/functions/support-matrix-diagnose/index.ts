import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  getMatrixConfig,
  matrixWhoami,
  testCreateRoomWithToken,
  usesSeparateAdminToken,
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

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const internalToken = Deno.env.get('SUPPORT_INTERNAL_TOKEN') ?? '';
  const authHeader = req.headers.get('Authorization') ?? '';
  const validBearers = [serviceKey, internalToken].filter(Boolean);
  if (!validBearers.some((t) => authHeader === `Bearer ${t}`)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
  }

  try {
    const config = getMatrixConfig();
    const botUserId = await matrixWhoami(config.homeserver, config.botAccessToken);
    const adminUserId = await matrixWhoami(config.homeserver, config.adminAccessToken);
    const separateAdmin = usesSeparateAdminToken(config);

    const homeserverHost = (() => {
      try {
        return new URL(config.homeserver).host;
      } catch {
        return config.homeserver;
      }
    })();

    const createRoomAsBot = await testCreateRoomWithToken(config, 'bot');
    const createRoomAsAdmin = await testCreateRoomWithToken(config, 'admin');

    const inviteMxids = config.inviteUserIds;
    const serverPart = botUserId.split(':')[1] ?? '';
    const inviteDomainOk =
      inviteMxids.length === 0
        ? null
        : inviteMxids.every((id) => id.endsWith(`:${serverPart}`));

    return new Response(
      JSON.stringify({
        success: true,
        homeserver: homeserverHost,
        separateAdminToken: separateAdmin,
        botUserId,
        adminUserId,
        inviteCount: inviteMxids.length,
        inviteMxids: inviteMxids.map((id) => id.replace(/(.{3}).+(@.+)/, '$1…$2')),
        inviteSameDomainAsBot: inviteDomainOk,
        notifyRoomConfigured: !!config.notifyRoomId,
        createRoomAsBot,
        createRoomAsAdmin,
        explanation:
          'Messtory erlaubt oft normalen Nutzern createRoom in Element. ' +
          'Bot-Accounts sind davon getrennt — Räume werden mit MATRIX_ADMIN_TOKEN angelegt (hilfe.php).',
        hints: [
          !separateAdmin && !createRoomAsAdmin.ok
            ? 'Secret MATRIX_ADMIN_TOKEN setzen (Admin-Token aus Systory hilfe.php), BOT-Token nur zum Senden.'
            : null,
          createRoomAsBot.ok === false && createRoomAsAdmin.ok === true
            ? 'Erwartet: Bot darf keinen Raum anlegen, Admin schon — so ist es korrekt konfiguriert.'
            : null,
          createRoomAsAdmin.ok === false
            ? 'MATRIX_ADMIN_TOKEN fehlt Admin-Recht für createRoom — Messtory-Admin kontaktieren.'
            : null,
          inviteMxids.length === 0
            ? 'MATRIX_SUPPORT_INVITE_IDS fehlt — Supporter werden nicht eingeladen.'
            : null,
          inviteDomainOk === false
            ? `Invite-MXIDs müssen auf :${serverPart} enden.`
            : null,
        ].filter(Boolean),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ success: false, error: message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  }
});
