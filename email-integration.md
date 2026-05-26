# Email-System für profleet (Auth + Notifications)

## Context

Heute verschickt die App nur Supabase-Auth-Default-Mails von `noreply@mail.app.supabase.io` — wirkt für eine seriöse B2B-SaaS unprofessionell. Notifications (neuer Kontakt, neue Nachricht, neues Offer, Approval) fehlen komplett, obwohl im UI an mehreren Stellen User-Engagement nötig ist.

**Ziel:** Alle App-Emails (Auth + Notifications) laufen mit Brand-Domain `profleet.de`, über einen einzigen Provider (Resend), mit wartbaren Templates im Repo. Auth-Mails von Supabase auch unter eigener Domain.

**Vom User bestätigte Entscheidungen:**
- Domain: `profleet.de`, bei SiteGround gehostet (DNS-Records werden dort gesetzt)
- Provider: **Resend** (free tier 3.000/Mo deckt Beta locker; bezahlt $20/Mo bis 50k)
- Templates: **Branded HTML via [react-email](https://react.email)** (TSX im Repo, typed, Hot-Reload)
- Prio Auth-Mails klar (User-Frage signalisiert Unbehagen mit Status quo)

## Architektur

Zwei klar getrennte Pfade, **ein Provider** dahinter:

```
┌──────────────────────────────────────┐
│  Auth-Events                          │
│  (Signup-Confirm, Password-Reset,     │
│   Magic-Link, Email-Change)           │
└──────────────────┬───────────────────┘
                   │
                   ▼
        ┌──────────────────────┐
        │ Supabase Auth        │ — custom SMTP
        │ + custom templates   │   konfiguriert in
        └──────────┬───────────┘   Supabase Dashboard
                   │
                   ▼
              ┌─────────┐
              │ Resend  │  smtp.resend.com via SMTP
              └────┬────┘    oder REST-API
                   │
                   ▼
                User Inbox

┌──────────────────────────────────────┐
│  App-Events                           │
│  (Approval-Welcome,                   │
│   neuer Kontakt, neue Nachricht,      │
│   neues Offer, Review, ...)           │
└──────────────────┬───────────────────┘
                   │
                   ▼
        ┌──────────────────────┐
        │ Next.js API Routes   │
        │ react-email Render   │ — eigene Templates
        │ src/lib/email/*      │   im Repo
        └──────────┬───────────┘
                   │
                   ▼
              ┌─────────┐
              │ Resend  │  REST-API
              └────┬────┘
                   │
                   ▼
                User Inbox
```

**Warum so getrennt:** Supabase Auth verschickt Mails **innerhalb** des Auth-Flows (User klickt "Passwort vergessen" → Supabase generiert Reset-Token → Supabase verschickt Mail mit Link). Wir können das nicht durch unseren App-Code routen. Stattdessen sagen wir Supabase: "Verwende Resend als SMTP-Server und diese Templates".

**Warum Resend für beide:** Single Vendor → eine Domain-Verifizierung, einheitliche Reputation, eine Stelle für Bounces/Webhooks, eine Rechnung.

## Phasen-Aufteilung

Sieben Phasen, jede ein eigenständig deploybarer Schritt:

| Phase | Inhalt | Risiko |
|---|---|---|
| **A** | Resend-Account, Domain verifizieren, DNS bei SiteGround (SPF, DKIM, DMARC) | Niedrig — nur DNS-Records |
| **B** | Supabase Custom SMTP + Custom Auth-Templates | Mittel — wenn falsch konfiguriert, kommen keine Auth-Mails durch |
| **C** | Template-Infrastruktur im Code (react-email, Layout-Komponente, Brand-Tokens) | Niedrig — neuer Code, nichts wird ersetzt |
| **D** | Sender-Helper + erste App-Mail: Approval-Welcome | Niedrig — additiv |
| **E** | Notification-Mails: neuer Kontakt, neue Nachricht, neues Offer | Mittel — Trigger-Points im bestehenden Code anpassen |
| **F** | Monitoring, Spam-Score-Tests, Throttling/Digest für Spam-anfällige Events | Niedrig — Polish |
| **G** | Notification-Preferences + Marken-getargetete Tender-Notification + Unsubscribe-Flow | Mittel — neue UI-Seite + neue Spalte + Token-Auth |
| **H** | Newsletter via Brevo, User-Verwaltung zentral in profleet | Niedrig-Mittel — Outsourced, weniger Code |

---

## Phase A — DNS & Resend-Setup

**1. Resend-Account anlegen** auf [resend.com](https://resend.com), Free Tier reicht.

**2. Domain `profleet.de` hinzufügen** → Resend gibt dir 3 DNS-Records:
- `MX` Record für `send.profleet.de` (für Bounces-Handling)
- `TXT` Record für SPF (`v=spf1 include:_spf.resend.com ~all`)
- `TXT` Record für DKIM (CNAME oder TXT mit Resend-spezifischem Key)

**3. Im SiteGround DNS-Manager** (Site Tools → Domain → DNS Zone Editor) die drei Records eintragen.

**4. DMARC-Record** zusätzlich anlegen — Best Practice für Auth-Mail-Reputation:
```
_dmarc.profleet.de  TXT  "v=DMARC1; p=quarantine; rua=mailto:dmarc@profleet.de"
```
(Start mit `p=quarantine`, später auf `p=reject` hochziehen, wenn alles sauber läuft.)

**5. Verifikation in Resend abwarten** (DNS-Propagation kann 15min bis 24h dauern).

**6. API-Key generieren** in Resend (Dashboard → API Keys → "Create API Key"), nur `Send access` für die App, Production-Scope.

**7. Test-Mail aus Resend-Dashboard** an deine eigene Adresse senden, prüfen ob sie ankommt und die Spam-Filter-Bewertung in [mail-tester.com](https://www.mail-tester.com) (10/10 anstreben).

**Inbox-Frage:** SiteGround behält `info@profleet.de` als echtes Postfach für eingehende Antworten. Resend ist **nur ausgehend** — Replies auf eine Resend-Mail laufen weiter zu deiner SiteGround-Inbox (`Reply-To: info@profleet.de` in jedem Template).

---

## Phase B — Supabase Auth via eigener Domain

**1. Supabase Dashboard → Project Settings → Authentication → SMTP Settings → "Enable Custom SMTP":**
```
Sender email:    noreply@profleet.de
Sender name:     profleet
SMTP Host:       smtp.resend.com
SMTP Port:       465
SMTP User:       resend
SMTP Password:   <Resend API Key aus Phase A.6>
```

**2. Authentication → Email Templates** — vier Templates anpassen mit eigenem Branding-HTML. Diese werden in der Supabase-UI bearbeitet (lebt nicht im Repo, aber gut dokumentierbar). Konkret zu pflegen:
- **Confirm Signup** — "Bestätige deine Anmeldung bei profleet"
- **Magic Link** — "Dein Login-Link für profleet"
- **Reset Password** — "Passwort zurücksetzen für profleet"
- **Change Email Address** — "Bestätige deine neue Email-Adresse"

Templates können `{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .SiteURL }}` als Platzhalter nutzen.

Praktischer Trick: Templates im Repo unter `email-templates/supabase-auth/*.html` halten als "Source of Truth", auch wenn Supabase sie nur via Dashboard liest. Wenn ein Template geändert wird, parallel die Repo-Version updaten — dann ist die Historie nicht weg, wenn das Supabase-Projekt mal migriert.

**3. Test:** Im Supabase Dashboard "Send test email" für jedes Template, dann eigene Email checken — kommt von `noreply@profleet.de` an statt von Supabase-Default.

---

## Phase C — Template-Infrastruktur im Repo

**Neue Dependencies:**
```bash
npm install resend react-email @react-email/components
npm install -D react-email
```

`react-email` (Dev-Tool) erlaubt Live-Preview der Templates unter `npm run email` auf [http://localhost:3001](http://localhost:3001).

**Neue Verzeichnis-Struktur:**
```
src/emails/
├── components/
│   ├── EmailLayout.tsx       ← Shared Wrapper (Header mit Logo, Footer mit Impressum, Brand-Farben)
│   ├── Button.tsx            ← Branded Action-Button
│   └── InfoCallout.tsx       ← Hervorhebungs-Box
├── ApprovalWelcomeEmail.tsx
├── NewContactEmail.tsx
├── NewMessageEmail.tsx
├── NewOfferEmail.tsx
└── README.md                  ← Wie Templates lokal previewn

src/lib/email/
├── send.ts                    ← Resend-Wrapper, einheitliche Error-Handling, From-Adresse
└── types.ts                   ← Email-Payload Types

src/app/api/email/
└── send/route.ts              ← Optional: server-route falls Client direkt anstoßen will (Auth-protected)
```

**EmailLayout-Komponente** definiert das visuelle Grundgerüst, das alle Templates teilen:
- Header mit Logo (`profleet`-Wortmarke)
- Brand-Color-Palette (matched zur App: blue-600, navy-950, cyan-500)
- Footer mit Impressum-Link, "Wenn du diese Mail nicht erwartest..."-Hinweis
- Reply-To: `info@profleet.de`

Templates sind reine React-Komponenten mit Props:
```tsx
<ApprovalWelcomeEmail
  firstName="Max"
  loginUrl="https://profleet.de/anmelden"
/>
```

**`src/lib/email/send.ts`** ist der zentrale Sender — eine Stelle für:
- Resend-Client-Init (lazy, mit Env-Check)
- From-Adresse (`noreply@profleet.de`)
- Reply-To-Adresse (`info@profleet.de`)
- Error-Handling + Logging
- Optional: Throttling/Dedup per Event-Key

---

## Phase D — Approval-Welcome-Mail (erste App-Mail)

Trigger: Admin setzt `profiles.is_active = true` → User soll Welcome-Mail mit Login-Link bekommen.

**Variante 1 — DB-Trigger + Edge Function (Recommended):**
- Supabase DB-Webhook auf `UPDATE profiles WHERE is_active = true AND old.is_active = false`
- Webhook ruft Edge Function `notify-approval` auf
- Edge Function rendert Template via react-email und sendet via Resend
- Vorteil: kein "vergessen" möglich, läuft auch wenn Admin SQL nutzt

**Variante 2 — API-Route (einfacher Einstieg):**
- Admin-UI für `is_active`-Toggle (gibt es noch nicht?) ruft `/api/admin/approve-user` auf
- Route flippt das Feld + verschickt Mail
- Vorteil: alles in einem Code-Pfad, leichter zu debuggen
- Nachteil: manueller SQL-Update löst nichts aus

**Empfehlung:** Start mit **Variante 1**, weil heute `is_active` per SQL gesetzt wird (kein Admin-UI im Code sichtbar). Edge Function lebt unter `supabase/functions/notify-approval/index.ts` (Verzeichnis aktuell nicht im Repo, neu anzulegen).

Falls Edge Functions zu viel Overhead sind: pragmatisch erstmal Variante 2 mit einer einfachen Server-Route, die der Admin manuell triggert (z.B. via curl bis Admin-UI da ist).

---

## Phase E — Notification-Mails

Drei Templates plus Trigger-Points:

| Mail | Trigger | Empfänger | Code-Pfad |
|---|---|---|---|
| **Neue Nachricht** | `INSERT INTO messages` | sender's counterpart (aus `contact`) | DB-Webhook → Edge Function, **mit Throttling** (siehe Phase F) |
| **Neues Offer** | `INSERT INTO offers` | tender.buyer_id (`role='nachfrager'` only) | DB-Webhook → Edge Function |

"Neuer Kontakt" entfällt — wenn ein Käufer auf "Kontakt aufnehmen" klickt, wird er typischerweise direkt eine Nachricht schreiben, die löst dann die "Neue Nachricht"-Mail aus. Doppelte Notification unnötig.

Beide Mails sollten als **DB-Webhooks** laufen (nicht API-Routes), weil Inserts an mehreren Stellen entstehen und ein direkter Code-Pfad das alles abdecken müsste. DB-Webhook ist die saubere Single-Source.

**Webhook-Setup pro Tabelle** (Supabase Dashboard → Database → Webhooks):
```
Name:      notify-new-contact
Table:     contacts
Events:    INSERT
URL:       https://profleet.de/api/email/triggers/new-contact
Method:    POST
Headers:   { "Authorization": "Bearer <SHARED_SECRET>" }
```

Das Shared-Secret wird in Vercel-Env als `EMAIL_WEBHOOK_SECRET` gespeichert, der Endpoint prüft den Header. Verhindert dass jemand den Trigger-Endpoint missbraucht.

Alternative: Edge Functions in Supabase selbst, dann braucht es kein Shared-Secret (Webhook authentifiziert sich automatisch). Pro Variante:
- API-Routes in Next.js: einfacher zu debuggen, lebt im selben Repo
- Edge Functions: schneller (im selben Netzwerk wie DB), kein zusätzlicher Vercel-Roundtrip

**Empfehlung:** API-Routes für Phase E (Repo-zentriert, einfacher). Edge Functions wären ein späteres Refactor wenn Performance ein Issue wird.

---

## Phase F — Monitoring, Spam-Schutz, Throttling

Nicht jeder Event soll sofort eine Mail triggern. Konkrete Risiken und Gegenmittel:

| Risiko | Lösung |
|---|---|
| 20 Nachrichten in 5min → 20 Mails | **Digest:** "Neue Nachricht"-Mail max. 1× pro Stunde pro User-Konversation. Implementierung: vor `Resend.send()` prüfen, ob die letzte gleichartige Mail < 1h zurückliegt — in einer kleinen `email_log`-Tabelle. |
| User möchte gar keine Notifications | **`profiles.email_notifications` boolean** Spalte ergänzen, Settings im Profil. Vor jedem Send prüfen. |
| Bounces sammeln sich → Reputation leidet | **Resend-Webhook** `email.bounced` einrichten → Empfänger als "do not contact" markieren in `profiles.email_status` |
| User klickt nichts → Spam-Filter lernen | **Resend-Webhook** `email.opened/clicked` einrichten → low-engagement User identifizieren |
| Mail im Spam | `mail-tester.com` regelmäßig prüfen, DMARC-Policy steigern |

**Optionale Spalten in `profiles`:**
```sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_notifications boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_status text NOT NULL DEFAULT 'ok'
    CHECK (email_status IN ('ok','bounced','complained','unsubscribed'));
```

**Optionale Audit-Tabelle:**
```sql
CREATE TABLE public.email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  template text NOT NULL,
  resend_message_id text,
  status text NOT NULL CHECK (status IN ('sent','bounced','complained','opened','clicked')),
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_log_user_template_created
  ON public.email_log (user_id, template, created_at DESC);
```

Letztere ist nützlich für Throttling-Queries: "Wann war die letzte `new_message`-Mail an diesen User?"

---

## Phase G — Notification-Preferences + Targeting + Unsubscribe

### G.1 — Notification-Preferences in `profiles`

Klare Trennung: **Pflicht-Mails** (kein Opt-Out, weil rechtlich / kritisch) vs. **Opt-Out-Mails** (User entscheidet).

**Pflicht (kein Toggle):**
- Auth-Mails (Confirm Signup, Magic Link, Password Reset, Email-Change) — Phase B
- Account-Freischaltung Welcome — Phase D (einmaliger Touchpoint, nicht opt-out-able)
- Stripe-Receipts/Invoices (rechtlich, von Stripe direkt versendet)

**Opt-Out per User:**

Neue JSONB-Spalte mit Defaults, nur die opt-out-baren Typen drin:

```sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_settings jsonb NOT NULL DEFAULT '{
    "new_message": true,
    "new_offer": true,
    "new_tender_matching": true,
    "review_received": true,
    "billing": true
  }'::jsonb;
```

JSONB statt 5 boolean-Spalten, weil:
- Neue Notification-Typen kommen ohne `ALTER TABLE` rein
- Defaults via merge mit Code-Defaults beim Lesen → kein Backfill nötig
- Filter-Logik im Code (vor `send()`): `if (profile.notification_settings?.new_message !== false)` → default true, nur explizit false blockt

### G.2 — UI: Benachrichtigungen-Seite

Neue Route: `/dashboard/profil/benachrichtigungen`. Toggles werden **rollenabhängig** gerendert (`profile.role === 'nachfrager'` vs `'anbieter'`):

```
Für alle:
  ☑ Neue Nachricht
  ☑ Bewertung erhalten
  ☑ Rechnungen & Vertragsstatus

Nur Nachfrager:
  ☑ Neues Angebot auf meine Ausschreibung

Nur Händler:
  ☑ Neue Ausschreibung mit meinen vertretenen Marken
```

Speichert via `UPDATE profiles SET notification_settings = ...`. RLS-Policy für `profiles` muss bereits SELECT/UPDATE für eigene Zeile erlauben (vermutlich schon der Fall).

"Rechnungen & Vertragsstatus" steuert die **App-eigenen** Subscription-Mails (Welcome-to-Pro, Cancellation-Bestätigung) — nicht die Stripe-Receipts, die laufen unabhängig (rechtlich Pflicht).

### G.3 — Marken-getargetete Tender-Notification

Trigger: `tenders.status` flippt von `'draft'` auf `'active'` → API-Route findet passende Händler.

**Query-Logik** (im API-Endpoint, nicht im DB-Trigger — zu komplex für SQL-Trigger):

```sql
SELECT p.id, p.first_name, p.email_public
FROM public.profiles p
WHERE p.role = 'anbieter'
  AND p.is_active = true
  AND p.email_status = 'ok'                              -- aus Phase F
  AND (p.notification_settings->>'new_tender_matching')::boolean IS DISTINCT FROM false
  AND p.brands && (
    SELECT array_agg(DISTINCT brand)
    FROM public.tender_vehicles
    WHERE tender_id = $1 AND brand IS NOT NULL
  );
```

`array && array` ist Postgres-Overlap-Operator: liefert true wenn **mindestens eine Marke** in beiden Arrays ist. Dafür braucht es einen GIN-Index auf `profiles.brands`:

```sql
CREATE INDEX IF NOT EXISTS idx_profiles_brands_gin
  ON public.profiles USING gin (brands);
```

Mail einmal pro matchendem Händler, mit Liste der relevanten `tender_vehicles` im Body ("Diese Modelle in dieser Ausschreibung sind relevant für dich: VW Golf, BMW X3"). Reply-Link zur Tender-Detail-Seite.

**Edge-Case:** Was wenn ein Tender später bearbeitet wird (z.B. neues Fahrzeug mit anderer Marke dazu)? Aktuell keine zweite Benachrichtigung — Trigger nur auf `status='active'` Flip. Falls später gewünscht: zusätzlicher Trigger auf `tender_vehicles` INSERT, mit Dedup-Check gegen `email_log` (kein zweiter Send an gleichen Händler in den letzten 24h für diesen Tender).

### G.4 — Unsubscribe-Flow

Jede Notification-Mail bekommt im Footer einen Unsubscribe-Link:
```
Diese Mail nicht mehr erhalten?
Benachrichtigungen verwalten: https://profleet.de/unsubscribe?token=<jwt>
```

Token = JWT mit `{ userId, type }`, signiert mit `EMAIL_TOKEN_SECRET` (neue Env-Variable). Server-Route `/unsubscribe`:
1. Token validieren
2. `notification_settings[type] = false` setzen
3. Bestätigungs-Seite anzeigen + Link zur vollen Settings-Page
4. User muss nicht eingeloggt sein (One-Click via Email-Link funktioniert)

DSGVO-relevant: Token im Link muss zeit-begrenzt sein (z.B. 30 Tage), sonst kann ein geleakter Link ewig benutzt werden.

### Files für Phase G

```
supabase/migrations/0009_notification_preferences.sql  ← notification_settings + GIN-Index brands
src/app/(main)/dashboard/profil/benachrichtigungen/page.tsx  ← UI-Seite
src/app/api/email/triggers/new-tender-matching/route.ts       ← Marken-Match-Endpoint
src/app/unsubscribe/page.tsx                                  ← Public Unsubscribe-Landing
src/app/api/email/unsubscribe/route.ts                        ← Token-validierter Setter
src/lib/email/preferences.ts                                  ← Helper: shouldSend(userId, type)
src/lib/email/token.ts                                        ← JWT sign/verify für Unsubscribe-Links
```

`shouldSend()`-Helper wird in **allen** Notification-Triggern aus Phase E vorgeschaltet, damit die Settings konsistent geprüft werden.

---

## Phase H — Newsletter (extern via Brevo, profleet als Source of Truth)

Newsletter werden **outgesourced** an Brevo (EU-Server, DACH-tauglich, Free Tier 300 Mails/Tag), aber die User-Verwaltung bleibt zentral in profleet. Das User-Erlebnis: Subscribe/Unsubscribe passiert ausschließlich in der profleet-App, Brevo wird nur als Send-Tool benutzt.

**Architektur:**
```
profleet DB (Source of Truth)
  profiles.newsletter_subscribed: bool
  profiles.newsletter_consent_at: timestamptz
  profiles.newsletter_consent_text: text
  profiles.newsletter_consent_ip: text
        │
        │ Sync via Brevo API
        ▼
Brevo Contact-Liste (Send-Tool)
  email, attributes, opt-in status
        │
        │ Newsletter-Versand
        ▼
   User Inbox
```

**Aufgabenteilung:**

| Aspekt | profleet | Brevo |
|---|---|---|
| User-Settings (an/aus) | UI im Profil | — |
| Consent-Audit (DSGVO) | Spalten in profiles + email_log | — |
| Double-Opt-In Bestätigung | API-Call → Brevo verschickt Mail | versendet & verfolgt |
| Newsletter schreiben | — | Dashboard / API |
| Newsletter senden | — | über Brevos Infrastruktur |
| Unsubscribe-Link im Footer | nimmt Auto-Unsub von Brevo, plus eigene profleet-URL als Fallback | bietet eigenen automatischen |
| Reporting (Opens, Clicks) | — | Brevo Dashboard |

### H.1 — Spalten in profiles statt eigene Tabelle

Da profleet schon ein User-System hat, reicht eine Erweiterung von `profiles` statt einer separaten Subscribers-Tabelle:

```sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS newsletter_subscribed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS newsletter_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS newsletter_consent_text text,
  ADD COLUMN IF NOT EXISTS newsletter_consent_ip text,
  ADD COLUMN IF NOT EXISTS brevo_contact_id text;
```

Die Felder dokumentieren die DSGVO-Einwilligung (wer hat wann mit welchem Text und von welcher IP zugestimmt). `brevo_contact_id` speichert die Brevo-interne ID nach Sync für spätere Updates/Deletes.

### H.2 — UI: Toggle im Profil

Neue Sektion auf `/dashboard/profil/benachrichtigungen` (gleiche Seite wie Phase G):

```
Marketing

  ☐ Ich möchte den profleet-Newsletter erhalten
    └─ Hinweis-Text: "Maximal 1× pro Monat: Branchen-News,
       Produkt-Updates, Erfolgsgeschichten. Du kannst jederzeit
       widerrufen."
```

Beim Aktivieren: Modal mit explizitem Consent-Text → User bestätigt → API-Call.

### H.3 — API-Endpoints

**`POST /api/newsletter/subscribe`** (eingeloggter User):
1. Authentifizierung prüfen
2. Consent-Text aktuell laden (lebt in `src/lib/newsletter/consent.ts` als Konstante mit Versionsnummer)
3. `profiles` updaten: `newsletter_subscribed=false` (noch nicht confirmed!) + Consent-Felder setzen
4. Brevo API: `POST /contacts` mit Double-Opt-In `attributes` und `listIds` der profleet-Newsletter-Liste
5. Brevo sendet Bestätigungs-Mail an User
6. User klickt Link → Brevo confirmed → Brevo-Webhook ruft profleet auf

**`POST /api/webhooks/brevo`** (von Brevo getriggert):
1. Signatur prüfen (Brevo Webhook-Secret)
2. Event-Typ: `list_addition` (confirmed)
3. `profiles.newsletter_subscribed=true` setzen für die Email

**`POST /api/newsletter/unsubscribe`** (eingeloggter User):
1. Brevo API: `DELETE /contacts/{email}` oder Liste entfernen
2. `profiles.newsletter_subscribed=false`, `newsletter_consent_at=null`

Brevo bietet auch automatische Unsubscribe-Links im Newsletter-Footer — die führen direkt zu Brevo-hosted Unsubscribe-Seite. Optional zusätzlich ein Link auf die profleet-Settings-Seite (sodass auch das User-Profil synchron bleibt — Brevo-Webhook handles das automatisch).

### H.4 — Newsletter-Versand selbst

Komplett in Brevo:
- Login Brevo Dashboard
- Campaigns → Create Newsletter
- Liste auswählen (die profleet-User)
- Inhalt schreiben (Drag-and-Drop Editor oder HTML)
- Senden oder schedule

Kein App-Code dafür. Vorteile: keine Maintenance, Brevo macht Reporting, A/B-Tests, Drip-Campaigns wenn nötig.

### H.5 — DSGVO-Compliance

| Anforderung | Wie erfüllt |
|---|---|
| Einwilligung dokumentiert | `newsletter_consent_at`, `_text`, `_ip` in profiles |
| Double-Opt-In | Brevo macht das automatisch |
| Widerruf jederzeit möglich | Toggle in profleet **und** Brevo Auto-Unsubscribe im Footer |
| Datenexport bei Auskunftsanfrage | profleet kann Consent-Spalten exportieren; Brevo bietet GDPR-Export |
| Recht auf Löschung | Toggle aus → profleet null'd Consent-Felder + Brevo löscht Contact |
| Server-Standort EU | Brevo Server in Frankreich/Belgien — Schrems-II-konform |
| Auftragsverarbeitung (DPA) | Brevo bietet Standard-DPA, einmalig in Brevo-Settings akzeptieren |

### H.6 — Files für Phase H

```
supabase/migrations/0010_newsletter_consent.sql        ← profiles-Spalten + RLS
src/app/api/newsletter/subscribe/route.ts              ← App → Brevo Subscribe
src/app/api/newsletter/unsubscribe/route.ts            ← App → Brevo Unsubscribe
src/app/api/webhooks/brevo/route.ts                    ← Brevo → App Confirmation-Webhook
src/lib/newsletter/brevo-client.ts                     ← Brevo SDK-Wrapper
src/lib/newsletter/consent.ts                          ← versioned Consent-Text Konstante
src/components/profile/NewsletterConsentToggle.tsx     ← UI-Komponente mit Modal
.env.example: BREVO_API_KEY, BREVO_LIST_ID, BREVO_WEBHOOK_SECRET
```

### H.7 — Risiken Phase H

| Risiko | Mitigation |
|---|---|
| Brevo-Webhook ausfällt → profleet kennt Confirmation nicht | Sync-Reconciliation-Job: täglich Brevo-Liste pollen, profleet-Spalten alignen |
| User toggled off, aber Brevo-Delete schlägt fehl | API-Fehler ins email_log schreiben, manueller Retry-Mechanismus oder Cron-Reconciliation |
| Brevo bietet Service ein, profleet behält bool=true → User kriegt nichts | Reconciliation-Job |
| Doppelte Einträge bei Brevo (User toggled mehrfach) | `brevo_contact_id` in profleet speichern, immer Update statt Insert |
| Consent-Text ändert sich, alte User haben "alten" Stand | Versionierter Consent-Text in `src/lib/newsletter/consent.ts`, bei Major-Änderung Re-Confirm anfordern |
| User löscht Account → Brevo-Contact bleibt | ON DELETE Trigger oder Edge Function ruft Brevo-Delete auf |

---

## Email-Inventar (zukünftiger Vollumfang)

Damit nichts vergessen wird — eine Tabelle aller geplanten Mails, gegliedert nach Phase:

| Mail | Phase | Trigger | Empfänger | Priorität |
|---|---|---|---|---|
| Confirm Signup | B | Supabase Auth | neuer User | Pflicht |
| Magic Link | B | Supabase Auth | User beim Login | Pflicht (wenn Magic-Link aktiv) |
| Reset Password | B | Supabase Auth | User | Pflicht |
| Change Email | B | Supabase Auth | User | Pflicht |
| Approval-Welcome | D | `profiles.is_active` true | User | Hoch |
| Neue Nachricht | E | `messages` INSERT (gedebouncet) | Counterpart | Hoch |
| Neues Offer | E | `offers` INSERT | Buyer (nur Nachfrager) | Hoch |
| Neue Bewertung erhalten | F (später) | `reviews` INSERT | to_user_id | Mittel |
| Tender abläuft in 24h | F (später) | Cron | Buyer | Mittel |
| Sofort-Angebot verkauft | F (später) | `instant_offers.status = 'sold'` | Dealer | Niedrig |
| Neue Ausschreibung mit deinen Marken | G | `tenders.status` flip auf 'active' | matchende Dealer | Hoch |
| Subscription Welcome | mit Stripe-Phase | Stripe Webhook | User | Pflicht ab Stripe |
| Subscription Payment Failed | mit Stripe-Phase | Stripe Webhook | User | Pflicht ab Stripe |

---

## Critical Files (zu erstellen)

```
src/emails/                           ← react-email Templates (Phase C)
src/emails/components/EmailLayout.tsx
src/emails/ApprovalWelcomeEmail.tsx    ← Phase D
src/emails/NewContactEmail.tsx         ← Phase E
src/emails/NewMessageEmail.tsx         ← Phase E
src/emails/NewOfferEmail.tsx           ← Phase E

src/lib/email/send.ts                  ← Resend-Wrapper (Phase C)
src/lib/email/throttle.ts              ← Phase F

src/app/api/email/triggers/
├── approval/route.ts                  ← Phase D, falls Variante 2
├── new-contact/route.ts               ← Phase E
├── new-message/route.ts               ← Phase E
└── new-offer/route.ts                 ← Phase E

src/app/api/webhooks/resend/route.ts   ← Phase F (bounces/opens)

supabase/migrations/0008_email_log.sql ← Phase F

email-templates/supabase-auth/         ← Mirror of Supabase Dashboard templates
├── confirm-signup.html
├── magic-link.html
├── reset-password.html
└── change-email.html

package.json scripts:
  "email": "email dev --dir src/emails"  ← Phase C

.env.example (neu erstellen oder local):
  RESEND_API_KEY=
  EMAIL_FROM=noreply@profleet.de
  EMAIL_REPLY_TO=info@profleet.de
  EMAIL_WEBHOOK_SECRET=<random-32-bytes-hex>
```

---

## Verification

Pro Phase:

**Phase A:**
- `dig TXT profleet.de` zeigt SPF + DKIM Records
- Resend Dashboard zeigt Domain als "Verified"
- Test-Mail aus Resend-UI kommt an, mail-tester.com Score >= 9/10

**Phase B:**
- Signup als Test-User → Confirm-Mail kommt von `noreply@profleet.de`
- Password-Reset triggern → Mail kommt mit eigenem Branding
- Magic-Link-Login funktioniert

**Phase C:**
- `npm run email` startet React-Email Dev-Server
- ApprovalWelcomeEmail rendert sauber im Browser-Preview
- `EmailLayout` zeigt Header/Footer korrekt

**Phase D:**
- Test-User in DB: `UPDATE profiles SET is_active = true WHERE id = '<test-user-id>'`
- Webhook feuert, Mail kommt an
- mail-tester.com Score >= 9/10 für die echte Mail (nicht nur Test-Mail)

**Phase E:**
- Käufer kontaktiert Händler → Händler kriegt "Neue Kontaktanfrage"
- Käufer schickt Nachricht → Händler kriegt "Neue Nachricht" (nicht mehr als 1× pro Stunde)
- Händler reicht Offer ein → Käufer kriegt "Neues Angebot"

**Phase F:**
- Resend-Webhook erreichbar (Test-Bounce simulieren via Resend Dashboard)
- `profiles.email_status` flippt auf `bounced` bei Test-Bounce
- `email_log`-Tabelle bekommt Einträge

---

## Risiken & Mitigationen

| Risiko | Mitigation |
|---|---|
| DKIM/SPF nicht propagiert → Auth-Mails landen im Spam | DNS-Check via [mxtoolbox.com](https://mxtoolbox.com) vor Phase B |
| Resend SMTP-Config falsch → Supabase kann keine Auth-Mails verschicken | "Send test email" in Supabase vor produktiver Aktivierung. Fallback: SMTP-Setting wieder deaktivieren → Supabase nimmt wieder Default |
| Resend API-Key leakt → Spam-Versand auf unsere Kosten | API-Key nur in Server-Env (`RESEND_API_KEY` ohne `NEXT_PUBLIC_`-Prefix), Rate-Limit in Resend setzen (z.B. max 1000/Tag bis App wächst) |
| User wird mit Notifications gespammt → unsubscribe-rate steigt | Phase F (Throttling + Opt-Out) muss vor breitem Rollout fertig sein |
| Supabase-Auth-Templates im Dashboard sind nicht versioniert | Mirror unter `email-templates/supabase-auth/` im Repo, commits dokumentieren Änderungen |
| profleet.de bei SiteGround nicht für externe DNS-Records vorbereitet | Vor Phase A in SiteGround DNS Zone Editor prüfen, ob beliebige TXT/MX-Records möglich sind (sollten — Standard) |

---

## Implementierungsreihenfolge / PR-Strategie

1. **PR-1 (Phase A+B):** DNS-Records + Resend Setup + Supabase Custom SMTP + Auth-Templates. Kein Repo-Code, aber dokumentiert in `email-templates/supabase-auth/` + Anleitung in `supabase/EMAIL_SETUP.md`.
2. **PR-2 (Phase C):** Template-Infrastruktur, Layout-Komponente, `lib/email/send.ts`. Noch keine echten Mails verschickt — nur Vorbereitung.
3. **PR-3 (Phase D):** Approval-Welcome-Mail, erster echter Send via App. DB-Webhook + API-Route + Template.
4. **PR-4 (Phase E):** Drei Notification-Mails + drei Trigger-Endpoints + DB-Webhooks.
5. **PR-5 (Phase F):** `email_log`-Migration, Throttling, Resend-Webhook für Bounces, Opt-Out im Profil.
6. **PR-6 (Phase G):** Notification-Preferences JSONB + Settings-UI + Marken-getargetete Tender-Notification + Unsubscribe-Flow mit Token-Auth.
7. **PR-7 (Phase H):** profiles-Consent-Spalten + UI-Toggle + Brevo-Subscribe/Unsubscribe-API-Routes + Brevo-Webhook für Double-Opt-In Confirmation + Reconciliation-Helper.

Jeder PR ist eigenständig deploybar und einzeln testbar.

## Stripe-Mails — wie verzahnen

Stripe verschickt einige Mails **selbst** (Receipts/Invoices/Payment-Failed), das können wir nicht über unseren Resend-Account routen. Aber wir können die Optik & Branding angleichen.

**Empfohlene Aufteilung:**

| Mail-Typ | Wer verschickt | Wie | Wann konfigurieren |
|---|---|---|---|
| **Receipt** (Zahlung erfolgreich) | Stripe selbst | Stripe Dashboard → Settings → Customer emails → "Successful payments" aktivieren | bei Stripe-Go-Live |
| **Invoice / Rechnung (PDF)** | Stripe selbst | automatisch bei Abos, rechtskonform | bei Stripe-Go-Live |
| **Payment Failed** | Stripe selbst | Stripe Dashboard → Settings → Customer emails → "Failed payments" aktivieren | bei Stripe-Go-Live |
| **Welcome to Pro** | Unsere App via Resend | Stripe-Webhook `customer.subscription.created` → unser Code rendert eigenes Template → Resend | mit Phase 7b-Webhook-Implementierung |
| **Cancellation-Confirmed** | Unsere App via Resend | Stripe-Webhook `customer.subscription.deleted` → unser Code → Resend | dito |
| **"Subscription läuft bald aus"** (Reminder) | Unsere App via Resend | Cron + `subscription_until`-Spalte | optional Phase F+ |

**Branding der Stripe-Mails — zwei Konfig-Schritte:**

1. **Stripe Dashboard → Settings → Branding** — Logo, Farben, Geschäftsadresse, Support-Email. Stripe nutzt das für PDF-Invoices und Mail-Optik.
2. **Stripe Dashboard → Settings → Customer emails → Custom Domain** — DNS-Records bei SiteGround zusätzlich anlegen (separat von den Resend-Records aus Phase A), dann sehen Receipts/Invoices aus, als kämen sie von `noreply@profleet.de`. Stripe macht eigene SPF/DKIM-Setup hier.

Sobald Phase 7b der Schema-Konsolidierung scharf geschaltet wird (echter Webhook-Handler statt 501-Stub), wird die "Welcome to Pro"-Mail dort eingebaut — als drittes Template neben Approval-Welcome und Notification-Mails, läuft durch die gleiche `send.ts`-Infrastruktur. Templates teilen das `EmailLayout` und das Brand-Kit.

## Was kommt erst später
- **Digest-Mode** (statt single Notification: tägliche Zusammenfassung "Du hast 3 neue Nachrichten, 2 neue Offers")
- **Admin-UI** zum `is_active`-Toggle (heute SQL) — erleichtert Phase D Variante 2
- **Unsubscribe-Link** im Footer aller Notification-Mails (Phase F, mit Opt-Out-Spalte)
