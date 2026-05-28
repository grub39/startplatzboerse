import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Messtory / Systory hilfe.php:
 * - MATRIX_ADMIN_TOKEN → createRoom, invite (wie normale Power-User / Admin)
 * - MATRIX_BOT_ACCESS_TOKEN → Nachrichten senden (kann eingeschränkt sein)
 */
export type MatrixConfig = {
  homeserver: string;
  botAccessToken: string;
  adminAccessToken: string;
  inviteUserIds: string[];
  notifyRoomId: string | null;
};

export function getMatrixConfig(): MatrixConfig {
  const homeserver = (
    Deno.env.get('MATRIX_HOMESERVER') ??
    Deno.env.get('MATRIX_SERVER_URL') ??
    ''
  ).replace(/\/$/, '');

  const adminAccessToken = (
    Deno.env.get('MATRIX_ADMIN_TOKEN') ??
    Deno.env.get('MATRIX_BOT_ACCESS_TOKEN') ??
    ''
  ).trim();

  const botAccessToken = (
    Deno.env.get('MATRIX_BOT_ACCESS_TOKEN') ??
    Deno.env.get('MATRIX_ADMIN_TOKEN') ??
    ''
  ).trim();

  const inviteRaw =
    Deno.env.get('MATRIX_SUPPORT_INVITE_IDS')?.trim() ??
    Deno.env.get('MATRIX_SUPPORTER_MXID')?.trim() ??
    '';

  const notifyRoomId = Deno.env.get('MATRIX_NOTIFY_ROOM_ID')?.trim() || null;

  if (!homeserver || !adminAccessToken || !botAccessToken) {
    throw new Error(
      'Matrix-Secrets fehlen: MATRIX_HOMESERVER und MATRIX_BOT_ACCESS_TOKEN ' +
        '(für createRoom zusätzlich MATRIX_ADMIN_TOKEN wie in Systory hilfe.php)',
    );
  }

  if (!/^https?:\/\//i.test(homeserver)) {
    throw new Error(
      `MATRIX_HOMESERVER muss eine URL sein (z. B. https://matrix.example.de), nicht: ${homeserver.slice(0, 40)}`,
    );
  }

  const inviteUserIds = inviteRaw
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.startsWith('@') && id.includes(':'));

  return {
    homeserver,
    botAccessToken,
    adminAccessToken,
    inviteUserIds,
    notifyRoomId,
  };
}

export function usesSeparateAdminToken(config: MatrixConfig) {
  return config.adminAccessToken !== config.botAccessToken;
}

export function formatTicketRef(ticketId: string) {
  return `T-${ticketId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

export function ticketRoomAliasName(ticketId: string) {
  const short = ticketId.replace(/-/g, '').slice(0, 12).toLowerCase();
  return `support_spb_${short}`;
}

export function matrixErrorMessage(data: Record<string, unknown>, status: number) {
  const errcode = typeof data.errcode === 'string' ? data.errcode : '';
  const error = typeof data.error === 'string' ? data.error : '';
  return [errcode, error].filter(Boolean).join(': ') ||
    `Matrix-Anfrage fehlgeschlagen (${status})`;
}

export async function matrixRequest(
  config: MatrixConfig,
  method: string,
  path: string,
  body: Record<string, unknown> | null = null,
  role: 'admin' | 'bot' = 'admin',
): Promise<Record<string, unknown>> {
  const token = role === 'admin' ? config.adminAccessToken : config.botAccessToken;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (body !== null) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${config.homeserver}${path}`, {
    method,
    headers,
    body: body !== null ? JSON.stringify(body) : undefined,
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(matrixErrorMessage(data, res.status));
  }
  return data;
}

export async function matrixWhoami(homeserver: string, accessToken: string) {
  const res = await fetch(`${homeserver}/_matrix/client/v3/account/whoami`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(matrixErrorMessage(data, res.status));
  }
  return data.user_id as string;
}

export async function ensureBotInRoom(config: MatrixConfig, roomId: string) {
  for (const role of ['bot', 'admin'] as const) {
    try {
      await matrixRequest(
        config,
        'POST',
        `/_matrix/client/v3/join/${encodeURIComponent(roomId)}`,
        {},
        role,
      );
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('M_ALREADY_IN_ROOM')) return;
      if (role === 'bot') continue;
      throw err;
    }
  }
}

async function inviteUserToRoom(
  config: MatrixConfig,
  roomId: string,
  userId: string,
) {
  try {
    await matrixRequest(
      config,
      'POST',
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/invite`,
      { user_id: userId },
      'admin',
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Matrix invite ${userId}:`, message);
  }
}

