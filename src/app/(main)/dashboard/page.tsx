"use client";

import { useAuth } from "@/components/providers/auth-provider";
import { useSubscription } from "@/components/providers/subscription-provider";
import { Card } from "@/components/ui/card";
import {
  Plus, Inbox, Star, Handshake,
  CarFront, FileText, Bell,
  MessageCircle, TrendingUp, ArrowRight, Loader2, InboxIcon,
  Crown, Zap,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { DealerTenderCard } from "@/components/tenders/DealerTenderCard";
import { InstantOfferCard } from "@/components/tenders/InstantOfferCard";
import { type InstantOfferRow } from "@/lib/instant-offers";
import { SITE_URL } from "@/lib/site";

// ─── Activity item type ──────────────────────────────────────────────────────
type ActivityItem = {
  id: string;
  type: "offer" | "message" | "review" | "tender" | "instant_offer";
  title: string;
  subtitle: string;
  time: string;
  href: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Gerade eben";
  if (mins < 60) return `vor ${mins} Min.`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `vor ${days} Tag${days > 1 ? "en" : ""}`;
  return new Date(dateStr).toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
}

function timeLeft(endAt: string | null): string {
  if (!endAt) return "—";
  const diff = new Date(endAt).getTime() - Date.now();
  if (diff <= 0) return "Abgelaufen";
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 0) return `${days} Tage ${hours} Std.`;
  const mins = Math.floor((diff % 3600000) / 60000);
  return `${hours} Std. ${mins} Min.`;
}

// ─── Map raw tender to DealerTenderCard props ────────────────────────────────
function mapTenderToCardProps(
  tender: any,
  answeredIds: Set<string>,
  offerStats: Record<string, { count: number; bestPriceNet: number | null; bestTotalNet: number | null }>,
  myOffers: Record<string, { purchasePriceNet: number; totalPrice: number }>,
  buyerRatings: Record<string, { score: number; total: number }>,
) {
  const vehicles = (tender.tender_vehicles || []).map((v: any) => ({
    quantity: v.quantity,
    brand: v.brand || "—",
    model: [v.model_name, v.trim_level].filter(Boolean).join(" ") || "—",
    specs: [v.fuel_type, v.body_type, v.color].filter(Boolean).join(" · ") || "",
  }));

  const totalVehicles = (tender.tender_vehicles || []).reduce((sum: number, v: any) => sum + v.quantity, 0);

  const hasFleetDiscount = (tender.tender_vehicles || []).some((v: any) => v.fleet_discount && v.fleet_discount > 0);
  const fleetDiscountPercent = (tender.tender_vehicles || []).find((v: any) => v.fleet_discount)?.fleet_discount || 0;

  const requestedTypes: string[] = ["Kauf"];
  const seen = new Set<string>();
  (tender.tender_vehicles || []).forEach((v: any) => {
    if (v.leasing?.requested && !seen.has("Leasing")) { requestedTypes.push("Leasing"); seen.add("Leasing"); }
    if (v.financing?.requested && !seen.has("Finanzierung")) { requestedTypes.push("Finanzierung"); seen.add("Finanzierung"); }
  });

  const buyer = tender.buyer;
  const buyerCompany = buyer?.company_name || "Unternehmen";

  return {
    id: tender.id,
    timeLeft: timeLeft(tender.end_at),
    buyerType: buyerCompany,
    buyerName: null,
    buyerProfession: buyer?.industry || null,
    buyerCity: buyer?.city || null,
    buyerPlz: buyer?.zip || null,
    buyerStreet: null,
    buyerEmail: null,
    buyerPhone: null,
    buyerMemberSince: buyer?.created_at || null,
    location: tender.delivery_plz
      ? `${tender.delivery_city || "Unbekannt"} (${tender.delivery_plz})`
      : "Deutschland",
    buyerRating: buyerRatings[tender.buyer_id]?.score ?? 0,
    buyerRatingTotal: buyerRatings[tender.buyer_id]?.total ?? 0,
    successRate: 0,
    isPreferredDealer: false,
    requestedTypes,
    fleetDiscount: hasFleetDiscount,
    fleetDiscountPercent,
    currentOffers: offerStats[tender.id]?.count ?? 0,
    bestPriceNet: offerStats[tender.id]?.bestPriceNet ?? null,
    bestTotalNet: offerStats[tender.id]?.bestTotalNet ?? null,
    myPriceNet: myOffers[tender.id]?.purchasePriceNet ?? null,
    myTotalPrice: myOffers[tender.id]?.totalPrice ?? null,
    vehicles,
    totalVehicles,
    hasAnswered: answeredIds.has(tender.id),
    rawVehicles: tender.tender_vehicles || [],
  };
}

