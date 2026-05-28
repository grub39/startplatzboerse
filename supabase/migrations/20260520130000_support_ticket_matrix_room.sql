-- Pro Support-Ticket ein eigener Matrix-Raum (Element).

alter table public.support_tickets
  add column if not exists matrix_room_id text;

comment on column public.support_tickets.matrix_room_id is
  'Matrix room id (!xxx:server) für dieses Ticket; wird vom Bot bei erster Nutzer-Nachricht angelegt.';

create index if not exists idx_support_tickets_matrix_room
  on public.support_tickets (matrix_room_id)
  where matrix_room_id is not null;
