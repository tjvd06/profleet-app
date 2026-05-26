import { Heading, Hr, Section, Text } from '@react-email/components';
import { Button } from './components/Button';
import { EMAIL_COLORS, EmailLayout } from './components/EmailLayout';

type NewOfferEmailProps = {
  recipientFirstName?: string | null;
  dealerName: string;
  vehicleLabel?: string | null;
  totalPriceFormatted?: string | null;
  offerUrl: string;
  unsubscribeUrl?: string;
};

export function NewOfferEmail({
  recipientFirstName,
  dealerName,
  vehicleLabel,
  totalPriceFormatted,
  offerUrl,
  unsubscribeUrl,
}: NewOfferEmailProps) {
  const greeting = recipientFirstName ? `Hallo ${recipientFirstName},` : 'Hallo,';

  return (
    <EmailLayout
      preview={`Neues Angebot von ${dealerName} auf Ihre Ausschreibung`}
      unsubscribeUrl={unsubscribeUrl}
    >
      <Heading style={headingStyle}>Neues Angebot auf Ihre Ausschreibung</Heading>

      <Text style={paragraphStyle}>{greeting}</Text>

      <Text style={paragraphStyle}>
        <strong style={{ color: EMAIL_COLORS.navy }}>{dealerName}</strong> hat ein
        Angebot auf eine Ihrer Ausschreibungen abgegeben. Sie können das Angebot jetzt
        prüfen und mit dem Händler in Kontakt treten.
      </Text>

      {(vehicleLabel || totalPriceFormatted) && (
        <Section style={infoBoxStyle}>
          {vehicleLabel && (
            <Text style={infoBoxRowStyle}>
              <span style={infoBoxLabelStyle}>Fahrzeug</span>
              <span style={infoBoxValueStyle}>{vehicleLabel}</span>
            </Text>
          )}
          {totalPriceFormatted && (
            <Text style={infoBoxRowStyle}>
              <span style={infoBoxLabelStyle}>Gesamtpreis</span>
              <span style={infoBoxValueStyle}>{totalPriceFormatted}</span>
            </Text>
          )}
        </Section>
      )}

      <Section style={buttonWrapStyle}>
        <Button href={offerUrl}>Angebot ansehen</Button>
      </Section>

      <Text style={fallbackHintStyle}>
        Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:
      </Text>
      <Text style={fallbackLinkStyle}>{offerUrl}</Text>

      <Hr style={hrStyle} />

      <Text style={infoStyle}>
        Sie können in Ihren Einstellungen festlegen, welche Benachrichtigungen Sie per
        E-Mail erhalten möchten.
      </Text>
    </EmailLayout>
  );
}

NewOfferEmail.PreviewProps = {
  recipientFirstName: 'Theo',
  dealerName: 'Autohaus Müller GmbH',
  vehicleLabel: 'VW Golf 1.5 TSI Style',
  totalPriceFormatted: '24.890,00 €',
  offerUrl: 'https://app.profleet.de/dashboard/eingang/abc-123/angebot',
} satisfies NewOfferEmailProps;

export default NewOfferEmail;

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

const infoBoxStyle = {
  margin: '8px 0 24px 0',
  padding: '16px 20px',
  backgroundColor: EMAIL_COLORS.slateLight,
  borderRadius: '8px',
  border: `1px solid ${EMAIL_COLORS.slateBorder}`,
};

const infoBoxRowStyle = {
  margin: '0 0 8px 0',
  fontSize: '14px',
  lineHeight: 1.5,
  display: 'block',
};

const infoBoxLabelStyle = {
  display: 'inline-block',
  width: '110px',
  color: EMAIL_COLORS.slate,
  fontWeight: 500,
};

const infoBoxValueStyle = {
  color: EMAIL_COLORS.textStrong,
  fontWeight: 600,
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
