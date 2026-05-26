import { Button as REButton } from '@react-email/components';
import type { ReactNode } from 'react';
import { EMAIL_COLORS } from './EmailLayout';

type ButtonProps = {
  href: string;
  children: ReactNode;
};

export function Button({ href, children }: ButtonProps) {
  return (
    <REButton href={href} style={buttonStyle}>
      {children}
    </REButton>
  );
}

const buttonStyle = {
  backgroundColor: EMAIL_COLORS.navy,
  color: EMAIL_COLORS.white,
  padding: '14px 28px',
  borderRadius: '8px',
  fontSize: '15px',
  fontWeight: 600,
  textDecoration: 'none',
  display: 'inline-block',
};
