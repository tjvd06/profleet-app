import 'server-only';

export type WebhookAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 500; reason: string };

export function verifyWebhookSecret(request: Request): WebhookAuthResult {
  const secret = process.env.EMAIL_WEBHOOK_SECRET;
  if (!secret) {
    return { ok: false, status: 500, reason: 'EMAIL_WEBHOOK_SECRET not configured' };
  }

  const header = request.headers.get('authorization');
  const expected = `Bearer ${secret}`;

  if (!header || header !== expected) {
    return { ok: false, status: 401, reason: 'Invalid or missing webhook secret' };
  }

  return { ok: true };
}
