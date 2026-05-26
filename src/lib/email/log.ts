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

export type EmailLogStatus =
  | 'sent'
  | 'delivered'
  | 'bounced'
  | 'complained'
  | 'opened'
  | 'clicked'
  | 'delivery_delayed';

type LogArgs = {
  userId: string;
  template: string;
  resendMessageId: string | null;
  status: EmailLogStatus;
  meta?: Record<string, unknown>;
};

/**
 * Inserts a row into email_log. Errors are logged but do not throw — logging
 * should never block a send or webhook ack.
 */
export async function logEmail(args: LogArgs): Promise<void> {
  const { error } = await adminClient().from('email_log').insert({
    user_id: args.userId,
    template: args.template,
    resend_message_id: args.resendMessageId,
    status: args.status,
    meta: args.meta ?? null,
  });

  if (error) {
    console.error('[email/log] insert failed:', error);
  }
}

/**
 * Looks up the user_id of the email_log row that recorded a given Resend
 * message id (set when status='sent'). Returns null if no row found.
 */
export async function findUserIdByResendMessageId(
  resendMessageId: string,
): Promise<string | null> {
  const { data, error } = await adminClient()
    .from('email_log')
    .select('user_id')
    .eq('resend_message_id', resendMessageId)
    .eq('status', 'sent')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[email/log] lookup failed:', error);
    return null;
  }

  return (data?.user_id as string | null) ?? null;
}
