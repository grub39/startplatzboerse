-- pg_net liegt im Schema "net" – search_path muss das enthalten, sonst schlägt der Trigger still fehl.

create or replace function public.notify_support_message_to_matrix()
returns trigger
language plpgsql
security definer
set search_path = public, net, extensions
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
