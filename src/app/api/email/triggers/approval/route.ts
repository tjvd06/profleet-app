import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { ApprovalWelcomeEmail } from '@/emails/ApprovalWelcomeEmail';
import { sendEmail } from '@/lib/email/send';
import { verifyWebhookSecret } from '@/lib/email/webhook-auth';

export const runtime = 'nodejs';

type ProfileRow = {
  id: string;
  first_name: string | null;
  is_active: boolean;
};

type SupabaseWebhookPayload = {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: ProfileRow | null;
  old_record: ProfileRow | null;
};

export async function POST(request: Request) {
  const auth = verifyWebhookSecret(request);
  if (!auth.ok) {
    console.error('[email/triggers/approval] auth failed:', auth.reason);
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  let payload: SupabaseWebhookPayload;
  try {
    payload = (await request.json()) as SupabaseWebhookPayload;
  } catch (err) {
    console.error('[email/triggers/approval] invalid JSON:', err);
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (payload.type !== 'UPDATE' || payload.table !== 'profiles') {
    return NextResponse.json({ skipped: 'not a profiles update' }, { status: 200 });
  }

  const flippedToActive =
    payload.old_record?.is_active === false && payload.record?.is_active === true;

  if (!flippedToActive || !payload.record) {
    return NextResponse.json({ skipped: 'is_active not flipped to true' }, { status: 200 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: userData, error: userErr } = await admin.auth.admin.getUserById(
    payload.record.id,
  );

  if (userErr || !userData.user?.email) {
    console.error('[email/triggers/approval] user lookup failed:', userErr, payload.record.id);
    return NextResponse.json(
      { error: 'User not found or has no email' },
      { status: 404 },
    );
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://app.profleet.de';
  const loginUrl = `${siteUrl.replace(/\/$/, '')}/anmelden`;

  const result = await sendEmail({
    to: userData.user.email,
    subject: 'Ihr proFleet-Konto ist freigeschaltet',
    react: ApprovalWelcomeEmail({
      firstName: payload.record.first_name,
      loginUrl,
    }),
  });

  if (result.error) {
    return NextResponse.json(
      { error: 'Send failed', details: result.error.message },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { sent: true, messageId: result.id, to: userData.user.email },
    { status: 200 },
  );
}
