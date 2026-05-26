import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { NewOfferEmail } from '@/emails/NewOfferEmail';
import { sendEmail } from '@/lib/email/send';
import { verifyWebhookSecret } from '@/lib/email/webhook-auth';

export const runtime = 'nodejs';

type OfferRow = {
  id: string;
  tender_id: string;
  tender_vehicle_id: string | null;
  dealer_id: string;
  status: string;
  total_price: number | null;
};

type SupabaseWebhookPayload = {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: OfferRow | null;
  old_record: OfferRow | null;
};

function displayDealerName(profile: {
  company_name: string | null;
  first_name: string | null;
  last_name: string | null;
}) {
  if (profile.company_name) return profile.company_name;
  const parts = [profile.first_name, profile.last_name].filter(Boolean);
  if (parts.length > 0) return parts.join(' ');
  return 'Ein Händler auf proFleet';
}

function formatPriceEUR(value: number | null): string | null {
  if (value === null || value === undefined) return null;
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(value);
}

export async function POST(request: Request) {
  const auth = verifyWebhookSecret(request);
  if (!auth.ok) {
    console.error('[email/triggers/new-offer] auth failed:', auth.reason);
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  let payload: SupabaseWebhookPayload;
  try {
    payload = (await request.json()) as SupabaseWebhookPayload;
  } catch (err) {
    console.error('[email/triggers/new-offer] invalid JSON:', err);
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (payload.table !== 'offers' || !payload.record) {
    return NextResponse.json({ skipped: 'not an offers event' }, { status: 200 });
  }

  // Fire only when offer becomes (or is created as) active.
  const becameActive =
    payload.type === 'INSERT'
      ? payload.record.status === 'active'
      : payload.type === 'UPDATE'
      ? payload.old_record?.status !== 'active' && payload.record.status === 'active'
      : false;

  if (!becameActive) {
    return NextResponse.json({ skipped: 'offer not active' }, { status: 200 });
  }

  const offer = payload.record;

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: tender, error: tenderErr } = await admin
    .from('tenders')
    .select('id, buyer_id')
    .eq('id', offer.tender_id)
    .single();

  if (tenderErr || !tender) {
    console.error('[email/triggers/new-offer] tender not found:', tenderErr);
    return NextResponse.json({ error: 'Tender not found' }, { status: 404 });
  }

  const [buyerProfileRes, dealerProfileRes, buyerUserRes, vehicleRes] = await Promise.all([
    admin
      .from('profiles')
      .select('first_name, last_name, company_name, role')
      .eq('id', tender.buyer_id)
      .single(),
    admin
      .from('profiles')
      .select('first_name, last_name, company_name')
      .eq('id', offer.dealer_id)
      .single(),
    admin.auth.admin.getUserById(tender.buyer_id),
    offer.tender_vehicle_id
      ? admin
          .from('tender_vehicles')
          .select('brand, model_name')
          .eq('id', offer.tender_vehicle_id)
          .single()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (buyerUserRes.error || !buyerUserRes.data.user?.email) {
    console.error(
      '[email/triggers/new-offer] buyer user lookup failed:',
      buyerUserRes.error,
      tender.buyer_id,
    );
    return NextResponse.json(
      { error: 'Buyer not found or has no email' },
      { status: 404 },
    );
  }

  // Phase G later adds notification_settings opt-out; for now: send to all nachfrager.
  if (buyerProfileRes.data?.role && buyerProfileRes.data.role !== 'nachfrager') {
    return NextResponse.json(
      { skipped: 'buyer is not nachfrager' },
      { status: 200 },
    );
  }

  const buyerEmail = buyerUserRes.data.user.email;
  const recipientFirstName = buyerProfileRes.data?.first_name ?? null;
  const dealerName = dealerProfileRes.data
    ? displayDealerName(dealerProfileRes.data)
    : 'Ein Händler auf proFleet';

  const vehicleLabel = vehicleRes.data
    ? [vehicleRes.data.brand, vehicleRes.data.model_name].filter(Boolean).join(' ') || null
    : null;

  const totalPriceFormatted = formatPriceEUR(offer.total_price);

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://app.profleet.de').replace(
    /\/$/,
    '',
  );
  const offerUrl = `${siteUrl}/dashboard/eingang/${tender.id}/angebot`;

  const result = await sendEmail({
    to: buyerEmail,
    subject: 'Neues Angebot auf Ihre Ausschreibung',
    react: NewOfferEmail({
      recipientFirstName,
      dealerName,
      vehicleLabel,
      totalPriceFormatted,
      offerUrl,
    }),
  });

  if (result.error) {
    return NextResponse.json(
      { error: 'Send failed', details: result.error.message },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { sent: true, messageId: result.id, to: buyerEmail },
    { status: 200 },
  );
}
