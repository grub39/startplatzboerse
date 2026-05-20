-- Zuverlässige Weiterleitung von Support-Nachrichten an Matrix (unabhängig vom Dashboard-Webhook).
-- Einmalig im SQL Editor ausführen, falls Vault-Secrets noch fehlen:
--
--   select vault.create_secret('https://DEIN-PROJECT-REF.supabase.co', 'supabase_project_url');
--   select vault.create_secret('DEIN_SERVICE_ROLE_KEY', 'supabase_service_role_key');

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_support_message_to_matrix()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  project_url text;
  service_key text;
  payload jsonb;
begin
  if new.sender_type is distinct from 'user' then
    return new;
  end if;

  select decrypted_secret
  into project_url
  from vault.decrypted_secrets
  where name = 'supabase_project_url'
  limit 1;

  select decrypted_secret
  into service_key
  from vault.decrypted_secrets
  where name = 'supabase_service_role_key'
  limit 1;

  if project_url is null or service_key is null then
    raise warning 'support matrix notify: vault secrets supabase_project_url / supabase_service_role_key fehlen';
    return new;
  end if;

  payload := jsonb_build_object(
    'type', 'INSERT',
    'table', 'support_messages',
    'schema', 'public',
    'record', to_jsonb(new)
  );

  perform net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/support-notify-matrix',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := payload
  );

  return new;
end;
$$;

drop trigger if exists support_messages_notify_matrix on public.support_messages;

create trigger support_messages_notify_matrix
  after insert on public.support_messages
  for each row
  execute function public.notify_support_message_to_matrix();
