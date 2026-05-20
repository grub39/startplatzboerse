-- Deduplizierung: jede Support-Nachricht löst höchstens einen Push aus

alter table public.support_messages
  add column if not exists push_notified_at timestamptz;

comment on column public.support_messages.push_notified_at is
  'Zeitpunkt des Expo-Push-Versands (verhindert Doppel-Pushes).';
