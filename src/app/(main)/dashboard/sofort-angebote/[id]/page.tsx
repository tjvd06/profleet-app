"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SavingsBadge } from "@/components/ui-custom/SavingsBadge";
import {
  ChevronLeft, ChevronRight, Bookmark, Phone, MapPin, Package, MessageCircle,
  Calendar, Loader2, ShieldCheck, ChevronDown, ChevronUp, Info, Mail, Building2, Send,
  FileText, Download, Lightbulb, Shield, Gauge, Eye, Disc, Zap, Wifi, Armchair, Check,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { useAuth } from "@/components/providers/auth-provider";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  type InstantOfferRow,
  buildSpecsString,
  buildEquipmentDetails,
  getImageUrl,
  getConfigDocUrl,
  buildLocationString,
} from "@/lib/instant-offers";

export default function InstantOfferDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, profile } = useAuth();
  const [supabase] = useState(() => createClient());

  const offerId = params.id as string;

  const [offer, setOffer] = useState<InstantOfferRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);

  // Image carousel
  const [currentImage, setCurrentImage] = useState(0);

  // Dealer profile
  const [dealerProfile, setDealerProfile] = useState<{
    company_name: string | null;
    first_name: string | null;
    last_name: string | null;
    dealer_type: string | null;
    zip: string | null;
    city: string | null;
    street: string | null;
    phone: string | null;
    email_public: string | null;
    subscription_tier: string | null;
    created_at: string | null;
  } | null>(null);

  // Inquiry
  const [showContactConfirm, setShowContactConfirm] = useState(false);
  const [contactLoading, setContactLoading] = useState(false);
  const [existingContactId, setExistingContactId] = useState<string | null>(null);

  // Collapsible sections
  const [showEquipment, setShowEquipment] = useState(true);
  const [showLeasing, setShowLeasing] = useState(false);
  const [showFinancing, setShowFinancing] = useState(false);

  // Fetch offer + dealer profile
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("instant_offers")
        .select("*")
        .eq("id", offerId)
        .single();

      if (error || !data) {
        setNotFound(true);
      } else {
        const offerData = data as InstantOfferRow;
        setOffer(offerData);

        // Load dealer profile — only for logged-in users
        if (offerData.dealer_id && user) {
          const { data: dp } = await supabase
            .from("profiles")
            .select("company_name, first_name, last_name, dealer_type, zip, city, street, phone, email_public, subscription_tier, created_at")
            .eq("id", offerData.dealer_id)
            .single();
          if (dp) setDealerProfile(dp);
        }
      }
      setLoading(false);
    })();
  }, [supabase, offerId, user]);

  // Fetch bookmark state + existing contact
  useEffect(() => {
    if (!user || !offerId) return;
    (async () => {
      const [bookmarkRes, contactRes] = await Promise.all([
        supabase.from("bookmarks").select("id").eq("user_id", user.id).eq("instant_offer_id", offerId).maybeSingle(),
        supabase.from("contacts").select("id").eq("buyer_id", user.id).eq("instant_offer_id", offerId).maybeSingle(),
      ]);
      setBookmarked(!!bookmarkRes.data);
      setExistingContactId(contactRes.data?.id || null);
    })();
  }, [user, offerId, supabase]);

  const toggleBookmark = async () => {
    if (!user) return;
    const newState = !bookmarked;
    setBookmarked(newState);
    if (newState) {
      await supabase.from("bookmarks").insert({ user_id: user.id, instant_offer_id: offerId });
    } else {
      await supabase.from("bookmarks").delete().eq("user_id", user.id).eq("instant_offer_id", offerId);
    }
  };

  const handleCreateContact = async () => {
    if (!user || !offer) return;
    setContactLoading(true);

    // Check if contact already exists
    const { data: existing } = await supabase
      .from("contacts")
      .select("id")
      .eq("buyer_id", user.id)
      .eq("instant_offer_id", offer.id)
      .maybeSingle();

    if (existing) {
      router.push(`/dashboard/nachrichten?contact=${existing.id}`);
      return;
    }

    const { data, error } = await supabase
      .from("contacts")
      .insert({
        instant_offer_id: offer.id,
        buyer_id: user.id,
        dealer_id: offer.dealer_id,
      })
      .select()
      .single();

    if (error) {
      toast.error("Fehler: " + error.message);
      setContactLoading(false);
    } else if (data) {
      router.push(`/dashboard/nachrichten?contact=${data.id}`);
    }
    setShowContactConfirm(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Loader2 className="animate-spin text-blue-600" size={40} />
      </div>
    );
  }

  if (notFound || !offer) {
    return (
      <div className="text-center py-24 max-w-7xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-navy-950 mb-4">Angebot nicht gefunden</h1>
        <p className="text-slate-500 mb-8">Das Sofort-Angebot existiert nicht oder ist abgelaufen.</p>
        <Link href="/dashboard/sofort-angebote">
          <Button className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold px-8 h-12">
            Zurück zum Marktplatz
          </Button>
        </Link>
      </div>
    );
  }

  const specs = buildSpecsString(offer);
  const equipmentDetails = buildEquipmentDetails(offer);
  const location = buildLocationString(offer);
  const offerPrice = offer.purchase_price_net ?? 0;
  const savingsPercent = offer.discount_percent ?? 0;
  const images = offer.images || [];
  const isBuyer = profile?.role === "nachfrager";
  const expiresAt = offer.expires_at ? new Date(offer.expires_at) : null;
  const daysLeft = expiresAt ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : null;

  return (
    <div className="bg-slate-50 min-h-screen">
      {/* Back Navigation */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="container mx-auto max-w-7xl px-4 md:px-8 py-3 flex items-center gap-4">
          <button onClick={() => router.back()} className="flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-navy-950 transition-colors">
            <ChevronLeft size={18} /> Zurück
          </button>
          <span className="text-slate-300">|</span>
          <span className="text-sm text-slate-400">Sofort-Angebot</span>
        </div>
      </div>

      <div className="container mx-auto max-w-7xl px-4 md:px-8 py-8 md:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">

          {/* Left Column: Images + Equipment */}
          <div className="lg:col-span-3 space-y-6">
            {/* Image Gallery */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              {images.length > 0 ? (
                <>
                  {/* Main Image */}
                  <div className="relative aspect-[16/10] bg-slate-100">
                    <img
                      src={getImageUrl(images[currentImage])}
                      alt={`${offer.brand} ${offer.model_name} - Bild ${currentImage + 1}`}
                      className="w-full h-full object-cover"
                    />
                    {images.length > 1 && (
                      <>
                        <button
                          onClick={() => setCurrentImage((prev) => (prev - 1 + images.length) % images.length)}
                          className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/80 hover:bg-white rounded-full flex items-center justify-center shadow-md backdrop-blur-sm transition-all"
                        >
                          <ChevronLeft size={20} />
                        </button>
                        <button
                          onClick={() => setCurrentImage((prev) => (prev + 1) % images.length)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/80 hover:bg-white rounded-full flex items-center justify-center shadow-md backdrop-blur-sm transition-all"
                        >
                          <ChevronRight size={20} />
                        </button>
                        <div className="absolute bottom-3 right-3 bg-black/60 text-white text-xs font-semibold px-3 py-1 rounded-full backdrop-blur-sm">
                          {currentImage + 1} / {images.length}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Thumbnail Strip */}
                  {images.length > 1 && (
                    <div className="p-3 flex gap-2 overflow-x-auto">
                      {images.map((img, idx) => (
                        <button
                          key={idx}
                          onClick={() => setCurrentImage(idx)}
                          className={`shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 transition-all ${
                            idx === currentImage ? "border-blue-500 shadow-md" : "border-transparent opacity-60 hover:opacity-100"
                          }`}
                        >
                          <img src={getImageUrl(img)} alt="" className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="aspect-[16/10] bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                  <div className="text-center text-slate-400">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="w-20 h-20 mx-auto mb-3 opacity-30">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 19v-1c0-1.1.9-2 2-2h4a2 2 0 012 2v1M3 13.5v-1c0-2.8 2.2-5 5-5h8a5 5 0 015 5v1M3 13.5C3 15.4 4.6 17 6.5 17h11c1.9 0 3.5-1.6 3.5-3.5" />
                    </svg>
                    <p className="font-semibold">Keine Bilder vorhanden</p>
                  </div>
                </div>
              )}
            </div>

            {/* Equipment Details - Collapsible */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <button
                onClick={() => setShowEquipment(!showEquipment)}
                className="w-full flex items-center justify-between p-6 hover:bg-slate-50 transition-colors"
              >
                <h2 className="text-xl font-bold text-navy-950">Fahrzeugdetails & Ausstattung</h2>
                {showEquipment ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
              </button>
              {showEquipment && (
                <div className="px-6 pb-6 space-y-6">
                  {/* Technical specs table */}
                  {equipmentDetails.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                      {equipmentDetails.map((d, i) => (
                        <div key={i} className="flex justify-between py-2 border-b border-slate-100 last:border-0">
                          <span className="text-sm text-slate-500 font-medium">{d.label}</span>
                          <span className="text-sm font-semibold text-navy-950 text-right">{d.value}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Grouped Exterieur-Extras */}
                  {(() => {
                    const ext = (offer.equipment as Record<string, unknown>)?.exteriorExtras as string[] | undefined;
                    if (!ext || ext.length === 0) return null;

                    const groups: { label: string; icon: React.ReactNode; items: string[] }[] = [
                      { label: "Licht & Sicht", icon: <Lightbulb size={14} />, items: [
                        "Adaptives Kurvenlicht", "Bi-Xenon Scheinwerfer", "Blendfreies Fernlicht", "Fernlichtassistent",
                        "Kurvenlicht", "Laserlicht", "LED-Scheinwerfer", "LED-Tagfahrlicht", "Lichtsensor",
                        "Nachtsicht-Assistent", "Nebelscheinwerfer", "Scheinwerferreinigung", "Tagfahrlicht", "Xenonscheinwerfer",
                      ]},
                      { label: "Sicherheit & Assistenz", icon: <Shield size={14} />, items: [
                        "ABS", "Abstandswarner", "Berganfahrassistent", "ESP", "Notbremsassistent",
                        "Spurhalteassistent", "Totwinkel-Assistent", "Traktionskontrolle", "Verkehrszeichenerkennung",
                        "Geschwindigkeitsbegrenzer", "Reifendruckkontrolle", "Elektr. Wegfahrsperre",
                      ]},
                      { label: "Fahrwerk & Raeder", icon: <Disc size={14} />, items: [
                        "Adaptives Fahrwerk", "Luftfederung", "Sportfahrwerk", "Leichtmetallfelgen", "Stahlfelgen",
                        "Allwetterreifen", "Sommerreifen", "Winterreifen", "Winterpaket", "Sportpaket",
                      ]},
                      { label: "Komfort & Karosserie", icon: <Zap size={14} />, items: [
                        "Abgedunkelte Scheiben", "Beheizbare Frontscheibe", "Dachreling", "Elektr. Heckklappe",
                        "Faltdach", "Panorama-Dach", "Regensensor", "Schiebedach", "Schlüssellose Zentralverriegelung",
                        "Servolenkung", "Start/Stopp-Automatik", "Zentralverriegelung",
                        "Notrad", "Pannenkit", "Reserverad", "Behindertengerecht",
                      ]},
                    ];

                    return (
                      <div>
                        <h3 className="text-sm font-bold text-navy-950 uppercase tracking-wider mb-3">Exterieur-Ausstattung</h3>
                        <div className="space-y-4">
                          {groups.map((g) => {
                            const matched = ext.filter((e) => g.items.includes(e));
                            if (matched.length === 0) return null;
                            return (
                              <div key={g.label}>
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-slate-400">{g.icon}</span>
                                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{g.label}</span>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {matched.map((item) => (
                                    <span key={item} className="inline-flex items-center gap-1 text-xs font-medium bg-slate-100 text-slate-700 px-2.5 py-1.5 rounded-lg">
                                      <Check size={12} className="text-green-500 shrink-0" />{item}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                          {/* Ungrouped extras */}
                          {(() => {
                            const allGrouped = groups.flatMap((g) => g.items);
                            const ungrouped = ext.filter((e) => !allGrouped.includes(e));
                            if (ungrouped.length === 0) return null;
                            return (
                              <div>
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-slate-400"><Zap size={14} /></span>
                                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sonstiges</span>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {ungrouped.map((item) => (
                                    <span key={item} className="inline-flex items-center gap-1 text-xs font-medium bg-slate-100 text-slate-700 px-2.5 py-1.5 rounded-lg">
                                      <Check size={12} className="text-green-500 shrink-0" />{item}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Grouped Interieur-Extras */}
                  {(() => {
                    const int = (offer.equipment as Record<string, unknown>)?.interiorExtras as string[] | undefined;
                    if (!int || int.length === 0) return null;

                    const groups: { label: string; icon: React.ReactNode; items: string[] }[] = [
                      { label: "Infotainment & Konnektivitaet", icon: <Wifi size={14} />, items: [
                        "Android Auto", "Apple CarPlay", "Bluetooth", "CD-Spieler", "Freisprecheinrichtung",
                        "Induktionsladen Smartphones", "Musikstreaming integriert", "Navigationssystem",
                        "Radio DAB", "Soundsystem", "Sprachsteuerung", "Touchscreen", "Tuner/Radio", "TV", "USB",
                        "Volldigitales Kombiinstrument", "WLAN/Wifi Hotspot", "Head-Up Display",
                      ]},
                      { label: "Sitze & Komfort", icon: <Armchair size={14} />, items: [
                        "Armlehne", "Beheizbares Lenkrad", "Elektr. Sitzeinstellung", "Elektr. Sitzeinstellung mit Memory",
                        "Elektr. Sitzeinstellung hinten", "Lederlenkrad", "Lordosenstütze", "Massagesitze",
                        "Sitzbelüftung", "Sitzheizung", "Sitzheizung hinten", "Sportsitze",
                        "Umklappbarer Beifahrersitz", "Multifunktionslenkrad", "Schaltwippen",
                      ]},
                      { label: "Sicherheit & Ueberwachung", icon: <Eye size={14} />, items: [
                        "Alarmanlage", "Bordcomputer", "Elektr. Seitenspiegel", "Elektr. Seitenspiegel anklappbar",
                        "Elektr. Fensterheber", "Innenspiegel autom. abblendend", "Isofix", "Isofix Beifahrersitz",
                        "Müdigkeitswarner", "Notrufsystem", "Virtuelle Seitenspiegel",
                      ]},
                      { label: "Sonstiges", icon: <Zap size={14} />, items: [
                        "Ambiente-Beleuchtung", "Gepäckraumabtrennung", "Raucherpaket", "Rechtslenker",
                        "Skisack", "Standheizung",
                      ]},
                    ];

                    return (
                      <div>
                        <h3 className="text-sm font-bold text-navy-950 uppercase tracking-wider mb-3">Interieur-Ausstattung</h3>
                        <div className="space-y-4">
                          {groups.map((g) => {
                            const matched = int.filter((e) => g.items.includes(e));
                            if (matched.length === 0) return null;
                            return (
                              <div key={g.label}>
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-slate-400">{g.icon}</span>
                                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{g.label}</span>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {matched.map((item) => (
                                    <span key={item} className="inline-flex items-center gap-1 text-xs font-medium bg-slate-100 text-slate-700 px-2.5 py-1.5 rounded-lg">
                                      <Check size={12} className="text-green-500 shrink-0" />{item}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                          {/* Ungrouped extras */}
                          {(() => {
                            const allGrouped = groups.flatMap((g) => g.items);
                            const ungrouped = int.filter((e) => !allGrouped.includes(e));
                            if (ungrouped.length === 0) return null;
                            return (
                              <div>
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-slate-400"><Zap size={14} /></span>
                                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Weitere</span>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {ungrouped.map((item) => (
                                    <span key={item} className="inline-flex items-center gap-1 text-xs font-medium bg-slate-100 text-slate-700 px-2.5 py-1.5 rounded-lg">
                                      <Check size={12} className="text-green-500 shrink-0" />{item}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    );
                  })()}

                  {equipmentDetails.length === 0 && !(offer.equipment as Record<string, unknown>)?.exteriorExtras && !(offer.equipment as Record<string, unknown>)?.interiorExtras && (
                    <p className="text-slate-400 text-sm">Keine detaillierten Spezifikationen verfügbar.</p>
                  )}
                </div>
              )}
            </div>

            {/* Config Documents */}
            {offer.config_documents && offer.config_documents.length > 0 && (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden p-6">
                <h2 className="text-xl font-bold text-navy-950 mb-4">Herstellerkonfiguration</h2>
                <p className="text-sm text-slate-500 mb-4">Detaillierte Konfigurationsdokumente vom Hersteller</p>
                <div className="space-y-2">
                  {(offer.config_documents as { path: string; name: string }[]).map((doc, idx) => {
                    const ext = doc.name.split(".").pop()?.toUpperCase() || "PDF";
                    return (
                      <a
                        key={idx}
                        href={getConfigDocUrl(doc.path)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-4 p-4 border border-slate-200 rounded-2xl hover:bg-slate-50 hover:border-blue-200 transition-all group"
                      >
                        <div className="h-11 w-11 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0 group-hover:bg-indigo-100 transition-colors">
                          <FileText size={20} className="text-indigo-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-navy-950 text-sm truncate">{doc.name}</p>
                          <p className="text-xs text-slate-400">{ext}-Dokument</p>
                        </div>
                        <Download size={18} className="text-slate-400 group-hover:text-blue-500 transition-colors shrink-0" />
                      </a>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Leasing Conditions - Collapsible */}
            {offer.leasing_enabled && (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <button
                  onClick={() => setShowLeasing(!showLeasing)}
                  className="w-full flex items-center justify-between p-6 hover:bg-slate-50 transition-colors"
                >
                  <h2 className="text-xl font-bold text-navy-950">Leasing-Konditionen</h2>
                  {showLeasing ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
                </button>
                {showLeasing && (
                  <div className="px-6 pb-6 space-y-3">
                    {offer.leasing_rate_net && (
                      <div className="flex justify-between py-2 border-b border-slate-100">
                        <span className="text-sm text-slate-500 font-medium">Monatliche Rate (netto)</span>
                        <span className="text-sm font-bold text-navy-950">{Number(offer.leasing_rate_net).toLocaleString("de-DE")} €</span>
                      </div>
                    )}
                    {offer.leasing_duration && (
                      <div className="flex justify-between py-2 border-b border-slate-100">
                        <span className="text-sm text-slate-500 font-medium">Laufzeit</span>
                        <span className="text-sm font-semibold text-navy-950">{offer.leasing_duration} Monate</span>
                      </div>
                    )}
                    {offer.leasing_mileage && (
                      <div className="flex justify-between py-2 border-b border-slate-100">
                        <span className="text-sm text-slate-500 font-medium">Kilometerleistung p.a.</span>
                        <span className="text-sm font-semibold text-navy-950">{offer.leasing_mileage.toLocaleString("de-DE")} km</span>
                      </div>
                    )}
                    {offer.leasing_conditions && (
                      <div className="pt-2">
                        <span className="text-sm text-slate-500 font-medium block mb-1">Hinweise</span>
                        <p className="text-sm text-navy-950">{offer.leasing_conditions}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Financing Conditions - Collapsible */}
            {offer.financing_enabled && (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <button
                  onClick={() => setShowFinancing(!showFinancing)}
                  className="w-full flex items-center justify-between p-6 hover:bg-slate-50 transition-colors"
                >
                  <h2 className="text-xl font-bold text-navy-950">Finanzierungs-Konditionen</h2>
                  {showFinancing ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
                </button>
                {showFinancing && (
                  <div className="px-6 pb-6 space-y-3">
                    {offer.financing_rate_net && (
                      <div className="flex justify-between py-2 border-b border-slate-100">
                        <span className="text-sm text-slate-500 font-medium">Monatliche Rate (netto)</span>
                        <span className="text-sm font-bold text-navy-950">{Number(offer.financing_rate_net).toLocaleString("de-DE")} €</span>
                      </div>
                    )}
                    {offer.financing_duration && (
                      <div className="flex justify-between py-2 border-b border-slate-100">
                        <span className="text-sm text-slate-500 font-medium">Laufzeit</span>
                        <span className="text-sm font-semibold text-navy-950">{offer.financing_duration} Monate</span>
                      </div>
                    )}
                    {offer.financing_downpayment && (
                      <div className="flex justify-between py-2 border-b border-slate-100">
                        <span className="text-sm text-slate-500 font-medium">Anzahlung</span>
                        <span className="text-sm font-semibold text-navy-950">{Number(offer.financing_downpayment).toLocaleString("de-DE")} €</span>
                      </div>
                    )}
                    {offer.financing_conditions && (
                      <div className="pt-2">
                        <span className="text-sm text-slate-500 font-medium block mb-1">Hinweise</span>
                        <p className="text-sm text-navy-950">{offer.financing_conditions}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column: Pricing, Dealer, Actions */}
          <div className="lg:col-span-2 space-y-6">
            {/* Title Card */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{offer.brand}</div>
              <h1 className="text-2xl md:text-3xl font-black text-navy-950 tracking-tight mb-3">{offer.model_name}</h1>
              {specs && <p className="text-sm text-slate-500 mb-4">{specs}</p>}

              <div className="flex flex-wrap gap-2">
                {offer.quantity > 1 && (
                  <Badge className="bg-blue-50 text-blue-700 border-blue-200 font-semibold px-3 py-1 flex items-center gap-1">
                    <Package size={14} /> {offer.quantity}x verfügbar
                  </Badge>
                )}
                {daysLeft !== null && daysLeft > 0 && (
                  <Badge className="bg-amber-50 text-amber-700 border-amber-200 font-semibold px-3 py-1 flex items-center gap-1">
                    <Calendar size={14} /> Noch {daysLeft} Tage
                  </Badge>
                )}
              </div>
            </div>

            {/* Price Card */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
              <h2 className="text-lg font-bold text-navy-950 mb-4">Preise</h2>

              {/* Purchase */}
              <div className="mb-4">
                <div className="flex items-end gap-3">
                  <span className="font-black text-navy-950 text-4xl tracking-tight">
                    {offerPrice > 0 ? `${offerPrice.toLocaleString("de-DE")} €` : "Auf Anfrage"}
                  </span>
                  {savingsPercent > 0 && <SavingsBadge savings={savingsPercent} />}
                </div>
                <span className="text-xs text-slate-400 font-medium">Kaufpreis netto</span>
              </div>

              {/* Additional costs */}
              {(offer.transfer_cost || offer.registration_cost) && (
                <div className="border-t border-slate-100 pt-3 mt-3 space-y-1">
                  {offer.transfer_cost && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Überführungskosten</span>
                      <span className="font-semibold text-navy-950">{Number(offer.transfer_cost).toLocaleString("de-DE")} €</span>
                    </div>
                  )}
                  {offer.registration_cost && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Zulassungskosten</span>
                      <span className="font-semibold text-navy-950">{Number(offer.registration_cost).toLocaleString("de-DE")} €</span>
                    </div>
                  )}
                  {offer.total_price && (
                    <div className="flex justify-between text-sm font-bold pt-2 border-t border-slate-100 mt-2">
                      <span className="text-navy-950">Gesamtpreis netto</span>
                      <span className="text-navy-950">{Number(offer.total_price).toLocaleString("de-DE")} €</span>
                    </div>
                  )}
                </div>
              )}

              {/* Financing options pills */}
              <div className="mt-4 space-y-2">
                {offer.leasing_enabled && offer.leasing_rate_net && (
                  <div className="flex items-center justify-between p-3 bg-blue-50 rounded-xl border border-blue-100">
                    <span className="text-sm font-semibold text-blue-700">Leasing</span>
                    <span className="text-lg font-black text-blue-700">ab {Number(offer.leasing_rate_net).toLocaleString("de-DE")} € / Monat</span>
                  </div>
                )}
                {offer.financing_enabled && offer.financing_rate_net && (
                  <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                    <span className="text-sm font-semibold text-emerald-700">Finanzierung</span>
                    <span className="text-lg font-black text-emerald-700">ab {Number(offer.financing_rate_net).toLocaleString("de-DE")} € / Monat</span>
                  </div>
                )}
              </div>
            </div>

            {/* Dealer Info Card — only for logged-in users */}
            {user ? (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
                <h2 className="text-lg font-bold text-navy-950 mb-4">Anbieter</h2>
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-center">
                    <Building2 size={24} className="text-blue-600" />
                  </div>
                  <div>
                    <div className="font-bold text-navy-950 text-lg">{dealerProfile?.company_name || "Anbieter"}</div>
                  </div>
                </div>
                {dealerProfile && (
                  <div className="space-y-2 mb-4">
                    {dealerProfile.dealer_type && (
                      <div className="text-sm text-slate-500">
                        <span className="font-semibold text-slate-400 text-xs uppercase tracking-wider">Händlertyp:</span>{" "}
                        <span className="font-medium text-slate-700">{dealerProfile.dealer_type}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 text-sm text-slate-600">
                      <MapPin size={14} className="shrink-0 text-slate-400" />
                      {dealerProfile.street && <span>{dealerProfile.street}, </span>}
                      {dealerProfile.zip || ""} {dealerProfile.city || location}
                    </div>
                    {dealerProfile.created_at && (
                      <div className="text-xs text-slate-400 mt-1">
                        Mitglied seit {new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" }).format(new Date(dealerProfile.created_at))}
                      </div>
                    )}
                  </div>
                )}
                {offer.delivery_radius && (
                  <div className="flex items-center gap-2 text-sm text-slate-500 bg-slate-50 rounded-xl p-3 border border-slate-100">
                    <Info size={14} className="text-slate-400 shrink-0" />
                    Lieferung im Umkreis von {offer.delivery_radius} km möglich
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 text-center">
                <div className="w-12 h-12 bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <Building2 size={24} className="text-slate-400" />
                </div>
                <p className="text-sm text-slate-500 font-medium">Anbieter-Details sind nur für angemeldete Nutzer sichtbar.</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-3 sticky bottom-6">
              {user && isBuyer && (
                existingContactId ? (
                  <Button
                    onClick={() => router.push(`/dashboard/nachrichten?contact=${existingContactId}`)}
                    className="w-full h-14 rounded-2xl bg-green-600 hover:bg-green-700 text-white font-bold text-lg shadow-lg shadow-green-600/20"
                  >
                    <MessageCircle size={18} className="mr-2" />
                    Zum Chat
                  </Button>
                ) : (
                  <Button
                    onClick={() => setShowContactConfirm(true)}
                    disabled={contactLoading}
                    className="w-full h-14 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg shadow-lg shadow-blue-600/20"
                  >
                    {contactLoading ? <Loader2 className="animate-spin mr-2" size={18} /> : <Send size={18} className="mr-2" />}
                    Anfrage senden
                  </Button>
                )
              )}
              {user ? (
                <Button
                  variant="outline"
                  className={`w-full h-14 rounded-2xl font-bold text-lg transition-all ${
                    bookmarked
                      ? "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                  onClick={toggleBookmark}
                >
                  <Bookmark size={18} className={`mr-2 ${bookmarked ? "fill-red-500" : ""}`} />
                  {bookmarked ? "Gemerkt" : "Merken"}
                </Button>
              ) : (
                <Link href="/anmelden" className="block">
                  <Button variant="outline" className="w-full h-14 rounded-2xl border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-lg">
                    Anmelden um alle Details zu sehen
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Contact confirmation dialog */}
      <Dialog open={showContactConfirm} onOpenChange={setShowContactConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Anfrage senden</DialogTitle>
            <DialogDescription>
              Möchten Sie den Händler{dealerProfile?.company_name ? ` "${dealerProfile.company_name}"` : ""} zu diesem Sofort-Angebot kontaktieren?
              Es wird eine Konversation erstellt, in der Sie direkt kommunizieren können.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" className="rounded-xl" onClick={() => setShowContactConfirm(false)}>Abbrechen</Button>
            <Button
              onClick={handleCreateContact}
              disabled={contactLoading}
              className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white"
            >
              {contactLoading ? <Loader2 className="animate-spin mr-2" size={16} /> : <Send size={16} className="mr-2" />}
              Kontakt aufnehmen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
