import { Heading, Hr, Section, Text } from '@react-email/components';
import { Button } from './components/Button';
import { EMAIL_COLORS, EmailLayout } from './components/EmailLayout';

type Vehicle = {
  brand: string;
  modelName?: string | null;
  quantity?: number | null;
};

type NewTenderMatchingEmailProps = {
  recipientFirstName?: string | null;
  matchedBrands: string[];
  vehicles: Vehicle[];
  tenderUrl: string;
  unsubscribeUrl?: string;
};

export function NewTenderMatchingEmail({
  recipientFirstName,
  matchedBrands,
  vehicles,
  tenderUrl,
  unsubscribeUrl,
}: NewTenderMatchingEmailProps) {
  const greeting = recipientFirstName ? `Hallo ${recipientFirstName},` : 'Hallo,';
  const brandList = matchedBrands.join(', ');

  return (
    <EmailLayout
      preview={`Neue Ausschreibung mit Marken: ${brandList}`}
      unsubscribeUrl={unsubscribeUrl}
    >
      <Heading style={headingStyle}>Neue Ausschreibung passt zu Ihren Marken</Heading>

      <Text style={paragraphStyle}>{greeting}</Text>

      <Text style={paragraphStyle}>
        Auf proFleet wurde gerade eine neue Ausschreibung veröffentlicht, die zu den
        von Ihnen vertretenen Marken passt:{' '}
        <strong style={{ color: EMAIL_COLORS.navy }}>{brandList}</strong>.
      </Text>

      {vehicles.length > 0 && (
        <Section style={vehiclesBoxStyle}>
          <Text style={vehiclesHeaderStyle}>Gesuchte Fahrzeuge</Text>
          {vehicles.map((v, i) => (
            <Text key={i} style={vehicleRowStyle}>
              {v.quantity ? `${v.quantity}× ` : ''}
              <strong style={{ color: EMAIL_COLORS.textStrong }}>
                {v.brand}
                {v.modelName ? ` ${v.modelName}` : ''}
              </strong>
            </Text>
          ))}
        </Section>
      )}

      <Text style={paragraphStyle}>
        Reichen Sie jetzt Ihr Angebot ein, bevor andere Händler die Anfrage bedienen.
      </Text>

      <Section style={buttonWrapStyle}>
        <Button href={tenderUrl}>Ausschreibung ansehen</Button>
      </Section>

      <Text style={fallbackHintStyle}>
        Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:
      </Text>
      <Text style={fallbackLinkStyle}>{tenderUrl}</Text>

      <Hr style={hrStyle} />

      <Text style={infoStyle}>
        Sie erhalten diese Mail, weil mindestens eine Ihrer im Profil hinterlegten
        Marken zur neuen Ausschreibung passt. Marken-Auswahl ändern: Profil →
        Marken.
      </Text>
    </EmailLayout>
  );
}

NewTenderMatchingEmail.PreviewProps = {
  recipientFirstName: 'Lars',
  matchedBrands: ['VW', 'Audi'],
  vehicles: [
    { brand: 'VW', modelName: 'Golf 1.5 TSI', quantity: 5 },
    { brand: 'Audi', modelName: 'A3 Sportback', quantity: 2 },
  ],
  tenderUrl: 'https://app.profleet.de/dashboard/ausschreibungen/abc-123',
  unsubscribeUrl: 'https://app.profleet.de/unsubscribe?token=xxx',
} satisfies NewTenderMatchingEmailProps;

export default NewTenderMatchingEmail;

const headingStyle = {
  margin: '0 0 16px 0',
  fontSize: '24px',
  fontWeight: 700,
  lineHeight: 1.3,
  color: EMAIL_COLORS.navy,
};

const paragraphStyle = {
  margin: '0 0 16px 0',
  fontSize: '15px',
  lineHeight: 1.6,
  color: EMAIL_COLORS.textBody,
};

const vehiclesBoxStyle = {
  margin: '8px 0 24px 0',
  padding: '16px 20px',
  backgroundColor: EMAIL_COLORS.slateLight,
  borderRadius: '8px',
  border: `1px solid ${EMAIL_COLORS.slateBorder}`,
};

const vehiclesHeaderStyle = {
  margin: '0 0 8px 0',
  fontSize: '12px',
  fontWeight: 700,
  letterSpacing: '0.05em',
  textTransform: 'uppercase' as const,
  color: EMAIL_COLORS.slate,
};

const vehicleRowStyle = {
  margin: '0 0 4px 0',
  fontSize: '14px',
  lineHeight: 1.5,
  color: EMAIL_COLORS.textStrong,
};

const buttonWrapStyle = {
  margin: '8px 0 24px 0',
};

const fallbackHintStyle = {
  margin: '0 0 6px 0',
  fontSize: '13px',
  lineHeight: 1.6,
  color: EMAIL_COLORS.slate,
};

const fallbackLinkStyle = {
  margin: 0,
  fontSize: '13px',
  lineHeight: 1.5,
  color: EMAIL_COLORS.blueStart,
  wordBreak: 'break-all' as const,
};

const hrStyle = {
  borderColor: EMAIL_COLORS.slateBorder,
  margin: '28px 0 20px 0',
};

const infoStyle = {
  margin: 0,
  fontSize: '13px',
  lineHeight: 1.6,
  color: EMAIL_COLORS.slate,
};
