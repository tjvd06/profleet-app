# Database-Webhook: new-message

Sendet eine Notification-Mail an den Empfänger einer neuen Nachricht (= das andere Mitglied des `contact`-Threads).

## Konfiguration im Supabase Dashboard

**Database → Webhooks → Create a new webhook:**

| Feld | Wert |
|---|---|
| Name | `new-message` |
| Table | `messages` |
| Events | ✅ Insert (nur Insert) |
| Type of webhook | `HTTP Request` |
| Method | `POST` |
| URL | `https://app.profleet.de/api/email/triggers/new-message` |
| Timeout (sec) | `5` |

**HTTP Headers:**

| Header | Value |
|---|---|
| `Content-Type` | `application/json` |
| `Authorization` | `Bearer <EMAIL_WEBHOOK_SECRET>` |

(Gleicher Secret wie für `notify-approval` — eine einheitliche Coolify-Env-Var, geteilt über alle Email-Webhooks.)

## Endpoint-Logik

[src/app/api/email/triggers/new-message/route.ts](../../src/app/api/email/triggers/new-message/route.ts) macht:

1. Bearer-Token validieren
2. Payload-Filter: `type=INSERT`, `table=messages`
3. `contact` per `message.contact_id` laden (service-role) → `buyer_id` + `dealer_id`
4. Empfänger bestimmen: `sender_id == buyer_id ? dealer_id : buyer_id`
5. Empfänger-Email aus `auth.users` + `first_name` aus `profiles` laden
6. Sender-Anzeigename aus `profiles` (company_name → first+last_name → Fallback)
7. Nachricht auf 200 Zeichen kürzen für Preview
8. Mail via Resend mit `NewMessageEmail`-Template, Link auf `/dashboard/nachrichten?contact=<id>`

## Payload-Format (Supabase liefert)

```json
{
  "type": "INSERT",
  "table": "messages",
  "schema": "public",
  "record": {
    "id": "uuid",
    "contact_id": "uuid",
    "sender_id": "uuid",
    "content": "Guten Tag, ...",
    "read": false,
    "created_at": "..."
  },
  "old_record": null
}
```

## Lokaler Test (vor Live-Deploy)

```powershell
$body = @{
  type   = "INSERT"
  table  = "messages"
  schema = "public"
  record = @{
    id         = "00000000-0000-0000-0000-000000000001"
    contact_id = "ECHTE-CONTACT-UUID"
    sender_id  = "ECHTE-SENDER-UUID"
    content    = "Hallo, das ist ein Test."
  }
  old_record = $null
} | ConvertTo-Json -Depth 3

Invoke-RestMethod -Uri "https://app.profleet.de/api/email/triggers/new-message" -Method Post `
  -Headers @{
    "Authorization" = "Bearer DEIN_EMAIL_WEBHOOK_SECRET"
    "Content-Type"  = "application/json"
  } `
  -Body $body
```

Erwartete Antworten:

| Stand | Antwort |
|---|---|
| Mit echten UUIDs (Contact + Sender existieren) | 200 `{sent: true, messageId: "...", to: "..."}` |
| Falsche `contact_id` | 404 `Contact not found` |
| `sender_id` == Empfänger (self-message) | 200 `{skipped: "sender and recipient identical"}` |
| Empfänger hat kein auth.users-Mapping | 404 `Recipient not found or has no email` |

## Production-Test mit echter SQL-Aktion

```sql
-- Im Supabase SQL Editor mit einem echten Contact, in dem du eine der beiden Parteien bist:
INSERT INTO public.messages (contact_id, sender_id, content)
VALUES ('CONTACT-UUID', 'DEINE-USER-UUID', 'Test-Nachricht für E-Mail-Trigger');
```

Erwartet:
- Resend Logs zeigen neuen Send-Event an die Email des anderen Contact-Members
- Empfänger-Inbox bekommt branded Mail mit Sender-Name + Preview + "Zur Konversation"-Button

## Throttling (Phase F)

Aktuell schickt der Endpoint **jede** Message → eine Mail. Bei vielen Nachrichten in kurzer Zeit wird der Empfänger gespammt. Phase F adressiert das mit:

- `email_log`-Tabelle mit Throttle-Check: max 1× pro Stunde pro `(recipient_id, contact_id)`
- Spätere Messages innerhalb der Stunde silent skippen, bei der nächsten nicht-gethrottelten wieder senden

Bis Phase F live ist: bewusste Limitation in Kauf nehmen oder Webhook temporär deaktivieren wenn ein Test-User in einer Schleife schreibt.
