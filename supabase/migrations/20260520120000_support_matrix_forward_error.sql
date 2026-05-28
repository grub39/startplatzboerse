-- Fehler der Matrix-Weiterleitung in der DB sichtbar machen (Debugging in SQL Editor).

alter table public.support_messages
  add column if not exists matrix_forward_error text;

comment on column public.support_messages.matrix_forward_error is
  'Letzter Fehler von support-notify-matrix; NULL = kein Fehler protokolliert.';
