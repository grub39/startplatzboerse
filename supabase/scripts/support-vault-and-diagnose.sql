-- Einmalig in Supabase SQL Editor (PRODUCTION), wenn der DB-Trigger nicht feuert.
-- Service Role Key: Dashboard → Project Settings → API → service_role (secret)

-- 1) Vault-Secrets (nur wenn noch nicht vorhanden)
-- select vault.create_secret(
--   'https://pwestdrlibkbfkwgqkup.supabase.co',
--   'supabase_project_url'
-- );
-- select vault.create_secret(
--   'HIER_SERVICE_ROLE_KEY_EINFÜGEN',
--   'supabase_service_role_key'
-- );

-- 2) Prüfen
select name from vault.secrets
where name in ('supabase_project_url', 'supabase_service_role_key');

-- 3) Letzte Nachrichten + Fehler (nach Migration matrix_forward_error)
select
  created_at,
  message_text,
  matrix_event_id,
  matrix_forward_error
from support_messages
where sender_type = 'user'
order by created_at desc
limit 10;

-- 4) Tickets ohne Matrix-Raum (nach App-Nachrichten)
select id, created_at, status, matrix_room_id
from support_tickets
order by created_at desc
limit 10;

-- 5) pg_net-Antworten (ob der Trigger die Function überhaupt aufruft)
select id, status_code, error_msg, created
from net._http_response
order by created desc
limit 10;

-- 6) Manuell hängende Nachrichten erneut senden (SERVICE_ROLE im Bearer!)
-- curl -s -X POST "$SUPABASE_URL/functions/v1/support-retry-matrix" \
--   -H "Authorization: Bearer SERVICE_ROLE_KEY" \
--   -H "apikey: ANON_KEY"
