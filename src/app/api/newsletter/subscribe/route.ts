import { createClient as createServerClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { brevoStartDoubleOptIn } from '@/lib/newsletter/brevo-client';
import { buildConsentRecord } from '@/lib/newsletter/consent';

export const runtime = 'nodejs';

function clientIp(request: Request): string | null {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() ?? null;
  return request.headers.get('x-real-ip');
}

export async function POST(request: Request) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: profile, error: loadErr } = await admin
    .from('profiles')
    .select('first_name, last_name, company_name, role, newsletter_subscribed')
    .eq('id', user.id)
    .single();

  if (loadErr || !profile) {
    console.error('[newsletter/subscribe] profile lookup failed:', loadErr);
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  // Idempotent: wenn schon confirmed, einfach 200 zurück.
  if (profile.newsletter_subscribed) {
    return NextResponse.json({ ok: true, alreadySubscribed: true });
  }

  // Consent-Felder VORAB setzen (Audit-Trail dokumentiert den Klick im UI,
  // unabhängig davon ob die DOI-Mail später confirmed wird).
  // newsletter_subscribed bleibt false bis Brevo-Webhook das Event liefert.
  const { error: updErr } = await admin
    .from('profiles')
    .update({
      newsletter_consent_at: new Date().toISOString(),
      newsletter_consent_text: buildConsentRecord(),
      newsletter_consent_ip: clientIp(request),
    })
    .eq('id', user.id);

  if (updErr) {
    console.error('[newsletter/subscribe] consent record update failed:', updErr);
    return NextResponse.json({ error: 'Could not record consent' }, { status: 500 });
  }

  const result = await brevoStartDoubleOptIn({
    email: user.email,
    attributes: {
      FIRSTNAME: profile.first_name as string | null,
      LASTNAME: profile.last_name as string | null,
      COMPANY: profile.company_name as string | null,
      ROLE: profile.role as string | null,
    },
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: 'Could not start opt-in',
        details: result.error?.message ?? 'unknown',
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, doiSent: true });
}
