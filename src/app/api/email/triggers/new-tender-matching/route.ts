import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { NewTenderMatchingEmail } from '@/emails/NewTenderMatchingEmail';
import { logEmail } from '@/lib/email/log';
import { shouldSendNotification } from '@/lib/email/preferences';
import { sendEmail } from '@/lib/email/send';
import { signUnsubscribeToken } from '@/lib/email/token';
import { verifyWebhookSecret } from '@/lib/email/webhook-auth';

export const runtime = 'nodejs';

const TEMPLATE = 'new-tender-matching';

type TenderRow = {
  id: string;
  buyer_id: string;
  status: string;
};

type SupabaseWebhookPayload = {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: TenderRow | null;
  old_record: TenderRow | null;
};

type TenderVehicleRow = {
  brand: string | null;
  model_name: string | null;
  quantity: number | null;
};

type DealerCandidate = {
  id: string;
  first_name: string | null;
  matchedBrands: string[];
};

type DealerBrandJoinRow = {
  brand: string;
  dealer_id: string;
  profiles: {
    id: string;
    first_name: string | null;
  } | null;
};

function uniq<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

export async function POST(request: Request) {
  const auth = verifyWebhookSecret(request);
  if (!auth.ok) {
    console.error('[email/triggers/new-tender-matching] auth failed:', auth.reason);
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  let payload: SupabaseWebhookPayload;
  try {
    payload = (await request.json()) as SupabaseWebhookPayload;
  } catch (err) {
    console.error('[email/triggers/new-tender-matching] invalid JSON:', err);
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (payload.table !== 'tenders' || !payload.record) {
    return NextResponse.json({ skipped: 'not a tenders event' }, { status: 200 });
  }

  const becameActive =
    payload.type === 'INSERT'
      ? payload.record.status === 'active'
      : payload.type === 'UPDATE'
      ? payload.old_record?.status !== 'active' && payload.record.status === 'active'
      : false;

  if (!becameActive) {
    return NextResponse.json({ skipped: 'tender not flipped to active' }, { status: 200 });
  }

  const tender = payload.record;

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // 1. Collect the tender's vehicle brands
  const { data: vehiclesRaw, error: vehiclesErr } = await admin
    .from('tender_vehicles')
    .select('brand, model_name, quantity')
    .eq('tender_id', tender.id);

  if (vehiclesErr || !vehiclesRaw) {
    console.error(
      '[email/triggers/new-tender-matching] vehicles lookup failed:',
      vehiclesErr,
    );
    return NextResponse.json({ error: 'Vehicles not found' }, { status: 500 });
  }

  const vehicles = vehiclesRaw as TenderVehicleRow[];
  const tenderBrands = uniq(
    vehicles
      .map((v) => v.brand)
      .filter((b): b is string => typeof b === 'string' && b.length > 0),
  );

  if (tenderBrands.length === 0) {
    return NextResponse.json(
      { skipped: 'tender has no brand-tagged vehicles' },
      { status: 200 },
    );
  }

  // 2. Find candidate dealers via dealer_brands join. Each matching brand
  // produces one row; we group by dealer afterwards. Per-type opt-out is
  // still checked individually via shouldSendNotification().
  const { data: matchRowsRaw, error: matchErr } = await admin
    .from('dealer_brands')
    .select(
      'brand, dealer_id, profiles!inner(id, first_name, role, is_active, email_status, email_notifications)',
    )
    .in('brand', tenderBrands)
    .eq('profiles.role', 'anbieter')
    .eq('profiles.is_active', true)
    .eq('profiles.email_status', 'ok')
    .eq('profiles.email_notifications', true);

  if (matchErr) {
    console.error(
      '[email/triggers/new-tender-matching] candidates lookup failed:',
      matchErr,
    );
    return NextResponse.json({ error: 'Candidate lookup failed' }, { status: 500 });
  }

  const matchRows = (matchRowsRaw ?? []) as unknown as DealerBrandJoinRow[];
  const dealerMap = new Map<string, DealerCandidate>();
  for (const row of matchRows) {
    if (!row.profiles) continue;
    const existing = dealerMap.get(row.dealer_id);
    if (existing) {
      existing.matchedBrands.push(row.brand);
    } else {
      dealerMap.set(row.dealer_id, {
        id: row.profiles.id,
        first_name: row.profiles.first_name,
        matchedBrands: [row.brand],
      });
    }
  }
  const candidates = Array.from(dealerMap.values());

  // 3. Filter out dealers who skip the buyer themselves (shouldn't match anyway)
  //    and apply per-type opt-out check.
  const eligibleDealers: DealerCandidate[] = [];
  for (const c of candidates) {
    if (c.id === tender.buyer_id) continue;
    if (!(await shouldSendNotification(c.id, 'new_tender_matching'))) continue;
    eligibleDealers.push(c);
  }

  if (eligibleDealers.length === 0) {
    return NextResponse.json(
      { skipped: 'no eligible dealers matched' },
      { status: 200 },
    );
  }

  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.profleet.de'
  ).replace(/\/$/, '');
  const tenderUrl = `${appUrl}/dashboard/ausschreibungen/${tender.id}`;

  // 4. Send mails. Sequential to keep error attribution easy — for a Beta
  //    that matches a handful of dealers per tender this is fast enough.
  let sent = 0;
  let failed = 0;

  for (const dealer of eligibleDealers) {
    const matchedBrands = dealer.matchedBrands;
    const matchedVehicles = vehicles
      .filter((v) => v.brand && matchedBrands.includes(v.brand))
      .map((v) => ({
        brand: v.brand as string,
        modelName: v.model_name,
        quantity: v.quantity,
      }));

    const { data: dealerUser, error: dealerUserErr } =
      await admin.auth.admin.getUserById(dealer.id);

    if (dealerUserErr || !dealerUser.user?.email) {
      console.error(
        '[email/triggers/new-tender-matching] dealer email lookup failed:',
        dealerUserErr,
        dealer.id,
      );
      failed += 1;
      continue;
    }

    const unsubscribeToken = await signUnsubscribeToken({
      userId: dealer.id,
      type: 'new_tender_matching',
    });
    const unsubscribeUrl = `${appUrl}/unsubscribe?token=${encodeURIComponent(
      unsubscribeToken,
    )}`;

    const result = await sendEmail({
      to: dealerUser.user.email,
      subject: `Neue Ausschreibung passt zu Ihren Marken (${matchedBrands.join(', ')})`,
      react: NewTenderMatchingEmail({
        recipientFirstName: dealer.first_name,
        matchedBrands,
        vehicles: matchedVehicles,
        tenderUrl,
        unsubscribeUrl,
      }),
    });

    if (result.error) {
      console.error(
        '[email/triggers/new-tender-matching] send failed for dealer:',
        dealer.id,
        result.error,
      );
      failed += 1;
      continue;
    }

    await logEmail({
      userId: dealer.id,
      template: TEMPLATE,
      resendMessageId: result.id,
      status: 'sent',
      meta: {
        tender_id: tender.id,
        matched_brands: matchedBrands,
      },
    });
    sent += 1;
  }

  return NextResponse.json(
    { sent, failed, total_candidates: eligibleDealers.length },
    { status: 200 },
  );
}
