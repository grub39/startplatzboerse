-- Support-Tickets für In-App-Chat + Matrix-Bridge (idempotent / safe to re-run)

create table if not exists public.support_tickets (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    subject text not null default 'Support-Anfrage',
    status text not null default 'open',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.support_messages (
    id uuid primary key default gen_random_uuid(),
    ticket_id uuid not null references public.support_tickets (id) on delete cascade,
    sender_type text not null default 'user',
    sender_id uuid references auth.users (id) on delete set null,
    message_text text not null,
    matrix_event_id text,
    created_at timestamptz not null default now()
);

-- Nachziehen, falls Tabellen schon früher im Dashboard ohne diese Spalten angelegt wurden
alter table public.support_tickets
    add column if not exists subject text not null default 'Support-Anfrage';

alter table public.support_tickets
    add column if not exists updated_at timestamptz not null default now();

alter table public.support_messages
    add column if not exists sender_type text not null default 'user';

alter table public.support_messages
    add column if not exists matrix_event_id text;

-- Älteres Dashboard-SQL hatte sender_id als NOT NULL (Admin/Bot braucht NULL)
alter table public.support_messages
    alter column sender_id drop not null;

-- Bestehende Nutzer-Nachrichten aus älterem Schema markieren
update public.support_messages
set sender_type = 'user'
where sender_type is null;

-- Constraints nur setzen, wenn noch nicht vorhanden
do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'support_tickets_status_check'
          and conrelid = 'public.support_tickets'::regclass
    ) then
        alter table public.support_tickets
            add constraint support_tickets_status_check
            check (status in ('open', 'answered', 'resolved'));
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'support_messages_sender_type_check'
          and conrelid = 'public.support_messages'::regclass
    ) then
        alter table public.support_messages
            add constraint support_messages_sender_type_check
            check (sender_type in ('user', 'admin', 'system'));
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'support_messages_user_sender_check'
          and conrelid = 'public.support_messages'::regclass
    ) then
        alter table public.support_messages
            add constraint support_messages_user_sender_check
            check (
                (sender_type = 'user' and sender_id is not null)
                or (sender_type in ('admin', 'system') and sender_id is null)
            );
    end if;
end $$;

create unique index if not exists support_messages_matrix_event_id_idx
    on public.support_messages (matrix_event_id)
    where matrix_event_id is not null;

create index if not exists idx_support_messages_ticket_created
    on public.support_messages (ticket_id, created_at asc);

create index if not exists idx_support_tickets_user_created
    on public.support_tickets (user_id, created_at desc);

alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;

drop policy if exists "Users can handle own tickets" on public.support_tickets;
drop policy if exists "Users can view own tickets" on public.support_tickets;
drop policy if exists "Users can create own tickets" on public.support_tickets;

create policy "Users can view own tickets"
    on public.support_tickets
    for select
    using (auth.uid() = user_id);

create policy "Users can create own tickets"
    on public.support_tickets
    for insert
    with check (auth.uid() = user_id);

drop policy if exists "Users can handle own messages" on public.support_messages;
drop policy if exists "Users can view messages of own tickets" on public.support_messages;
drop policy if exists "Users can send messages to own tickets" on public.support_messages;

create policy "Users can view messages of own tickets"
    on public.support_messages
    for select
    using (
        exists (
            select 1
            from public.support_tickets t
            where t.id = support_messages.ticket_id
              and t.user_id = auth.uid()
        )
    );

create policy "Users can send messages to own tickets"
    on public.support_messages
    for insert
    with check (
        sender_type = 'user'
        and sender_id = auth.uid()
        and exists (
            select 1
            from public.support_tickets t
            where t.id = ticket_id
              and t.user_id = auth.uid()
        )
    );

create or replace function public.touch_support_ticket_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.support_tickets
    set updated_at = now()
    where id = new.ticket_id;

    return new;
end;
$$;

drop trigger if exists support_messages_touch_ticket on public.support_messages;

create trigger support_messages_touch_ticket
    after insert on public.support_messages
    for each row
    execute function public.touch_support_ticket_updated_at();
