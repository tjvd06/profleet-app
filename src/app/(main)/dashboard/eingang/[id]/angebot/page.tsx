"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft, ChevronDown, ChevronRight, CheckCircle2, Mail, Save, Loader2,
  Check, Circle, ClipboardList, User, Car, FileText, Truck, BarChart3,
  Phone, AlertTriangle, MapPin, Upload, Trash2, Building2, Clock,
} from "lucide-react";
import Link from "next/link";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase";
import { useAuth } from "@/components/providers/auth-provider";
import { useSubscription } from "@/components/providers/subscription-provider";
import { dbRowToVehicleConfig } from "@/types/vehicle";
import type { VehicleConfig } from "@/types/vehicle";
import { VehicleDetailSections } from "@/components/tenders/VehicleDetailSections";
import { ConfigFileDownload } from "@/components/tenders/ConfigFileDownload";
import { RatingBadge } from "@/components/ui-custom/RatingBadge";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type TenderVehicleRow = Record<string, unknown> & {
  id: string;
  quantity: number;
  brand: string | null;
  model_name: string | null;
  fleet_discount: number | null;
  leasing: any;
  financing: any;
  alt_preferences: any;
  config_method: string | null;
  equipment: any;
};

type BuyerProfile = {
  company_name: string | null;
  first_name: string | null;
  last_name: string | null;
  industry: string | null;
  zip: string | null;
  city: string | null;
  street: string | null;
  phone: string | null;
  email_public: string | null;
  subscription_tier: string | null;
  created_at: string | null;
};

type TenderData = {
  id: string;
  buyer_id: string;
  status: string;
  delivery_plz: string | null;
  delivery_city: string | null;
  delivery_radius: number | null;
  tender_scope: string;
  start_at: string | null;
  end_at: string | null;
  preferred_dealer: { name?: string; id?: string } | null;
  tender_vehicles: TenderVehicleRow[];
  buyer: BuyerProfile | null;
};

type VehicleOfferForm = {
  exactMatch: boolean;
  deviationDesc: string;
  dayRegistration: boolean;
  dayRegistrationDate: string;
  dayRegistrationKm: string;
  deliveryZip: string;
  deliveryCity: string;
  deliveryDate: string;
  hasFleetContract: boolean;
  fleetContractDiscount: string;
  hasSpecialAgreement: boolean;
  specialAgreementDiscount: string;
  offeredQuantity: string;
  purchasePriceNet: string;
  leasingRateNet: string;
  leasingDuration: string;
  leasingKmYear: string;
  leasingDownPayment: string;
  financingRateNet: string;
  financingDuration: string;
  financingDownPayment: string;
  financingResidual: string;
  transferCostNet: string;
  registrationCostNet: string;
  totalPriceNetOverride: string;
  configFile: File | null;
  existingConfigPath: string | null;
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function timeLeft(endAt: string | null): string {
  if (!endAt) return "—";
  const diff = new Date(endAt).getTime() - Date.now();
  if (diff <= 0) return "Abgelaufen";
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  return days > 0 ? `${days}T ${hours}Std` : `${hours} Std.`;
}

function createEmptyOfferForm(vehicle: TenderVehicleRow): VehicleOfferForm {
  return {
    exactMatch: true,
    deviationDesc: "",
    dayRegistration: false,
    dayRegistrationDate: "",
    dayRegistrationKm: "",
    deliveryZip: "",
    deliveryCity: "",
    deliveryDate: "",
    hasFleetContract: !!(vehicle.fleet_discount && vehicle.fleet_discount > 0),
    fleetContractDiscount: vehicle.fleet_discount ? String(vehicle.fleet_discount) : "",
    hasSpecialAgreement: false,
    specialAgreementDiscount: "",
    offeredQuantity: String(vehicle.quantity),
    purchasePriceNet: "",
    leasingRateNet: "",
    leasingDuration: vehicle.leasing?.duration || "36",
    leasingKmYear: vehicle.leasing?.km_year || "15000",
    leasingDownPayment: vehicle.leasing?.down_payment || "0",
    financingRateNet: "",
    financingDuration: vehicle.financing?.duration || "48",
    financingDownPayment: vehicle.financing?.down_payment || "0",
    financingResidual: vehicle.financing?.residual || "",
    transferCostNet: "0",
    registrationCostNet: "0",
    totalPriceNetOverride: "",
    configFile: null,
    existingConfigPath: null,
  };
}

function isFormFilled(f: VehicleOfferForm): boolean {
  return parseFloat(f.purchasePriceNet) > 0;
}

function validateForm(f: VehicleOfferForm): string[] {
  const errors: string[] = [];
  const price = parseFloat(f.purchasePriceNet);
  if (!price || price <= 0) errors.push("Kaufpreis netto ist erforderlich und muss > 0 sein");
  if (price < 0) errors.push("Kaufpreis darf nicht negativ sein");
  const qty = parseInt(f.offeredQuantity);
  if (!qty || qty < 1) errors.push("Stückzahl muss mindestens 1 sein");
  if (parseFloat(f.transferCostNet) < 0) errors.push("Überführungskosten dürfen nicht negativ sein");
  if (parseFloat(f.registrationCostNet) < 0) errors.push("Zulassungskosten dürfen nicht negativ sein");
  if (parseFloat(f.leasingRateNet) < 0) errors.push("Leasing-Rate darf nicht negativ sein");
  if (parseFloat(f.financingRateNet) < 0) errors.push("Finanzierungs-Rate darf nicht negativ sein");
  const override = parseFloat(f.totalPriceNetOverride);
  if (f.totalPriceNetOverride && override <= 0) errors.push("Gesamtpreis netto muss > 0 sein");
  return errors;
}

function calcTotalNetto(f: VehicleOfferForm): number {
  return Math.max(0, (parseFloat(f.purchasePriceNet) || 0)) + Math.max(0, (parseFloat(f.transferCostNet) || 0)) + Math.max(0, (parseFloat(f.registrationCostNet) || 0));
}

function fmt(n: number): string {
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(d));
}

