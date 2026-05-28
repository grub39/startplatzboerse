-- Höhenmeter als filterbare Spalten (Trail); Distanz bleibt in distance_km.
alter table public.listings
  add column if not exists elevation_gain_m numeric,
  add column if not exists elevation_loss_m numeric;

comment on column public.listings.elevation_gain_m is
  'Höhenmeter Aufstieg (v. a. Trail), filterbar neben distance_km.';

comment on column public.listings.elevation_loss_m is
  'Höhenmeter Abstieg (Trail), optional.';
