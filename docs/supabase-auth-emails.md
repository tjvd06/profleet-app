# Supabase Auth-Mails via Resend (Phase B)

Konfiguriert Supabase Auth so, dass Signup-Confirm / Magic-Link / Password-Reset / Email-Change unter `noreply@profleet.de` mit Brand-HTML rausgehen.

**Voraussetzung:** [Phase A](./email-setup.md) abgeschlossen, `RESEND_API_KEY` existiert.

## Schritt 1 — Custom SMTP aktivieren

Supabase Dashboard → **Project Settings → Authentication → SMTP Settings → "Enable Custom SMTP"**:

| Feld | Wert |
|---|---|
| Sender email | `noreply@profleet.de` |
| Sender name | `proFleet` |
| SMTP Host | `smtp.resend.com` |
| SMTP Port | `465` |
| SMTP User | `resend` |
| SMTP Password | `<RESEND_API_KEY aus Phase A>` |

Speichern. Supabase warnt typischerweise vor SMTP-Limits — bei Resend Free-Tier sind 100/Tag das Limit, für Beta-Phase ausreichend.

## Schritt 2 — Auth-Templates anpassen

Supabase Dashboard → **Authentication → Email Templates**. Für jedes der vier Templates:

1. Subject anpassen (siehe Tabelle unten)
2. Body-HTML aus dem Repo-Mirror 1:1 reinkopieren
3. Speichern

| Template | Subject | Repo-Mirror |
|---|---|---|
| **Confirm signup** | `Bestätigen Sie Ihre Anmeldung bei proFleet` | [confirm-signup.html](../email-templates/supabase-auth/confirm-signup.html) |
| **Magic Link** | `Ihr Login-Link für proFleet` | [magic-link.html](../email-templates/supabase-auth/magic-link.html) |
| **Reset Password** | `Passwort zurücksetzen für proFleet` | [reset-password.html](../email-templates/supabase-auth/reset-password.html) |
| **Change Email Address** | `Bestätigen Sie Ihre neue E-Mail-Adresse` | [change-email.html](../email-templates/supabase-auth/change-email.html) |

**Verfügbare Variablen:**
- `{{ .ConfirmationURL }}` — Action-Link (Confirm / Magic-Link / Reset / Change)
- `{{ .Email }}` — Empfänger-Email
- `{{ .SiteURL }}` — konfigurierte Site-URL aus Auth-Settings
- `{{ .Token }}` / `{{ .TokenHash }}` — wenn manueller Link-Bau nötig

## Schritt 3 — Test je Template

Im Dashboard pro Template → **Send test email** → eigene Adresse.

Checks:
- Absender steht als `proFleet <noreply@profleet.de>` (nicht `noreply@mail.app.supabase.io`)
- Subject deutsch
- HTML rendert korrekt (Header navy-950, Body, CTA-Button, Footer mit Impressum)
- CTA-Link funktioniert (sendet zum richtigen `redirect_to`-Endpunkt)

**End-to-End-Test ohne Test-Button:**
1. Signup mit neuer Test-Email → Confirm-Mail kommt an
2. Password-Reset triggern → Reset-Mail kommt an
3. (Falls Magic-Link aktiv:) Login via Magic-Link → Mail kommt an

## Konvention: Repo als Source-of-Truth

Supabase Dashboard hat **keine Versionierung** für Auth-Templates. Wenn das Projekt mal migriert wird oder jemand versehentlich überschreibt, ist die History weg.

**Regel:** Jede Änderung im Dashboard wird parallel im Repo-Mirror unter `email-templates/supabase-auth/*.html` committet. PR-Description erklärt was geändert wurde und warum.

## Verifikation Phase B komplett

- [ ] Custom SMTP in Supabase aktiviert, "Send test email" liefert eine Mail
- [ ] Alle 4 Auth-Templates angepasst, jeweils via "Send test email" geprüft
- [ ] Echter Signup-Flow: Confirm-Mail kommt von `noreply@profleet.de`
- [ ] Echter Password-Reset-Flow: Reset-Mail kommt mit Branding an
- [ ] Repo-Mirror-Files entsprechen dem Dashboard-Stand

Nächster Schritt: [Phase C — Template-Infrastruktur im Code](../src/emails/README.md). Phase D (erster echter App-Send) folgt sobald Phase A & B live sind.
