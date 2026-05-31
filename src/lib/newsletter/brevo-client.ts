import 'server-only';

/**
 * Minimaler Brevo-API-Wrapper (kein NPM-Package — direkt via fetch).
 *
 * Brevo API Docs: https://developers.brevo.com/reference/
 *
 * - DOI-Subscribe nutzt POST /v3/contacts/doubleOptinConfirmation,
 *   Brevo verschickt die Confirmation-Mail (DOI-Template muss in Brevo
 *   eingerichtet sein, ID landet in BREVO_DOI_TEMPLATE_ID).
 * - Unsubscribe via DELETE /v3/contacts/lists/{listId}/contacts/remove
 *   (entfernt nur aus der Liste, Contact bleibt erhalten — Brevo behält
 *   ihn als "opted-out", damit kein versehentliches Re-Add passiert).
 */

const BREVO_API = 'https://api.brevo.com/v3';

function apiKey(): string {
  const key = process.env.BREVO_API_KEY;
  if (!key) {
    throw new Error('[newsletter/brevo] BREVO_API_KEY is not set');
  }
  return key;
}

function listIdNumber(): number {
  const raw = process.env.BREVO_LIST_ID;
  if (!raw) {
    throw new Error('[newsletter/brevo] BREVO_LIST_ID is not set');
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`[newsletter/brevo] BREVO_LIST_ID invalid: ${raw}`);
  }
  return n;
}

function doiTemplateIdNumber(): number {
  const raw = process.env.BREVO_DOI_TEMPLATE_ID;
  if (!raw) {
    throw new Error('[newsletter/brevo] BREVO_DOI_TEMPLATE_ID is not set');
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`[newsletter/brevo] BREVO_DOI_TEMPLATE_ID invalid: ${raw}`);
  }
  return n;
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.profleet.de';
}

type BrevoError = { code?: string; message?: string };

async function brevoRequest(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<{ status: number; data: unknown; error: BrevoError | null }> {
  const res = await fetch(`${BREVO_API}${path}`, {
    method,
    headers: {
      'api-key': apiKey(),
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    return {
      status: res.status,
      data,
      error: (data as BrevoError) ?? { message: `HTTP ${res.status}` },
    };
  }

  return { status: res.status, data, error: null };
}

export type BrevoContactAttributes = {
  FIRSTNAME?: string | null;
  LASTNAME?: string | null;
  COMPANY?: string | null;
  ROLE?: string | null;
};

/**
 * Startet den Double-Opt-In-Flow für eine Email.
 * Brevo verschickt automatisch die Confirmation-Mail. Erst nach Klick wird
 * der Contact zur Liste hinzugefügt — dann feuert Brevo den
 * `contact_added`-Webhook, den wir in /api/webhooks/brevo handlen.
 */
export async function brevoStartDoubleOptIn(args: {
  email: string;
  attributes?: BrevoContactAttributes;
}): Promise<{ ok: boolean; error: BrevoError | null }> {
  const result = await brevoRequest(
    'POST',
    '/contacts/doubleOptinConfirmation',
    {
      email: args.email,
      attributes: args.attributes ?? undefined,
      includeListIds: [listIdNumber()],
      templateId: doiTemplateIdNumber(),
      redirectionUrl: `${appUrl()}/newsletter/bestaetigt`,
    },
  );

  if (result.error) {
    console.error('[newsletter/brevo] DOI start failed:', result.error);
    return { ok: false, error: result.error };
  }
  return { ok: true, error: null };
}

/**
 * Entfernt den Contact aus der profleet-Newsletter-Liste.
 * Lässt den Contact selbst in Brevo bestehen (mit Status "removed from list"),
 * damit DSGVO-Auskunftspflicht erfüllbar bleibt.
 */
export async function brevoRemoveFromList(
  email: string,
): Promise<{ ok: boolean; error: BrevoError | null }> {
  const result = await brevoRequest(
    'POST',
    `/contacts/lists/${listIdNumber()}/contacts/remove`,
    { emails: [email] },
  );

  // Brevo gibt 204 No Content bei Erfolg, oder 400 wenn Contact eh nicht in
  // der Liste war — letzteres ist für uns kein Fehler (idempotent).
  if (result.error && result.error.code !== 'document_not_found') {
    console.error('[newsletter/brevo] removeFromList failed:', result.error);
    return { ok: false, error: result.error };
  }
  return { ok: true, error: null };
}

/**
 * Holt den Brevo-internen Contact via Email — gibt `null` zurück wenn nicht
 * existent. Nützlich für Reconciliation-Jobs.
 */
export async function brevoGetContact(
  email: string,
): Promise<{ id: number | null; listIds: number[]; emailBlacklisted: boolean } | null> {
  const result = await brevoRequest(
    'GET',
    `/contacts/${encodeURIComponent(email)}`,
  );

  if (result.error) {
    if (result.status === 404) return null;
    console.error('[newsletter/brevo] getContact failed:', result.error);
    return null;
  }

  const data = result.data as {
    id?: number;
    listIds?: number[];
    emailBlacklisted?: boolean;
  };
  return {
    id: data.id ?? null,
    listIds: data.listIds ?? [],
    emailBlacklisted: data.emailBlacklisted ?? false,
  };
}
