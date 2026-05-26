# Email Templates

React-Email-Templates für App-versendete Mails. Auth-Mails (Confirm Signup, Magic Link, Reset, Email-Change) leben separat als HTML-Mirror unter [`email-templates/supabase-auth/`](../../email-templates/supabase-auth/).

## Lokale Preview

```bash
npm run email
```

Öffnet [http://localhost:3030](http://localhost:3030). Listet alle `*.tsx`-Templates in diesem Verzeichnis. Hot-Reload bei Änderungen.

Port **3030** ist bewusst gewählt — `next dev` belegt 3000/3001.

## Verzeichnis-Struktur

```
src/emails/
├── components/
│   ├── EmailLayout.tsx     Shared Wrapper: Header, Footer, Brand-Tokens
│   └── Button.tsx          Branded CTA-Button (solid navy, kein Gradient)
├── ApprovalWelcomeEmail.tsx
└── README.md
```

Brand-Tokens (`EMAIL_COLORS`, `EMAIL_FONT_STACK`) werden zentral aus [components/EmailLayout.tsx](./components/EmailLayout.tsx) exportiert.

## Neues Template hinzufügen

```tsx
// src/emails/MyNewEmail.tsx
import { Heading, Text } from '@react-email/components';
import { Button } from './components/Button';
import { EmailLayout } from './components/EmailLayout';

type MyNewEmailProps = {
  firstName: string;
  actionUrl: string;
};

export function MyNewEmail({ firstName, actionUrl }: MyNewEmailProps) {
  return (
    <EmailLayout preview="Kurze Vorschau-Zeile im Postfach">
      <Heading>Hallo {firstName}</Heading>
      <Text>...</Text>
      <Button href={actionUrl}>Jetzt handeln</Button>
    </EmailLayout>
  );
}

MyNewEmail.PreviewProps = {
  firstName: 'Max',
  actionUrl: 'https://profleet.de/...',
} satisfies MyNewEmailProps;

export default MyNewEmail;
```

`PreviewProps` werden vom `react-email`-Dev-Server für die Live-Preview genutzt — ohne sie würde das Template ohne Daten gerendert.

## Versand

Templates werden via [`src/lib/email/send.ts`](../lib/email/send.ts) verschickt:

```ts
import { sendEmail } from '@/lib/email/send';
import { ApprovalWelcomeEmail } from '@/emails/ApprovalWelcomeEmail';

const { id, error } = await sendEmail({
  to: 'user@example.com',
  subject: 'Ihr proFleet-Konto ist freigeschaltet',
  react: <ApprovalWelcomeEmail firstName="Max" loginUrl="https://profleet.de/anmelden" />,
});
```

`sendEmail` ist server-only (`import 'server-only'`). Aufrufer sind API-Routes oder server actions — niemals direkt aus dem Client.

## Email-CSS-Quirks

- **Kein flexbox, kein grid** — Outlook und ältere Clients ignorieren das. Layout via `<table>` und Inline-Styles.
- **Inline-Styles bevorzugt** — manche Clients strippen `<style>`-Blöcke.
- **Max-Width 600 px** — Standard-Breite für Mail-Inhalte; auf Mobile responsive.
- **Bilder via absolute URL** — z.B. `https://profleet.de/logo.svg`. Email-Clients laden externe Bilder erst nach User-Klick auf "Bilder anzeigen", deshalb wo möglich Text-Fallback.
- **Kein Gradient auf Buttons** — Outlook rendert linear-gradients nicht. Solid `#030B1A` (navy-950) ist die sichere Wahl.
- **Preview-Text** — Die `preview`-Prop in `EmailLayout` zeigt sich als Vorschau-Snippet im Postfach (vor dem Öffnen). Sollte den Inhalt einer Mail in einem Satz zusammenfassen.

## Roadmap

Live (siehe [email-integration.md](../../email-integration.md)):

- **ApprovalWelcomeEmail.tsx** (Phase D) — "Ihr Konto ist freigeschaltet"
- **NewMessageEmail.tsx** (Phase E) — "Neue Nachricht von …"
- **NewOfferEmail.tsx** (Phase E) — "Neues Angebot auf Ihre Ausschreibung"

Geplant:

- **NewTenderMatchingEmail.tsx** (Phase G) — "Neue Ausschreibung für Ihre Marken"
- **ReviewReceivedEmail.tsx** (Phase F+) — "Sie haben eine Bewertung erhalten"
- **SubscriptionWelcomeEmail.tsx** (Stripe-Phase) — "Willkommen bei proFleet Pro"
