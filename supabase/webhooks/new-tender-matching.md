# Database-Webhook: new-tender-matching

Sendet eine Notification-Mail an alle Händler (Anbieter), deren `profiles.brands` mit den Marken der neu aktivierten Ausschreibung überlappen.

## Konfiguration im Supabase Dashboard

**Database → Webhooks → Create a new webhook:**

| Feld | Wert |
|---|---|
| Name | `new-tender-matching` |
| Table | `tenders` |
| Events | ☑ Insert **und** ☑ Update |
| Type of webhook | `HTTP Request` |
| Method | `POST` |
| URL | `https://app.profleet.de/api/email/triggers/new-tender-matching` |
| Timeout (sec) | `10` |

**HTTP Headers:**

| Header | Value |
|---|---|
| `Content-Type` | `application/json` |
| `Authorization` | `Bearer <EMAIL_WEBHOOK_SECRET>` |

Timeout ist auf **10s** gesetzt (höher als die anderen Webhooks), weil dieser Endpoint potenziell viele Empfänger anschreibt (1 Mail pro matchender Händler).

## Endpoint-Logik

[src/app/api/email/triggers/new-tender-matching/route.ts](../../src/app/api/email/triggers/new-tender-matching/route.ts):

1. Bearer-Token validieren
2. Payload-Filter: `table=tenders`, status flipped to/created as `active`
3. `tender_vehicles` für den Tender laden → Marken-Liste deduplizieren
4. Wenn keine Marken im Tender: skip
5. Kandidaten-Händler suchen via Supabase PostgREST `overlaps('brands', tenderBrands)` — nutzt den GIN-Index aus Migration 0002
6. Pro Kandidat: `shouldSendNotification(dealer_id, 'new_tender_matching')` prüfen — respektiert email_notifications + email_status + notification_settings
7. Pro berechtigten Händler: eigene Mail mit den passenden Marken+Modellen + Unsubscribe-Link via JWT-Token
8. Return: `{sent, failed, total_candidates}`

## Payload-Format

```json
{
  "type": "INSERT" | "UPDATE",
  "table": "tenders",
  "schema": "public",
  "record": { "id": "uuid", "buyer_id": "uuid", "status": "active", ... },
  "old_record": { ... | null }
}
```

## Production-Test

```sql
-- Mit echtem Tender, der mind. ein vehicle mit brand hat:
update public.tenders set status = 'draft' where id = 'TENDER-UUID';
update public.tenders set status = 'active' where id = 'TENDER-UUID';
```

Erwartet:
- Coolify-Logs: `[email/triggers/new-tender-matching]`-Zeilen für jeden Kandidaten
- Response: `{sent: <N>, failed: 0, total_candidates: <N>}`
- Resend Logs: ein Send-Event pro Händler
- email_log: ein Row pro Send mit `template='new-tender-matching'`, meta enthält `matched_brands`

## Mehrfach-Sends bei Edits

Wenn ein Tender später bearbeitet wird (neues Vehicle mit anderer Marke hinzu) und dann status wieder auf active flippt: wird der Webhook erneut feuern. Dann gehen **zweite Mails an Händler** raus, weil:

- Kein Throttle implementiert (anders als new-message + new-offer) — bewusst, weil neue Vehicles wirklich neue Information sind
- email_log dedup wäre möglich (skip wenn schon einmal an diesen Händler für diesen Tender gesendet), aber bisher nicht implementiert

Falls Mehrfach-Sends ein Problem werden: in [src/app/api/email/triggers/new-tender-matching/route.ts](../../src/app/api/email/triggers/new-tender-matching/route.ts) einen `isThrottled`-Check pro Händler hinzufügen, z.B. 24h-Window per `(dealer_id, tender_id)`.
