import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { NewOfferEmail } from '@/emails/NewOfferEmail';
import { logEmail } from '@/lib/email/log';
import { shouldSendNotification } from '@/lib/email/preferences';
import { sendEmail } from '@/lib/email/send';
import { isThrottled } from '@/lib/email/throttle';
import { signUnsubscribeToken } from '@/lib/email/token';
import { verifyWebhookSecret } from '@/lib/email/webhook-auth';

export const runtime = 'nodejs';

const TEMPLATE = 'new-offer';
const THROTTLE_WINDOW_MINUTES = 15;

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

  const buyerId = tender.buyer_id;

  if (!(await shouldSendNotification(buyerId, 'new_offer'))) {
    return NextResponse.json(
      { skipped: 'buyer opted out or address not deliverable' },
      { status: 200 },
    );
  }

  if (
    await isThrottled({
      userId: buyerId,
      template: TEMPLATE,
      windowMinutes: THROTTLE_WINDOW_MINUTES,
      metaMatch: { tender_id: tender.id },
    })
  ) {
    return NextResponse.json(
      { skipped: 'throttled — recent offer mail for this tender' },
      { status: 200 },
    );
  }

  const [buyerProfileRes, dealerProfileRes, buyerUserRes, vehicleRes] = await Promise.all([
    admin
      .from('profiles')
      .select('first_name, last_name, company_name, role')
      .eq('id', buyerId)
      .single(),
    admin
      .from('profiles')
      .select('first_name, last_name, company_name')
      .eq('id', offer.dealer_id)
      .single(),
    admin.auth.admin.getUserById(buyerId),
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
      buyerId,
    );
    return NextResponse.json(
      { error: 'Buyer not found or has no email' },
      { status: 404 },
    );
  }

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

  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ?? 'https://app.profleet.de'
  ).replace(/\/$/, '');
  const offerUrl = `${siteUrl}/dashboard/eingang/${tender.id}/angebot`;

  const unsubscribeToken = await signUnsubscribeToken({
    userId: buyerId,
    type: 'new_offer',
  });
  const unsubscribeUrl = `${siteUrl}/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;

  const result = await sendEmail({
    to: buyerEmail,
    subject: 'Neues Angebot auf Ihre Ausschreibung',
    react: NewOfferEmail({
      recipientFirstName,
      dealerName,
      vehicleLabel,
      totalPriceFormatted,
      offerUrl,
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
    userId: buyerId,
    template: TEMPLATE,
    resendMessageId: result.id,
    status: 'sent',
    meta: { tender_id: tender.id, offer_id: offer.id, dealer_id: offer.dealer_id },
  });

  return NextResponse.json(
    { sent: true, messageId: result.id, to: buyerEmail },
    { status: 200 },
  );
}
