import { Heading, Hr, Section, Text } from '@react-email/components';
import { Button } from './components/Button';
import { EMAIL_COLORS, EmailLayout } from './components/EmailLayout';

type NewMessageEmailProps = {
  recipientFirstName?: string | null;
  senderName: string;
  messagePreview: string;
  conversationUrl: string;
  unsubscribeUrl?: string;
};

export function NewMessageEmail({
  recipientFirstName,
  senderName,
  messagePreview,
  conversationUrl,
  unsubscribeUrl,
}: NewMessageEmailProps) {
  const greeting = recipientFirstName ? `Hallo ${recipientFirstName},` : 'Hallo,';

  return (
    <EmailLayout
      preview={`Neue Nachricht von ${senderName} auf proFleet`}
      unsubscribeUrl={unsubscribeUrl}
    >
      <Heading style={headingStyle}>Sie haben eine neue Nachricht</Heading>

      <Text style={paragraphStyle}>{greeting}</Text>

      <Text style={paragraphStyle}>
        <strong style={{ color: EMAIL_COLORS.navy }}>{senderName}</strong> hat
        Ihnen über proFleet eine neue Nachricht gesendet.
      </Text>

      <Section style={quoteWrapStyle}>
        <Text style={quoteStyle}>{messagePreview}</Text>
      </Section>

      <Section style={buttonWrapStyle}>
        <Button href={conversationUrl}>Zur Konversation</Button>
      </Section>

      <Text style={fallbackHintStyle}>
        Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:
      </Text>
      <Text style={fallbackLinkStyle}>{conversationUrl}</Text>

      <Hr style={hrStyle} />

      <Text style={infoStyle}>
        Sie können in Ihren Einstellungen festlegen, welche Benachrichtigungen Sie per
        E-Mail erhalten möchten.
      </Text>
    </EmailLayout>
  );
}

NewMessageEmail.PreviewProps = {
  recipientFirstName: 'Anna',
  senderName: 'Autohaus Müller GmbH',
  messagePreview:
    'Guten Tag, vielen Dank für Ihre Anfrage. Wir haben den VW Golf in der gewünschten Konfiguration verfügbar und können Ihnen ein attraktives Angebot machen…',
  conversationUrl: 'https://app.profleet.de/dashboard/nachrichten?contact=abc123',
} satisfies NewMessageEmailProps;

export default NewMessageEmail;

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

const quoteWrapStyle = {
  margin: '8px 0 24px 0',
  padding: '16px 20px',
  backgroundColor: EMAIL_COLORS.slateLight,
  borderLeft: `3px solid ${EMAIL_COLORS.blueStart}`,
  borderRadius: '6px',
};

const quoteStyle = {
  margin: 0,
  fontSize: '14px',
  lineHeight: 1.6,
  color: EMAIL_COLORS.textStrong,
  fontStyle: 'italic' as const,
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
