import { createClient as createServerClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { brevoRemoveFromList } from '@/lib/newsletter/brevo-client';

export const runtime = 'nodejs';

export async function POST() {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Brevo zuerst — wenn das fehlschlägt, lassen wir den Local-State unverändert,
  // damit Re-Try möglich ist. (Anders herum käme der User in einen Zustand,
  // in dem profleet "abgemeldet" sagt, Brevo aber weiter sendet.)
  const result = await brevoRemoveFromList(user.email);
  if (!result.ok) {
    return NextResponse.json(
      {
        error: 'Could not unsubscribe at provider',
        details: result.error?.message ?? 'unknown',
      },
      { status: 502 },
    );
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { error: updErr } = await admin
    .from('profiles')
    .update({
      newsletter_subscribed: false,
      newsletter_consent_at: null,
      newsletter_consent_text: null,
      newsletter_consent_ip: null,
    })
    .eq('id', user.id);

  if (updErr) {
    console.error('[newsletter/unsubscribe] profile update failed:', updErr);
    return NextResponse.json(
      { error: 'Provider unsubscribed but profile update failed', details: updErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
