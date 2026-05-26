# Phase F Setup: Throttling, Bounce-Handling, Opt-Out

Phase F bringt drei Bausteine:

1. **Migration** — `email_log` Tabelle + `profiles.email_status` + `profiles.email_notifications`
2. **Throttle + Reachable Helpers** — Trigger-Endpoints prüfen vor jedem Send ob der User opted-out / bounced ist und ob in der letzten Stunde schon eine ähnliche Mail rausging
3. **Resend Webhook** — Empfängt Delivery / Bounce / Complaint / Open / Click Events, schreibt sie ins `email_log` und flippt `profiles.email_status` bei Bounce/Complaint

## Schritt 1 — Migration ausführen

Supabase Dashboard → **SQL Editor** → kompletten Inhalt von [supabase/migrations/0001_email_phase_f.sql](../supabase/migrations/0001_email_phase_f.sql) reinkopieren → Run.

Idempotent: `add column if not exists`, `create table if not exists`, `create index if not exists`. Mehrfach ausführen ist safe.

**Verifikation:**

```sql
-- Spalten da?
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
  and column_name in ('email_notifications', 'email_status')
order by column_name;

-- Tabelle da?
select count(*) from public.email_log;
-- Erwartet: 0 (gleich leer, aber Tabelle existiert)
```

## Schritt 2 — Throttling-Verhalten

Die drei Trigger-Endpoints prüfen jetzt **vor jedem Send**:

| Endpoint | Reachable-Check? | Throttle | Throttle-Key |
|---|---|---|---|
| `approval-welcome` | Nein (transaktional, einmalig) | Nein | — |
| `new-message` | Ja | 60 Min | `(recipient, contact_id)` |
| `new-offer` | Ja | 15 Min | `(recipient, tender_id)` |

**Reachable-Check** = `profiles.email_notifications=true AND email_status='ok'`. Wenn ein User opted out (notifications=false) oder bounced/complained/unsubscribed ist, wird **kein** Send ausgelöst.

**Throttle-Lookup** = "Existiert in `email_log` ein `sent`/`delivered`-Row für genau diese template + meta-Kombination in den letzten N Minuten?"

Beide Helpers sind **fail-open** — bei DB-Fehlern werden Sends nicht blockiert (lieber eine Mail zu viel als kritische User-Kommunikation verlieren).

## Schritt 3 — Resend Webhook konfigurieren

Resend Dashboard → **Webhooks → Add Endpoint**:

| Feld | Wert |
|---|---|
| Endpoint URL | `https://app.profleet.de/api/webhooks/resend` |
| Events | ✅ `email.delivered`<br>✅ `email.bounced`<br>✅ `email.complained`<br>✅ `email.opened` *(optional)*<br>✅ `email.clicked` *(optional)*<br>✅ `email.delivery_delayed` *(optional)* |

Nach Speichern: **Signing Secret** kopieren (steht im Webhook-Detail, beginnt typischerweise mit `whsec_...`).

## Schritt 4 — Coolify Env-Variable

Coolify Dashboard → Application `profleet-app` → Environment Variables → **Add**:

```
RESEND_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxx
```

→ Speichern → **Redeploy** anstoßen.

## Schritt 5 — Test des Webhooks

Im Resend Dashboard → Webhooks → Endpoint öffnen → **Test** Button. Resend schickt ein synthetisches Event an deinen Endpoint.

Erwartet in Coolify-Logs (kein `console.error`-Eintrag = OK). Antwort vom Endpoint: 200 mit `{recorded: true, ...}` oder `{skipped: "no matching email_log row"}` (bei einem Test-Event ist die `email_id` natürlich nicht in unserer DB → korrekter skip).

## Schritt 6 — Echter Bounce-Test

Resend bietet eine **Test-Adresse** für simulierte Bounces. Schick eine Test-Mail an `bounced@resend.dev`:

```powershell
$body = @{
  from = "noreply@profleet.de"
  to   = "bounced@resend.dev"
  subject = "Bounce-Test"
  html = "<p>Test</p>"
} | ConvertTo-Json

Invoke-RestMethod -Uri "https://api.resend.com/emails" -Method Post `
  -Headers @{
    "Authorization" = "Bearer DEIN_RESEND_API_KEY"
    "Content-Type"  = "application/json"
  } -Body $body
