-- Matrix → App: Sync-Cursor + minütlicher Abruf neuer Raum-Nachrichten

create table if not exists public.support_matrix_sync (
    id int primary key default 1 check (id = 1),
    next_batch text,
    updated_at timestamptz not null default now()
);

alter table public.support_matrix_sync enable row level security;

-- Nur Service Role (Edge Functions) – keine Client-Policies

create extension if not exists pg_cron with schema pg_catalog;

create or replace function public.invoke_support_matrix_inbound()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  project_url text;
  service_key text;
begin
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
    raise warning 'support-matrix-inbound: vault secrets fehlen';
    return;
  end if;

  perform net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/support-matrix-inbound',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := '{}'::jsonb
  );
end;
$$;

do $$
declare
  job_id bigint;
begin
  select jobid into job_id
  from cron.job
  where jobname = 'support-matrix-inbound-sync';

  if job_id is not null then
    perform cron.unschedule(job_id);
  end if;

  perform cron.schedule(
    'support-matrix-inbound-sync',
    '* * * * *',
    'select public.invoke_support_matrix_inbound();'
  );
end;
$$;
