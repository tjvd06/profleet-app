# Database-Webhook: notify-approval

Triggert beim Flip von `profiles.is_active` von `false` auf `true` die Approval-Welcome-Mail.

## Konfiguration im Supabase Dashboard

**Database → Webhooks → Create a new webhook:**

| Feld | Wert |
|---|---|
| Name | `notify-approval` |
| Table | `profiles` |
| Events | ✅ Update (nur Update, nicht Insert/Delete) |
| Type of webhook | `HTTP Request` |
| Method | `POST` |
| URL | `https://app.profleet.de/api/email/triggers/approval` |
| Timeout (sec) | `5` |

**HTTP Headers:**

| Header | Value |
|---|---|
| `Content-Type` | `application/json` |
| `Authorization` | `Bearer <EMAIL_WEBHOOK_SECRET>` |

`<EMAIL_WEBHOOK_SECRET>` ist der Wert aus Coolify-Env (siehe [docs/cutover-checklist.md](../../docs/cutover-checklist.md), Schritt "Webhook-Secret generieren").

**Filter / Conditions:** Supabase Database-Webhooks haben keine native Payload-Filter — der Webhook feuert auf jedes UPDATE der `profiles`-Tabelle. Die Endpoint-Logik in [src/app/api/email/triggers/approval/route.ts](../../src/app/api/email/triggers/approval/route.ts) filtert dann auf `old_record.is_active === false && record.is_active === true`. Andere Updates werden mit 200 `{skipped: ...}` quittiert.

## Payload-Format (Supabase liefert)

```json
{
  "type": "UPDATE",
  "table": "profiles",
  "schema": "public",
  "record": {
    "id": "uuid",
    "first_name": "Max",
    "is_active": true,
    ...
  },
  "old_record": {
    "id": "uuid",
    "first_name": "Max",
    "is_active": false,
    ...
  }
}
```

## Lokaler Test (vor Phase A Cutover, ohne Resend)

```bash
curl -X POST http://localhost:3000/api/email/triggers/approval \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-secret-123" \
  -d '{
    "type": "UPDATE",
    "table": "profiles",
    "schema": "public",
    "record":     {"id":"00000000-0000-0000-0000-000000000001","first_name":"Max","is_active":true},
    "old_record": {"id":"00000000-0000-0000-0000-000000000001","first_name":"Max","is_active":false}
  }'
```

Mit `EMAIL_WEBHOOK_SECRET=test-secret-123` in `.env.local`. Erwartete Antworten je nach Setup-Stand:

| Stand | Antwort |
|---|---|
| Ohne `EMAIL_WEBHOOK_SECRET` | 500 `EMAIL_WEBHOOK_SECRET not configured` |
| Mit falschem Bearer-Token | 401 `Invalid or missing webhook secret` |
| Mit richtigem Token, aber User-ID existiert nicht in auth.users | 404 `User not found or has no email` |
| Mit richtigem Token + echtem User, aber `RESEND_API_KEY` fehlt | 500 `Send failed: RESEND_API_KEY is not set` |
| Mit allem live | 200 `{sent: true, messageId: "...", to: "..."}` |

## Test mit echtem User (nach Cutover)

```sql
-- Im Supabase SQL Editor, einen Test-User entdeaktivieren und reaktivieren:
UPDATE profiles SET is_active = false WHERE id = '<test-user-id>';
-- Kurz warten, dann:
UPDATE profiles SET is_active = true  WHERE id = '<test-user-id>';
```

Der zweite UPDATE feuert den Webhook. Im Resend Dashboard → Logs sollte unter `to=<email-of-test-user>` ein `Delivered` Event erscheinen.

## Retry-Verhalten

Supabase retried Webhooks bei 5xx-Responses (3 Versuche, exponentielles Backoff). Bei 4xx-Responses **kein** Retry — was Sinn ergibt: bei falschem Secret oder fehlendem User würde ein Retry nichts ändern. Bei 200 (auch `{skipped: ...}`) kein Retry.

Für Phase F ist geplant: `email_log`-Tabelle mit `dedup_key`, so dass mehrfaches Feuern (z.B. bei Supabase-Retry nach transientem Resend-Fehler) keine Mehrfach-Mails produziert.
