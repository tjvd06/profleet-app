import 'server-only';
import { createClient } from '@supabase/supabase-js';

let _admin: ReturnType<typeof createClient> | null = null;

function adminClient() {
  if (_admin) return _admin;
  _admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  return _admin;
}

export type NotificationType =
  | 'new_message'
  | 'new_offer'
  | 'new_tender_matching'
  | 'review_received'
  | 'billing';

/**
 * Determines whether a non-transactional notification of `type` should be
 * delivered to `userId`. Combines all opt-out signals:
 *
 *   1. Hard opt-out: `profiles.email_notifications = false` blocks everything
 *   2. Deliverability: `profiles.email_status` must be 'ok'
 *   3. Per-type opt-out: `notification_settings[type] === false` blocks this type
 *
 * Default-on: missing JSONB keys count as opted-in (so adding new types in
 * Phase H+ doesn't accidentally silence existing users).
 *
 * Fail-open on DB errors — better one extra mail than losing critical
 * communication to a transient query failure.
 */
export async function shouldSendNotification(
  userId: string,
  type: NotificationType,
): Promise<boolean> {
  const { data, error } = await adminClient()
    .from('profiles')
    .select('email_notifications, email_status, notification_settings')
    .eq('id', userId)
    .single();

  if (error || !data) {
    console.error('[email/preferences] lookup failed:', error);
    return true;
  }

  if (data.email_notifications !== true) return false;
  if (data.email_status !== 'ok') return false;

  const settings = (data.notification_settings ?? {}) as Record<string, unknown>;
  if (settings[type] === false) return false;

  return true;
}