export default function DashboardOverviewPage() {
  const { user, profile, isLoading: authLoading } = useAuth();
  const {
    tier, subscriptionSince, monthlyOfferCount, activeInstantOfferCount,
    getOfferLimit, getInstantOfferLimit, isLoading: subLoading,
  } = useSubscription();

  const isDealer = profile?.role === "anbieter";
  const userName = profile?.company_name || (isDealer ? "Händler" : "User");

  // ─── Supabase client ──────────────────────────────────────────────────────
  const [supabase] = useState(() => createClient());

  // ─── Buyer state ──────────────────────────────────────────────────────────
  const [buyerStats, setBuyerStats] = useState({ activeTenders: 0, newOffers: 0, openRatings: 0 });
  // Buyer bottom section: offers for their tenders
  const [buyerTenderOffers, setBuyerTenderOffers] = useState<any[]>([]);

  // ─── Dealer state ─────────────────────────────────────────────────────────
  const [dealerStats, setDealerStats] = useState({ newRequests: 0, openOffers: 0, contactRequests: 0, dealerRating: 0 });
  // Dealer bottom section: recent tenders
  const [dealerTenders, setDealerTenders] = useState<any[]>([]);
  const [answeredTenderIds, setAnsweredTenderIds] = useState<Set<string>>(new Set());
  const [offerStats, setOfferStats] = useState<Record<string, { count: number; bestPriceNet: number | null; bestTotalNet: number | null }>>({});
  const [myOffers, setMyOffers] = useState<Record<string, { purchasePriceNet: number; totalPrice: number }>>({});
  const [buyerRatings, setBuyerRatings] = useState<Record<string, { score: number; total: number }>>({});

  // ─── Shared state ─────────────────────────────────────────────────────────
  const [recentInstantOffers, setRecentInstantOffers] = useState<InstantOfferRow[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);

  const timeout = <T,>(p: Promise<T>) =>
    Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("TIMEOUT")), 10000))]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setStatsLoading(false); return; }

    let cancelled = false;

    (async () => {
      try {
        const lastLogin = profile?.last_login || null;

        if (!isDealer) {
          // ── BUYER STATS ─────────────────────────────────────────────────
          const [tendersRes, contactsRes, reviewsRes, messagesRes, instantOffersRes] = await Promise.all([
            timeout(
              supabase
                .from("tenders")
                .select("id, status, created_at, tender_vehicles(brand, model_name, trim_level, quantity), offers(id, dealer_id, total_price, created_at)")
                .eq("buyer_id", user.id) as any
            ),
            timeout(supabase.from("contacts").select("id, tender_id, dealer_id, created_at, tenders!inner(status)").eq("buyer_id", user.id).in("tenders.status", ["completed", "cancelled"]) as any),
            timeout(supabase.from("reviews").select("id, contact_id, from_user_id, to_user_id, type, created_at").or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`) as any),
            timeout(supabase.from("messages").select("id, contact_id, sender_id, content, created_at").neq("sender_id", user.id).order("created_at", { ascending: false }).limit(20) as any),
            timeout(supabase.from("instant_offers").select("*").eq("status", "active").order("created_at", { ascending: false }).limit(6) as any),
          ]);

          if (cancelled) return;

          const tenders = (tendersRes as any)?.data || [];
          const activeTenders = tenders.filter((t: any) => t.status === "active").length;

          // Count new offers since last login
          let newOffers = 0;
          const allOffers: any[] = [];
          tenders.forEach((t: any) => {
            ((t.offers as any[]) || []).forEach((o: any) => {
              allOffers.push({ ...o, tenderId: t.id, tenderVehicles: t.tender_vehicles });
              if (lastLogin && new Date(o.created_at) > new Date(lastLogin)) {
                newOffers++;
              } else if (!lastLogin) {
                newOffers++;
              }
            });
          });

          // Open ratings: completed contacts without review from this user
          const completedContacts = ((contactsRes as any)?.data || []).map((c: any) => c.id);
          const givenReviews = ((reviewsRes as any)?.data || []).filter((r: any) => r.from_user_id === user.id);
          const reviewedContactIds = new Set(givenReviews.map((r: any) => r.contact_id));
          const openRatings = completedContacts.filter((id: string) => !reviewedContactIds.has(id)).length;

          setBuyerStats({ activeTenders, newOffers, openRatings });

          // ── BUYER ACTIVITY FEED ───────────────────────────────────────
          const activityItems: ActivityItem[] = [];

          // Recent offers received
          allOffers
            .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 5)
            .forEach((o: any) => {
              const vehicle = o.tenderVehicles?.[0];
              const vehicleName = vehicle ? [vehicle.brand, vehicle.model_name].filter(Boolean).join(" ") : "Fahrzeug";
              activityItems.push({
                id: `offer-${o.id}`,
                type: "offer",
                title: "Neues Angebot erhalten",
                subtitle: `Für ${vehicleName}`,
                time: o.created_at,
                href: `/dashboard/ausschreibungen`,
              });
            });

          // Recent messages
          ((messagesRes as any)?.data || []).slice(0, 5).forEach((m: any) => {
            activityItems.push({
              id: `msg-${m.id}`,
              type: "message",
              title: "Neue Nachricht",
              subtitle: m.content?.substring(0, 50) + (m.content?.length > 50 ? "…" : ""),
              time: m.created_at,
              href: `/dashboard/nachrichten`,
            });
          });

          // Recent reviews received
          ((reviewsRes as any)?.data || [])
            .filter((r: any) => r.to_user_id === user.id)
            .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 3)
            .forEach((r: any) => {
              activityItems.push({
                id: `review-${r.id}`,
                type: "review",
                title: "Neue Bewertung erhalten",
                subtitle: r.type === "positive" ? "Positive Bewertung" : r.type === "neutral" ? "Neutrale Bewertung" : "Negative Bewertung",
                time: r.created_at,
                href: `/dashboard/bewertungen`,
              });
            });

          activityItems.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
          setActivities(activityItems.slice(0, 5));

          // ── BUYER BOTTOM: Recent offers for their tenders ─────────────
          // Show tenders with their latest offers
          const tendersWithOffers = tenders
            .filter((t: any) => t.status === "active" && (t.offers as any[])?.length > 0)
            .sort((a: any, b: any) => {
              const latestA = Math.max(...((a.offers as any[]) || []).map((o: any) => new Date(o.created_at).getTime()));
              const latestB = Math.max(...((b.offers as any[]) || []).map((o: any) => new Date(o.created_at).getTime()));
              return latestB - latestA;
            })
            .slice(0, 5);
          setBuyerTenderOffers(tendersWithOffers);

          // Instant offers for buyer
          setRecentInstantOffers(((instantOffersRes as any)?.data || []) as InstantOfferRow[]);

        } else {
          // ── DEALER STATS ────────────────────────────────────────────────
          const [tendersRes, offersRes, contactsRes, reviewsRes, messagesRes, instantOffersRes] = await Promise.all([
            timeout(supabase.from("tenders").select("*, tender_vehicles(*), buyer_id").eq("status", "active").order("created_at", { ascending: false }).limit(10) as any),
            timeout(supabase.from("offers").select("id, tender_id, purchase_price, total_price, offered_quantity, created_at").eq("dealer_id", user.id) as any),
            timeout(supabase.from("contacts").select("id, buyer_id, tender_id, instant_offer_id, created_at").eq("dealer_id", user.id) as any),
            timeout(supabase.from("reviews").select("id, contact_id, from_user_id, to_user_id, type, created_at").or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`) as any),
            timeout(supabase.from("messages").select("id, contact_id, sender_id, content, created_at").neq("sender_id", user.id).order("created_at", { ascending: false }).limit(20) as any),
            timeout(supabase.from("instant_offers").select("*").eq("dealer_id", user.id).eq("status", "active").order("created_at", { ascending: false }).limit(6) as any),
          ]);

          if (cancelled) return;

          const tenders = (tendersRes as any)?.data || [];
          const offers = (offersRes as any)?.data || [];
          const contacts = (contactsRes as any)?.data || [];
          const allReviews = (reviewsRes as any)?.data || [];

          // Count new requests (active tenders not yet answered)
          const answeredSet = new Set<string>(offers.map((o: any) => o.tender_id));
          const newRequests = tenders.filter((t: any) => !answeredSet.has(t.id)).length;

          // Open offers count
          const openOffers = offers.length;

          // Contact requests
          const contactRequests = contacts.length;

          // Dealer rating
          const receivedReviews = allReviews.filter((r: any) => r.to_user_id === user.id);
          const positiveCount = receivedReviews.filter((r: any) => r.type === "positive").length;
          const dealerRating = receivedReviews.length > 0 ? Math.round((positiveCount / receivedReviews.length) * 100) : 0;

          setDealerStats({ newRequests, openOffers, contactRequests, dealerRating });

          // ── DEALER ACTIVITY FEED ──────────────────────────────────────
          const activityItems: ActivityItem[] = [];

          // New tenders (for dealers these are "new requests")
          tenders.slice(0, 5).forEach((t: any) => {
            const vehicle = t.tender_vehicles?.[0];
            const vehicleName = vehicle ? [vehicle.brand, vehicle.model_name].filter(Boolean).join(" ") : "Fahrzeug";
            activityItems.push({
              id: `tender-${t.id}`,
              type: "tender",
              title: "Neue Ausschreibung",
              subtitle: vehicleName,
              time: t.created_at,
              href: `/dashboard/eingang`,
            });
          });

          // Recent messages
          ((messagesRes as any)?.data || []).slice(0, 5).forEach((m: any) => {
            activityItems.push({
              id: `msg-${m.id}`,
              type: "message",
              title: "Neue Nachricht",
              subtitle: m.content?.substring(0, 50) + (m.content?.length > 50 ? "…" : ""),
              time: m.created_at,
              href: `/dashboard/nachrichten`,
            });
          });

          // Contact requests
          contacts
            .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 3)
            .forEach((c: any) => {
              activityItems.push({
                id: `contact-${c.id}`,
                type: "offer",
                title: "Neuer Kontaktwunsch",
                subtitle: c.instant_offer_id ? "Sofort-Angebot Anfrage" : "Ausschreibungs-Anfrage",
                time: c.created_at,
                href: `/dashboard/nachrichten`,
              });
            });

          // Reviews received
          receivedReviews
            .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 3)
            .forEach((r: any) => {
              activityItems.push({
                id: `review-${r.id}`,
                type: "review",
                title: "Neue Bewertung erhalten",
                subtitle: r.type === "positive" ? "Positive Bewertung" : r.type === "neutral" ? "Neutrale Bewertung" : "Negative Bewertung",
                time: r.created_at,
                href: `/dashboard/bewertungen`,
              });
            });

          activityItems.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
          setActivities(activityItems.slice(0, 5));

          // ── DEALER BOTTOM: Tenders + buyer ratings ────────────────────
          setDealerTenders(tenders);
          setAnsweredTenderIds(answeredSet);

          const myOfferMap: Record<string, { purchasePriceNet: number; totalPrice: number }> = {};
          offers.forEach((o: any) => {
            if (!myOfferMap[o.tender_id]) myOfferMap[o.tender_id] = { purchasePriceNet: 0, totalPrice: 0 };
            myOfferMap[o.tender_id].purchasePriceNet += o.purchase_price || 0;
            myOfferMap[o.tender_id].totalPrice += (o.total_price || 0) * (o.offered_quantity || 1);
          });
          setMyOffers(myOfferMap);

          // Load buyer profiles for tender cards
          const buyerIds = Array.from(new Set(tenders.map((t: any) => t.buyer_id).filter(Boolean)));
          if (buyerIds.length > 0) {
            const [profilesRes, reviewsForBuyers] = await Promise.all([
              supabase.from("profiles").select("id, company_name, industry, zip, city, created_at").in("id", buyerIds),
              supabase.from("reviews").select("to_user_id, type").in("to_user_id", buyerIds),
            ]);
            const buyerMap: Record<string, any> = {};
            (profilesRes.data || []).forEach((p: any) => { buyerMap[p.id] = p; });
            // Attach buyer to tenders
            setDealerTenders(prev => prev.map(t => ({ ...t, buyer: buyerMap[t.buyer_id] || null })));

            const ratingMap: Record<string, { score: number; total: number }> = {};
            const grouped: Record<string, { positive: number; total: number }> = {};
            (reviewsForBuyers.data || []).forEach((r: any) => {
              if (!grouped[r.to_user_id]) grouped[r.to_user_id] = { positive: 0, total: 0 };
              grouped[r.to_user_id].total++;
              if (r.type === "positive") grouped[r.to_user_id].positive++;
            });
            Object.entries(grouped).forEach(([uid, { positive, total }]) => {
              ratingMap[uid] = { score: total > 0 ? Math.round((positive / total) * 100) : 0, total };
            });
            setBuyerRatings(ratingMap);
          }

          // Offer stats via RPC
          const tenderIds = tenders.map((t: any) => t.id);
          if (tenderIds.length > 0) {
            const { data: statsData } = await supabase.rpc("get_tender_offer_stats", { tender_ids: tenderIds });
            const stats: Record<string, { count: number; bestPriceNet: number | null; bestTotalNet: number | null }> = {};
            if (statsData) {
              (statsData as any[]).forEach((s) => {
                stats[s.tender_id] = { count: s.offer_count, bestPriceNet: s.best_price_net, bestTotalNet: s.best_total_net };
              });
            }
            setOfferStats(stats);
          }

          // Dealer's own instant offers for bottom section
          setRecentInstantOffers(((instantOffersRes as any)?.data || []) as InstantOfferRow[]);
        }
      } catch (e) {
        if (!cancelled) console.error("[Dashboard] Stats load error:", e);
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [authLoading, user?.id, isDealer]);

  // ─── Activity icon mapping ────────────────────────────────────────────────
  const activityIcon = (type: ActivityItem["type"]) => {
    switch (type) {
      case "offer": return <Inbox size={16} className="text-emerald-600" />;
      case "message": return <MessageCircle size={16} className="text-blue-600" />;
      case "review": return <Star size={16} className="text-amber-500" />;
      case "tender": return <FileText size={16} className="text-blue-600" />;
      case "instant_offer": return <Zap size={16} className="text-purple-600" />;
    }
  };

  return (
    <div className="min-h-[calc(100vh-80px)] pb-20">

      {/* ── Clean Header ── */}
      <div className="border-b border-slate-200 bg-white">
        <div className="container mx-auto max-w-7xl px-4 md:px-8 py-6 md:py-8">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-500 mb-1">Dashboard</p>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-navy-950">
                Willkommen, {userName}
              </h1>
            </div>
            <div className="flex items-center gap-3">
              {isDealer ? (
                <>
                  <Link href="/dashboard/eingang" className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg border border-slate-200 bg-white text-navy-950 hover:bg-slate-50 transition-colors">
                    <Inbox size={16} /> Posteingang
                  </Link>
                  <Link href="/dashboard/sofort-angebote/neu" className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg bg-navy-950 text-white hover:bg-navy-900 transition-colors">
                    <CarFront size={16} /> Sofort-Angebot erstellen
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/dashboard/sofort-angebote" className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg border border-slate-200 bg-white text-navy-950 hover:bg-slate-50 transition-colors">
                    <Zap size={16} /> Marktplatz
                  </Link>
                  <Link href="/dashboard/ausschreibung/neu" className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                    <Plus size={16} /> Neue Ausschreibung
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-7xl px-4 md:px-8 mt-6 md:mt-8 space-y-8">

        {/* =========================================
            BUYER VIEW
           ========================================= */}
        {!isDealer && (
          <div className="animate-in fade-in duration-300 space-y-8">

            {/* KPI Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Link href="/dashboard/ausschreibungen">
                <Card className="p-5 rounded-xl border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm transition-all group cursor-pointer">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Aktive Ausschreibungen</span>
                    <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                      <FileText size={18} />
                    </div>
                  </div>
                  <div className="flex items-end justify-between">
                    <span className="text-3xl font-bold text-navy-950">
                      {statsLoading ? <Loader2 size={20} className="animate-spin text-slate-300" /> : buyerStats.activeTenders}
                    </span>
                    <ArrowRight size={16} className="text-slate-300 group-hover:text-blue-600 transition-colors mb-1" />
                  </div>
                </Card>
              </Link>

              <Link href="/dashboard/ausschreibungen">
                <Card className="p-5 rounded-xl border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm transition-all group cursor-pointer">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Neue Angebote</span>
                    <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <Inbox size={18} />
                    </div>
                  </div>
                  <div className="flex items-end justify-between">
                    <div>
                      <span className="text-3xl font-bold text-navy-950">
                        {statsLoading ? <Loader2 size={20} className="animate-spin text-slate-300" /> : buyerStats.newOffers}
                      </span>
                      {!statsLoading && buyerStats.newOffers > 0 && (
                        <span className="ml-2 text-xs font-medium text-emerald-600">seit letztem Login</span>
                      )}
                    </div>
                    <ArrowRight size={16} className="text-slate-300 group-hover:text-emerald-600 transition-colors mb-1" />
                  </div>
                </Card>
              </Link>

              <Link href="/dashboard/bewertungen">
                <Card className={`p-5 rounded-xl bg-white hover:shadow-sm transition-all group cursor-pointer ${buyerStats.openRatings > 0 ? "border-amber-200 hover:border-amber-300" : "border-slate-200 hover:border-slate-300"}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Offene Bewertungen</span>
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${buyerStats.openRatings > 0 ? "bg-amber-50 text-amber-600" : "bg-amber-50 text-amber-500"}`}>
                      <Star size={18} />
                    </div>
                  </div>
                  <div className="flex items-end justify-between">
                    <div>
                      <span className={`text-3xl font-bold ${buyerStats.openRatings > 0 ? "text-amber-600" : "text-navy-950"}`}>
                        {statsLoading ? <Loader2 size={20} className="animate-spin text-slate-300" /> : buyerStats.openRatings}
                      </span>
                      {buyerStats.openRatings > 0 && (
                        <span className="ml-2 text-xs font-medium text-amber-600">ausstehend</span>
                      )}
                    </div>
                    <ArrowRight size={16} className="text-slate-300 group-hover:text-amber-500 transition-colors mb-1" />
                  </div>
                </Card>
              </Link>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

              {/* Activity Feed */}
              <div className="lg:col-span-3">
                <Card className="rounded-xl border-slate-200 bg-white overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                    <h2 className="text-sm font-semibold text-navy-950">Letzte Aktivitäten</h2>
                    {activities.length > 0 && (
                      <Link href="/dashboard/profil#aktivitaeten" className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1">
                        Alle ansehen <ArrowRight size={12} />
                      </Link>
                    )}
                  </div>
                  <div className="p-2">
                    {statsLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 size={20} className="animate-spin text-slate-300" />
                      </div>
                    ) : activities.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center mb-3 text-slate-300">
                          <InboxIcon size={24} />
                        </div>
                        <p className="text-sm font-medium text-navy-950 mb-1">Noch keine Aktivitäten</p>
                        <p className="text-xs text-slate-500 max-w-xs">Sobald Sie Ausschreibungen erstellen oder Angebote erhalten, erscheinen Ihre Aktivitäten hier.</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-50">
                        {activities.map((a) => (
                          <Link key={a.id} href={a.href} className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-slate-50 transition-colors group/item">
                            <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0 group-hover/item:bg-slate-100 transition-colors">
                              {activityIcon(a.type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-navy-950 truncate">{a.title}</p>
                              <p className="text-xs text-slate-500 truncate">{a.subtitle}</p>
                            </div>
                            <span className="text-xs text-slate-400 shrink-0">{timeAgo(a.time)}</span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </Card>
              </div>

              {/* Quick Actions Sidebar */}
              <div className="lg:col-span-2 space-y-4">
                <Card className="rounded-xl border-slate-200 bg-white overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100">
                    <h2 className="text-sm font-semibold text-navy-950">Schnellzugriff</h2>
                  </div>
                  <div className="p-3 space-y-1">
                    <Link href="/dashboard/ausschreibung/neu" className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-blue-50 transition-colors group/action">
                      <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
                        <Plus size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-navy-950">Ausschreibung erstellen</p>
                        <p className="text-xs text-slate-500">Neuen Beschaffungsprozess starten</p>
                      </div>
                      <ArrowRight size={14} className="text-slate-300 group-hover/action:text-blue-600 transition-colors shrink-0" />
                    </Link>
                    <Link href="/dashboard/sofort-angebote" className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-slate-50 transition-colors group/action">
                      <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                        <Zap size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-navy-950">Sofort-Angebote</p>
                        <p className="text-xs text-slate-500">Verfügbare Lagerwagen durchsuchen</p>
                      </div>
                      <ArrowRight size={14} className="text-slate-300 group-hover/action:text-navy-950 transition-colors shrink-0" />
                    </Link>
                    <Link href="/dashboard/ausschreibungen" className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-slate-50 transition-colors group/action">
                      <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                        <FileText size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-navy-950">Meine Ausschreibungen</p>
                        <p className="text-xs text-slate-500">Laufende Ausschreibungen verwalten</p>
                      </div>
                      <ArrowRight size={14} className="text-slate-300 group-hover/action:text-navy-950 transition-colors shrink-0" />
                    </Link>
                  </div>
                </Card>
              </div>
            </div>

            {/* ── Bottom Section: Recent offers for tenders & Instant Offers ── */}
            {!statsLoading && (buyerTenderOffers.length > 0 || recentInstantOffers.length > 0) && (
              <div className="space-y-8">
                {buyerTenderOffers.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-base font-semibold text-navy-950">Neue Angebote für Ihre Ausschreibungen</h2>
                      <Link href="/dashboard/ausschreibungen" className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1">
                        Alle ansehen <ArrowRight size={12} />
                      </Link>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {buyerTenderOffers.map((t: any) => {
                        const vehicle = t.tender_vehicles?.[0];
                        const vehicleName = vehicle ? [vehicle.brand, vehicle.model_name].filter(Boolean).join(" ") : "Fahrzeug";
                        const offerCount = (t.offers as any[])?.length || 0;
                        return (
                          <Link key={t.id} href="/dashboard/ausschreibungen">
                            <Card className="p-4 rounded-xl border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer">
                              <div className="flex items-center gap-3 mb-3">
                                <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                                  <FileText size={16} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-navy-950 truncate">{vehicleName}</p>
                                  <p className="text-xs text-slate-500">
                                    {vehicle?.quantity || 1}x · {t.id.split("-")[0].toUpperCase()}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                                <span className="text-sm font-semibold text-emerald-600">{offerCount} Angebot{offerCount !== 1 ? "e" : ""}</span>
                                <ArrowRight size={14} className="text-slate-300" />
                              </div>
                            </Card>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}

                {recentInstantOffers.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-base font-semibold text-navy-950">Neue Sofort-Angebote</h2>
                      <a href={`${SITE_URL}/sofort-angebote`} className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1">
                        Alle ansehen <ArrowRight size={12} />
                      </a>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {recentInstantOffers.map((offer) => (
                        <InstantOfferCard
                          key={offer.id}
                          offer={offer}
                          viewMode="buyer"
                          userId={user?.id}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* =========================================
            DEALER VIEW
           ========================================= */}
        {isDealer && (
          <div className="animate-in fade-in duration-300 space-y-8">

            {/* Subscription + Usage Strip */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Current Abo */}
              <Card className="p-5 rounded-xl border-slate-200 bg-white">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Aktuelles Abo</span>
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                    tier === "premium" ? "bg-amber-50 text-amber-600" :
                    tier === "pro" ? "bg-blue-50 text-blue-600" :
                    "bg-slate-50 text-slate-500"
                  }`}>
                    {tier === "premium" ? <Crown size={18} /> : tier === "pro" ? <Zap size={18} /> : <Star size={18} />}
                  </div>
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <span className="text-xl font-bold text-navy-950 capitalize">{tier}</span>
                    {tier !== "starter" && (
                      <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        tier === "premium" ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"
                      }`}>{tier === "premium" ? "Premium" : "Pro"}</span>
                    )}
                    {subscriptionSince && (
                      <p className="text-xs text-slate-400 mt-0.5">seit {new Date(subscriptionSince).toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" })}</p>
                    )}
                  </div>
                  <Link href="/dashboard/abo" className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1">
                    Verwalten <ArrowRight size={12} />
                  </Link>
                </div>
              </Card>

              {/* Offers this month */}
              <Card className="p-5 rounded-xl border-slate-200 bg-white">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Angebote diesen Monat</span>
                  <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                    <TrendingUp size={18} />
                  </div>
                </div>
                {(() => {
                  const limit = getOfferLimit();
                  return (
                    <div>
                      <span className="text-2xl font-bold text-navy-950">
                        {subLoading ? <Loader2 size={18} className="animate-spin text-slate-300" /> : (
                          limit !== null ? `${monthlyOfferCount}/${limit}` : <>{monthlyOfferCount} <span className="text-xs font-medium text-slate-400">unbegrenzt</span></>
                        )}
                      </span>
                      {limit !== null && !subLoading && (
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden mt-2">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${monthlyOfferCount >= limit ? "bg-red-500" : "bg-blue-500"}`}
                            style={{ width: `${Math.min((monthlyOfferCount / limit) * 100, 100)}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })()}
              </Card>

              {/* Active instant offers */}
              <Card className="p-5 rounded-xl border-slate-200 bg-white">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Sofort-Angebote aktiv</span>
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <Zap size={18} />
                  </div>
                </div>
                {(() => {
                  const limit = getInstantOfferLimit();
                  return (
                    <div>
                      <span className="text-2xl font-bold text-navy-950">
                        {subLoading ? <Loader2 size={18} className="animate-spin text-slate-300" /> : (
                          limit !== null ? `${activeInstantOfferCount}/${limit}` : <>{activeInstantOfferCount} <span className="text-xs font-medium text-slate-400">unbegrenzt</span></>
                        )}
                      </span>
                      {limit !== null && !subLoading && (
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden mt-2">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${activeInstantOfferCount >= limit ? "bg-red-500" : "bg-emerald-500"}`}
                            style={{ width: `${Math.min((activeInstantOfferCount / limit) * 100, 100)}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })()}
              </Card>
            </div>

            {/* 4 KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Link href="/dashboard/eingang">
                <Card className="p-5 rounded-xl border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm transition-all group cursor-pointer">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Neue Anfragen</span>
                    <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                      <Bell size={18} />
                    </div>
                  </div>
                  <div className="flex items-end justify-between">
                    <div>
                      <span className="text-3xl font-bold text-navy-950">
                        {statsLoading ? <Loader2 size={20} className="animate-spin text-slate-300" /> : dealerStats.newRequests}
                      </span>
                      {!statsLoading && dealerStats.newRequests > 0 && (
                        <p className="text-xs font-medium text-blue-600 mt-1">offen</p>
                      )}
                    </div>
                    <ArrowRight size={14} className="text-slate-300 group-hover:text-blue-600 transition-colors mb-1" />
                  </div>
                </Card>
              </Link>

              <Link href="/dashboard/angebote">
                <Card className="p-5 rounded-xl border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm transition-all group cursor-pointer">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Angebote</span>
                    <div className="w-9 h-9 rounded-lg bg-slate-50 text-slate-500 flex items-center justify-center">
                      <TrendingUp size={18} />
                    </div>
                  </div>
                  <div className="flex items-end justify-between">
                    <span className="text-3xl font-bold text-navy-950">
                      {statsLoading ? <Loader2 size={20} className="animate-spin text-slate-300" /> : dealerStats.openOffers}
                    </span>
                    <ArrowRight size={14} className="text-slate-300 group-hover:text-slate-500 transition-colors mb-1" />
                  </div>
                </Card>
              </Link>

              <Link href="/dashboard/nachrichten">
                <Card className="p-5 rounded-xl border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm transition-all group cursor-pointer">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Kontakte</span>
                    <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <Handshake size={18} />
                    </div>
                  </div>
                  <div className="flex items-end justify-between">
                    <span className="text-3xl font-bold text-navy-950">
                      {statsLoading ? <Loader2 size={20} className="animate-spin text-slate-300" /> : dealerStats.contactRequests}
                    </span>
                    <ArrowRight size={14} className="text-slate-300 group-hover:text-emerald-600 transition-colors mb-1" />
                  </div>
                </Card>
              </Link>

              <Link href="/dashboard/bewertungen">
                <Card className="p-5 rounded-xl border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm transition-all group cursor-pointer">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Bewertung</span>
                    <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-500 flex items-center justify-center">
                      <Star size={18} />
                    </div>
                  </div>
                  <div className="flex items-end justify-between">
                    <span className="text-3xl font-bold text-navy-950">
                      {statsLoading ? <Loader2 size={20} className="animate-spin text-slate-300" /> : `${dealerStats.dealerRating}%`}
                    </span>
                    <ArrowRight size={14} className="text-slate-300 group-hover:text-amber-500 transition-colors mb-1" />
                  </div>
                </Card>
              </Link>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

              {/* Activity Feed */}
              <div className="lg:col-span-3">
                <Card className="rounded-xl border-slate-200 bg-white overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                    <h2 className="text-sm font-semibold text-navy-950">Letzte Aktivitäten</h2>
                    {activities.length > 0 && (
                      <Link href="/dashboard/profil#aktivitaeten" className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1">
                        Alle ansehen <ArrowRight size={12} />
                      </Link>
                    )}
                  </div>
                  <div className="p-2">
                    {statsLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 size={20} className="animate-spin text-slate-300" />
                      </div>
                    ) : activities.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center mb-3 text-slate-300">
                          <InboxIcon size={24} />
                        </div>
                        <p className="text-sm font-medium text-navy-950 mb-1">Noch keine Aktivitäten</p>
                        <p className="text-xs text-slate-500 max-w-xs">Sobald es Neuigkeiten zu Ihren Angeboten oder Ausschreibungen gibt, erscheinen sie hier.</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-50">
                        {activities.map((a) => (
                          <Link key={a.id} href={a.href} className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-slate-50 transition-colors group/item">
                            <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0 group-hover/item:bg-slate-100 transition-colors">
                              {activityIcon(a.type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-navy-950 truncate">{a.title}</p>
                              <p className="text-xs text-slate-500 truncate">{a.subtitle}</p>
                            </div>
                            <span className="text-xs text-slate-400 shrink-0">{timeAgo(a.time)}</span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </Card>
              </div>

              {/* Quick Actions Sidebar */}
              <div className="lg:col-span-2 space-y-4">
                <Card className="rounded-xl border-slate-200 bg-white overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100">
                    <h2 className="text-sm font-semibold text-navy-950">Schnellzugriff</h2>
                  </div>
                  <div className="p-3 space-y-1">
                    <Link href="/dashboard/eingang" className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-slate-50 transition-colors group/action">
                      <div className="w-9 h-9 rounded-lg bg-navy-950 text-white flex items-center justify-center shrink-0">
                        <Inbox size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-navy-950">Ausschreibungen ansehen</p>
                        <p className="text-xs text-slate-500">Anfragen prüfen & beantworten</p>
                      </div>
                      <ArrowRight size={14} className="text-slate-300 group-hover/action:text-navy-950 transition-colors shrink-0" />
                    </Link>
                    <Link href="/dashboard/sofort-angebote/neu" className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-slate-50 transition-colors group/action">
                      <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                        <CarFront size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-navy-950">Sofort-Angebot erstellen</p>
                        <p className="text-xs text-slate-500">Lagerwagen im Marktplatz listen</p>
                      </div>
                      <ArrowRight size={14} className="text-slate-300 group-hover/action:text-navy-950 transition-colors shrink-0" />
                    </Link>
                    <Link href="/dashboard/angebote" className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-slate-50 transition-colors group/action">
                      <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                        <FileText size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-navy-950">Meine Angebote</p>
                        <p className="text-xs text-slate-500">Abgegebene Angebote verwalten</p>
                      </div>
                      <ArrowRight size={14} className="text-slate-300 group-hover/action:text-navy-950 transition-colors shrink-0" />
                    </Link>
                  </div>
                </Card>
              </div>
            </div>

            {/* ── Bottom Section: New Tenders & Instant Offers for Dealer ── */}
            {!statsLoading && (dealerTenders.length > 0 || recentInstantOffers.length > 0) && (
              <div className="space-y-8">
                {dealerTenders.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-base font-semibold text-navy-950">Aktuelle Ausschreibungen</h2>
                      <Link href="/dashboard/eingang" className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1">
                        Alle ansehen <ArrowRight size={12} />
                      </Link>
                    </div>
                    <div className="flex flex-col gap-4">
                      {dealerTenders.slice(0, 5).map((tender: any) => (
                        <DealerTenderCard
                          key={tender.id}
                          tender={mapTenderToCardProps(tender, answeredTenderIds, offerStats, myOffers, buyerRatings)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {recentInstantOffers.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-base font-semibold text-navy-950">Ihre Sofort-Angebote</h2>
                      <Link href="/dashboard/sofort-angebote" className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1">
                        Alle ansehen <ArrowRight size={12} />
                      </Link>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {recentInstantOffers.map((offer) => (
                        <InstantOfferCard
                          key={offer.id}
                          offer={offer}
                          viewMode="seller"
                          isOwnOffer={true}
                          userId={user?.id}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
