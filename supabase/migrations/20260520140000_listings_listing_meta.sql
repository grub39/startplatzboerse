-- Strukturierte Zusatzdaten für Laufen Ultra / Trail (Filter, Detail, Edit).
alter table public.listings
  add column if not exists listing_meta jsonb not null default '{}'::jsonb;

comment on column public.listings.listing_meta is
  'Sport-spezifische Details, z. B. run.ultra oder run.trail für Laufen.';

create index if not exists listings_listing_meta_gin
  on public.listings using gin (listing_meta);
