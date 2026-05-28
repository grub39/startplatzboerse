alter table public.listings
add column if not exists price_type text not null default 'fixed';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'listings_price_type_check'
  ) then
    alter table public.listings
      add constraint listings_price_type_check
      check (price_type in ('fixed', 'vb'));
  end if;
end
$$;

comment on column public.listings.price_type is
  'Preisart: fixed = Festpreis, vb = Verhandlungsbasis';
