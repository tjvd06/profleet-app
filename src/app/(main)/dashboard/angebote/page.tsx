"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Activity, Handshake, Clock, ExternalLink, Loader2, MessageCircle,
  Phone, Mail, MapPin, CheckCircle2, Star, ChevronDown, ChevronUp,
  ThumbsUp, Minus, ThumbsDown, X, ChevronRight,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { createClient } from "@/lib/supabase";
import Link from "next/link";
import { toast } from "sonner";
import { VehicleDetailSections } from "@/components/tenders/VehicleDetailSections";
import { dbRowToVehicleConfig } from "@/types/vehicle";

type ReviewRow = {
  id: string;
  contact_id: string;
  from_user_id: string;
  to_user_id: string;
  type: "positive" | "neutral" | "negative";
  contract_concluded: boolean;
  comment: string | null;
};

type BuyerProfile = {
  id: string;
  company_name: string | null;
  first_name: string | null;
  last_name: string | null;
  industry: string | null;
  zip: string | null;
  city: string | null;
  phone: string | null;
  email_public: string | null;
};

type Contact = {
  id: string;
  // Two link paths: (tender_id + offer_id) OR (instant_offer_id)
  tender_id: string | null;
  offer_id: string | null;
  instant_offer_id: string | null;
  buyer_id: string;
  dealer_id: string;
  status: string;
  dealer_responded: boolean;
  contract_concluded: boolean | null;
  created_at: string;
};

function EmptyTabState({ icon: Icon, title, description }: { icon: any; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center px-4">
      <div className="w-20 h-20 bg-slate-100 rounded-3xl flex items-center justify-center mb-6 text-slate-300">
        <Icon size={36} />
      </div>
      <h3 className="text-xl font-bold text-navy-950 mb-2">{title}</h3>
      <p className="text-slate-500 max-w-sm">{description}</p>
    </div>
  );
}

function timeLeft(endAt: string | null): string {
  if (!endAt) return "—";
  const diff = new Date(endAt).getTime() - Date.now();
  if (diff <= 0) return "Abgelaufen";
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  return days > 0 ? `${days}T ${hours}Std` : `${hours} Std.`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(dateStr));
}

