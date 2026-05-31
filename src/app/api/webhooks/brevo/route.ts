import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * Brevo Webhook Handler.
 *
 * Brevo signiert Webhook-Payloads nicht — stattdessen erlauben sie pro
 * Webhook-URL custom Headers. Wir setzen `Authorization: Bearer <secret>`
 * in der Brevo-Webhook-Konfiguration (Settings → Transactional/Marketing
 * webhooks → Headers). Der Endpoint verifiziert das hier.
 *
 * Events die wir handlen:
 *   - `list_addition` (oder `listAddition`): User hat DOI-Mail bestätigt.
 *     → newsletter_subscribed = true setzen
 *   - `unsubscribed`: User hat über Brevo-Footer-Link abgemeldet.
 *     → newsletter_subscribed = false + Consent-Felder leeren
 *   - `hardBounce`, `complaint`: optional, derzeit nur geloggt
 *
 * Alle anderen Events (delivered, opened, clicked, ...) werden mit 200
 * acknowledged, damit Brevo nicht retried.
 */

type BrevoEvent = {
  event?: string;
  email?: string;
  id?: number;
  list_id?: number;
  listId?: number;
  date?: string;
};

function verifyAuth(request: Request): boolean {
  const secret = process.env.BREVO_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[webhooks/brevo] BREVO_WEBHOOK_SECRET not configured');
    return false;
  }
  const header = request.headers.get('authorization');
  return header === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: BrevoEvent;
  try {
    payload = (await request.json()) as BrevoEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const event = payload.event ?? '';
  const email = payload.email?.toLowerCase().trim();

  if (!email) {
    return NextResponse.json({ skipped: 'no email in payload' });
  }

  const normalized = event.toLowerCase().replace(/[_-]/g, '');

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Brevo identifiziert User über die Email-Adresse. Wir mappen das auf
  // auth.users.id via SECURITY DEFINER RPC (siehe Migration 0003).
  const { data: userIdData, error: rpcErr } = await admin.rpc(
    'find_user_id_by_email',
    { p_email: email },
  );

  if (rpcErr) {
    console.error('[webhooks/brevo] find_user_id_by_email RPC failed:', rpcErr);
    return NextResponse.json(
      { error: 'User lookup failed', details: rpcErr.message },
      { status: 500 },
    );
  }

  if (!userIdData) {
    console.warn('[webhooks/brevo] unknown email:', email, 'event:', event);
    return NextResponse.json({ skipped: 'unknown email' });
  }

  const userId = userIdData as string;

  if (normalized === 'listaddition') {
    const { error } = await admin
      .from('profiles')
      .update({
        newsletter_subscribed: true,
        brevo_contact_id: payload.id ? String(payload.id) : undefined,
      })
      .eq('id', userId);
    if (error) {
      console.error('[webhooks/brevo] list_addition update failed:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, event: 'list_addition', userId });
  }

  if (normalized === 'unsubscribed' || normalized === 'listremoval') {
    const { error } = await admin
      .from('profiles')
      .update({
        newsletter_subscribed: false,
        newsletter_consent_at: null,
        newsletter_consent_text: null,
        newsletter_consent_ip: null,
      })
      .eq('id', userId);
    if (error) {
      console.error('[webhooks/brevo] unsubscribe update failed:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, event: 'unsubscribed', userId });
  }

  if (normalized === 'hardbounce' || normalized === 'complaint') {
    console.warn(
      `[webhooks/brevo] ${event} for user ${userId} — not auto-blocking newsletter`,
    );
    return NextResponse.json({ ok: true, event, userId, action: 'logged_only' });
  }

  return NextResponse.json({ ok: true, event, action: 'ignored' });
}
