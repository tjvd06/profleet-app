/**
 * Versionierter Consent-Text für den Newsletter-Opt-In.
 *
 * Bei jeder Änderung am Wortlaut die Version hochzählen. So bleibt im
 * `profiles.newsletter_consent_text` dokumentiert, welche Fassung der User
 * konkret bestätigt hat — bei größeren Änderungen (z.B. neuer Themen-Scope)
 * sollten bestehende User vor erneutem Versand zur Re-Confirmation
 * aufgefordert werden.
 */
export const NEWSLETTER_CONSENT_VERSION = '1.0';

export const NEWSLETTER_CONSENT_TEXT =
  'Ich möchte den proFleet-Newsletter mit Branchen-News, Produkt-Updates und ' +
  'Erfolgsgeschichten erhalten (max. 1× pro Monat). Mir ist bewusst, dass ich ' +
  'diese Einwilligung jederzeit widerrufen kann — entweder über den ' +
  'Abmelde-Link in jeder Newsletter-Mail oder im Profil unter ' +
  '„Benachrichtigungen". Der Widerruf berührt nicht die Rechtmäßigkeit der ' +
  'bis dahin erfolgten Datenverarbeitung.';

export function buildConsentRecord(): string {
  return `v${NEWSLETTER_CONSENT_VERSION}: ${NEWSLETTER_CONSENT_TEXT}`;
}
