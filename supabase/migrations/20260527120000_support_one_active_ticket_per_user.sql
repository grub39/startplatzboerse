-- Pro Nutzer höchstens ein offenes Support-Ticket (verhindert doppelte Matrix-Räume)

create unique index if not exists support_tickets_one_active_per_user_idx
    on public.support_tickets (user_id)
    where status in ('open', 'answered');
