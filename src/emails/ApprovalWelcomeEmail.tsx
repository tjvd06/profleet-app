import { Heading, Hr, Section, Text } from '@react-email/components';
import { Button } from './components/Button';
import { EMAIL_COLORS, EmailLayout } from './components/EmailLayout';

type ApprovalWelcomeEmailProps = {
  firstName?: string | null;
  loginUrl: string;
};

export function ApprovalWelcomeEmail({ firstName, loginUrl }: ApprovalWelcomeEmailProps) {
  const greeting = firstName ? `Hallo ${firstName},` : 'Hallo,';

  return (
    <EmailLayout preview="Ihr proFleet-Konto ist freigeschaltet. Jetzt anmelden und mit Ausschreibungen starten.">
      <Heading style={headingStyle}>Ihr proFleet-Konto ist freigeschaltet</Heading>

      <Text style={paragraphStyle}>{greeting}</Text>

      <Text style={paragraphStyle}>
        herzlich willkommen bei proFleet. Ihr Konto wurde geprüft und ist nun aktiv.
        Sie können sich ab sofort anmelden und mit Ausschreibungen starten.
      </Text>

      <Section style={buttonWrapStyle}>
        <Button href={loginUrl}>Jetzt anmelden</Button>
      </Section>

      <Text style={fallbackHintStyle}>
        Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:
      </Text>
      <Text style={fallbackLinkStyle}>{loginUrl}</Text>

      <Hr style={hrStyle} />

      <Text style={infoStyle}>
        Bei Fragen erreichen Sie uns jederzeit unter{' '}
        <a href="mailto:info@profleet.de" style={inlineLinkStyle}>
          info@profleet.de
        </a>
        . Wir freuen uns, Sie an Bord zu haben.
      </Text>
    </EmailLayout>
  );
}

ApprovalWelcomeEmail.PreviewProps = {
  firstName: 'Max',
  loginUrl: 'https://app.profleet.de/anmelden',
} satisfies ApprovalWelcomeEmailProps;

export default ApprovalWelcomeEmail;

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

const buttonWrapStyle = {
  margin: '24px 0 28px 0',
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

const inlineLinkStyle = {
  color: EMAIL_COLORS.blueStart,
  textDecoration: 'underline',
};
