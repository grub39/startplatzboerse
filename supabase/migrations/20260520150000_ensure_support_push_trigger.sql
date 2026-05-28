-- Support-Push: gleiche Edge Function wie Startplatz-Chat (send-message-notification)

create or replace function public.notify_support_push()
returns trigger
language plpgsql
security definer
set search_path = public, net, extensions
as $$
declare
  project_url text;
  service_key text;
begin
  if new.sender_type is distinct from 'admin' then
    return new;
  end if;

  select decrypted_secret into project_url
  from vault.decrypted_secrets where name = 'supabase_project_url' limit 1;

  select decrypted_secret into service_key
  from vault.decrypted_secrets where name = 'supabase_service_role_key' limit 1;

  if project_url is null or service_key is null then
    raise warning 'support push: vault secrets fehlen';
    return new;
  end if;

  perform net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/send-message-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'support_messages',
      'record', to_jsonb(new)
    )
  );

  return new;
end;
$$;

drop trigger if exists support_messages_push_notify on public.support_messages;

create trigger support_messages_push_notify
  after insert on public.support_messages
  for each row
  execute function public.notify_support_push();
