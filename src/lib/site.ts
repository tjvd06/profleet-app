// URL-Konstanten für die App.
//
// Konvention:
//   - APP_URL       = die App selbst (dieses Repo), z.B. https://app.profleet.de.
//                     Für interne Self-Refs (Mail-Links, Redirects).
//   - MARKETING_URL = die Brand-/Marketing-Site (anderes Repo), z.B. https://profleet.de.
//                     Für Logout-Redirect, Impressum/Datenschutz-Links etc.

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";
export const MARKETING_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://profleet.de";
