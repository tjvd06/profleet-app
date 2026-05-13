import { NextResponse } from "next/server";

// ============================================================================
// Stripe webhook endpoint — STUB
// ============================================================================
// This file is a placeholder. The DB schema (subscriptions, subscription_events,
// profiles.stripe_customer_id, profiles.subscription_until, sync trigger,
// auto-downgrade cron) is already in place via migration 0006.
//
// What's still missing before this becomes a real endpoint:
//   1. `npm install stripe`
//   2. STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET in env
//   3. Replace this file with full handler:
//        - read raw body
//        - verify signature via stripe.webhooks.constructEvent()
//        - switch on event.type:
//            customer.subscription.created/updated/deleted
//            invoice.payment_succeeded/failed
//        - upsert into public.subscriptions (sync trigger handles profiles)
//        - insert into public.subscription_events for audit
//   4. Configure the endpoint URL in the Stripe dashboard.
//
// Until then we return 501 so accidental webhook deliveries are visible.
// ============================================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    { error: "Stripe webhook not yet configured" },
    { status: 501 }
  );
}

export async function GET() {
  return NextResponse.json(
    { error: "Stripe webhook accepts POST only" },
    { status: 405 }
  );
}
