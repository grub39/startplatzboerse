-- Profilbilder: öffentlich lesbar, Upload nur für eingeloggte Nutzer

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Avatar images are publicly accessible" on storage.objects;
create policy "Avatar images are publicly accessible"
  on storage.objects
  for select
  to public
  using (bucket_id = 'avatars');

drop policy if exists "Authenticated users can upload avatars" on storage.objects;
create policy "Authenticated users can upload avatars"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'avatars');

drop policy if exists "Authenticated users can update avatars" on storage.objects;
create policy "Authenticated users can update avatars"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'avatars');

drop policy if exists "Authenticated users can delete avatars" on storage.objects;
create policy "Authenticated users can delete avatars"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'avatars');
