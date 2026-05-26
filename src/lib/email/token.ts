import 'server-only';
import { jwtVerify, SignJWT } from 'jose';
import type { NotificationType } from './preferences';

const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const ALGORITHM = 'HS256';

function getSecret(): Uint8Array {
  const secret = process.env.EMAIL_TOKEN_SECRET;
  if (!secret) {
    throw new Error('[email/token] EMAIL_TOKEN_SECRET is not set');
  }
  return new TextEncoder().encode(secret);
}

export type UnsubscribeTokenPayload = {
  userId: string;
  type: NotificationType | 'all';
};

/**
 * Sign a short-lived JWT carrying a user-id and a notification type so the
 * `/unsubscribe?token=...` link can flip a single setting without requiring
 * the user to be logged in.
 *
 * Tokens are valid for 30 days. A leaked link can be used only within that
 * window. The signing secret (EMAIL_TOKEN_SECRET) must never be exposed.
 */
export async function signUnsubscribeToken(
  payload: UnsubscribeTokenPayload,
): Promise<string> {
  return await new SignJWT({ userId: payload.userId, type: payload.type })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS)
    .sign(getSecret());
}

export async function verifyUnsubscribeToken(
  token: string,
): Promise<UnsubscribeTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: [ALGORITHM],
    });
    if (typeof payload.userId !== 'string' || typeof payload.type !== 'string') {
      return null;
    }
    return {
      userId: payload.userId,
      type: payload.type as UnsubscribeTokenPayload['type'],
    };
  } catch (err) {
    console.error('[email/token] verify failed:', err);
    return null;
  }
}
