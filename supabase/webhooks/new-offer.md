# Database-Webhook: new-offer

Sendet eine Notification-Mail an den Buyer (Tender-Owner) wenn ein Dealer ein Angebot abgibt.

## Konfiguration im Supabase Dashboard

**Database → Webhooks → Create a new webhook:**

| Feld | Wert |
|---|---|
| Name | `new-offer` |
| Table | `offers` |
| Events | ✅ Insert **und** ✅ Update (beide aktivieren) |
| Type of webhook | `HTTP Request` |
| Method | `POST` |
| URL | `https://app.profleet.de/api/email/triggers/new-offer` |
| Timeout (sec) | `5` |

**HTTP Headers:**

| Header | Value |
|---|---|
| `Content-Type` | `application/json` |
| `Authorization` | `Bearer <EMAIL_WEBHOOK_SECRET>` |

## Warum INSERT *und* UPDATE?

Ein Dealer kann ein Offer als `draft` anlegen und später publishen:

- **INSERT mit `status='active'`** → direkter Publish, sofort Mail
- **INSERT mit `status='draft'`** → keine Mail (Filter im Code blockt)
- **UPDATE von `status='draft'` → `'active'`** → Publish-Flip, jetzt Mail

Ein einzelner Trigger mit INSERT-only würde den zweiten Fall verpassen.

## Endpoint-Logik

[src/app/api/email/triggers/new-offer/route.ts](../../src/app/api/email/triggers/new-offer/route.ts):

1. Bearer-Token validieren
2. Payload-Filter: `table=offers`, plus:
   - INSERT mit `record.status === 'active'`, **oder**
   - UPDATE mit `old_record.status !== 'active' && record.status === 'active'`
3. `tender` per `offer.tender_id` laden → `buyer_id`
4. Profile + auth.users für Buyer laden, Profile für Dealer laden
5. Tender-Vehicle laden (falls vorhanden) für Brand+Modell-Label
6. Optional `total_price` als EUR formatieren
7. Mail via Resend mit `NewOfferEmail`-Template, Link auf `/dashboard/eingang/<tender_id>/angebot`

## Payload-Format

```json
{
  "type": "INSERT" | "UPDATE",
  "table": "offers",
  "schema": "public",
  "record": {
    "id": "uuid",
    "tender_id": "uuid",
    "tender_vehicle_id": "uuid|null",
    "dealer_id": "uuid",
    "status": "active",
    "total_price": 24890.00,
    ...
  },
  "old_record": { ... | null }
}
```

## Lokaler Test

```powershell
$body = @{
  type   = "INSERT"
  table  = "offers"
  schema = "public"
  record = @{
    id                = "00000000-0000-0000-0000-000000000001"
    tender_id         = "ECHTE-TENDER-UUID"
    tender_vehicle_id = $null
    dealer_id         = "ECHTE-DEALER-UUID"
    status            = "active"
    total_price       = 24890.00
  }
  old_record = $null
} | ConvertTo-Json -Depth 3

Invoke-RestMethod -Uri "https://app.profleet.de/api/email/triggers/new-offer" -Method Post `
  -Headers @{
    "Authorization" = "Bearer DEIN_EMAIL_WEBHOOK_SECRET"
    "Content-Type"  = "application/json"
  } `
  -Body $body
```

Erwartete Antworten:

| Stand | Antwort |
|---|---|
| Echte UUIDs, Buyer ist nachfrager | 200 `{sent: true, messageId: "...", to: "..."}` |
| `status: "draft"` | 200 `{skipped: "offer not active"}` |
| Falsche `tender_id` | 404 `Tender not found` |
| Buyer ist `anbieter` (z.B. Dealer auf eigene Tender) | 200 `{skipped: "buyer is not nachfrager"}` |

## Production-Test

```sql
-- Im Supabase SQL Editor — Test als Dealer mit echtem Tender:
INSERT INTO public.offers (tender_id, tender_vehicle_id, dealer_id, status, total_price)
VALUES (
  'ECHTE-TENDER-UUID',
  'ECHTE-TENDER-VEHICLE-UUID',
  'DEINE-DEALER-USER-UUID',
  'active',
  24890.00
);
```

Erwartet:
- Resend Logs zeigen Send-Event an Buyer
- Buyer-Inbox bekommt branded Mail mit Dealer-Name + Fahrzeug + Preis + "Angebot ansehen"-Button → `/dashboard/eingang/<tender_id>/angebot`

## Idempotenz / Mehrfach-Sends

Wenn ein Dealer eine bereits aktive Offer nochmal speichert (z.B. Preis ändert), feuert der Webhook nicht mehr — der Filter (`old_record.status !== 'active' && record.status === 'active'`) blockt. Wenn aber `status` von active → draft → active gewechselt wird, gibt's eine zweite Mail. Phase F dedupliziert via `email_log`-Tabelle, hier aktuell akzeptierte Limitation.
