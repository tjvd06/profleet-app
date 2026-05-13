// Single source of truth for all enum values that mirror DB CHECK constraints.
// Keep these arrays in sync with the corresponding Postgres CHECK clauses;
// changing one without the other will cause runtime errors.

// ─── Profiles ──────────────────────────────────────────────────────────────

export const USER_ROLES = ["nachfrager", "anbieter"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  nachfrager: "Nachfrager (Käufer)",
  anbieter: "Anbieter (Händler)",
};

export const DEALER_TYPES = [
  "vertragshaendler",
  "leasingfirma",
  "bank",
  "freier_haendler",
] as const;
export type DealerType = (typeof DEALER_TYPES)[number];

export const DEALER_TYPE_LABELS: Record<DealerType, string> = {
  vertragshaendler: "Vertragshändler",
  leasingfirma: "Leasingfirma",
  bank: "Bank",
  freier_haendler: "Freier Händler",
};

export const SUBSCRIPTION_TIERS = ["starter", "pro", "premium"] as const;
export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number];

// ─── Marketplace / Tenders / Offers ────────────────────────────────────────

export const INSTANT_OFFER_STATUSES = [
  "draft",
  "active",
  "expired",
  "archived",
  "sold",
  "withdrawn",
] as const;
export type InstantOfferStatus = (typeof INSTANT_OFFER_STATUSES)[number];

export const INSTANT_OFFER_STATUS_LABELS: Record<InstantOfferStatus, string> = {
  draft: "Entwurf",
  active: "Aktiv",
  expired: "Abgelaufen",
  archived: "Archiviert",
  sold: "Verkauft",
  withdrawn: "Zurückgezogen",
};

export const TENDER_STATUSES = [
  "draft",
  "active",
  "completed",
  "cancelled",
] as const;
export type TenderStatus = (typeof TENDER_STATUSES)[number];

export const TENDER_SCOPES = ["bundesweit", "lokal"] as const;
export type TenderScope = (typeof TENDER_SCOPES)[number];

export const OFFER_STATUSES = ["draft", "active"] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

// ─── Communication / Reviews ───────────────────────────────────────────────

export const CONTACT_STATUSES = [
  "initiated",
  "responded",
  "contract_yes",
  "contract_no",
] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export const REVIEW_TYPES = ["positive", "neutral", "negative"] as const;
export type ReviewType = (typeof REVIEW_TYPES)[number];

export const REVIEW_TYPE_LABELS: Record<ReviewType, string> = {
  positive: "Positiv",
  neutral: "Neutral",
  negative: "Negativ",
};

// ─── Vehicles ──────────────────────────────────────────────────────────────

export const VEHICLE_TYPES = ["PKW", "NFZ"] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];