```

Resend simuliert dann einen permanenten Bounce. Innerhalb ca. 1 Minute solltest du in deiner DB sehen:

```sql
-- Neuer Row mit status=bounced
select template, status, resend_message_id, meta, created_at
from public.email_log
order by created_at desc
limit 5;
```

Da der Bounce-Test direkt aus Resend rausgeht (nicht über unseren Trigger), existiert kein `sent`-Row mit der `resend_message_id` in unserer DB → Endpoint antwortet mit `{skipped: "no matching email_log row"}`. Das ist OK — nur Mails die wir selbst über unsere Trigger versendet haben werden ge-tracked.

Für einen **vollständigen Round-Trip-Test** brauchst du einen User in deiner DB, dessen Email tatsächlich bounced — z.B. ein Test-User mit `bounced@resend.dev` als Email:

```sql
-- Sicherheit: das nur in Dev/Staging, nicht in Production!
update auth.users set email = 'bounced@resend.dev'
where id = 'TEST-USER-UUID';

-- Approval-Mail triggern:
update public.profiles set is_active = false where id = 'TEST-USER-UUID';
update public.profiles set is_active = true  where id = 'TEST-USER-UUID';

-- 1-2 Min warten, dann:
select email_status from public.profiles where id = 'TEST-USER-UUID';
-- Erwartet: 'bounced'
```

## Throttle-Verhalten testen

Schick als Buyer **innerhalb von 60 Minuten** zwei Nachrichten in derselben Konversation an einen Händler. Erwartet:

- Erste Nachricht → Mail kommt an
- Zweite Nachricht → keine Mail (Coolify-Logs: `[email/triggers/new-message]` Response `{skipped: "throttled — recent send for this conversation"}`)
- Nach 60 Minuten: nächste Nachricht löst wieder Mail aus

Du kannst die Limits in [src/app/api/email/triggers/new-message/route.ts](../src/app/api/email/triggers/new-message/route.ts) und [new-offer/route.ts](../src/app/api/email/triggers/new-offer/route.ts) anpassen (Konstante `THROTTLE_WINDOW_MINUTES` am Datei-Anfang).

## Opt-Out-Verhalten testen

Manuell im SQL Editor:

```sql
update public.profiles set email_notifications = false
where id = 'TEST-USER-UUID';
```

Jetzt eine Nachricht an diesen User triggern → keine Mail (Logs: `{skipped: "recipient opted out ..."}`).

```sql
-- Rückgängig
update public.profiles set email_notifications = true
where id = 'TEST-USER-UUID';
```

Die UI fürs Toggling kommt in Phase G.

## Was Phase F nicht macht

- **Keine UI für Notification-Settings** — kommt in Phase G
- **Kein Re-Engagement-Flow für gebouncte User** — wer einmal `email_status='bounced'` ist, bleibt es. Re-Verifikation müsste manuell oder via Admin-Tool laufen.
- **Kein Aggregations-Digest** — geplante Idee aus Phase F war ein "tägliche Zusammenfassung statt 20 Einzel-Mails". Aktuell nur Throttle (= "skip duplicates innerhalb 15-60 Min"). Echtes Digest wäre ein zusätzlicher Cron-Job, der die geskippten Events sammelt und einmal pro Tag zustellt. Optional.

## Status nach Phase F

| Phase | Status |
|---|---|
| A — Resend DNS | ✅ Live |
| B — Supabase Auth via Resend | ✅ Live |
| C — Template-Infrastruktur | ✅ Live |
| D — Approval-Welcome | ✅ Live + jetzt logged |
| E — Neue Nachricht + Neues Offer | ✅ Live + jetzt mit Throttle/Reachable/Log |
| **F — email_log + Throttle + Resend-Bounce-Webhook** | ✅ Code ready, Migration ausführen + Resend Webhook konfigurieren |
| G — Notification-Settings UI + Tender-Matching + Unsubscribe | offen |
| H — Brevo Newsletter | offen |