async function inviteSupportTeam(config: MatrixConfig, roomId: string) {
  for (const userId of config.inviteUserIds) {
    await inviteUserToRoom(config, roomId, userId);
  }
}

function explainCreateRoomError(message: string, config: MatrixConfig) {
  if (!message.includes('M_FORBIDDEN')) return message;

  const separate = usesSeparateAdminToken(config);
  if (/administrator|admin/i.test(message)) {
    if (separate) {
      return (
        `${message} — MATRIX_ADMIN_TOKEN kann keinen Raum anlegen. ` +
        'Bitte Admin-Token von Systory/Messtory prüfen.'
      );
    }
    return (
      `${message} — Auf Messtory dürfen oft normale Nutzer Räume anlegen, ` +
      'aber nicht dieser Bot-Account. Zusätzlich Secret MATRIX_ADMIN_TOKEN setzen ' +
      '(derselbe Token wie in Systory hilfe.php / MATRIX_ADMIN_TOKEN).'
    );
  }
  return message;
}

async function requestCreateRoom(
  config: MatrixConfig,
  body: Record<string, unknown>,
): Promise<string> {
  const data = await matrixRequest(
    config,
    'POST',
    '/_matrix/client/v3/createRoom',
    body,
    'admin',
  );
  const roomId = typeof data.room_id === 'string' ? data.room_id : undefined;
  if (!roomId) {
    throw new Error('Matrix-Raum anlegen: keine room_id');
  }
  return roomId;
}

/** Raum anlegen wie pages/hilfe.php — immer mit Admin-Token. */
export async function createTicketRoom(
  config: MatrixConfig,
  options: {
    ticketId: string;
    ticketRef: string;
    nickname: string;
    userEmail: string;
    subject: string;
  },
): Promise<string> {
  const label = `${options.nickname} · ${options.ticketRef}`;
  const alias = ticketRoomAliasName(options.ticketId);

  const createWithAlias = {
    room_alias_name: alias,
    name: `Support: ${label}`.slice(0, 255),
    topic: `Startplatzbörse · ${options.subject} · ${options.userEmail}`.slice(0, 255),
    visibility: 'private',
    preset: 'private_chat',
    initial_state: [
      {
        type: 'm.room.join_rules',
        state_key: '',
        content: { join_rule: 'invite' },
      },
    ],
  };

  let roomId: string;

  try {
    roomId = await requestCreateRoom(config, createWithAlias);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const aliasBusy =
      message.includes('M_ROOM_IN_USE') ||
      message.includes('M_INVALID_PARAM') ||
      message.includes('room_alias');
    if (!aliasBusy) {
      throw new Error(explainCreateRoomError(message, config));
    }

    try {
      roomId = await requestCreateRoom(config, {
        name: createWithAlias.name,
        topic: createWithAlias.topic,
        visibility: 'private',
        preset: 'private_chat',
        initial_state: createWithAlias.initial_state,
      });
    } catch (retryErr) {
      const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
      throw new Error(explainCreateRoomError(retryMsg, config));
    }
  }

  await ensureBotInRoom(config, roomId);
  await inviteSupportTeam(config, roomId);

  return roomId;
}

