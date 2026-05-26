import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { findUserIdByResendMessageId, logEmail } from '@/lib/email/log';
import type { EmailLogStatus } from '@/lib/email/log';

export const runtime = 'nodejs';

type ResendEventType =
  | 'email.sent'
  | 'email.delivered'
  | 'email.delivery_delayed'
  | 'email.bounced'
  | 'email.complained'
  | 'email.opened'
  | 'email.clicked';

type ResendEvent = {
  type: ResendEventType;
  created_at: string;
  data: {
    email_id: string;
    from?: string;
    to?: string[];
    subject?: string;
    bounce?: { type?: string; subType?: string; message?: string };
  };
};

const EVENT_TO_STATUS: Partial<Record<ResendEventType, EmailLogStatus>> = {
  'email.delivered': 'delivered',
  'email.delivery_delayed': 'delivery_delayed',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.opened': 'opened',
  'email.clicked': 'clicked',
};

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[webhooks/resend] RESEND_WEBHOOK_SECRET not configured');
    return NextResponse.json(
      { error: 'Webhook secret not configured' },
      { status: 500 },
    );
  }

  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing svix headers' }, { status: 401 });
  }

  const rawBody = await request.text();

  let event: ResendEvent;
  try {
    const wh = new Webhook(secret);
    event = wh.verify(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ResendEvent;
  } catch (err) {
    console.error('[webhooks/resend] signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Map event type to email_log.status. Skip events we don't care about.
  const newStatus = EVENT_TO_STATUS[event.type];
  if (!newStatus) {
    return NextResponse.json(
      { skipped: `event type ${event.type} not tracked` },
      { status: 200 },
    );
  }

  const resendMessageId = event.data.email_id;
  if (!resendMessageId) {
    return NextResponse.json({ error: 'Missing email_id' }, { status: 400 });
  }

  const userId = await findUserIdByResendMessageId(resendMessageId);
  if (!userId) {
    // Event for a message we never logged (older than email_log existed?).
    // Acknowledge to avoid Resend retries — there's nothing to do.
    return NextResponse.json(
      { skipped: 'no matching email_log row' },
      { status: 200 },
    );
  }

  await logEmail({
    userId,
    template: `resend-event:${event.type}`,
    resendMessageId,
    status: newStatus,
    meta: {
      event_type: event.type,
      event_created_at: event.created_at,
      bounce: event.data.bounce,
    },
  });

  // Update profiles.email_status on hard signals (bounce / complaint).
  if (newStatus === 'bounced' || newStatus === 'complained') {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { error: updErr } = await admin
      .from('profiles')
      .update({ email_status: newStatus })
      .eq('id', userId);
    if (updErr) {
      console.error('[webhooks/resend] failed to update email_status:', updErr);
    }
  }

  return NextResponse.json({ recorded: true, status: newStatus }, { status: 200 });
}