// ─── Expandable offer details (same layout as Nachfrager side) ────────────────
function OfferDetailsExpander({ offer }: { offer: any }) {
  const [expanded, setExpanded] = useState(false);
  const d = offer.offer_details || {};

  const hasLeasing = !!(offer.leasing_rate_net);
  const hasFinancing = !!(d.financingRate);
  const hasCosts = !!((offer.transfer_cost && offer.transfer_cost > 0) || (offer.registration_cost && offer.registration_cost > 0));
  const hasDelivery = !!(offer.delivery_plz || offer.delivery_city || offer.delivery_date);
  const hasDiscounts = !!(d.hasFleetContract || d.hasSpecialAgreement);
  const hasDayReg = !!(d.dayRegistration && (d.dayRegistrationDate || d.dayRegistrationKm));
  const hasExtras = hasLeasing || hasFinancing || hasCosts || hasDelivery || hasDiscounts || hasDayReg;

  if (!hasExtras) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700 transition-colors"
      >
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {expanded ? "Weniger anzeigen" : "Alle Details anzeigen"}
      </button>

      {expanded && (
        <div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">

          {/* Kosten */}
          {(hasCosts || offer.total_price) && (
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Kosten</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
                {offer.purchase_price && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Kaufpreis netto</span>
                    <span className="font-semibold text-navy-950">{offer.purchase_price.toLocaleString("de-DE")} €</span>
                  </div>
                )}
                {offer.transfer_cost != null && offer.transfer_cost > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Überführung</span>
                    <span className="font-semibold text-navy-950">{offer.transfer_cost.toLocaleString("de-DE")} €</span>
                  </div>
                )}
                {offer.registration_cost != null && offer.registration_cost > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Zulassung</span>
                    <span className="font-semibold text-navy-950">{offer.registration_cost.toLocaleString("de-DE")} €</span>
                  </div>
                )}
                {offer.total_price && (
                  <div className="flex justify-between text-xs col-span-full pt-1 border-t border-slate-200 mt-1">
                    <span className="text-slate-500 font-semibold">Gesamtpreis netto</span>
                    <span className="font-bold text-navy-950">{offer.total_price.toLocaleString("de-DE")} €</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Leasing */}
          {hasLeasing && (
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Leasing</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
                {offer.leasing_rate_net && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Rate / Monat netto</span>
                    <span className="font-semibold text-navy-950">{offer.leasing_rate_net.toLocaleString("de-DE")} €</span>
                  </div>
                )}
                {d.leasingDuration && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Laufzeit</span>
                    <span className="font-semibold text-navy-950">{d.leasingDuration} Monate</span>
                  </div>
                )}
                {d.leasingKmYear && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">km / Jahr</span>
                    <span className="font-semibold text-navy-950">{Number(d.leasingKmYear).toLocaleString("de-DE")} km</span>
                  </div>
                )}
                {d.leasingDownPayment != null && d.leasingDownPayment !== "" && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Anzahlung netto</span>
                    <span className="font-semibold text-navy-950">{Number(d.leasingDownPayment).toLocaleString("de-DE")} €</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Finanzierung */}
          {hasFinancing && (
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Finanzierung</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
                {d.financingRate && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Rate / Monat</span>
                    <span className="font-semibold text-navy-950">{d.financingRate.toLocaleString("de-DE")} €</span>
                  </div>
                )}
                {d.financingDuration && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Laufzeit</span>
                    <span className="font-semibold text-navy-950">{d.financingDuration} Monate</span>
                  </div>
                )}
                {d.financingDownPayment != null && d.financingDownPayment !== "" && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Anzahlung</span>
                    <span className="font-semibold text-navy-950">{Number(d.financingDownPayment).toLocaleString("de-DE")} €</span>
                  </div>
                )}
                {d.financingResidual != null && d.financingResidual !== "" && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Restwert</span>
                    <span className="font-semibold text-navy-950">{Number(d.financingResidual).toLocaleString("de-DE")} €</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Lieferung */}
          {hasDelivery && (
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Lieferung</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
                {(offer.delivery_plz || offer.delivery_city) && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Abholort</span>
                    <span className="font-semibold text-navy-950">{offer.delivery_plz || ""} {offer.delivery_city || ""}</span>
                  </div>
                )}
                {offer.delivery_date && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Liefertermin</span>
                    <span className="font-semibold text-navy-950">{formatDate(offer.delivery_date)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Rabatte */}
          {hasDiscounts && (
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Rabatte</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
                {d.hasFleetContract && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Großkundenrabatt</span>
                    <span className="font-semibold text-green-700">{d.fleetContractDiscount ? `${d.fleetContractDiscount}%` : "Ja"}</span>
                  </div>
                )}
                {d.hasSpecialAgreement && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Sondervereinbarung</span>
                    <span className="font-semibold text-green-700">{d.specialAgreementDiscount ? `${d.specialAgreementDiscount}%` : "Ja"}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tageszulassung */}
          {hasDayReg && (
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Tageszulassung</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
                {d.dayRegistrationDate && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Datum</span>
                    <span className="font-semibold text-navy-950">{formatDate(d.dayRegistrationDate)}</span>
                  </div>
                )}
                {d.dayRegistrationKm && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">km-Stand</span>
                    <span className="font-semibold text-navy-950">{Number(d.dayRegistrationKm).toLocaleString("de-DE")} km</span>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      )}
    </>
  );
}

// ─── Review Popup (mirrors EndTenderWizard from Nachfrager side) ─────────────
function DealerReviewPopup({
  buyerName, buyerInitial, buyerSubline,
  existingReview, contactId,
  counterpartContractConfirmed,
  onSubmitReview, onUpdateReview, onClose,
}: {
  buyerName: string;
  buyerInitial: string;
  buyerSubline: string;
  existingReview: ReviewRow | null;
  contactId: string;
  counterpartContractConfirmed: boolean | null;
  onSubmitReview: (contactId: string, type: "positive" | "neutral" | "negative", comment: string) => Promise<void>;
  onUpdateReview: (reviewId: string, type: "positive" | "neutral" | "negative", comment: string) => Promise<void>;
  onClose: () => void;
}) {
  const isEditing = !!existingReview;
  const [reviewType, setReviewType] = useState<"positive" | "neutral" | "negative" | null>(existingReview?.type ?? null);
  const [comment, setComment] = useState(existingReview?.comment || "");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async () => {
    if (!reviewType) return;
    setLoading(true);
    if (isEditing && existingReview) {
      await onUpdateReview(existingReview.id, reviewType, comment);
    } else {
      await onSubmitReview(contactId, reviewType, comment);
    }
    setLoading(false);
    setDone(true);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-3xl max-w-lg w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-8 relative">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={16} />
          </button>

          {/* Done state */}
          {done && (
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="text-green-600" size={32} />
              </div>
              <h2 className="text-2xl font-black text-navy-950 mb-2">Fertig!</h2>
              <p className="text-slate-500 text-sm mb-6">
                Ihre Bewertung für {buyerName} wurde {isEditing ? "aktualisiert" : "abgegeben"}.
              </p>
              <Button onClick={onClose} className="rounded-xl h-12 px-8 bg-navy-900 hover:bg-navy-950 text-white font-bold">
                Schließen
              </Button>
            </div>
          )}

          {/* Review flow */}
          {!done && (
            <div>
              {/* Buyer header */}
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-lg shrink-0">
                  {buyerInitial}
                </div>
                <div className="flex-1">
                  <div className="text-xs text-slate-400 font-semibold">Bewertung für</div>
                  <h3 className="text-lg font-bold text-navy-950">{buyerName}</h3>
                  {buyerSubline && <p className="text-xs text-slate-500">{buyerSubline}</p>}
                </div>
              </div>

              {/* Counterpart contract status (read-only for dealer) */}
              {counterpartContractConfirmed !== null && (
                <div className="mb-4">
                  <Badge variant="outline" className={`text-[10px] ${counterpartContractConfirmed ? "border-green-200 text-green-700 bg-green-50" : "border-slate-200 text-slate-500"}`}>
                    {buyerName}: {counterpartContractConfirmed ? "Vertrag bestätigt" : "Kein Vertrag"}
                  </Badge>
                </div>
              )}

              {/* Rating (directly, no contract question for dealer) */}
              <div>
                <h4 className="font-bold text-navy-950 mb-4">Wie bewerten Sie {buyerName}?</h4>

                <div className="flex gap-2 mb-4">
                  {(["positive", "neutral", "negative"] as const).map((t) => {
                    const config = {
                      positive: { icon: ThumbsUp, label: "Positiv", active: "border-green-400 bg-green-100 text-green-700 ring-2 ring-green-200", idle: "border-green-200 bg-green-50 text-green-600 hover:bg-green-100" },
                      neutral: { icon: Minus, label: "Neutral", active: "border-amber-400 bg-amber-100 text-amber-700 ring-2 ring-amber-200", idle: "border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100" },
                      negative: { icon: ThumbsDown, label: "Negativ", active: "border-red-400 bg-red-100 text-red-700 ring-2 ring-red-200", idle: "border-red-200 bg-red-50 text-red-600 hover:bg-red-100" },
                    }[t];
                    const Icon = config.icon;
                    return (
                      <button
                        key={t}
                        onClick={() => setReviewType(t)}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-3 rounded-xl border-2 text-sm font-bold transition-all ${reviewType === t ? config.active : config.idle}`}
                      >
                        <Icon size={16} /> {config.label}
                      </button>
                    );
                  })}
                </div>

                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Optionaler Kommentar..."
                  rows={2}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 resize-none mb-4"
                />

                <div className="flex gap-3">
                  <Button variant="outline" onClick={onClose} className="rounded-xl h-11 text-slate-500">
                    Abbrechen
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={!reviewType || loading}
                    className="flex-1 rounded-xl h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold"
                  >
                    {loading ? (
                      <Loader2 size={16} className="animate-spin mr-2" />
                    ) : (
                      <ChevronRight size={16} className="mr-1" />
                    )}
                    {isEditing ? "Bewertung aktualisieren" : "Bewertung absenden"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DealerOffersPage() {
  const { user, profile, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [offers, setOffers] = useState<any[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [buyerProfiles, setBuyerProfiles] = useState<Record<string, BuyerProfile>>({});
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [tenderVehiclesMap, setTenderVehiclesMap] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [expandedTender, setExpandedTender] = useState<string | null>(null);
  const [vehicleDetailsOpen, setVehicleDetailsOpen] = useState<Record<string, boolean>>({});
  const [offersOpen, setOffersOpen] = useState<Record<string, boolean>>({});
  const [reviewTenderId, setReviewTenderId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && profile && profile.role !== "anbieter") {
      router.replace("/dashboard");
    }
  }, [authLoading, profile]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLoading(false); return; }

    let cancelled = false;
    setLoading(true);
    setFetchError(null);

    const run = async () => {
      try {
        // 1. Load dealer's offers (flat, no joins that might fail)
        const { data: rawOffers, error: offersErr } = await supabase
          .from("offers")
          .select("*")
          .eq("dealer_id", user.id)
          .order("created_at", { ascending: false });

        if (offersErr) { if (!cancelled) setFetchError(offersErr.message); return; }
        if (cancelled || !rawOffers || rawOffers.length === 0) {
          if (!cancelled) { setOffers([]); setLoading(false); }
          return;
        }

        // 2. Load all related tenders and tender_vehicles in parallel
        const tenderIds = Array.from(new Set(rawOffers.map((o: any) => o.tender_id)));
        const vehicleIds = Array.from(new Set(rawOffers.map((o: any) => o.tender_vehicle_id).filter(Boolean)));

        const [tendersRes, vehiclesRes, allTenderVehiclesRes, contactsRes, reviewsRes] = await Promise.all([
          supabase.from("tenders").select("id, status, end_at, created_at, buyer_id, delivery_plz, delivery_city, tender_scope").in("id", tenderIds),
          vehicleIds.length > 0
            ? supabase.from("tender_vehicles").select("*").in("id", vehicleIds)
            : Promise.resolve({ data: [] }),
          // Load ALL tender_vehicles for all tenders (needed for completed tab detail view)
          supabase.from("tender_vehicles").select("*").in("tender_id", tenderIds),
          supabase.from("contacts").select("*").eq("dealer_id", user.id),
          supabase.from("reviews").select("*").eq("from_user_id", user.id),
        ]);

        if (cancelled) return;

        // Build lookup maps
        const tenderMap: Record<string, any> = {};
        (tendersRes.data || []).forEach((t: any) => { tenderMap[t.id] = t; });
        const vehicleMap: Record<string, any> = {};
        ((vehiclesRes as any).data || []).forEach((v: any) => { vehicleMap[v.id] = v; });

        // Build tender_id -> all vehicles map
        const tvMap: Record<string, any[]> = {};
        ((allTenderVehiclesRes as any).data || []).forEach((v: any) => {
          if (!tvMap[v.tender_id]) tvMap[v.tender_id] = [];
          tvMap[v.tender_id].push(v);
        });
        setTenderVehiclesMap(tvMap);

        // Merge into offers
        const enrichedOffers = rawOffers.map((o: any) => ({
          ...o,
          tenders: tenderMap[o.tender_id] || null,
          tender_vehicles: o.tender_vehicle_id ? vehicleMap[o.tender_vehicle_id] || null : null,
        }));

        setOffers(enrichedOffers);

        const loadedContacts = (contactsRes.data || []) as Contact[];
        setContacts(loadedContacts);
        setReviews((reviewsRes.data || []) as ReviewRow[]);

        // Load buyer profiles
        const allBuyerIds = Array.from(new Set([
          ...loadedContacts.map((c) => c.buyer_id),
          ...enrichedOffers.filter((o: any) => o.tenders?.buyer_id).map((o: any) => o.tenders.buyer_id),
        ]));
        if (allBuyerIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, company_name, first_name, last_name, industry, zip, city, phone, email_public")
            .in("id", allBuyerIds);
          if (profiles) {
            const map: Record<string, BuyerProfile> = {};
            profiles.forEach((p: BuyerProfile) => { map[p.id] = p; });
            setBuyerProfiles(map);
          }
        }
      } catch (e: any) {
        if (cancelled) return;
        setFetchError(e?.message || "Unbekannter Fehler");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();

    // Poll for tender status changes every 30s (Realtime may not be configured)
    const interval = setInterval(() => { run(); }, 30000);

    // Also subscribe via Realtime if available
    const channel = supabase
      .channel("angebote-tender-status")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tenders" },
        () => { run(); }
      )
      .subscribe();

    return () => { cancelled = true; clearInterval(interval); supabase.removeChannel(channel); };
  }, [authLoading, user?.id]);

  /* ── Review Handlers ── */
  const handleSubmitReview = async (contactId: string, type: "positive" | "neutral" | "negative", comment: string) => {
    const contact = contacts.find(c => c.id === contactId);
    if (!contact || !user) return;
    const linkFields = contact.instant_offer_id
      ? { instant_offer_id: contact.instant_offer_id, tender_id: null }
      : { tender_id: contact.tender_id, instant_offer_id: null };
    const { data, error } = await supabase.from("reviews").insert({
      ...linkFields,
      contact_id: contactId, from_user_id: user.id,
      to_user_id: contact.buyer_id, type,
      contract_concluded: false,
      comment: comment || null,
    }).select().single();
    if (error) toast.error("Fehler: " + error.message);
    else if (data) { setReviews(prev => [...prev, data as ReviewRow]); toast.success("Bewertung abgegeben!"); }
  };

  const handleUpdateReview = async (reviewId: string, type: "positive" | "neutral" | "negative", comment: string) => {
    const { error } = await supabase.from("reviews").update({ type, comment: comment || null }).eq("id", reviewId);
    if (error) toast.error("Fehler: " + error.message);
    else { setReviews(prev => prev.map(r => r.id === reviewId ? { ...r, type, comment: comment || null } : r)); toast.success("Bewertung aktualisiert!"); }
  };

  /* ── Derived Data ── */

  // Set of tender_ids where buyer contacted this dealer
  const contactedTenderIds = new Set(contacts.map(c => c.tender_id));
  const getContactForTender = (tenderId: string) => contacts.find(c => c.tender_id === tenderId);

  // Group offers by tender
  const groupByTender = (offerList: any[]) => {
    const groups: Record<string, any[]> = {};
    offerList.forEach(o => { const t = o.tender_id; if (!groups[t]) groups[t] = []; groups[t].push(o); });
    return Object.values(groups);
  };

  // Treat tenders past their end_at as effectively completed, even if the cron hasn't run yet
  const isEffectivelyCompleted = (o: any) => {
    if (!o.tenders) return true; // missing tender data → treat as completed
    if (o.tenders.status === "completed" || o.tenders.status === "cancelled") return true;
    if (o.tenders.status === "active" && o.tenders.end_at && new Date(o.tenders.end_at).getTime() <= Date.now()) return true;
    return false;
  };

  // Tab buckets
  const activeOffers = offers.filter(o => !isEffectivelyCompleted(o) && !contactedTenderIds.has(o.tender_id));
  const negotiatingOffers = offers.filter(o => !isEffectivelyCompleted(o) && contactedTenderIds.has(o.tender_id));
  const completedOffers = offers.filter(o => isEffectivelyCompleted(o));

  const activeGroups = groupByTender(activeOffers);
  const negotiatingGroups = groupByTender(negotiatingOffers);
  const completedGroups = groupByTender(completedOffers);


  /* ── Render Offer Group Card ── */
  const renderOfferGroup = (groupOffers: any[], showContact = false) => {
    const firstOffer = groupOffers[0];
    const buyer = firstOffer.tenders?.buyer_id ? buyerProfiles[firstOffer.tenders.buyer_id] : null;
    const isMulti = groupOffers.length > 1;
    const grandTotal = groupOffers.reduce((s: number, o: any) => s + ((o.total_price ?? 0) * (o.offered_quantity ?? 1)), 0);
    const tenderId = firstOffer.tender_id;
    const contact = getContactForTender(tenderId);
    const rawTenderStatus = firstOffer.tenders?.status;
    // Show effective status: expired active tenders display as "completed"
    const tenderStatus = isEffectivelyCompleted(firstOffer) && rawTenderStatus === "active" ? "completed" : (rawTenderStatus || "completed");

    return (
      <Card key={tenderId} className="border-slate-200 shadow-sm rounded-3xl overflow-hidden">
        <div className="p-6 md:p-8">
          {/* Header */}
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h3 className="text-base font-bold text-navy-950 truncate">
                  {(() => {
                    const vehicle = firstOffer.tender_vehicles || null;
                    return isMulti
                      ? `${groupOffers.length} Fahrzeuge`
                      : vehicle ? `${vehicle.brand || "—"} ${vehicle.model_name || ""}`.trim() : "Ausschreibung";
                  })()}
                </h3>
                <Badge variant="outline" className="text-slate-400 font-mono text-[10px] px-1.5 py-0">{tenderId?.split("-")[0].toUpperCase()}</Badge>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                {buyer && <span className="font-semibold text-navy-900">{buyer.company_name || "Nachfrager"}</span>}
                {buyer && (buyer.zip || buyer.city) && <><span className="text-slate-300">|</span><span className="flex items-center gap-1"><MapPin size={10} /> {buyer.zip || ""} {buyer.city || ""}</span></>}
                {firstOffer.tenders?.end_at && tenderStatus === "active" && (
                  <><span className="text-slate-300">|</span><span className="flex items-center gap-1 text-amber-600 font-semibold"><Clock size={12} /> Noch {timeLeft(firstOffer.tenders.end_at)}</span></>
                )}
                {contact && tenderStatus === "active" && <><span className="text-slate-300">|</span><span className="text-purple-600 font-semibold">Kontakt hergestellt</span></>}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link href={`/dashboard/eingang/${tenderId}/angebot`}>
                <Button variant="outline" size="sm" className="rounded-xl border-slate-200 text-slate-600 hover:text-navy-900">
                  <ExternalLink size={14} className="mr-1.5" /> {tenderStatus === "active" ? "Bearbeiten" : "Ansehen"}
                </Button>
              </Link>
            </div>
          </div>

          {/* Per-vehicle rows */}
          {groupOffers.map((offer: any, idx: number) => {
            const vehicle = offer.tender_vehicles || null;
            const vehicleLabel = vehicle ? `${vehicle.brand || ""} ${vehicle.model_name || ""}`.trim() || "Fahrzeug" : "Ausschreibung";
            return (
              <div key={offer.id} className={idx > 0 ? "mt-3 pt-3 border-t border-slate-100" : ""}>
                <div className="flex items-center gap-3">
                  {isMulti && <div className="w-6 h-6 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">{idx + 1}</div>}
                  {!isMulti && <div className="w-10 h-10 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-center text-blue-600 font-black text-lg shrink-0">{(vehicle?.brand || "F")[0]}</div>}
                  <div className="flex-1">
                    <h3 className={`font-bold text-navy-950 ${isMulti ? "text-sm" : "text-xl"}`}>{vehicleLabel}</h3>
                    <p className="text-sm text-slate-500">
                      {vehicle?.quantity && <>{vehicle.quantity}x · </>}
                      Kaufpreis: <span className="font-bold text-navy-900">{offer.purchase_price ? `${offer.purchase_price.toLocaleString("de-DE")} €` : "—"}</span>
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[10px] font-bold text-slate-400 uppercase">{isMulti ? "Zwischensumme" : "Gesamt netto"}</div>
                    <div className="font-bold text-blue-700">{offer.total_price ? `${((offer.total_price ?? 0) * (offer.offered_quantity ?? 1)).toLocaleString("de-DE")} €` : "—"}</div>
                  </div>
                </div>
                <OfferDetailsExpander offer={offer} />
              </div>
            );
          })}

          {/* Grand total for multi-vehicle */}
          {isMulti && (
            <div className="mt-4 bg-navy-950 text-white px-5 py-3 rounded-xl flex items-center justify-between">
              <span className="font-bold text-sm">Gesamtangebot ({groupOffers.reduce((s: number, o: any) => s + (o.offered_quantity ?? 1), 0)} Fahrzeuge)</span>
              <span className="font-black text-lg text-amber-400">{grandTotal.toLocaleString("de-DE")} € netto</span>
            </div>
          )}

          {/* Single vehicle price detail */}
          {!isMulti && (
            <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Kaufpreis</div>
                <div className="font-bold text-navy-950">{firstOffer.purchase_price ? `${firstOffer.purchase_price.toLocaleString("de-DE")} €` : "—"}</div>
              </div>
              {firstOffer.leasing_rate_net && (
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Leasing p.M.</div>
                  <div className="font-bold text-navy-950">{firstOffer.leasing_rate_net.toLocaleString("de-DE")} €</div>
                </div>
              )}
              <div>
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Gesamtpreis netto</div>
                <div className="font-bold text-navy-950">{firstOffer.total_price ? `${((firstOffer.total_price ?? 0) * (firstOffer.offered_quantity ?? 1)).toLocaleString("de-DE")} €` : "—"}</div>
              </div>
            </div>
          )}

          {/* Contact / Chat section */}
          {showContact && contact && (
            <div className="mt-5 pt-5 border-t border-slate-100">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-green-700">
                  <CheckCircle2 size={16} className="text-green-500" />
                  Kontakt seit {formatDate(contact.created_at)}
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <Link href={`/dashboard/nachrichten?contact=${contact.id}`}>
                    <Button size="sm" variant="outline" className="rounded-xl border-blue-200 text-blue-600 hover:bg-blue-50 text-xs font-bold h-8 px-4">
                      <MessageCircle size={12} className="mr-1.5" /> Nachrichten öffnen
                    </Button>
                  </Link>
                  {buyer?.email_public && (
                    <a href={`mailto:${buyer.email_public}`} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-600 transition-colors">
                      <Mail size={12} /> {buyer.email_public}
                    </a>
                  )}
                  {buyer?.phone && (
                    <a href={`tel:${buyer.phone}`} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-600 transition-colors">
                      <Phone size={12} /> {buyer.phone}
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>
    );
  };

  /* ── Render Completed Group (matches Nachfrager design) ── */
  const renderCompletedGroup = (groupOffers: any[]) => {
    const tenderId = groupOffers[0].tender_id;
    const firstOffer = groupOffers[0];
    const tender = firstOffer.tenders;
    const contact = getContactForTender(tenderId);
    const buyer = tender?.buyer_id ? buyerProfiles[tender.buyer_id] : null;
    const existingReview = contact ? reviews.find(r => r.contact_id === contact.id) : null;
    const rawTenderStatus = tender?.status;
    const tenderStatus = isEffectivelyCompleted(firstOffer) && rawTenderStatus === "active" ? "completed" : (rawTenderStatus || "completed");
    const isExpanded = expandedTender === tenderId;
    const endDate = tender?.end_at || firstOffer.created_at;

    // All vehicles of the tender (from separate query, not join)
    const allTenderVehicles: any[] = tenderVehiclesMap[tenderId] || [];
    const vehicleConfigs = allTenderVehicles.map((v: Record<string, unknown>) => dbRowToVehicleConfig(v));
    const totalQtyTender = allTenderVehicles.reduce((s: number, v: any) => s + (v.quantity || 1), 0);
    const isMultiVehicle = allTenderVehicles.length > 1;

    // Build offer lookup by tender_vehicle_id
    const offerByVehicleId: Record<string, any> = {};
    groupOffers.forEach((o: any) => { if (o.tender_vehicle_id) offerByVehicleId[o.tender_vehicle_id] = o; });
    const grandTotal = groupOffers.reduce((s: number, o: any) => s + ((o.total_price ?? 0) * (o.offered_quantity ?? 1)), 0);

    // Delivery location from tender
    const deliveryLocation = tender?.delivery_plz
      ? `${tender.delivery_city || "Unbekannt"} (${tender.delivery_plz})`
      : "Deutschland";

    return (
      <Card key={tenderId} className="border-slate-200 shadow-sm rounded-3xl overflow-hidden">
        {/* Collapsible header */}
        <div
          className={`p-6 md:p-8 cursor-pointer transition-colors ${isExpanded ? "bg-slate-50 border-b border-slate-200" : "bg-white hover:bg-slate-50/50"}`}
          onClick={() => setExpandedTender(isExpanded ? null : tenderId)}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h3 className="text-base font-bold text-navy-950 truncate">
                  {isMultiVehicle
                    ? `${allTenderVehicles.length} Konfigurationen · ${totalQtyTender} Fahrzeuge`
                    : (() => {
                      const vehicle = allTenderVehicles[0];
                      return vehicle ? `${vehicle.brand || "—"} ${vehicle.model_name || ""}${vehicle.trim_level ? ` ${vehicle.trim_level}` : ""}` : "Ausschreibung";
                    })()}
                </h3>
                <Badge variant="outline" className="text-slate-400 font-mono text-[10px] px-1.5 py-0">{tenderId?.split("-")[0].toUpperCase()}</Badge>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                <Badge className={`${tenderStatus === "cancelled" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"} border-none text-xs px-2 py-0`}>
                  {tenderStatus === "cancelled" ? "Zurückgezogen" : "Abgeschlossen"}
                </Badge>
                {buyer && <><span className="text-slate-300">|</span><span className="font-semibold text-navy-900">{buyer.company_name || "Nachfrager"}</span></>}
                {buyer && (buyer.zip || buyer.city) && <><span className="text-slate-300">|</span><span className="flex items-center gap-1"><MapPin size={10} /> {buyer.zip || ""} {buyer.city || ""}</span></>}
                <span className="text-slate-300">|</span>
                <span>{tenderStatus === "cancelled" ? "Zurückgezogen" : "Abgeschlossen"} am {formatDate(endDate)}</span>
                {grandTotal > 0 && (
                  <><span className="text-slate-300">|</span><span className="font-semibold text-green-600">{grandTotal.toLocaleString("de-DE")} € netto</span></>
                )}
              </div>
              {isMultiVehicle && (
                <p className="text-xs text-slate-400 mt-1">
                  {allTenderVehicles.map((v: any) => `${v.quantity || 1}x ${v.brand || "—"} ${v.model_name || ""}`).join(" · ")}
                </p>
              )}
            </div>
            <Button variant="ghost" size="icon" className="rounded-full bg-white border border-slate-200 shadow-sm text-slate-400 hover:text-navy-900 h-9 w-9 shrink-0">
              {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </Button>
          </div>
        </div>

        {/* Expanded content */}
        {isExpanded && (
          <div className="bg-white p-6 md:p-8 animate-in slide-in-from-top-4 duration-300">
            {/* Buyer info header */}
            {buyer && (
              <div className="flex items-center gap-3 mb-6 pb-6 border-b border-slate-200">
                <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-lg shrink-0">
                  {buyer.company_name?.[0] || "N"}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-navy-950">{buyer.company_name || "Nachfrager"}</span>
                    {buyer.industry && <Badge variant="outline" className="text-[10px] border-slate-200 text-slate-400">{buyer.industry}</Badge>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5 flex-wrap">
                    {(buyer.zip || buyer.city) && <span className="flex items-center gap-1"><MapPin size={10} /> {buyer.zip || ""} {buyer.city || ""}</span>}
                    {contact && buyer.email_public && <a href={`mailto:${buyer.email_public}`} className="flex items-center gap-1 text-blue-600"><Mail size={10} /> {buyer.email_public}</a>}
                    {contact && buyer.phone && <a href={`tel:${buyer.phone}`} className="flex items-center gap-1 text-blue-600"><Phone size={10} /> {buyer.phone}</a>}
                  </div>
                </div>
                {deliveryLocation && (
                  <Badge variant="outline" className="text-xs border-slate-200 text-slate-500 shrink-0">
                    <MapPin size={10} className="mr-1" /> Lieferung: {deliveryLocation}
                  </Badge>
                )}
              </div>
            )}

            {/* Collapsible Fahrzeugdetails */}
            <div className="mb-8">
              <button
                onClick={() => setVehicleDetailsOpen(prev => ({ ...prev, [tenderId]: !prev[tenderId] }))}
                className="flex items-center justify-between w-full text-left group"
              >
                <h3 className="text-lg font-bold text-navy-950">Fahrzeugdetails</h3>
                <ChevronDown size={20} className={`text-slate-400 transition-transform duration-200 ${vehicleDetailsOpen[tenderId] ? "rotate-180" : ""}`} />
              </button>
              {vehicleDetailsOpen[tenderId] && (
                <div className="space-y-4 mt-4 animate-in slide-in-from-top-2 duration-200">
                  {allTenderVehicles.length > 0 ? vehicleConfigs.map((config: any, idx: number) => {
                    const raw = allTenderVehicles[idx];
                    return (
                      <div key={raw.id || idx} className="bg-slate-50 border border-slate-200 rounded-2xl p-5 relative overflow-hidden">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="font-bold text-navy-950 text-base">
                            {isMultiVehicle && <span className="text-blue-600 mr-1">Fahrzeug {idx + 1}:</span>}
                            {config.brand || "—"} {config.model || ""} {raw?.trim_level || ""}
                            <span className="text-slate-500 font-normal ml-2">· {raw?.quantity || config.quantity || 1} Stück</span>
                          </h3>
                        </div>
                        <VehicleDetailSections vehicle={config} viewerRole="haendler" />
                      </div>
                    );
                  }) : groupOffers.map((offer: any, idx: number) => {
                    const vehicle = offer.tender_vehicles || null;
                    const vehicleConfig = vehicle ? dbRowToVehicleConfig(vehicle) : null;
                    const vehicleLabel = vehicle ? `${vehicle.brand || ""} ${vehicle.model_name || ""}${vehicle.trim_level ? ` ${vehicle.trim_level}` : ""}`.trim() || "Fahrzeug" : "Ausschreibung";
                    return (
                      <div key={offer.id} className="bg-slate-50 border border-slate-200 rounded-2xl p-5 relative overflow-hidden">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="font-bold text-navy-950 text-base">
                            {groupOffers.length > 1 && <span className="text-blue-600 mr-1">Fahrzeug {idx + 1}:</span>}
                            {vehicleLabel}
                            <span className="text-slate-500 font-normal ml-2">· {offer.offered_quantity || vehicle?.quantity || 1} Stück</span>
                          </h3>
                        </div>
                        {vehicleConfig && <VehicleDetailSections vehicle={vehicleConfig} viewerRole="haendler" />}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Collapsible Ihr Angebot */}
            <div className="mb-8">
              <button
                onClick={() => setOffersOpen(prev => ({ ...prev, [tenderId]: prev[tenderId] === false ? true : prev[tenderId] === undefined ? false : !prev[tenderId] }))}
                className="flex items-center justify-between w-full text-left group"
              >
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-bold text-navy-950">Ihr Angebot</h3>
                  {grandTotal > 0 && <span className="text-sm font-bold text-blue-700">{grandTotal.toLocaleString("de-DE")} € netto</span>}
                </div>
                <ChevronDown size={20} className={`text-slate-400 transition-transform duration-200 ${offersOpen[tenderId] === false ? "" : "rotate-180"}`} />
              </button>
              {offersOpen[tenderId] !== false && (
                <div className="mt-4 border border-slate-200 rounded-2xl overflow-hidden animate-in slide-in-from-top-2 duration-200">
                  {(allTenderVehicles.length > 0 ? vehicleConfigs.map((config: any, idx: number) => {
                    const raw = allTenderVehicles[idx];
                    const offer = offerByVehicleId[raw.id];
                    if (!offer) return (
                      <div key={raw.id || idx} className="px-5 py-3 border-t border-slate-100 first:border-t-0">
                        <span className="text-xs text-slate-400 italic">
                          {isMultiVehicle && <span className="text-blue-600 font-bold mr-1">Fahrzeug {idx + 1}:</span>}
                          Kein Angebot abgegeben
                        </span>
                      </div>
                    );
                    return (
                      <div key={raw.id || idx} className="px-5 py-3 border-t border-slate-100 first:border-t-0">
                        <div className="flex items-center justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {isMultiVehicle && <div className="w-5 h-5 rounded bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold shrink-0">{idx + 1}</div>}
                            <span className="font-bold text-navy-950 text-sm truncate">{config.brand || "—"} {config.model || ""}</span>
                            <span className="text-[10px] text-slate-400 shrink-0">{raw?.quantity || config.quantity || 1}x</span>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="font-bold text-navy-950">{offer.purchase_price ? `${offer.purchase_price.toLocaleString("de-DE")} €` : "—"}</span>
                            <span className="text-[10px] text-slate-400 ml-1">Kaufpreis</span>
                          </div>
                        </div>
                        <OfferDetailsExpander offer={offer} />
                      </div>
                    );
                  }) : groupOffers.map((offer: any, idx: number) => {
                    const vehicle = offer.tender_vehicles || null;
                    const vehicleLabel = vehicle ? `${vehicle.brand || ""} ${vehicle.model_name || ""}`.trim() || "Fahrzeug" : "Ausschreibung";
                    return (
                      <div key={offer.id} className="px-5 py-3 border-t border-slate-100 first:border-t-0">
                        <div className="flex items-center justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {groupOffers.length > 1 && <div className="w-5 h-5 rounded bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold shrink-0">{idx + 1}</div>}
                            <span className="font-bold text-navy-950 text-sm truncate">{vehicleLabel}</span>
                            <span className="text-[10px] text-slate-400 shrink-0">{offer.offered_quantity || vehicle?.quantity || 1}x</span>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="font-bold text-navy-950">{offer.purchase_price ? `${offer.purchase_price.toLocaleString("de-DE")} €` : "—"}</span>
                            <span className="text-[10px] text-slate-400 ml-1">Kaufpreis</span>
                          </div>
                        </div>
                        <OfferDetailsExpander offer={offer} />
                      </div>
                    );
                  }))}

                  {/* Grand total for multi-vehicle */}
                  {(isMultiVehicle || groupOffers.length > 1) && (
                    <div className="flex items-center justify-between bg-navy-950 text-white px-5 py-3 text-sm">
                      <span className="font-bold">Gesamt: {totalQtyTender} Fahrzeug{totalQtyTender !== 1 ? "e" : ""}</span>
                      <span className="font-bold text-amber-400">{grandTotal.toLocaleString("de-DE")} € netto</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Action bar */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
              {contact && (
                <Button
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); setReviewTenderId(tenderId); }}
                  className={`rounded-xl font-bold h-9 px-5 text-xs ${existingReview
                    ? "bg-white border border-amber-200 text-amber-700 hover:bg-amber-50"
                    : "bg-amber-500 hover:bg-amber-600 text-white"}`}
                >
                  <Star size={14} className="mr-1.5" />
                  {existingReview ? "Bewertung bearbeiten" : "Nachfrager bewerten"}
                </Button>
              )}
            </div>
          </div>
        )}
      </Card>
    );
  };

  /* ── Default tab ── */
  const defaultTab = negotiatingGroups.length > 0 ? "negotiating" : activeGroups.length > 0 ? "active" : "completed";

  /* ── Review Popup (like EndTenderWizard on Nachfrager side) ── */
  const reviewPopup = (() => {
    if (!reviewTenderId) return null;
    const group = completedGroups.find(g => g[0].tender_id === reviewTenderId);
    if (!group) return null;
    const tenderId = reviewTenderId;
    const contact = getContactForTender(tenderId);
    if (!contact) return null;
    const buyer = group[0].tenders?.buyer_id ? buyerProfiles[group[0].tenders.buyer_id] : null;
    const existingReview = reviews.find(r => r.contact_id === contact.id);
    const buyerName = buyer?.company_name || "Nachfrager";

    return (
      <DealerReviewPopup
        buyerName={buyerName}
        buyerInitial={buyer?.company_name?.[0] || "N"}
        buyerSubline={[
          buyer?.city ? `${buyer.zip || ""} ${buyer.city}` : null,
          buyer?.industry,
        ].filter(Boolean).join(" · ")}
        existingReview={existingReview || null}
        contactId={contact.id}
        counterpartContractConfirmed={(contact as any).contract_concluded_buyer ?? null}
        onSubmitReview={handleSubmitReview}
        onUpdateReview={handleUpdateReview}
        onClose={() => setReviewTenderId(null)}
      />
    );
  })();

  return (
    <div className="min-h-[calc(100vh-80px)] pb-24">
      {reviewPopup}
      <div className="border-b border-slate-200 bg-white">
        <div className="container mx-auto max-w-7xl px-4 md:px-8 py-6 md:py-8">
          <p className="text-sm font-medium text-slate-500 mb-1">Dashboard</p>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-navy-950">Meine Angebote</h1>
          <p className="text-sm text-slate-500 mt-1">
            Übersicht über Ihre abgegebenen Angebote — von laufend bis abgeschlossen.
          </p>
        </div>
      </div>

      <div className="container mx-auto max-w-7xl px-4 md:px-8 mt-6 md:mt-8">
        {loading ? (
          <div className="flex items-center justify-center py-32 text-slate-400">
            <Loader2 className="animate-spin mr-3" size={28} />
            <span className="text-lg font-semibold">Angebote werden geladen…</span>
          </div>
        ) : fetchError ? (
          <div className="py-16 flex flex-col items-center text-center">
            <div className="bg-red-50 border border-red-200 rounded-2xl p-8 max-w-lg w-full">
              <h3 className="text-lg font-bold text-red-800 mb-2">Fehler beim Laden</h3>
              <p className="text-red-600 text-sm mb-4">{fetchError}</p>
              <Button variant="outline" className="rounded-xl border-red-200 text-red-700 hover:bg-red-100" onClick={() => window.location.reload()}>Erneut versuchen</Button>
            </div>
          </div>
        ) : (
          <Tabs defaultValue={defaultTab} className="w-full flex flex-col lg:flex-row gap-8 lg:gap-12">
            <div className="w-full lg:w-56 shrink-0">
              <div className="sticky top-28">
                <TabsList className="flex flex-col h-auto bg-transparent w-full p-0 space-y-1">
                  <TabsTrigger value="active" className="w-full justify-between items-center px-4 py-2.5 !rounded-lg !bg-transparent hover:!bg-slate-50 data-[active]:!bg-blue-50 !border-0 !text-slate-400 data-[active]:!text-blue-700 data-[active]:!font-semibold !shadow-none transition-all text-sm font-medium">
                    <span>Laufend</span>
                    <span className="text-xs text-slate-400 font-normal">{activeGroups.length}</span>
                  </TabsTrigger>
                  <TabsTrigger value="negotiating" className="w-full justify-between items-center px-4 py-2.5 !rounded-lg !bg-transparent hover:!bg-slate-50 data-[active]:!bg-blue-50 !border-0 !text-slate-400 data-[active]:!text-blue-700 data-[active]:!font-semibold !shadow-none transition-all text-sm font-medium">
                    <span>In Verhandlung</span>
                    <span className="text-xs text-slate-400 font-normal">{negotiatingGroups.length}</span>
                  </TabsTrigger>
                  <TabsTrigger value="completed" className="w-full justify-between items-center px-4 py-2.5 !rounded-lg !bg-transparent hover:!bg-slate-50 data-[active]:!bg-blue-50 !border-0 !text-slate-400 data-[active]:!text-blue-700 data-[active]:!font-semibold !shadow-none transition-all text-sm font-medium">
                    <span>Abgeschlossen</span>
                    <span className="text-xs text-slate-400 font-normal">{completedGroups.length}</span>
                  </TabsTrigger>
                </TabsList>
              </div>
            </div>

            <div className="flex-1 min-w-0">

              {/* ── LAUFEND ── */}
              <TabsContent value="active" className="m-0 space-y-6 animate-in fade-in slide-in-from-bottom-6 duration-500">
                {activeGroups.length === 0 ? (
                  <EmptyTabState icon={Activity} title="Keine laufenden Angebote"
                    description="Sobald Sie ein Angebot auf eine aktive Ausschreibung abgeben, erscheint es hier." />
                ) : (
                  activeGroups.map(g => renderOfferGroup(g))
                )}
              </TabsContent>

              {/* ── IN VERHANDLUNG ── */}
              <TabsContent value="negotiating" className="m-0 space-y-6 animate-in fade-in slide-in-from-bottom-6 duration-500">
                {negotiatingGroups.length === 0 ? (
                  <EmptyTabState icon={Handshake} title="Keine Verhandlungen"
                    description="Wenn ein Nachfrager zu einem Ihrer Angebote Kontakt aufnimmt, erscheint es hier." />
                ) : (
                  negotiatingGroups.map(g => renderOfferGroup(g, true))
                )}
              </TabsContent>

              {/* ── ABGESCHLOSSEN ── */}
              <TabsContent value="completed" className="m-0 space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-500">
                {completedGroups.length === 0 ? (
                  <EmptyTabState icon={CheckCircle2} title="Keine abgeschlossenen Ausschreibungen"
                    description="Beendete Ausschreibungen erscheinen hier zur Bewertung." />
                ) : (
                  completedGroups.map(g => renderCompletedGroup(g))
                )}
              </TabsContent>

            </div>
          </Tabs>
        )}
      </div>
    </div>
  );
}
