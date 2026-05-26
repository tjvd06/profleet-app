import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { NotificationType } from '@/lib/email/preferences';
import { verifyUnsubscribeToken } from '@/lib/email/token';

export const runtime = 'nodejs';

const ALL_TYPES: NotificationType[] = [
  'new_message',
  'new_offer',
  'new_tender_matching',
  'review_received',
  'billing',
];

export async function POST(request: Request) {
  let body: { token?: string };
  try {
    body = (await request.json()) as { token?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  const payload = await verifyUnsubscribeToken(body.token);
  if (!payload) {
    return NextResponse.json(
      { error: 'Token invalid or expired' },
      { status: 401 },
    );
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Load current settings, merge the requested opt-out(s) in, write back.
  const { data: profile, error: loadErr } = await admin
    .from('profiles')
    .select('notification_settings')
    .eq('id', payload.userId)
    .single();

  if (loadErr || !profile) {
    console.error('[email/unsubscribe] profile lookup failed:', loadErr);
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  const settings = {
    ...((profile.notification_settings as Record<string, unknown> | null) ?? {}),
  };

  if (payload.type === 'all') {
    for (const t of ALL_TYPES) settings[t] = false;
  } else {
    settings[payload.type] = false;
  }

  const { error: updErr } = await admin
    .from('profiles')
    .update({ notification_settings: settings })
    .eq('id', payload.userId);

  if (updErr) {
    console.error('[email/unsubscribe] update failed:', updErr);
    return NextResponse.json(
      { error: 'Could not update settings', details: updErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { ok: true, type: payload.type },
    { status: 200 },
  );
}
