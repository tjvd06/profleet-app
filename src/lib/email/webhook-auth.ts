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
    debugAuthMismatch(header, secret);
    return { ok: false, status: 401, reason: 'Invalid or missing webhook secret' };
  }

  return { ok: true };
}

// TEMPORARY DEBUG — REMOVE AFTER auth issue is solved
function debugAuthMismatch(header: string | null, secret: string) {
  if (header === null) {
    console.error('[webhook-auth] header: MISSING');
    return;
  }

  const expectedPrefix = 'Bearer ';
  const hasPrefix = header.startsWith(expectedPrefix);
  const received = hasPrefix ? header.slice(expectedPrefix.length) : header;

  const summarize = (s: string) => ({
    length: s.length,
    first4: s.slice(0, 4),
    last4: s.slice(-4),
    firstCharCode: s.length > 0 ? s.charCodeAt(0) : null,
    lastCharCode: s.length > 0 ? s.charCodeAt(s.length - 1) : null,
    hasWhitespace: /\s/.test(s),
    hasQuotes: /["']/.test(s),
  });

  console.error('[webhook-auth] mismatch', {
    headerHasBearerPrefix: hasPrefix,
    received: summarize(received),
    expected: summarize(secret),
  });
}
