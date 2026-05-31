import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { NewMessageEmail } from '@/emails/NewMessageEmail';
import { logEmail } from '@/lib/email/log';
import { shouldSendNotification } from '@/lib/email/preferences';
import { sendEmail } from '@/lib/email/send';
import { isThrottled } from '@/lib/email/throttle';
import { signUnsubscribeToken } from '@/lib/email/token';
import { verifyWebhookSecret } from '@/lib/email/webhook-auth';

export const runtime = 'nodejs';

const TEMPLATE = 'new-message';
const THROTTLE_WINDOW_MINUTES = 60;
const PREVIEW_MAX_CHARS = 200;

type MessageRow = {
  id: string;
  contact_id: string;
  sender_id: string;
  content: string;
};

type SupabaseWebhookPayload = {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: MessageRow | null;
  old_record: MessageRow | null;
};

function truncate(text: string, max: number) {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max).trimEnd() + '…';
}

function displayName(profile: {
  company_name: string | null;
  first_name: string | null;
  last_name: string | null;
}) {
  if (profile.company_name) return profile.company_name;
  const parts = [profile.first_name, profile.last_name].filter(Boolean);
  if (parts.length > 0) return parts.join(' ');
  return 'Ein Nutzer von proFleet';
}

export async function POST(request: Request) {
  const auth = verifyWebhookSecret(request);
  if (!auth.ok) {
    console.error('[email/triggers/new-message] auth failed:', auth.reason);
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  let payload: SupabaseWebhookPayload;
  try {
    payload = (await request.json()) as SupabaseWebhookPayload;
  } catch (err) {
    console.error('[email/triggers/new-message] invalid JSON:', err);
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (payload.type !== 'INSERT' || payload.table !== 'messages' || !payload.record) {
    return NextResponse.json({ skipped: 'not a messages insert' }, { status: 200 });
  }

  const message = payload.record;

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: contact, error: contactErr } = await admin
    .from('contacts')
    .select('id, buyer_id, dealer_id')
    .eq('id', message.contact_id)
    .single();

  if (contactErr || !contact) {
    console.error('[email/triggers/new-message] contact not found:', contactErr);
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
  }

  const recipientId =
    message.sender_id === contact.buyer_id ? contact.dealer_id : contact.buyer_id;

  if (recipientId === message.sender_id) {
    return NextResponse.json(
      { skipped: 'sender and recipient identical' },
      { status: 200 },
    );
  }

  if (!(await shouldSendNotification(recipientId, 'new_message'))) {
    return NextResponse.json(
      { skipped: 'recipient opted out or address not deliverable' },
      { status: 200 },
    );
  }

  if (
    await isThrottled({
      userId: recipientId,
      template: TEMPLATE,
      windowMinutes: THROTTLE_WINDOW_MINUTES,
      metaMatch: { contact_id: contact.id },
    })
  ) {
    return NextResponse.json(
      { skipped: 'throttled — recent send for this conversation' },
      { status: 200 },
    );
  }

  const [recipientProfileRes, senderProfileRes, recipientUserRes] = await Promise.all([
    admin
      .from('profiles')
      .select('first_name, last_name, company_name')
      .eq('id', recipientId)
      .single(),
    admin
      .from('profiles')
      .select('first_name, last_name, company_name')
      .eq('id', message.sender_id)
      .single(),
    admin.auth.admin.getUserById(recipientId),
  ]);

  if (recipientUserRes.error || !recipientUserRes.data.user?.email) {
    console.error(
      '[email/triggers/new-message] recipient user lookup failed:',
      recipientUserRes.error,
      recipientId,
    );
    return NextResponse.json(
      { error: 'Recipient not found or has no email' },
      { status: 404 },
    );
  }

  const recipientEmail = recipientUserRes.data.user.email;
  const recipientFirstName = recipientProfileRes.data?.first_name ?? null;
  const senderName = senderProfileRes.data
    ? displayName(senderProfileRes.data)
    : 'Ein Nutzer von proFleet';

  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.profleet.de'
  ).replace(/\/$/, '');
  const conversationUrl = `${appUrl}/dashboard/nachrichten?contact=${contact.id}`;
  const messagePreview = truncate(message.content, PREVIEW_MAX_CHARS);

  const unsubscribeToken = await signUnsubscribeToken({
    userId: recipientId,
    type: 'new_message',
  });
  const unsubscribeUrl = `${appUrl}/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;

  const result = await sendEmail({
    to: recipientEmail,
    subject: `Neue Nachricht von ${senderName} auf proFleet`,
    react: NewMessageEmail({
      recipientFirstName,
      senderName,
      messagePreview,
      conversationUrl,
      unsubscribeUrl,
    }),
  });

  if (result.error) {
    return NextResponse.json(
      { error: 'Send failed', details: result.error.message },
      { status: 500 },
    );
  }

  await logEmail({
    userId: recipientId,
    template: TEMPLATE,
    resendMessageId: result.id,
    status: 'sent',
    meta: { contact_id: contact.id, sender_id: message.sender_id },
  });

  return NextResponse.json(
    { sent: true, messageId: result.id, to: recipientEmail },
    { status: 200 },
  );
}
