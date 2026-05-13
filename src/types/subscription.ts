// Mirrors `public.subscriptions` row.
import type { SubscriptionTier } from "@/constants/enums";

export const SUBSCRIPTION_STATUSES = [
  "active",
  "trialing",
  "past_due",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "unpaid",
  "paused",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export interface SubscriptionRow {
  id: string;
  user_id: string;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
}

// Mirrors `public.subscription_events` row.
export interface SubscriptionEventRow {
  id: string;
  user_id: string | null;
  stripe_event_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  processed_at: string;
}
