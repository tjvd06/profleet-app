import { createClient } from "@/lib/supabase";
import { kwToPs } from "@/lib/vehicle-units";

// ─── DB row type ────────────────────────────────────────────────────────────
export interface InstantOfferRow {
  id: string;
  dealer_id: string;
  status: string;
  vehicle_type: string;
  brand: string;
  model_name: string;
  body_type: string | null;
  fuel_type: string | null;
  transmission: string | null;
  power_kw: number | null;
  awd: boolean;
  color: string | null;
  metallic: boolean;
  doors: number | null;
  equipment: Record<string, unknown> | null;
  images: string[];
  quantity: number;
  delivery_plz: string | null;
  delivery_city: string | null;
  delivery_radius: number | null;
  purchase_price_net: number | null;
  discount_percent: number | null;
  leasing_enabled: boolean;
  leasing_rate_net: number | null;
  leasing_duration: number | null;
  leasing_mileage: number | null;
  leasing_conditions: string | null;
  financing_enabled: boolean;
  financing_rate_net: number | null;
  financing_duration: number | null;
  financing_downpayment: number | null;
  financing_conditions: string | null;
  config_documents: { path: string; name: string }[];
  transfer_cost: number | null;
  registration_cost: number | null;
  total_price: number | null;
  duration_days: number;
  published_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Helper: build specs string from DB row ─────────────────────────────────
export function buildSpecsString(row: InstantOfferRow): string {
  const parts: string[] = [];
  if (row.power_kw) {
    parts.push(`${row.power_kw} kW (${kwToPs(row.power_kw)} PS)`);
  }
  if (row.transmission) parts.push(row.transmission);
  if (row.fuel_type) parts.push(row.fuel_type);
  if (row.color) {
    parts.push(row.color + (row.metallic ? " Metallic" : ""));
  }
  if (row.awd) parts.push("Allrad");
  return parts.join(" · ");
}

// ─── Helper: build equipment detail list (label/value pairs) ────────────────
export interface EquipmentDetail {
  label: string;
  value: string;
}

export function buildEquipmentDetails(row: InstantOfferRow): EquipmentDetail[] {
  const details: EquipmentDetail[] = [];
  const eq = row.equipment || {};

  // Core vehicle specs
  if (row.vehicle_type) details.push({ label: "Fahrzeugart", value: row.vehicle_type });
  if (row.body_type) details.push({ label: "Karosserie", value: row.body_type });
  if (row.fuel_type) details.push({ label: "Kraftstoff", value: row.fuel_type });
  if (row.power_kw) {
    details.push({ label: "Leistung", value: `${row.power_kw} kW (${kwToPs(row.power_kw)} PS)` });
  }
  if (row.transmission) details.push({ label: "Getriebe", value: row.transmission });
  if (row.awd) details.push({ label: "Antrieb", value: "Allrad" });
  if (row.color) details.push({ label: "Farbe", value: row.color + (row.metallic ? " Metallic" : "") });
  if (row.doors) details.push({ label: "Türen", value: String(row.doors) });

  // Equipment JSONB fields
  if (eq.seatsFrom != null) {
    const seats = eq.seatsTo ? `${eq.seatsFrom}–${eq.seatsTo}` : String(eq.seatsFrom);
    details.push({ label: "Sitze", value: seats });
  }
  if (eq.slidingDoor) details.push({ label: "Schiebetür", value: eq.slidingDoor as string });
  if (eq.displacementFrom != null) {
    const disp = eq.displacementTo ? `${eq.displacementFrom}–${eq.displacementTo} ccm` : `${eq.displacementFrom} ccm`;
    details.push({ label: "Hubraum", value: disp });
  }
  if (eq.cylinders != null) details.push({ label: "Zylinder", value: String(eq.cylinders) });
  if (eq.fuelConsumption != null) details.push({ label: "Verbrauch", value: `${eq.fuelConsumption} l/100km` });
  if (eq.driveType) details.push({ label: "Antriebsart", value: eq.driveType as string });
  if (eq.towBar) details.push({ label: "Anhängerkupplung", value: eq.towBar as string });
  if (eq.towCapacityBraked != null) details.push({ label: "Anhängelast gebremst", value: `${eq.towCapacityBraked} kg` });
  if (eq.environmentalBadge) details.push({ label: "Umweltplakette", value: eq.environmentalBadge as string });
  if (eq.emissionClass) details.push({ label: "Abgasnorm", value: eq.emissionClass as string });
  if (eq.particleFilter) details.push({ label: "Partikelfilter", value: "Ja" });
  if (eq.parkingAid && (eq.parkingAid as string[]).length > 0) details.push({ label: "Einparkhilfe", value: (eq.parkingAid as string[]).join(", ") });
  if (eq.cruiseControl) details.push({ label: "Tempomat", value: eq.cruiseControl as string });
  // exteriorExtras & interiorExtras are rendered separately as grouped chips on the detail page
  if (eq.interiorColor) details.push({ label: "Innenfarbe", value: eq.interiorColor as string });
  if (eq.interiorMaterial) details.push({ label: "Innenmaterial", value: eq.interiorMaterial as string });
  if (eq.airbags) details.push({ label: "Airbags", value: eq.airbags as string });
  if (eq.climate) details.push({ label: "Klimaanlage", value: eq.climate as string });

  return details;
}

// ─── Helper: get public URL for a storage image path ────────────────────────
export function getImageUrl(path: string): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  return `${supabaseUrl}/storage/v1/object/public/instant-offer-images/${path}`;
}

// ─── Helper: get public URL for a config document path ──────────────────────
export function getConfigDocUrl(path: string): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  return `${supabaseUrl}/storage/v1/object/public/instant-offer-config-docs/${path}`;
}

// ─── Helper: build location string ──────────────────────────────────────────
export function buildLocationString(row: InstantOfferRow): string {
  const parts: string[] = [];
  if (row.delivery_plz) parts.push(row.delivery_plz);
  if (row.delivery_city) parts.push(row.delivery_city);
  if (parts.length === 0) return "Deutschland";
  return parts.join(" ") + " (DE)";
}
