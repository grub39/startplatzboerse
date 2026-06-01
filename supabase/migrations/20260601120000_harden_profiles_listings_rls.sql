-- DSGVO-kritisch: PII-Leak über PostgREST (profiles.registered_email, listings.seller_email/vorname/nachname)
-- Responsible Disclosure 2026-06-01
--
-- Strategie:
-- 1) RLS für Zeilen-Zugriff
-- 2) Spalten-Rechte: sensible Felder für anon/authenticated nicht lesbar
-- 3) Öffentliche Profil-Vorschau über View (nickname, avatar)

-- =============================================================================
-- PROFILES
-- =============================================================================

-- security_invoker = false (Default): View läuft mit Owner-Rechten, damit anon die View lesen kann
-- ohne direkten Zugriff auf die profiles-Tabelle.
create or replace view public.profiles_public
with (security_invoker = false) as
select
    id,
    nickname,
    avatar_url,
    updated_at
from public.profiles;

grant select on public.profiles_public to anon, authenticated;

alter table public.profiles enable row level security;

drop policy if exists "Public profiles are viewable by everyone" on public.profiles;
drop policy if exists "Profiles are publicly readable" on public.profiles;
drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Users can upsert own profile" on public.profiles;

-- Nur eigene Zeile lesbar — sensible Spalten (registered_email, first_name, …) nie für fremde Profile
create policy "Users can read own profile"
    on public.profiles
    for select
    to authenticated
    using (auth.uid() = id);

create policy "Users can insert own profile"
    on public.profiles
    for insert
    to authenticated
    with check (auth.uid() = id);

create policy "Users can update own profile"
    on public.profiles
    for update
    to authenticated
    using (auth.uid() = id)
    with check (auth.uid() = id);

revoke all on table public.profiles from anon;
revoke all on table public.profiles from authenticated;

-- Kein direkter anon-Zugriff auf profiles — öffentliche Anzeige über profiles_public
grant select (
    id,
    nickname,
    first_name,
    last_name,
    registered_email,
    avatar_url,
    updated_at,
    has_completed_onboarding,
    push_new_messages
) on table public.profiles to authenticated;

grant insert (
    id,
    nickname,
    first_name,
    last_name,
    registered_email,
    has_completed_onboarding,
    updated_at,
    avatar_url
) on table public.profiles to authenticated;

grant update (
    nickname,
    first_name,
    last_name,
    registered_email,
    has_completed_onboarding,
    updated_at,
    avatar_url,
    push_new_messages
) on table public.profiles to authenticated;

-- =============================================================================
-- LISTINGS
-- =============================================================================

alter table public.listings enable row level security;

drop policy if exists "Public read active listings" on public.listings;
drop policy if exists "Users can read own listings" on public.listings;
drop policy if exists "Users can insert own listings" on public.listings;
drop policy if exists "Users can update own listings" on public.listings;
drop policy if exists "Users can delete own listings" on public.listings;
drop policy if exists "Listings are publicly readable" on public.listings;

create policy "Public read active approved listings"
    on public.listings
    for select
    to anon, authenticated
    using (approved is true and status = 'active');

create policy "Owners read own listings"
    on public.listings
    for select
    to authenticated
    using (auth.uid() = user_id);

create policy "Owners insert own listings"
    on public.listings
    for insert
    to authenticated
    with check (auth.uid() = user_id);

create policy "Owners update own listings"
    on public.listings
    for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create policy "Owners delete own listings"
    on public.listings
    for delete
    to authenticated
    using (auth.uid() = user_id);

revoke all on table public.listings from anon, authenticated;

-- Öffentliche Felder (ohne seller_email, vorname, nachname, street)
grant select (
    id,
    user_id,
    category,
    event_name,
    description,
    distance,
    distance_km,
    elevation_gain_m,
    elevation_loss_m,
    swim_dist,
    bike_dist,
    run_dist,
    event_date,
    event_url,
    plz,
    location,
    lat,
    lng,
    price,
    price_type,
    old_price,
    approved,
    status,
    created_at,
    listing_meta
) on table public.listings to anon, authenticated;

grant insert (
    user_id,
    seller_email,
    vorname,
    nachname,
    category,
    event_name,
    description,
    distance,
    distance_km,
    elevation_gain_m,
    elevation_loss_m,
    swim_dist,
    bike_dist,
    run_dist,
    event_date,
    street,
    event_url,
    plz,
    location,
    lat,
    lng,
    price,
    price_type,
    approved,
    status,
    listing_meta
) on table public.listings to authenticated;

grant update (
    price,
    price_type,
    description,
    street,
    plz,
    location,
    event_url,
    old_price,
    status,
    lat,
    lng
) on table public.listings to authenticated;

grant delete on table public.listings to authenticated;

-- =============================================================================
-- CONVERSATIONS + MESSAGES (Vorsorge — nicht vom Reporter geprüft, aber analog kritisch)
-- =============================================================================

alter table if exists public.conversations enable row level security;

drop policy if exists "Participants can read conversations" on public.conversations;
drop policy if exists "Buyers can create conversations" on public.conversations;
drop policy if exists "Participants can update conversations" on public.conversations;

create policy "Participants can read conversations"
    on public.conversations
    for select
    to authenticated
    using (auth.uid() = buyer_id or auth.uid() = seller_id);

create policy "Buyers can create conversations"
    on public.conversations
    for insert
    to authenticated
    with check (auth.uid() = buyer_id);

create policy "Participants can update conversations"
    on public.conversations
    for update
    to authenticated
    using (auth.uid() = buyer_id or auth.uid() = seller_id);

alter table if exists public.messages enable row level security;

drop policy if exists "Participants can read messages" on public.messages;
drop policy if exists "Participants can send messages" on public.messages;
drop policy if exists "Participants can mark messages read" on public.messages;

create policy "Participants can read messages"
    on public.messages
    for select
    to authenticated
    using (
        exists (
            select 1
            from public.conversations c
            where c.id = messages.conversation_id
              and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
        )
    );

create policy "Participants can send messages"
    on public.messages
    for insert
    to authenticated
    with check (
        sender_id = auth.uid()
        and exists (
            select 1
            from public.conversations c
            where c.id = conversation_id
              and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
        )
    );

create policy "Participants can mark messages read"
    on public.messages
    for update
    to authenticated
    using (
        exists (
            select 1
            from public.conversations c
            where c.id = messages.conversation_id
              and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
        )
    );

-- =============================================================================
-- DEVICE TOKENS
-- =============================================================================

alter table if exists public.device_tokens enable row level security;

drop policy if exists "Users manage own device tokens" on public.device_tokens;

create policy "Users manage own device tokens"
    on public.device_tokens
    for all
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