/* ------------------------------------------------------------------ */
/*  Collapsible Section                                                */
/* ------------------------------------------------------------------ */

function Section({
  title, icon: Icon, children, defaultOpen = true, badge,
}: {
  title: string; icon: React.ElementType; children: React.ReactNode; defaultOpen?: boolean; badge?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      <button type="button" onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50/50 transition-colors text-left">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
            <Icon size={16} className="text-blue-600" />
          </div>
          <span className="font-bold text-navy-950">{title}</span>
          {badge}
        </div>
        <ChevronDown size={16} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-6 pb-6 border-t border-slate-100 pt-4">{children}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function OfferCreationPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { canCreateOffer, monthlyOfferCount, getOfferLimit, isLoading: subLoading } = useSubscription();
  const [supabase] = useState(() => createClient());

  const [tender, setTender] = useState<TenderData | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [tosAccepted, setTosAccepted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [offerCount, setOfferCount] = useState(0);
  const [bestOfferPrice, setBestOfferPrice] = useState<number | null>(null);
  const [buyerRating, setBuyerRating] = useState<{ score: number; total: number }>({ score: 0, total: 0 });

  const [forms, setForms] = useState<VehicleOfferForm[]>([]);
  // Step: 0..N-1 = per-vehicle, N = summary
  const [step, setStep] = useState(0);
  const [isEdit, setIsEdit] = useState(false);

  /* ---- Data Loading ---- */
  useEffect(() => {
    if (authLoading || !user) return;
    (async () => {
      try {
        const [tenderResult, offersResult] = await Promise.all([
          supabase.from("tenders").select("*, tender_vehicles(*)").eq("id", params.id).single(),
          supabase.from("offers").select("*").eq("tender_id", params.id).eq("dealer_id", user.id),
        ]);

        if (tenderResult.error) { setPageError(tenderResult.error.message); return; }
        const t = tenderResult.data as TenderData;

        if (t.buyer_id) {
          const { data: buyerData } = await supabase
            .from("profiles")
            .select("company_name, first_name, last_name, industry, zip, city, street, phone, email_public, subscription_tier, created_at")
            .eq("id", t.buyer_id).single();
          t.buyer = buyerData || null;

          const { data: reviewsData } = await supabase.from("reviews").select("type").eq("to_user_id", t.buyer_id);
          if (reviewsData && reviewsData.length > 0) {
            const pos = reviewsData.filter((r: any) => r.type === "positive").length;
            setBuyerRating({ score: Math.round((pos / reviewsData.length) * 100), total: reviewsData.length });
          }
        }

        setTender(t);

        const { count } = await supabase.from("offers").select("*", { count: "exact", head: true }).eq("tender_id", params.id);
        setOfferCount(count || 0);

        const { data: bestOffer } = await supabase.from("offers").select("purchase_price").eq("tender_id", params.id).order("purchase_price", { ascending: true }).limit(1);
        if (bestOffer && bestOffer.length > 0) setBestOfferPrice(bestOffer[0].purchase_price);

        const existingOffers = (offersResult.data || []) as any[];
        if (existingOffers.length > 0) {
          setIsEdit(true);
          const formsByVehicle = new Map(existingOffers.map((o: any) => [o.tender_vehicle_id, o]));
          const builtForms = t.tender_vehicles.map((v) => {
            const existing = formsByVehicle.get(v.id);
            if (!existing) return createEmptyOfferForm(v);
            const d = existing.offer_details || {};
            return {
              exactMatch: d.exactMatch ?? true,
              deviationDesc: existing.deviation_details?.description || "",
              dayRegistration: d.dayRegistration ?? false,
              dayRegistrationDate: d.dayRegistrationDate || "",
              dayRegistrationKm: d.dayRegistrationKm || "",
              deliveryZip: existing.delivery_plz || "",
              deliveryCity: existing.delivery_city || "",
              deliveryDate: existing.delivery_date || "",
              hasFleetContract: d.hasFleetContract ?? false,
              fleetContractDiscount: d.fleetContractDiscount ? String(d.fleetContractDiscount) : "",
              hasSpecialAgreement: d.hasSpecialAgreement ?? false,
              specialAgreementDiscount: d.specialAgreementDiscount ? String(d.specialAgreementDiscount) : "",
              offeredQuantity: existing.offered_quantity ? String(existing.offered_quantity) : String(v.quantity),
              purchasePriceNet: existing.purchase_price ? String(existing.purchase_price) : "",
              leasingRateNet: existing.leasing_rate_net ? String(existing.leasing_rate_net) : "",
              leasingDuration: d.leasingDuration || v.leasing?.duration || "36",
              leasingKmYear: d.leasingKmYear || v.leasing?.km_year || "15000",
              leasingDownPayment: d.leasingDownPayment || v.leasing?.down_payment || "0",
              financingRateNet: d.financingRate ? String(d.financingRate) : "",
              financingDuration: d.financingDuration || v.financing?.duration || "48",
              financingDownPayment: d.financingDownPayment || v.financing?.down_payment || "0",
              financingResidual: d.financingResidual || v.financing?.residual || "",
              transferCostNet: existing.transfer_cost != null ? String(existing.transfer_cost) : "0",
              registrationCostNet: existing.registration_cost != null ? String(existing.registration_cost) : "0",
              totalPriceNetOverride: "",
              configFile: null,
              existingConfigPath: existing.config_file_path || null,
            };
          });

          // Verify that files referenced by existingConfigPath actually exist in storage
          const verifiedForms = await Promise.all(builtForms.map(async (f) => {
            if (!f.existingConfigPath) return f;
            try {
              const res = await fetch("/api/storage/exists", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filePath: f.existingConfigPath, bucket: "tender-config-files" }),
              });
              const { exists } = await res.json();
              if (!exists) return { ...f, existingConfigPath: null };
            } catch (err) {
              console.error("[verify config] error:", err);
              return { ...f, existingConfigPath: null };
            }
            return f;
          }));

          setForms(verifiedForms);
        } else {
          setForms(t.tender_vehicles.map((v) => createEmptyOfferForm(v)));
        }
      } catch (e: any) {
        setPageError(e?.message || "Fehler beim Laden");
      } finally {
        setPageLoading(false);
      }
    })();
  }, [authLoading, user?.id, params.id]);

  const vehicles = tender?.tender_vehicles || [];
  const vehicleConfigs: VehicleConfig[] = useMemo(
    () => vehicles.map((v) => dbRowToVehicleConfig(v as Record<string, unknown>)),
    [vehicles],
  );

  const isSummary = step === vehicles.length;
  const currentVehicle = !isSummary ? vehicles[step] : null;
  const currentConfig = !isSummary ? vehicleConfigs[step] : null;
  const currentForm = !isSummary ? forms[step] : null;

  const updateForm = (patch: Partial<VehicleOfferForm>) => {
    setForms((prev) => prev.map((f, i) => {
      if (i !== step) return f;
      const updated = { ...f, ...patch };
      // Auto-clear override when component prices change so the total recalculates
      if ("purchasePriceNet" in patch || "transferCostNet" in patch || "registrationCostNet" in patch) {
        updated.totalPriceNetOverride = "";
      }
      return updated;
    }));
  };

  const grandTotalNetto = forms.reduce((sum, f) => {
    const perVehicle = f.totalPriceNetOverride && parseFloat(f.totalPriceNetOverride) > 0
      ? parseFloat(f.totalPriceNetOverride)
      : calcTotalNetto(f);
    return sum + perVehicle * (parseInt(f.offeredQuantity) || 1);
  }, 0);
  const totalVehicleCount = forms.reduce((sum, f) => sum + (parseInt(f.offeredQuantity) || 0), 0);
  const allFormsValid = forms.every((f) => validateForm(f).length === 0);
  const allFormErrors = forms.map((f) => validateForm(f));

  /* ---- Submit ---- */
  const handleSubmitOffer = async (draft = false) => {
    if (!user || !tender) return;

    // Validate all forms before submitting (skip for drafts)
    if (!draft) {
      const errors = forms.flatMap((f, i) =>
        validateForm(f).map((msg) => `Fahrzeug ${i + 1}: ${msg}`)
      );
      if (errors.length > 0) {
        setSubmitError(errors.join(" · "));
        return;
      }
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const inserts = vehicles.map((v, i) => {
        const f = forms[i];
        const perVehicleNetto = f.totalPriceNetOverride && parseFloat(f.totalPriceNetOverride) > 0
          ? parseFloat(f.totalPriceNetOverride) : calcTotalNetto(f);
        const qty = parseInt(f.offeredQuantity) || v.quantity;

        return {
          tender_id: tender.id,
          tender_vehicle_id: v.id,
          dealer_id: user.id,
          status: draft ? "draft" : "active",
          purchase_price: parseFloat(f.purchasePriceNet) || 0,
          leasing_rate_net: v.leasing?.requested ? parseFloat(f.leasingRateNet) || null : null,
          transfer_cost: parseFloat(f.transferCostNet) || 0,
          registration_cost: parseFloat(f.registrationCostNet) || 0,
          total_price: perVehicleNetto,
          offered_quantity: qty,
          delivery_plz: f.deliveryZip || null,
          delivery_city: f.deliveryCity || null,
          delivery_date: f.deliveryDate || null,
          deviation_type: f.exactMatch ? null : "alternative",
          deviation_details: f.exactMatch ? null : { description: f.deviationDesc },
          offer_details: {
            exactMatch: f.exactMatch,
            dayRegistration: f.dayRegistration,
            dayRegistrationDate: f.dayRegistration ? (f.dayRegistrationDate || null) : null,
            dayRegistrationKm: f.dayRegistration ? (f.dayRegistrationKm || null) : null,
            hasFleetContract: f.hasFleetContract,
            fleetContractDiscount: f.hasFleetContract ? (parseFloat(f.fleetContractDiscount) || null) : null,
            hasSpecialAgreement: f.hasSpecialAgreement,
            specialAgreementDiscount: f.hasSpecialAgreement ? (parseFloat(f.specialAgreementDiscount) || null) : null,
            // Only save leasing details if a rate was actually entered
            ...(parseFloat(f.leasingRateNet) > 0 ? {
              leasingDuration: f.leasingDuration,
              leasingKmYear: f.leasingKmYear,
              leasingDownPayment: f.leasingDownPayment,
            } : {}),
            // Only save financing details if a rate was actually entered
            ...(parseFloat(f.financingRateNet) > 0 ? {
              financingRate: parseFloat(f.financingRateNet),
              financingDuration: f.financingDuration,
              financingDownPayment: f.financingDownPayment,
              financingResidual: f.financingResidual,
            } : {}),
          },
        };
      });

      const { error } = await supabase.from("offers").upsert(inserts, {
        onConflict: "tender_id,tender_vehicle_id,dealer_id",
      });
      if (error) throw error;

      // Upload config files per vehicle and save path to offers table
      for (let i = 0; i < vehicles.length; i++) {
        const f = forms[i];
        if (f.configFile) {
          const safeName = f.configFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const storagePath = `offers/${user.id}/${tender.id}/${vehicles[i].id}/${safeName}`;
          const formData = new FormData();
          formData.append("file", f.configFile);
          formData.append("storagePath", storagePath);
          formData.append("bucket", "tender-config-files");
          const uploadRes = await fetch("/api/storage/upload", { method: "POST", body: formData });
          if (!uploadRes.ok) {
            const err = await uploadRes.json().catch(() => ({}));
            throw new Error(`Datei-Upload fehlgeschlagen: ${err.details || "Unbekannter Fehler"}`);
          }
          await supabase.from("offers")
            .update({ config_file_path: storagePath })
            .eq("tender_id", tender.id)
            .eq("tender_vehicle_id", vehicles[i].id)
            .eq("dealer_id", user.id);
        }
      }

      router.push("/dashboard/angebote");
    } catch (e: any) {
      setSubmitError(e?.message || "Fehler beim Absenden");
    } finally {
      setSubmitting(false);
    }
  };

  /* ---- Loading / Error / Limit states ---- */

  if (pageLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-slate-400">
        <Loader2 className="animate-spin mr-3" size={28} />
        <span className="text-lg font-semibold">Ausschreibung wird geladen…</span>
      </div>
    );
  }

  if (pageError || !tender) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8 max-w-lg text-center">
          <h3 className="text-lg font-bold text-red-800 mb-2">Fehler</h3>
          <p className="text-red-600 text-sm mb-4">{pageError || "Ausschreibung nicht gefunden."}</p>
          <Link href="/dashboard/eingang">
            <Button variant="outline" className="rounded-xl border-red-200 text-red-700">Zurück zum Eingang</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!subLoading && !isEdit && !canCreateOffer()) {
    const limit = getOfferLimit();
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-navy-950/80 via-blue-900/60 to-navy-950/80 backdrop-blur-sm">
        <div className="bg-white/90 backdrop-blur-xl border border-slate-200 rounded-3xl p-8 md:p-12 max-w-lg mx-4 shadow-2xl text-center">
          <h2 className="text-2xl font-black text-navy-950 mb-3">Monatliches Kontingent erreicht</h2>
          <p className="text-slate-500 font-medium mb-8">Sie haben diesen Monat bereits {monthlyOfferCount} von {limit} Angeboten abgegeben.</p>
          <div className="flex gap-3 justify-center">
            <Link href="/dashboard/abo"><Button className="h-12 px-8 rounded-xl font-bold text-white bg-blue-600">Auf Pro upgraden</Button></Link>
            <Link href="/dashboard/eingang"><Button variant="ghost" className="h-12 px-8 rounded-xl">Zurück</Button></Link>
          </div>
        </div>
      </div>
    );
  }

  const buyer = tender.buyer;

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */

  return (
    <div className="bg-slate-50 min-h-screen">
      {/* ── Top Bar ── */}
      <div className="bg-navy-950 text-white py-4 sticky top-0 z-40 shadow-md">
        <div className="container mx-auto max-w-4xl px-4 md:px-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard/eingang">
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 rounded-full h-8 w-8">
                <ChevronLeft size={20} />
              </Button>
            </Link>
            <div>
              <h1 className="font-bold text-lg">Angebot abgeben</h1>
              <div className="flex items-center gap-2 text-xs text-blue-200">
                <Badge className="bg-white/20 text-blue-200 border-none px-2 rounded-md font-mono text-[10px]">{tender.id.split("-")[0].toUpperCase()}</Badge>
                {buyer?.company_name && <span>· {buyer.company_name}</span>}
                <span>· <Clock size={10} className="inline" /> {timeLeft(tender.end_at)}</span>
              </div>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-3 text-sm">
            <div className="text-right">
              <div className="text-[10px] text-blue-300 uppercase font-bold">Angebote</div>
              <div className="font-bold">{offerCount}</div>
            </div>
            {bestOfferPrice != null && (
              <div className="text-right border-l border-white/20 pl-3">
                <div className="text-[10px] text-blue-300 uppercase font-bold">Bester Preis</div>
                <div className="font-bold text-green-400">{bestOfferPrice.toLocaleString("de-DE")} €</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Step Indicator ── */}
      <div className="bg-white border-b border-slate-200 sticky top-[64px] z-30">
        <div className="container mx-auto max-w-4xl px-4 md:px-8 py-3 flex gap-2 overflow-x-auto">
          {vehicles.map((v, i) => (
            <button key={v.id} type="button" onClick={() => setStep(i)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${step === i ? "bg-blue-600 text-white shadow-md" : "bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100"
                }`}>
              {isFormFilled(forms[i]) ? <Check size={16} className={step === i ? "text-white" : "text-green-500"} /> : <Circle size={16} className={step === i ? "text-blue-200" : "text-slate-300"} />}
              {vehicles.length > 1 ? `Fzg. ${i + 1}: ` : ""}{v.brand || "—"} {v.model_name || ""}
            </button>
          ))}
          <button type="button" onClick={() => setStep(vehicles.length)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${isSummary ? "bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md" : "bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100"
              }`}>
            <ClipboardList size={16} /> Zusammenfassung
          </button>
        </div>
      </div>

      <div className="container mx-auto max-w-4xl px-4 md:px-8 py-8">

        {/* ================================================================ */}
        {/*  SUMMARY VIEW                                                     */}
        {/* ================================================================ */}
        {isSummary ? (
          <div className="flex flex-col gap-6">
            <h2 className="text-3xl font-bold text-navy-950">Zusammenfassung</h2>

            {/* Buyer info compact */}
            {buyer && (
              <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center gap-4">
                <div className="w-10 h-10 bg-purple-50 border border-purple-100 rounded-xl flex items-center justify-center shrink-0"><Building2 size={18} className="text-purple-600" /></div>
                <div className="flex-1">
                  <div className="font-bold text-navy-950 text-sm">{buyer.company_name}</div>
                  <div className="text-xs text-slate-500">{buyer.zip} {buyer.city}</div>
                </div>
                <RatingBadge score={buyerRating.score} total={buyerRating.total} />
              </div>
            )}

            {vehicles.map((v, i) => {
              const f = forms[i];
              const total = f.totalPriceNetOverride && parseFloat(f.totalPriceNetOverride) > 0 ? parseFloat(f.totalPriceNetOverride) : calcTotalNetto(f);
              const qty = parseInt(f.offeredQuantity) || v.quantity;
              return (
                <div key={v.id} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-navy-950 flex items-center gap-2">
                      {isFormFilled(f) ? <Check size={18} className="text-green-500" /> : <Circle size={18} className="text-slate-300" />}
                      {vehicles.length > 1 && `Fzg. ${i + 1}: `}{v.brand} {v.model_name} · {qty} Stk.
                    </h3>
                    <Button variant="ghost" size="sm" className="text-blue-600" onClick={() => setStep(i)}>Bearbeiten</Button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="text-slate-400 font-semibold text-xs uppercase">Kaufpreis netto</div>
                      <div className="font-bold text-navy-950">{f.purchasePriceNet ? `${fmt(parseFloat(f.purchasePriceNet))} €` : "—"}</div>
                    </div>
                    <div>
                      <div className="text-slate-400 font-semibold text-xs uppercase">Überführung</div>
                      <div className="font-bold text-navy-950">{f.transferCostNet ? `${fmt(parseFloat(f.transferCostNet))} €` : "—"}</div>
                    </div>
                    <div>
                      <div className="text-slate-400 font-semibold text-xs uppercase">Zulassung</div>
                      <div className="font-bold text-navy-950">{f.registrationCostNet ? `${fmt(parseFloat(f.registrationCostNet))} €` : "—"}</div>
                    </div>
                    <div>
                      <div className="text-slate-400 font-semibold text-xs uppercase">Gesamt netto</div>
                      <div className="font-bold text-blue-700">{fmt(total)} €</div>
                    </div>
                  </div>
                  {(v.leasing?.requested && f.leasingRateNet) && (
                    <div className="mt-3 pt-3 border-t border-slate-100 text-sm text-slate-600">Leasing: {fmt(parseFloat(f.leasingRateNet))} €/Mon. · {f.leasingDuration} Mon.</div>
                  )}
                  {(v.financing?.requested && f.financingRateNet) && (
                    <div className="mt-1 text-sm text-slate-600">Finanzierung: {fmt(parseFloat(f.financingRateNet))} €/Mon. · {f.financingDuration} Mon.</div>
                  )}
                  {(f.configFile || f.existingConfigPath) && (
                    <div className="mt-2 text-xs text-blue-600 flex items-center gap-1">
                      <FileText size={12} /> {f.configFile ? f.configFile.name : "Konfiguration hochgeladen"}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Grand total */}
            <div className="bg-navy-950 text-white p-6 rounded-2xl flex items-center justify-between">
              <div>
                <div className="text-blue-200 font-semibold text-sm">Gesamtangebot</div>
                <div className="text-sm text-slate-400">{totalVehicleCount} Fahrzeuge · netto</div>
              </div>
              <div className="text-3xl font-black text-amber-400">{fmt(grandTotalNetto)} €</div>
            </div>

            <div className="flex items-center gap-3">
              <Checkbox id="tos" checked={tosAccepted} onCheckedChange={(v) => setTosAccepted(!!v)} className="scale-125 border-slate-300" />
              <Label htmlFor="tos" className="text-sm text-slate-500 leading-relaxed cursor-pointer">
                Ich bestätige die Vertragsbedingungen. Diese Angaben sind rechtlich bindend.
              </Label>
            </div>

            {/* Validation errors per vehicle */}
            {!allFormsValid && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle size={16} className="text-amber-600" />
                  <span className="font-bold text-amber-800 text-sm">Bitte korrigieren Sie folgende Angaben:</span>
                </div>
                <ul className="text-sm text-amber-700 space-y-1">
                  {allFormErrors.map((errors, i) =>
                    errors.map((err, j) => (
                      <li key={`${i}-${j}`} className="flex items-center gap-2">
                        <span className="font-semibold">{vehicles.length > 1 ? `Fzg. ${i + 1}:` : ""}</span> {err}
                      </li>
                    ))
                  )}
                </ul>
              </div>
            )}

            {submitError && <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm font-semibold">{submitError}</div>}

            <div className="bg-white/90 backdrop-blur-xl p-4 sm:p-6 rounded-2xl shadow-lg border border-slate-200 sticky bottom-6 z-50 flex flex-col sm:flex-row justify-between items-center gap-4">
              <Button variant="outline" onClick={() => handleSubmitOffer(true)} disabled={submitting} className="w-full sm:w-auto rounded-xl h-12 px-6 text-slate-600 font-semibold border-slate-300">
                <Save className="mr-2" size={18} /> Entwurf
              </Button>
              <Button onClick={() => handleSubmitOffer(false)} disabled={submitting || !allFormsValid || !tosAccepted}
                className="w-full sm:w-auto rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-lg px-8 h-12 font-bold disabled:opacity-50 disabled:cursor-not-allowed">
                {submitting ? <><Loader2 className="animate-spin mr-2" size={18} /> Wird gesendet…</> : <><Mail className="mr-2" size={18} /> Verbindlich abgeben</>}
              </Button>
            </div>
          </div>

        ) : currentVehicle && currentForm && currentConfig ? (

          /* ================================================================ */
          /*  PER-VEHICLE FORM — Single Column Wizard                          */
          /* ================================================================ */
          <div className="flex flex-col gap-5">

            {/* Vehicle header */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex items-center gap-4 mb-3">
                <div className="w-12 h-12 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-center shrink-0">
                  <Car size={22} className="text-blue-600" />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-navy-950">{currentVehicle.brand} {currentVehicle.model_name}</h2>
                  <div className="flex items-center gap-3 text-sm text-slate-500">
                    <span>{currentVehicle.quantity}x</span>
                    {currentConfig.fuelType && <span>· {currentConfig.fuelType}</span>}
                    {currentConfig.bodyType && <span>· {currentConfig.bodyType}</span>}
                    {currentConfig.exteriorColor && <span>· {currentConfig.exteriorColor}</span>}
                  </div>
                </div>
                {currentVehicle.config_method === "upload" && (currentVehicle as any).config_file_path && (
                  <ConfigFileDownload filePath={(currentVehicle as any).config_file_path} />
                )}
              </div>
              {/* Requested types badges */}
              <div className="flex gap-2 flex-wrap">
                <Badge className="bg-slate-100 text-slate-700 border-none text-xs">Barkauf</Badge>
                {currentVehicle.leasing?.requested && <Badge className="bg-blue-50 text-blue-700 border border-blue-200 text-xs">Leasing ({currentVehicle.leasing.duration || 36} Mon.)</Badge>}
                {currentVehicle.financing?.requested && <Badge className="bg-blue-50 text-blue-700 border border-blue-200 text-xs">Finanzierung ({currentVehicle.financing.duration || 48} Mon.)</Badge>}
                {currentVehicle.fleet_discount && currentVehicle.fleet_discount > 0 && (
                  <Badge className="bg-purple-50 text-purple-700 border border-purple-200 text-xs">Großkunde ({currentVehicle.fleet_discount}%)</Badge>
                )}
              </div>
            </div>

            {/* Nachgefragte Konfiguration (collapsible) */}
            <Section title="Nachgefragte Konfiguration" icon={Car} defaultOpen={false}>
              <VehicleDetailSections vehicle={currentConfig} />
            </Section>

            {/* 1. Konfiguration & Abweichung */}
            <Section title="Ihre Konfiguration" icon={FileText}
              badge={<Badge className={currentForm.exactMatch ? "bg-green-100 text-green-700 border-none text-xs ml-2" : "bg-amber-100 text-amber-700 border-none text-xs ml-2"}>
                {currentForm.exactMatch ? "Exakt" : "Alternative"}
              </Badge>}>
              <div className="space-y-5">
                <div className="flex items-start gap-4">
                  <Switch checked={currentForm.exactMatch} onCheckedChange={(c) => updateForm({ exactMatch: c })} className="scale-110 mt-1" />
                  <div>
                    <Label className="font-bold text-navy-950 cursor-pointer block mb-1" onClick={() => updateForm({ exactMatch: !currentForm.exactMatch })}>
                      Exakte Konfiguration anbieten
                    </Label>
                    <p className="text-sm text-slate-500">Schalten Sie aus, wenn Sie eine Alternative anbieten.</p>
                  </div>
                </div>

                {currentForm.exactMatch ? (
                  <div className="space-y-4">
                    <div className="flex items-start gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <Switch checked={currentForm.dayRegistration} onCheckedChange={(c) => updateForm({ dayRegistration: c })} className="mt-1" />
                      <div className="flex-grow">
                        <Label className="font-semibold text-navy-950 block mb-1">Tageszulassung</Label>
                        {currentForm.dayRegistration && (
                          <div className="grid grid-cols-2 gap-3 mt-3">
                            <div><Label className="text-xs text-slate-600">Datum</Label><DatePicker value={currentForm.dayRegistrationDate} onChange={(v) => updateForm({ dayRegistrationDate: v })} className="h-10" /></div>
                            <div><Label className="text-xs text-slate-600">km-Stand</Label><Input type="number" value={currentForm.dayRegistrationKm} onChange={(e) => updateForm({ dayRegistrationKm: e.target.value })} className="rounded-xl h-10" placeholder="z.B. 50" /></div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <Label className="text-sm font-semibold text-amber-700 block mb-2">Beschreibung der Abweichungen</Label>
                    <Textarea placeholder="z.B. Fahrzeug ist weiß statt schwarz, dafür sofort verfügbar..." value={currentForm.deviationDesc}
                      onChange={(e) => updateForm({ deviationDesc: e.target.value })}
                      className="min-h-[100px] rounded-xl bg-amber-50/30 border-amber-200 text-sm p-3" />
                  </div>
                )}

                {/* Config PDF Upload */}
                <div className="border-t border-slate-100 pt-4">
                  <Label className="text-sm font-semibold text-slate-700 block mb-2">Hersteller-Konfiguration hochladen (optional)</Label>
                  {currentForm.configFile ? (
                    <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                      <FileText size={18} className="text-blue-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-navy-950 text-sm truncate">{currentForm.configFile.name}</p>
                        <p className="text-xs text-slate-500">{(currentForm.configFile.size / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                      <button onClick={() => updateForm({ configFile: null })} className="h-8 w-8 rounded-lg border border-red-200 bg-white flex items-center justify-center text-red-500 hover:bg-red-50 shrink-0">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ) : currentForm.existingConfigPath ? (
                    <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-xl">
                      <CheckCircle2 size={18} className="text-green-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-navy-950 text-sm">Konfiguration bereits hochgeladen</p>
                        <p className="text-xs text-slate-500">{currentForm.existingConfigPath.split("/").pop()}</p>
                      </div>
                      <button onClick={() => {
                        const input = document.createElement("input");
                        input.type = "file";
                        input.accept = ".pdf,.doc,.docx,.txt,.xlsx,.xls";
                        input.onchange = () => { const file = input.files?.[0]; if (file) updateForm({ configFile: file }); };
                        input.click();
                      }} className="text-xs text-blue-600 hover:text-blue-700 font-semibold shrink-0">
                        Ersetzen
                      </button>
                    </div>
                  ) : (
                    <div className="border-2 border-dashed border-slate-200 bg-slate-50/50 rounded-xl p-6 flex flex-col items-center text-slate-500 hover:bg-slate-50 hover:border-blue-300 transition-colors cursor-pointer"
                      onClick={() => {
                        const input = document.createElement("input");
                        input.type = "file";
                        input.accept = ".pdf,.doc,.docx,.txt,.xlsx,.xls";
                        input.onchange = () => { const file = input.files?.[0]; if (file) updateForm({ configFile: file }); };
                        input.click();
                      }}>
                      <Upload size={20} className="mb-2 text-slate-400" />
                      <p className="text-sm font-semibold text-navy-900">PDF, DOC, DOCX oder Excel hochladen</p>
                      <p className="text-xs text-slate-400">Genaue Hersteller-Konfiguration für dieses Fahrzeug</p>
                    </div>
                  )}
                </div>
              </div>
            </Section>

            {/* 2. Preise */}
            <Section title="Preise" icon={BarChart3}
              badge={<Badge className="bg-blue-100 text-blue-700 border-none text-xs ml-2">Pflichtfeld</Badge>}>
              <div className="space-y-6">
                {/* Purchase price */}
                <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
                  <h4 className="font-bold text-navy-950 mb-4">Barkauf-Angebot</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-semibold text-slate-700">Kaufpreis netto / Fzg. (€) *</Label>
                      <Input type="number" step="0.01" min="0" value={currentForm.purchasePriceNet}
                        onChange={(e) => updateForm({ purchasePriceNet: e.target.value })}
                        className="rounded-xl h-12 border-blue-200 bg-white text-lg font-bold text-blue-700 mt-1" placeholder="0,00" />
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-slate-700">Stückzahl</Label>
                      <Input type="number" min="1" value={currentForm.offeredQuantity} onChange={(e) => updateForm({ offeredQuantity: e.target.value })}
                        className="rounded-xl h-12 bg-slate-50 border-slate-200 text-lg mt-1" />
                      <p className="text-[10px] text-slate-400 mt-1">Angefragt: {currentVehicle.quantity}</p>
                    </div>
                  </div>
                </div>

                {/* Leasing */}
                {currentVehicle.leasing?.requested && (
                  <div className="p-5 rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/20">
                    <h4 className="font-bold text-navy-950 mb-1">Leasing-Angebot</h4>
                    <p className="text-xs text-slate-500 mb-4">Vom Nachfrager gewünscht: {currentVehicle.leasing.duration || 36} Mon., {parseInt(currentVehicle.leasing.km_year || "15000").toLocaleString("de-DE")} km/Jahr</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div><Label className="text-sm text-slate-700 font-semibold">Rate mtl. netto (€)</Label><Input type="number" step="0.01" min="0" value={currentForm.leasingRateNet} onChange={(e) => updateForm({ leasingRateNet: e.target.value })} className="rounded-xl h-11 mt-1" placeholder="0,00" /></div>
                      <div><Label className="text-sm text-slate-700 font-semibold">Laufzeit (Mon.)</Label><Input type="number" min="1" value={currentForm.leasingDuration} onChange={(e) => updateForm({ leasingDuration: e.target.value })} className="rounded-xl h-11 mt-1" /></div>
                      <div><Label className="text-sm text-slate-700 font-semibold">KM / Jahr</Label><Input type="number" min="0" value={currentForm.leasingKmYear} onChange={(e) => updateForm({ leasingKmYear: e.target.value })} className="rounded-xl h-11 mt-1" /></div>
                      <div><Label className="text-sm text-slate-700 font-semibold">Anzahlung (€)</Label><Input type="number" min="0" value={currentForm.leasingDownPayment} onChange={(e) => updateForm({ leasingDownPayment: e.target.value })} className="rounded-xl h-11 mt-1" /></div>
                    </div>
                  </div>
                )}

                {/* Financing */}
                {currentVehicle.financing?.requested && (
                  <div className="p-5 rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/20">
                    <h4 className="font-bold text-navy-950 mb-1">Finanzierungs-Angebot</h4>
                    <p className="text-xs text-slate-500 mb-4">Vom Nachfrager gewünscht: {currentVehicle.financing.duration || 48} Mon.</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div><Label className="text-sm text-slate-700 font-semibold">Rate mtl. netto (€)</Label><Input type="number" step="0.01" min="0" value={currentForm.financingRateNet} onChange={(e) => updateForm({ financingRateNet: e.target.value })} className="rounded-xl h-11 mt-1" placeholder="0,00" /></div>
                      <div><Label className="text-sm text-slate-700 font-semibold">Laufzeit (Mon.)</Label><Input type="number" min="1" value={currentForm.financingDuration} onChange={(e) => updateForm({ financingDuration: e.target.value })} className="rounded-xl h-11 mt-1" /></div>
                      <div><Label className="text-sm text-slate-700 font-semibold">Anzahlung (€)</Label><Input type="number" min="0" value={currentForm.financingDownPayment} onChange={(e) => updateForm({ financingDownPayment: e.target.value })} className="rounded-xl h-11 mt-1" /></div>
                      <div><Label className="text-sm text-slate-700 font-semibold">Restzahlung (€)</Label><Input type="number" min="0" value={currentForm.financingResidual} onChange={(e) => updateForm({ financingResidual: e.target.value })} className="rounded-xl h-11 mt-1" /></div>
                    </div>
                  </div>
                )}

                {/* Additional costs */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <div>
                      <Label className="font-bold text-navy-950 block text-sm">Überführungskosten netto (€)</Label>
                      <span className="text-slate-500 text-xs">inkl. Reinigung, Übergabe</span>
                    </div>
                    <Input type="number" min="0" value={currentForm.transferCostNet} onChange={(e) => updateForm({ transferCostNet: e.target.value })} className="w-32 rounded-xl h-10 text-right font-bold bg-white" placeholder="0" />
                  </div>
                  <div className="flex items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <div>
                      <Label className="font-bold text-navy-950 block text-sm">Zulassungskosten netto (€)</Label>
                      <span className="text-slate-500 text-xs">inkl. Wunschkennzeichen</span>
                    </div>
                    <Input type="number" min="0" value={currentForm.registrationCostNet} onChange={(e) => updateForm({ registrationCostNet: e.target.value })} className="w-32 rounded-xl h-10 text-right font-bold bg-white" placeholder="0" />
                  </div>
                </div>

                {/* Total */}
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-200 flex items-center justify-between">
                  <div>
                    <Label className="font-bold text-navy-950 block">Gesamtpreis nett</Label>
                    <span className="text-slate-400 text-xs">Kaufpreis + Überführung + Zulassung</span>
                  </div>
                  <Input type="number" min="0" step="0.01"
                    value={currentForm.totalPriceNetOverride || (currentForm.purchasePriceNet ? String(calcTotalNetto(currentForm)) : "")}
                    onChange={(e) => updateForm({ totalPriceNetOverride: e.target.value })}
                    className="w-40 rounded-xl h-12 text-right text-xl font-black text-blue-700 bg-white border-blue-200" />
                </div>
              </div>
            </Section>

            {/* 3. Lieferung */}
            <Section title="Lieferung" icon={Truck} defaultOpen={false}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label className="text-sm font-semibold text-slate-700">PLZ</Label>
                  <Input value={currentForm.deliveryZip} onChange={(e) => updateForm({ deliveryZip: e.target.value })} className="rounded-xl h-11 bg-slate-50 mt-1" placeholder="z.B. 80331" />
                </div>
                <div>
                  <Label className="text-sm font-semibold text-slate-700">Ort</Label>
                  <Input value={currentForm.deliveryCity} onChange={(e) => updateForm({ deliveryCity: e.target.value })} className="rounded-xl h-11 bg-slate-50 mt-1" placeholder="z.B. München" />
                </div>
                <div>
                  <Label className="text-sm font-semibold text-slate-700">Liefertermin</Label>
                  <div className="mt-1">
                    <DatePicker value={currentForm.deliveryDate} onChange={(v) => updateForm({ deliveryDate: v })} fromToday className="h-11" />
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-3">Gewünschter Auslieferungsort des Nachfragers: {tender.delivery_plz || "—"} {tender.delivery_city || ""}</p>
            </Section>

            {/* 4. Vertragsdaten */}
            <Section title="Vertragsdaten" icon={FileText} defaultOpen={false}>
              <div className="space-y-4">
                <div className="flex items-start gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <Switch checked={currentForm.hasFleetContract} onCheckedChange={(c) => updateForm({ hasFleetContract: c })} className="mt-1" />
                  <div className="flex-grow">
                    <Label className="font-semibold text-navy-950 block mb-1">Großkundenvertrag</Label>
                    {currentForm.hasFleetContract && (
                      <div className="mt-2"><Label className="text-xs text-slate-600">Rabatt %</Label><Input type="number" step="0.1" min="0" max="100" value={currentForm.fleetContractDiscount} onChange={(e) => updateForm({ fleetContractDiscount: e.target.value })} className="rounded-xl h-10 w-32 mt-1" /></div>
                    )}
                  </div>
                </div>
                <div className="flex items-start gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <Switch checked={currentForm.hasSpecialAgreement} onCheckedChange={(c) => updateForm({ hasSpecialAgreement: c })} className="mt-1" />
                  <div className="flex-grow">
                    <Label className="font-semibold text-navy-950 block mb-1">Sondervereinbarung</Label>
                    {currentForm.hasSpecialAgreement && (
                      <div className="mt-2"><Label className="text-xs text-slate-600">Rabatt %</Label><Input type="number" step="0.1" min="0" max="100" value={currentForm.specialAgreementDiscount} onChange={(e) => updateForm({ specialAgreementDiscount: e.target.value })} className="rounded-xl h-10 w-32 mt-1" /></div>
                    )}
                  </div>
                </div>
              </div>
            </Section>

            {/* Navigation */}
            <div className="bg-white/90 backdrop-blur-xl p-4 sm:p-6 rounded-2xl shadow-lg border border-slate-200 sticky bottom-6 z-50 flex justify-between items-center gap-4">
              <Button variant="outline" onClick={() => handleSubmitOffer(true)} disabled={submitting} className="rounded-xl h-12 px-5 text-slate-600 border-slate-300">
                <Save className="mr-2" size={16} /> Entwurf
              </Button>

              <div className="flex gap-3">
                {step > 0 && (
                  <Button variant="outline" onClick={() => setStep(step - 1)} className="rounded-xl h-12 px-4">
                    <ChevronLeft size={16} className="mr-1" /> Zurück
                  </Button>
                )}
                {step < vehicles.length - 1 ? (
                  <Button onClick={() => setStep(step + 1)} className="rounded-xl bg-navy-800 hover:bg-navy-950 text-white h-12 px-6 font-bold">
                    Fahrzeug {step + 2} <ChevronRight size={16} className="ml-1" />
                  </Button>
                ) : (
                  <Button onClick={() => setStep(vehicles.length)}
                    className="rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-lg h-12 px-6 font-bold">
                    <ClipboardList size={16} className="mr-2" /> Zusammenfassung
                  </Button>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
