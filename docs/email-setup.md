# Email-Setup (Phase A): Resend + DNS bei SiteGround

Runbook für die einmalige externe Einrichtung des Email-Versands. Code-Seite siehe [src/emails/README.md](../src/emails/README.md), Auth-Mails siehe [supabase-auth-emails.md](./supabase-auth-emails.md).

## Ziel

- Domain `profleet.de` ist in Resend verifiziert (SPF/DKIM/DMARC sauber).
- `RESEND_API_KEY` liegt in Vercel-Env (Production + Preview).
- Test-Mail von `noreply@profleet.de` an externe Adresse erreicht Inbox (nicht Spam), mail-tester.com-Score ≥ 9/10.
- Postfach `info@profleet.de` bei SiteGround bleibt erreichbar für eingehende Replies.

## Schritt 1 — Resend-Account

1. Auf [resend.com](https://resend.com) registrieren (Free Tier: 3.000 Mails/Mo, 100/Tag).
2. Im Dashboard: **Domains → Add Domain → `profleet.de`**.
3. Region: **EU (Frankfurt)** wählen — DSGVO-relevant für DACH-User.
4. Resend zeigt drei DNS-Records zur Eintragung an. Werte notieren.

## Schritt 2 — DNS bei SiteGround

Site Tools → **Domain → DNS Zone Editor** für `profleet.de`. Folgende Records anlegen:

| Type | Host (Name) | Wert | Priority | TTL |
|---|---|---|---|---|
| `MX` | `send` | (aus Resend Dashboard, typisch `feedback-smtp.eu-west-1.amazonses.com`) | 10 | 3600 |
| `TXT` | `send` | (SPF, aus Resend, typisch `v=spf1 include:amazonses.com ~all`) | — | 3600 |
| `TXT` | `resend._domainkey` | (DKIM-Public-Key, langer String aus Resend) | — | 3600 |
| `TXT` | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:dmarc@profleet.de` | — | 3600 |

**Hinweise:**
- Bei SiteGround Host-Feld ohne Domain-Suffix eintragen (`send` statt `send.profleet.de`).
- Der DMARC-Record ist **nicht** in Resend gelistet — wir setzen ihn manuell. Start mit `p=quarantine`, später auf `p=reject` hochziehen, wenn die Reputation steht.
- DMARC `rua`-Adresse: `dmarc@profleet.de` einrichten oder auf eine bestehende Inbox umleiten — sonst gehen Reports verloren.

## Schritt 3 — Verifikation abwarten

DNS-Propagation: typisch 15 min – 24 h.

Status-Checks vom Terminal:
```bash
dig MX  send.profleet.de               +short
dig TXT send.profleet.de               +short
dig TXT resend._domainkey.profleet.de  +short
dig TXT _dmarc.profleet.de             +short
```

Im Resend Dashboard: **Domains → profleet.de** muss bei allen drei Records ein grünes "Verified" zeigen.

## Schritt 4 — API-Key generieren

Resend Dashboard → **API Keys → Create API Key**:
- Name: `profleet-production`
- Permission: **Sending access** (nicht Full Access)
- Domain: `profleet.de`

Den Key sofort kopieren — er ist nur einmal sichtbar.

**Lokal:** in `.env.local` (nicht committen, siehe `.env.example`).

**Produktiv (Coolify auf Hetzner):** Coolify-Dashboard → Application `profleet-app` → **Environment Variables** → folgende Vars setzen (alle als "Build Time" markieren wenn Next.js sie zur Build-Zeit braucht; `RESEND_*` reichen Runtime):

```
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxx
EMAIL_FROM=noreply@profleet.de
EMAIL_REPLY_TO=info@profleet.de
```

Nach dem Speichern Application neu deployen (Coolify → Redeploy), damit der Container die neuen Env-Vars sieht.

## Schritt 5 — Test-Mail

Resend hat **keinen "Send Test"-Button** im Dashboard — nur API. Drei Wege:

**Option A — curl gegen Resend-API (schnellster Test):**

```bash
curl -X POST 'https://api.resend.com/emails' \
  -H 'Authorization: Bearer YOUR_RESEND_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "from": "noreply@profleet.de",
    "to": "deine-adresse@example.com",
    "reply_to": "info@profleet.de",
    "subject": "Resend-Test profleet",
    "html": "<p>Hallo aus Resend. Wenn diese Mail ankommt, ist Phase A abgeschlossen.</p>"
  }'
```

Antwort `{"id":"..."}` = abgeschickt. Antwort `{"statusCode":403,"name":"validation_error","message":"The profleet.de domain is not verified..."}` = DNS noch nicht durch oder Domain nicht verifiziert.

**Option B — mail-tester.com Spam-Score:**

`test-xxxxx@mail-tester.com` Adresse generieren (auf [mail-tester.com](https://www.mail-tester.com)) und via curl (siehe oben) an diese Adresse senden. Score-Ziel: **≥ 9/10**.

**Option C — Resend Activity-Log:**

Resend Dashboard → **Logs** zeigt jeden Send-Versuch inklusive Bounce/Delivered-Status. Nach Option A hier verifizieren, dass `Delivered` steht.

## Schritt 6 — Inbox-Pfad bleibt intakt

`noreply@profleet.de` ist **nur ausgehend** (Resend). Replies darauf werden via `Reply-To: info@profleet.de` automatisch an die SiteGround-Inbox umgeleitet — das Postfach bei SiteGround bleibt unverändert.

**Wichtig:** Der MX-Record auf `profleet.de` (Hauptdomain, nicht `send.profleet.de`) muss weiterhin auf SiteGround zeigen, damit eingehende Mails ankommen. Im DNS Zone Editor prüfen, dass dort nichts überschrieben wird — die Resend-MX-Records gehen ausschließlich auf den Subhost `send`.

## Verifikation Phase A komplett

- [ ] Resend Dashboard zeigt Domain als "Verified" (alle 3 Records grün)
- [ ] `dig` liefert die erwarteten Werte für SPF/DKIM/DMARC
- [ ] Test-Mail aus Resend kommt in eigener Inbox an (nicht Spam)
- [ ] mail-tester.com Score ≥ 9/10
- [ ] `RESEND_API_KEY` in Coolify-Env-Variables für `profleet-app` gesetzt + Application redeployed
- [ ] Hauptdomain-MX (`profleet.de` → SiteGround) unverändert, Inbox `info@profleet.de` erreichbar

Nächster Schritt: [Phase B — Supabase Auth via eigener Domain](./supabase-auth-emails.md).
