import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import type { ReactNode } from 'react';

export const EMAIL_COLORS = {
  navy: '#030B1A',
  navyLight: '#163D7A',
  blueStart: '#3B82F6',
  blueEnd: '#22D3EE',
  slate: '#64748B',
  slateLight: '#F1F5F9',
  slateBorder: '#E2E8F0',
  slateMuted: '#94A3B8',
  textStrong: '#0F172A',
  textBody: '#475569',
  white: '#FFFFFF',
} as const;

export const EMAIL_FONT_STACK =
  "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

type EmailLayoutProps = {
  preview: string;
  children: ReactNode;
  unsubscribeUrl?: string;
};

export function EmailLayout({ preview, children, unsubscribeUrl }: EmailLayoutProps) {
  return (
    <Html lang="de">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={bodyStyle}>
        <Container style={cardStyle}>
          <Section style={headerStyle}>
            <table width="100%" cellPadding={0} cellSpacing={0} role="presentation">
              <tbody>
                <tr>
                  <td style={brandTextStyle}>proFleet</td>
                  <td align="right" style={brandTaglineStyle}>
                    Die Ausschreibungsplattform für Flotten
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Section style={contentStyle}>{children}</Section>

          <Section style={footerStyle}>
            <Text style={footerReplyStyle}>
              Antworten Sie einfach auf diese E-Mail (
              <Link href="mailto:info@profleet.de" style={footerLinkInlineStyle}>
                info@profleet.de
              </Link>
              ), wenn Sie Fragen haben.
            </Text>
            {unsubscribeUrl && (
              <Text style={footerReplyStyle}>
                Diese Art von Benachrichtigung nicht mehr erhalten?{' '}
                <Link href={unsubscribeUrl} style={footerLinkInlineStyle}>
                  Mit einem Klick abmelden
                </Link>
                .
              </Text>
            )}
            <Hr style={footerHrStyle} />
            <Text style={footerImprintStyle}>
              proFleet GmbH · Hartstraße 23 · 82110 München · Tel. +49 89 306365-10
              <br />
              <Link href="https://profleet.de/impressum" style={footerLinkStyle}>
                Impressum
              </Link>
              {' · '}
              <Link href="https://profleet.de/datenschutz" style={footerLinkStyle}>
                Datenschutz
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const bodyStyle = {
  margin: 0,
  padding: '32px 16px',
  backgroundColor: EMAIL_COLORS.slateLight,
  fontFamily: EMAIL_FONT_STACK,
  color: EMAIL_COLORS.textStrong,
};

const cardStyle = {
  maxWidth: '600px',
  width: '100%',
  margin: '0 auto',
  backgroundColor: EMAIL_COLORS.white,
  borderRadius: '12px',
  overflow: 'hidden',
  boxShadow: '0 1px 3px rgba(3,11,26,0.08)',
};

const headerStyle = {
  backgroundColor: EMAIL_COLORS.navy,
  padding: '28px 32px',
};

const brandTextStyle = {
  color: EMAIL_COLORS.white,
  fontSize: '22px',
  fontWeight: 700,
  letterSpacing: '-0.02em',
};

const brandTaglineStyle = {
  color: EMAIL_COLORS.slateMuted,
  fontSize: '13px',
  fontWeight: 500,
};

const contentStyle = {
  padding: '40px 32px 32px 32px',
  backgroundColor: EMAIL_COLORS.white,
};

const footerStyle = {
  backgroundColor: EMAIL_COLORS.navy,
  padding: '24px 32px',
  color: EMAIL_COLORS.slateMuted,
  fontSize: '12px',
  lineHeight: 1.6,
};

const footerReplyStyle = {
  margin: 0,
  color: EMAIL_COLORS.slateMuted,
  fontSize: '12px',
  lineHeight: 1.6,
};

const footerLinkInlineStyle = {
  color: EMAIL_COLORS.blueEnd,
  textDecoration: 'none',
};

const footerHrStyle = {
  borderColor: 'rgba(255,255,255,0.08)',
  margin: '16px 0',
};

const footerImprintStyle = {
  margin: 0,
  color: EMAIL_COLORS.slate,
  fontSize: '12px',
  lineHeight: 1.6,
};

const footerLinkStyle = {
  color: EMAIL_COLORS.slateMuted,
  textDecoration: 'underline',
};
