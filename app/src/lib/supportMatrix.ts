import { supabase, supabaseAnonKey, supabaseUrl } from './supabase';

export type SupportMessageRecord = {
  id: string;
  ticket_id: string;
  sender_type: string;
  sender_id: string | null;
  message_text: string;
  created_at?: string;
  matrix_event_id?: string | null;
};

type NotifyResult = {
  ok: boolean;
  matrixEventId?: string | null;
  matrixRoomId?: string | null;
  error?: string;
};

const MATRIX_POLL_MS = 400;
const MATRIX_POLL_ATTEMPTS = 12;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchMatrixEventId(messageId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('support_messages')
    .select('matrix_event_id, matrix_forward_error')
    .eq('id', messageId)
    .maybeSingle();

  if (error) {
    console.warn('Support matrix_event_id lookup:', error.message);
    return null;
  }

  return data?.matrix_event_id ?? null;
}

async function fetchMatrixForwardError(messageId: string): Promise<string | null> {
  const { data } = await supabase
    .from('support_messages')
    .select('matrix_forward_error')
    .eq('id', messageId)
    .maybeSingle();

  return data?.matrix_forward_error ?? null;
}

export async function notifySupportMessageToMatrix(
  record: SupportMessageRecord,
): Promise<NotifyResult> {
  const { data: fnData, error: fnError } = await supabase.functions.invoke(
    'support-notify-matrix',
    { body: { record } },
  );

  if (fnError) {
    return { ok: false, error: fnError.message };
  }

  const payload = fnData as {
    success?: boolean;
    error?: string;
    matrix_event_id?: string | null;
    matrix_room_id?: string | null;
    skipped?: boolean;
  } | null;

  if (payload?.matrix_event_id) {
    return {
      ok: true,
      matrixEventId: payload.matrix_event_id,
      matrixRoomId: payload.matrix_room_id ?? null,
    };
  }

  if (payload?.error || payload?.success === false) {
    return { ok: false, error: payload.error ?? 'Weiterleitung fehlgeschlagen' };
  }

  const loggedError = await fetchMatrixForwardError(record.id);
  if (loggedError) {
    return { ok: false, error: loggedError };
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token ?? supabaseAnonKey;

  const res = await fetch(`${supabaseUrl}/functions/v1/support-notify-matrix`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ record }),
  });

  let json: {
    success?: boolean;
    error?: string;
    matrix_event_id?: string | null;
    matrix_room_id?: string | null;
  } = {};

  try {
    json = await res.json();
  } catch {
    return { ok: false, error: `Antwort ungültig (HTTP ${res.status})` };
  }

  if (json.matrix_event_id) {
    return {
      ok: true,
      matrixEventId: json.matrix_event_id,
      matrixRoomId: json.matrix_room_id ?? null,
    };
  }

  if (json.error || json.success === false) {
    return { ok: false, error: json.error ?? 'Weiterleitung fehlgeschlagen' };
  }

  const dbError = await fetchMatrixForwardError(record.id);
  if (dbError) {
    return { ok: false, error: dbError };
  }

  return { ok: false, error: `HTTP ${res.status}` };
}

export async function fetchTicketMatrixRoomId(ticketId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('support_tickets')
    .select('matrix_room_id')
    .eq('id', ticketId)
    .maybeSingle();

  if (error) {
    console.warn('matrix_room_id lookup:', error.message);
    return null;
  }

  return data?.matrix_room_id?.trim() || null;
}

/**
 * Wartet auf den DB-Trigger (support_messages_notify_matrix).
 * Ruft support-notify-matrix nur einmal als Fallback auf — verhindert doppelte Matrix-Räume.
 */
export async function forwardSupportMessageToMatrix(
  record: SupportMessageRecord,
): Promise<NotifyResult> {
  if (record.matrix_event_id) {
    const roomId = await fetchTicketMatrixRoomId(record.ticket_id);
    return { ok: true, matrixEventId: record.matrix_event_id, matrixRoomId: roomId };
  }

  for (let i = 0; i < 12; i++) {
    await sleep(MATRIX_POLL_MS);
    const eventId = await fetchMatrixEventId(record.id);
    if (eventId) {
      const roomId = await fetchTicketMatrixRoomId(record.ticket_id);
      return { ok: true, matrixEventId: eventId, matrixRoomId: roomId };
    }
    const dbError = await fetchMatrixForwardError(record.id);
    if (dbError) {
      return { ok: false, error: dbError };
    }
  }

  const fallback = await notifySupportMessageToMatrix(record);
  if (fallback.matrixEventId) {
    return fallback;
  }

  const eventId = await fetchMatrixEventId(record.id);
  if (eventId) {
    const roomId = await fetchTicketMatrixRoomId(record.ticket_id);
    return { ok: true, matrixEventId: eventId, matrixRoomId: roomId };
  }

  const dbError = await fetchMatrixForwardError(record.id);
  const roomId = await fetchTicketMatrixRoomId(record.ticket_id);
  if (roomId && !eventId) {
    return {
      ok: false,
      error:
        dbError ??
        'Matrix-Raum wurde angelegt, aber die Nachricht konnte nicht gesendet werden.',
      matrixRoomId: roomId,
    };
  }

  return {
    ok: false,
    error: dbError ?? fallback.error ?? 'Matrix-Weiterleitung fehlgeschlagen.',
  };
}

type InboundResult = {
  ok: boolean;
  imported?: number;
  error?: string;
  hint?: string | null;
};

/** Holt neue Admin-Antworten aus Element in die Datenbank. */
export async function syncSupportMessagesFromMatrix(): Promise<InboundResult> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token ?? supabaseAnonKey;

  const res = await fetch(`${supabaseUrl}/functions/v1/support-matrix-inbound`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });

  let json: { success?: boolean; error?: string; imported?: number; hint?: string | null } = {};
  try {
    json = await res.json();
  } catch {
    return { ok: false, error: `Antwort ungültig (HTTP ${res.status})` };
  }

  if (json.error || json.success === false) {
    return { ok: false, error: json.error ?? 'Import fehlgeschlagen' };
  }

  return { ok: true, imported: json.imported ?? 0, hint: json.hint ?? null };
}
