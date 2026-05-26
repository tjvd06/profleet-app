# Phase G Setup: Per-Type Opt-Out, Tender-Matching, Unsubscribe-Flow

Phase G erweitert das Email-System um drei Bausteine:

1. **`notification_settings` JSONB** in `profiles` — User können per-Type opt-out
2. **Settings-UI** unter `/dashboard/profil/benachrichtigungen`
3. **Marken-getargetete Tender-Notification** für Händler
4. **Unsubscribe-Flow** mit JWT-Token (auch ohne Login funktioniert)

## Schritt 1 — Migration ausführen

Supabase Dashboard → **SQL Editor** → Inhalt von [supabase/migrations/0002_notification_preferences.sql](../supabase/migrations/0002_notification_preferences.sql) reinkopieren → Run.

```sql
-- profiles.notification_settings JSONB mit Defaults
alter table public.profiles
  add column if not exists notification_settings jsonb not null default '{
    "new_message": true,
    "new_offer": true,
    "new_tender_matching": true,
    "review_received": true,
    "billing": true
  }'::jsonb;

-- GIN-Index für brands (Tender-Matching-Performance)
create index if not exists idx_profiles_brands_gin
  on public.profiles using gin (brands);
```

Verifikation:
```sql
select notification_settings from public.profiles limit 3;
-- Erwartet: JSONB mit allen 5 Keys = true

select indexname from pg_indexes
where tablename = 'profiles' and indexname = 'idx_profiles_brands_gin';
-- Erwartet: 1 row
```

## Schritt 2 — `EMAIL_TOKEN_SECRET` generieren

Wie das EMAIL_WEBHOOK_SECRET: 64 Hex-Zeichen aus crypto-randomBytes.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Den Wert in Coolify-Env-Variables hinterlegen als `EMAIL_TOKEN_SECRET` → Speichern → **Redeploy**.

**Achtung:** Dieser Secret darf sich nie ändern, sobald Mails mit Unsubscribe-Links rausgegangen sind — sonst werden alle bisher generierten Tokens ungültig. (Zeit-begrenzt sind sie eh: 30 Tage TTL.)

## Schritt 3 — Database-Webhook für Tender-Matching anlegen

Supabase Dashboard → **Database → Webhooks → Create**:

| Feld | Wert |
|---|---|
| Name | `new-tender-matching` |
| Table | `tenders` |
| Events | ☑ Insert ☑ Update |
| URL | `https://app.profleet.de/api/email/triggers/new-tender-matching` |
| Header `Authorization` | `Bearer <EMAIL_WEBHOOK_SECRET>` (gleicher wie für die anderen) |
| Timeout | 10s |

Details: [supabase/webhooks/new-tender-matching.md](../supabase/webhooks/new-tender-matching.md).

## Schritt 4 — Commit + Push

```powershell
cd c:\Projekte\profleet-app
git add supabase src/emails src/app src/lib package.json package-lock.json .env.example docs
git commit -m "feat: phase G — per-type opt-out, settings UI, tender-matching, unsubscribe"
git push
```

## Tests

### Test A: Settings-UI funktioniert

1. Eingeloggt: `https://app.profleet.de/dashboard/profil/benachrichtigungen` öffnen
2. Toggles je nach Rolle (Nachfrager / Anbieter / Beide)
3. "Alle E-Mail-Benachrichtigungen" Master-Schalter ausschalten → andere Toggles werden gedimmt
4. Einen Toggle umstellen → Speichern → Toast "Aktualisiert"
5. SQL-Check:
   ```sql
   select email_notifications, notification_settings
   from public.profiles where id = 'DEINE-UUID';
   ```

### Test B: Per-Type Opt-Out wirkt im Send

1. Toggle `new_message` auf OFF, Speichern
2. Als Buyer in Konversation eine Nachricht schreiben (anderer User schickt sie zurück)
3. Erwartet: keine Mail kommt an (Coolify Logs: `{skipped: "recipient opted out..."}`)
4. Toggle wieder auf ON → nächste Nachricht: Mail kommt wie gewohnt

### Test C: Tender-Matching

1. Ein anbieter-Profil mit z.B. `brands = ['VW', 'Audi']` haben (im Profil → Marken setzen)
2. Eine neue Ausschreibung erstellen als Nachfrager mit Vehicle `brand='VW'`
3. Status auf `active` setzen (im UI veröffentlichen oder via SQL):
   ```sql
   update public.tenders set status = 'active' where id = 'TENDER-UUID';
   ```
4. Erwartet: der Test-Händler bekommt Mail "Neue Ausschreibung passt zu Ihren Marken"
5. Coolify Logs: `[email/triggers/new-tender-matching]` mit Response `{sent: N, ...}`

### Test D: Unsubscribe-Link aus Mail

1. Email öffnen (z.B. die Tender-Matching-Mail)
2. Im Footer "Mit einem Klick abmelden" klicken
3. Landest auf `app.profleet.de/unsubscribe?token=...`
4. Token wird verifiziert, `notification_settings.<type> = false` gesetzt
5. Confirmation-Page erscheint mit Link zu den Settings
6. SQL-Check: `notification_settings.<type>` ist jetzt `false`

### Test E: Token-Expiry

Tokens sind 30 Tage gültig. Ein abgelaufener oder verfälschter Token landet auf der Error-Page ("Abmeldung nicht möglich").

## Was Phase G nicht macht

- **Kein Re-Subscribe-Flow per Email** — wer einmal opted-out ist, kann sich nur via Settings-UI wieder einschalten (Login nötig). Das ist DSGVO-konform und schützt vor "ungewollten Re-Subscribes".
- **Kein Resubscribe-Confirmation** — wenn ein User in der UI einen Toggle wieder einschaltet, gibt's keine zusätzliche "Bist du sicher?"-Confirmation. Bei Bedarf später hinzufügen.
- **Keine Marken-Match-Throttle** — wenn ein Tender editiert und re-publishiert wird, gibt's eine zweite Mail. Wenn das nervt: in tender-matching-Endpoint einen 24h-Throttle pro (dealer, tender) ergänzen.
- **Keine Notification-Settings-Page Navigation** — die Page existiert unter `/dashboard/profil/benachrichtigungen`, aber falls noch kein Link im Profil-Dashboard auf sie zeigt: in `src/app/(main)/dashboard/profil/page.tsx` einen Tab/Link hinzufügen oder via DashboardSidebar erreichbar machen.

## Status nach Phase G

| Phase | Status |
|---|---|
| A — Resend DNS | ✅ Live |
| B — Supabase Auth via Resend | ✅ Live |
| C — Template-Infrastruktur | ✅ Live |
| D — Approval-Welcome | ✅ Live |
| E — Neue Nachricht + Neues Offer | ✅ Live |
| F — email_log + Throttle + Bounces | ✅ Live |
| **G — Settings UI + Tender-Matching + Unsubscribe** | ✅ Code ready, Migration + Webhook + Env-Var |
| H — Brevo Newsletter | offen |
