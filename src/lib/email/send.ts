import 'server-only';
import { render } from '@react-email/components';
import { Resend } from 'resend';
import type { ReactElement } from 'react';
import type { EmailSendResult } from './types';

let _resend: Resend | null = null;

function getResendClient(): Resend {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error('[email/send] RESEND_API_KEY is not set');
  }
  _resend = new Resend(key);
  return _resend;
}

type SendArgs = {
  to: string | string[];
  subject: string;
  react: ReactElement;
  replyTo?: string;
};

export async function sendEmail({
  to,
  subject,
  react,
  replyTo,
}: SendArgs): Promise<EmailSendResult> {
  const from = process.env.EMAIL_FROM ?? 'noreply@profleet.de';
  const reply = replyTo ?? process.env.EMAIL_REPLY_TO ?? 'info@profleet.de';

  const [html, text] = await Promise.all([
    render(react),
    render(react, { plainText: true }),
  ]);

  try {
    const result = await getResendClient().emails.send({
      from,
      to,
      subject,
      html,
      text,
      replyTo: reply,
    });

    if (result.error) {
      console.error('[email/send] resend error', result.error);
      return { id: null, error: new Error(result.error.message) };
    }

    return { id: result.data?.id ?? null, error: null };
  } catch (err) {
    console.error('[email/send] unexpected error', err);
    return { id: null, error: err as Error };
  }
}
