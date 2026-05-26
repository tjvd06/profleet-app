# Cutover-Checkliste: DNS-Propagation fertig → Email-System live

Reihenfolge der Schritte, sobald Resend Domain-Verifikation alle 3 Records grün zeigt. Schätzdauer: 30 Min.

## Schritt 1 — Resend Domain verifiziert (Vorbedingung)

- [ ] Resend Dashboard → Domains → `profleet.de` → alle 3 Records **Verified** (grün)
- [ ] `dig TXT resend._domainkey.profleet.de` liefert den DKIM-Key (nicht NXDOMAIN)
- [ ] Smoke-Test via curl gegen Resend-API (siehe [email-setup.md Schritt 5](./email-setup.md)) liefert `{"id":"..."}` und im Resend-Log steht `Delivered`
- [ ] mail-tester.com Score ≥ 9/10

Falls hier irgendwo rot: noch nicht weitermachen, erst Phase A finalisieren.

## Schritt 2 — Webhook-Secret generieren

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Den 64-Zeichen-Hex-Wert kopieren — das wird `EMAIL_WEBHOOK_SECRET`. Sicher hinterlegen (Passwort-Manager oder 1Password), du brauchst ihn an zwei Stellen (Coolify + Supabase Webhook-Header).

## Schritt 3 — Coolify Env-Variablen setzen

Coolify-Dashboard → Application `profleet-app` → **Environment Variables**:

| Variable | Wert |
|---|---|
| `RESEND_API_KEY` | (aus Resend Dashboard → API Keys, Production-Scope) |
| `EMAIL_FROM` | `noreply@profleet.de` |
| `EMAIL_REPLY_TO` | `info@profleet.de` |
| `EMAIL_WEBHOOK_SECRET` | (aus Schritt 2) |
| `NEXT_PUBLIC_SITE_URL` | `https://app.profleet.de` |

Speichern → **Redeploy** anstoßen. Application muss neu hochfahren, damit der Container die neuen Werte sieht.

## Schritt 4 — Supabase Auth Site URL umstellen

Supabase Dashboard → **Authentication → URL Configuration**:

- **Site URL:** `https://app.profleet.de`
- **Redirect URLs (Allow list):** `https://app.profleet.de/**`

(Falls vorher `app.profleet.eu` oder ähnliches drinstand: ersetzen.)

## Schritt 5 — Supabase Custom SMTP aktivieren

Supabase Dashboard → **Project Settings → Authentication → SMTP Settings → "Enable Custom SMTP":**

| Feld | Wert |
|---|---|
| Sender email | `noreply@profleet.de` |
| Sender name | `proFleet` |
| SMTP Host | `smtp.resend.com` |
| SMTP Port | `465` |
| SMTP User | `resend` |
| SMTP Password | `<RESEND_API_KEY>` (gleicher Key wie in Coolify) |

Speichern. Im SMTP-Test-Bereich (falls vorhanden) einmal "Send test email" — sollte ankommen.

## Schritt 6 — Supabase Auth Templates importieren

Supabase Dashboard → **Authentication → Email Templates**, für jedes der 4 Templates:

1. Subject anpassen (siehe Tabelle in [docs/supabase-auth-emails.md](./supabase-auth-emails.md))
2. Body-HTML aus [email-templates/supabase-auth/](../email-templates/supabase-auth/) reinkopieren
3. Speichern

| Template | Subject | Mirror-File |
|---|---|---|
| Confirm signup | `Bestätigen Sie Ihre Anmeldung bei proFleet` | confirm-signup.html |
| Magic Link | `Ihr Login-Link für proFleet` | magic-link.html |
| Reset Password | `Passwort zurücksetzen für proFleet` | reset-password.html |
| Change Email Address | `Bestätigen Sie Ihre neue E-Mail-Adresse` | change-email.html |

## Schritt 7 — Database-Webhook für Approval anlegen

Supabase Dashboard → **Database → Webhooks → Create a new webhook**:

| Feld | Wert |
|---|---|
| Name | `notify-approval` |
| Table | `profiles` |
| Events | nur `Update` |
| Type | HTTP Request |
| Method | POST |
| URL | `https://app.profleet.de/api/email/triggers/approval` |
| Headers → `Authorization` | `Bearer <EMAIL_WEBHOOK_SECRET>` (aus Schritt 2) |
| Timeout | 5 sec |

Speichern. Details siehe [supabase/webhooks/notify-approval.md](../supabase/webhooks/notify-approval.md).

## Schritt 8 — End-to-End-Test

Im Supabase SQL Editor:

```sql
-- Test-User in inaktiven Zustand bringen
UPDATE profiles SET is_active = false WHERE id = '<dein-test-user-id>';

-- Eine Sekunde warten (Webhook würde sonst denselben Tick sehen), dann reaktivieren
UPDATE profiles SET is_active = true WHERE id = '<dein-test-user-id>';
```

Prüfen:
- [ ] **Resend Logs:** ein neuer Send-Event an die Email des Test-Users, Status `Delivered`
- [ ] **Test-User-Inbox:** Approval-Welcome-Mail kommt an, von `noreply@profleet.de`, mit korrektem Branding, "Jetzt anmelden"-Button verlinkt auf `https://app.profleet.de/anmelden`
- [ ] Mail landet **nicht im Spam**
- [ ] Klick auf "Jetzt anmelden" → landet auf der Login-Page der App

## Schritt 9 — Auth-Mail End-to-End

- [ ] Echter Signup-Flow mit neuer Test-Email → Confirm-Mail kommt von `noreply@profleet.de` mit eigenem Branding (nicht Supabase-Default)
- [ ] Password-Reset triggern → Reset-Mail kommt mit eigenem Branding
- [ ] Confirm-Link führt zu `app.profleet.de/...`, nicht zur alten Test-Domain

## Schritt 10 — Sauberkeit

- [ ] `app.profleet.eu` → 301-Redirect auf `app.profleet.de` (in Coolify oder Cloudflare, je nach DNS-Setup)
- [ ] Eintrag in Memory aktualisieren: Cutover abgeschlossen, app.profleet.eu nur noch Redirect-Footprint

## Rollback-Plan

Falls etwas schiefgeht:
1. Supabase SMTP-Settings → "Disable Custom SMTP" → Supabase fällt zurück auf Default-Mailer (Auth-Mails kommen wieder von `noreply@mail.app.supabase.io`)
2. Supabase Webhook → temporär deaktivieren (Toggle in Webhook-Detail-Page)
3. Coolify Env-Var `RESEND_API_KEY` leer setzen + Redeploy → unser App-Code throwt `RESEND_API_KEY is not set` statt Mails zu schicken

Bei DNS-Problemen: Records bei SiteGround prüfen (nicht löschen). Resend gibt im Dashboard genaue Fehlertexte, was wo nicht passt.
