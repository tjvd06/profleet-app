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

type ThrottleCheck = {
  userId: string;
  template: string;
  windowMinutes: number;
  metaMatch?: Record<string, unknown>;
};

/**
 * Returns true if a sent/delivered email_log row for this user+template
 * (and optional meta filter) exists within the time window.
 *
 * Fail-open: on DB errors, returns false so sends are not blocked.
 */
export async function isThrottled(check: ThrottleCheck): Promise<boolean> {
  const sinceISO = new Date(Date.now() - check.windowMinutes * 60_000).toISOString();

  let query = adminClient()
    .from('email_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', check.userId)
    .eq('template', check.template)
    .in('status', ['sent', 'delivered'])
    .gte('created_at', sinceISO);

  if (check.metaMatch) {
    query = query.contains('meta', check.metaMatch);
  }

  const { count, error } = await query;
  if (error) {
    console.error('[email/throttle] check failed:', error);
    return false;
  }
  return (count ?? 0) > 0;
}

/**
 * Returns true if the recipient has opted in to email notifications and is
 * not flagged as bounced/complained/unsubscribed. Fail-open on DB errors.
 */
export async function isRecipientReachable(userId: string): Promise<boolean> {
  const { data, error } = await adminClient()
    .from('profiles')
    .select('email_notifications, email_status')
    .eq('id', userId)
    .single();

  if (error || !data) {
    console.error('[email/throttle] reachable check failed:', error);
    return true;
  }

  return data.email_notifications === true && data.email_status === 'ok';
}