export async function notifyNewSupportRoom(
  config: MatrixConfig,
  options: {
    label: string;
    ticketRef: string;
    roomId: string;
    userEmail: string;
  },
) {
  if (!config.notifyRoomId) return;

  const txn = `spn_${Date.now()}`;
  const text =
    `Neuer Support-Chat (Startplatzbörse)\n` +
    `Von: ${options.label}\n` +
    `E-Mail: ${options.userEmail}\n` +
    `Ticket: ${options.ticketRef}\n` +
    `Raum: ${options.roomId}`;

  try {
    await matrixRequest(
      config,
      'PUT',
      `/_matrix/client/v3/rooms/${encodeURIComponent(config.notifyRoomId)}/send/m.room.message/${txn}`,
      {
        msgtype: 'm.text',
        body: text,
        format: 'org.matrix.custom.html',
        formatted_body:
          `<b>Neuer Support-Chat</b> (Startplatzbörse)<br>` +
          `Von: <b>${escapeHtml(options.label)}</b><br>` +
          `E-Mail: <code>${escapeHtml(options.userEmail)}</code><br>` +
          `Ticket: <code>${escapeHtml(options.ticketRef)}</code><br>` +
          `Raum: <code>${escapeHtml(options.roomId)}</code>`,
      },
      'admin',
    );
  } catch (err) {
    console.warn('MATRIX_NOTIFY_ROOM_ID:', err);
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function sendMatrixUserMessage(
  config: MatrixConfig,
  roomId: string,
  txnId: string,
  messageText: string,
) {
  const payload = {
    msgtype: 'm.text',
    body: messageText,
    'io.systory.side': 'user',
  };

  try {
    const matrixData = await matrixRequest(
      config,
      'PUT',
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
      payload,
      'bot',
    );
    return matrixData as { event_id?: string };
  } catch (botErr) {
    if (usesSeparateAdminToken(config)) {
      throw botErr;
    }
    const matrixData = await matrixRequest(
      config,
      'PUT',
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
      payload,
      'admin',
    );
    return matrixData as { event_id?: string };
  }
}

type TicketRow = {
  id: string;
  user_id: string;
  subject: string;
  status: string;
  matrix_room_id: string | null;
};

export async function ensureTicketMatrixRoom(
  supabase: SupabaseClient,
  config: MatrixConfig,
  ticket: TicketRow,
  meta: { nickname: string; userEmail: string },
): Promise<{ roomId: string; created: boolean }> {
  const existing = ticket.matrix_room_id?.trim();
  if (existing) {
    await ensureBotInRoom(config, existing);
    return { roomId: existing, created: false };
  }

  const { data: freshTicket, error: freshError } = await supabase
    .from('support_tickets')
    .select('id, user_id, subject, status, matrix_room_id')
    .eq('id', ticket.id)
    .single();

  if (freshError) {
    throw new Error(`Ticket neu laden: ${freshError.message}`);
  }

  const freshRoomId = freshTicket?.matrix_room_id?.trim();
  if (freshRoomId) {
    await ensureBotInRoom(config, freshRoomId);
    return { roomId: freshRoomId, created: false };
  }

  const ticketRef = formatTicketRef(ticket.id);
  const roomId = await createTicketRoom(config, {
    ticketId: ticket.id,
    ticketRef,
    nickname: meta.nickname,
    userEmail: meta.userEmail,
    subject: ticket.subject,
  });

  const { data: claimed, error } = await supabase
    .from('support_tickets')
    .update({ matrix_room_id: roomId })
    .eq('id', ticket.id)
    .is('matrix_room_id', null)
    .select('matrix_room_id')
    .maybeSingle();

  if (error) {
    throw new Error(`matrix_room_id speichern: ${error.message}`);
  }

  if (!claimed) {
    const { data: winner, error: winnerError } = await supabase
      .from('support_tickets')
      .select('matrix_room_id')
      .eq('id', ticket.id)
      .single();

    if (winnerError || !winner?.matrix_room_id?.trim()) {
      throw new Error('Matrix-Raum konnte nicht zugewiesen werden (Race).');
    }

    await ensureBotInRoom(config, winner.matrix_room_id);
    return { roomId: winner.matrix_room_id, created: false };
  }

  await notifyNewSupportRoom(config, {
    label: `${meta.nickname} · ${ticketRef}`,
    ticketRef,
    roomId,
    userEmail: meta.userEmail,
  });

  return { roomId, created: true };
}

export type MatrixEvent = {
  event_id: string;
  type: string;
  sender: string;
  origin_server_ts?: number;
  content: Record<string, unknown>;
};

export async function fetchRecentRoomMessages(
  config: MatrixConfig,
  roomId: string,
  limit = 50,
): Promise<MatrixEvent[]> {
  for (const role of ['bot', 'admin'] as const) {
    try {
      const data = await matrixRequest(
        config,
        'GET',
        `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages?dir=b&limit=${limit}`,
        null,
        role,
      );
      return (data.chunk ?? []) as MatrixEvent[];
    } catch (err) {
      if (role === 'bot') continue;
      throw err;
    }
  }
  return [];
}

export function extractReplyText(content: Record<string, unknown>): string {
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

export function isMatrixUserOutbound(content: Record<string, unknown>) {
  return content['io.systory.side'] === 'user';
}

export function isBotOutboundTemplate(text: string) {
  return /\[T-[A-F0-9]{8}\]/i.test(text) && /Support/i.test(text);
}

/** Test createRoom mit einem Token (Diagnose). */
export async function testCreateRoomWithToken(
  config: MatrixConfig,
  role: 'admin' | 'bot',
): Promise<{ ok: boolean; room_id?: string; error?: string }> {
  try {
    const data = await matrixRequest(
      config,
      'POST',
      '/_matrix/client/v3/createRoom',
      {
        name: `SPB Diagnose ${role} ${new Date().toISOString()}`.slice(0, 64),
        preset: 'private_chat',
        visibility: 'private',
      },
      role,
    );
    return { ok: true, room_id: data.room_id as string | undefined };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
