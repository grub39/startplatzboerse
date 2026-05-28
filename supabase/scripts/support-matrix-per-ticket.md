# Support-Chat ↔ Matrix / Messtory

Angelehnt an Systory `pages/hilfe.php` (Messtory-Bot, CS-API, ein Raum pro Ticket).

## Ablauf

1. Nutzer startet Support-Chat → `support_tickets`.
2. Erste Nutzer-Nachricht → `support-notify-matrix`.
3. Function legt Matrix-Raum an (`createRoom` + Alias + Invite) → `matrix_room_id`.
4. Nachricht mit `io.systory.side: user` (wie hilfe.php `chat_send`).
5. Team antwortet in Element im Ticket-Raum.
6. Cron → `support-matrix-inbound` importiert nur **Support**-Seite (kein `user`-Side, kein Bot-Outbound).

## Supabase Secrets (Messtory / Systory-Namen möglich)

| Secret | Alternativ | Pflicht | Beschreibung |
|--------|------------|---------|--------------|
| `MATRIX_HOMESERVER` | `MATRIX_SERVER_URL` | ja | Messtory-Homeserver-URL |
| `MATRIX_ADMIN_TOKEN` | — | **ja für Räume** | Wie in Systory `hilfe.php` — darf `createRoom` |
| `MATRIX_BOT_ACCESS_TOKEN` | — | ja | Bot zum Senden (kann ohne Admin sein) |
| `MATRIX_SUPPORT_INVITE_IDS` | `MATRIX_SUPPORTER_MXID` | empfohlen | `@supporter:messtory…` (kommagetrennt) |

**Hinweis:** Auf Messtory dürfen oft **normale Nutzer** in Element Räume anlegen; der **Bot-Account** (`@…-bot-…`) ist davon getrennt und braucht für `createRoom` den **Admin-Token** aus `hilfe.php`.
| `MATRIX_NOTIFY_ROOM_ID` | — | nein | Optional: Team-Inbox „Neuer Chat“ (wie Mailtory) |

`MATRIX_SUPPORT_ROOM_ID` (alter Sammelraum) wird **nicht** mehr verwendet.

## Raum-Erstellung (wie hilfe.php)

- `room_alias_name`: `support_spb_{ticketId}`
- `preset`: `private_chat`, `join_rule`: `invite`
- Supporter werden per **`/invite`** eingeladen (nicht nur beim createRoom)
- Optional Benachrichtigung in `MATRIX_NOTIFY_ROOM_ID`

## Deploy

```bash
npx supabase functions deploy support-notify-matrix --project-ref pwestdrlibkbfkwgqkup
npx supabase functions deploy support-matrix-inbound --project-ref pwestdrlibkbfkwgqkup
```

## Bot (Messtory)

- Token muss **Server-Admin** sein (wie `MATRIX_ADMIN_TOKEN` in Systory `hilfe.php`)
- Ohne Admin: `M_FORBIDDEN: Raum- und Space-Erstellung ist nur Administratoren erlaubt`
- Rechte: `createRoom`, Räume betreten, Nachrichten senden, User einladen
- Räume **ohne E2EE** (sonst kein Import in die App)

### Diagnose (Supabase)

```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/support-matrix-diagnose" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "apikey: $ANON_KEY" | jq
```

`createRoomTest.ok` muss `true` sein.

## Diagnose

```bash
curl -s "$SUPABASE_URL/functions/v1/support-matrix-inbound" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" | jq
```
