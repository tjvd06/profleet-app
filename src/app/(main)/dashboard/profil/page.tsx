"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2, Save, User, Building2, X, PartyPopper,
  Inbox, MessageCircle, Star, FileText, Zap, InboxIcon, Activity,
  Bell, ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { useAuth } from "@/components/providers/auth-provider";
import { toast } from "sonner";
import { DEALER_TYPES, DEALER_TYPE_LABELS } from "@/constants/enums";

const DEALER_TYPE_OPTIONS = DEALER_TYPES.map((value) => ({
  value,
  label: DEALER_TYPE_LABELS[value],
}));

const INDUSTRY_OPTIONS = [
  "Automobil",
  "Bauwesen",
  "Dienstleistungen",
  "Energie",
  "Finanzen & Versicherung",
  "Gesundheit",
  "Handel",
  "Handwerk",
  "IT & Telekommunikation",
  "Logistik & Transport",
  "Öffentlicher Dienst",
  "Produktion & Fertigung",
  "Sonstiges",
];

type ProfileForm = {
  first_name: string;
  last_name: string;
  phone: string;
  email_public: string;
  company_name: string;
  industry: string | null;
  street: string;
  zip: string;
  city: string;
  vat_id: string;
  // Stored as DealerType | null; "" represents "not selected" in the Select UI
  dealer_type: string;
  brands: string[];
};

type ActivityItem = {
  id: string;
  type: "offer" | "message" | "review" | "tender" | "instant_offer";
  title: string;
  subtitle: string;
  time: string;
  href: string;
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Gerade eben";
  if (mins < 60) return `vor ${mins} Min.`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `vor ${days} Tag${days > 1 ? "en" : ""}`;
  return new Date(dateStr).toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" });
}

export default function ProfilePage() {
  const { user, profile, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isWelcome = searchParams.get("welcome") === "1";
  const [supabase] = useState(() => createClient());
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);

  const [form, setForm] = useState<ProfileForm>({
    first_name: "",
    last_name: "",
    phone: "",
    email_public: "",
    company_name: "",
    industry: "",
    street: "",
    zip: "",
    city: "",
    vat_id: "",
    dealer_type: "",
    brands: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [brandInput, setBrandInput] = useState("");

  // Available brands from vehicle_models
  const [availableBrands, setAvailableBrands] = useState<string[]>([]);

  // Load profile data + available brands
  useEffect(() => {
    if (authLoading || !user) return;

    (async () => {
      const [profileResult, brandsResult] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        supabase.from("vehicle_models").select("brand"),
      ]);

      if (profileResult.data) {
        const p = profileResult.data;
        setForm({
          first_name: p.first_name || "",
          last_name: p.last_name || "",
          phone: p.phone || "",
          email_public: p.email_public || "",
          company_name: p.company_name || "",
          industry: p.industry || "",
          street: p.street || "",
          zip: p.zip || "",
          city: p.city || "",
          vat_id: p.vat_id || "",
          dealer_type: p.dealer_type || "",
          brands: p.brands || [],
        });
      }

      if (brandsResult.data) {
        const unique = Array.from(new Set(brandsResult.data.map((r: any) => r.brand))).sort() as string[];
        setAvailableBrands(unique);
      }

      setLoading(false);
    })();
  }, [authLoading, user?.id]);

  // ─── Load all activities ─────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    const isDealer = profile?.role === "anbieter";

    (async () => {
      try {
        const activityItems: ActivityItem[] = [];

        if (!isDealer) {
          // Buyer activities
          const [tendersRes, reviewsRes, messagesRes] = await Promise.all([
            supabase
              .from("tenders")
              .select("id, status, created_at, tender_vehicles(brand, model_name), offers(id, created_at)")
              .eq("buyer_id", user.id) as any,
            supabase.from("reviews").select("id, from_user_id, to_user_id, type, created_at").or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`) as any,
            supabase.from("messages").select("id, sender_id, content, created_at").neq("sender_id", user.id).order("created_at", { ascending: false }).limit(50) as any,
          ]);

          // Offers received
          ((tendersRes as any)?.data || []).forEach((t: any) => {
            ((t.offers as any[]) || []).forEach((o: any) => {
              const vehicle = t.tender_vehicles?.[0];
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
          });

          // Messages
          ((messagesRes as any)?.data || []).forEach((m: any) => {
            activityItems.push({
              id: `msg-${m.id}`,
              type: "message",
              title: "Neue Nachricht",
              subtitle: m.content?.substring(0, 50) + (m.content?.length > 50 ? "\u2026" : ""),
              time: m.created_at,
              href: `/dashboard/nachrichten`,
            });
          });

          // Reviews received
          ((reviewsRes as any)?.data || [])
            .filter((r: any) => r.to_user_id === user.id)
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
        } else {
          // Dealer activities
          const [tendersRes, contactsRes, reviewsRes, messagesRes] = await Promise.all([
            supabase.from("tenders").select("id, created_at, tender_vehicles(brand, model_name)").eq("status", "active").order("created_at", { ascending: false }).limit(50) as any,
            supabase.from("contacts").select("id, instant_offer_id, created_at").eq("dealer_id", user.id).order("created_at", { ascending: false }).limit(50) as any,
            supabase.from("reviews").select("id, from_user_id, to_user_id, type, created_at").or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`) as any,
            supabase.from("messages").select("id, sender_id, content, created_at").neq("sender_id", user.id).order("created_at", { ascending: false }).limit(50) as any,
          ]);

          // Tenders
          ((tendersRes as any)?.data || []).forEach((t: any) => {
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

          // Contacts
          ((contactsRes as any)?.data || []).forEach((c: any) => {
            activityItems.push({
              id: `contact-${c.id}`,
              type: "offer",
              title: "Neuer Kontaktwunsch",
              subtitle: c.instant_offer_id ? "Sofort-Angebot Anfrage" : "Ausschreibungs-Anfrage",
              time: c.created_at,
              href: `/dashboard/nachrichten`,
            });
          });

          // Messages
          ((messagesRes as any)?.data || []).forEach((m: any) => {
            activityItems.push({
              id: `msg-${m.id}`,
              type: "message",
              title: "Neue Nachricht",
              subtitle: m.content?.substring(0, 50) + (m.content?.length > 50 ? "\u2026" : ""),
              time: m.created_at,
              href: `/dashboard/nachrichten`,
            });
          });

          // Reviews received
          ((reviewsRes as any)?.data || [])
            .filter((r: any) => r.to_user_id === user.id)
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
        }

        activityItems.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
        if (!cancelled) setActivities(activityItems);
      } catch (e) {
        console.error("[Profil] Activities load error:", e);
      } finally {
        if (!cancelled) setActivitiesLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [authLoading, user?.id, profile?.role]);

  const activityIcon = (type: ActivityItem["type"]) => {
    switch (type) {
      case "offer": return <Inbox size={16} className="text-emerald-600" />;
      case "message": return <MessageCircle size={16} className="text-blue-600" />;
      case "review": return <Star size={16} className="text-amber-500" />;
      case "tender": return <FileText size={16} className="text-blue-600" />;
      case "instant_offer": return <Zap size={16} className="text-purple-600" />;
    }
  };

  const update = (patch: Partial<ProfileForm>) => setForm((prev) => ({ ...prev, ...patch }));

  const isAnbieter = profile?.role === "anbieter";

  const handleSave = async () => {
    if (!user) return;

    // Lightweight email-format guard for the optional public contact email
    const trimmedEmail = form.email_public.trim();
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast.error("Bitte eine gültige E-Mail-Adresse für den öffentlichen Kontakt angeben.");
      return;
    }

    setSaving(true);

    const payload: Record<string, unknown> = {
      first_name: form.first_name || null,
      last_name: form.last_name || null,
      phone: form.phone || null,
      email_public: trimmedEmail || null,
      company_name: form.company_name || null,
      industry: form.industry || null,
      street: form.street || null,
      zip: form.zip || null,
      city: form.city || null,
      vat_id: form.vat_id || null,
      profile_completed: true,
    };

    if (isAnbieter) {
      payload.dealer_type = form.dealer_type || null;
      // Drop any brand value that no longer exists in vehicle_models (typo or
      // removed master-data entry); warn the user if anything was dropped.
      const validBrands = form.brands.filter((b) => availableBrands.includes(b));
      const droppedBrands = form.brands.filter((b) => !availableBrands.includes(b));
      if (droppedBrands.length > 0) {
        toast.warning(`Folgende Marken sind unbekannt und wurden entfernt: ${droppedBrands.join(", ")}`);
      }
      payload.brands = validBrands.length > 0 ? validBrands : null;
    }

    const { error } = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", user.id);

    setSaving(false);

    if (error) {
      toast.error("Fehler beim Speichern: " + error.message);
    } else {
      toast.success("Profil erfolgreich gespeichert!");
    }
  };

  const addBrand = (brand: string) => {
    if (brand && !form.brands.includes(brand)) {
      update({ brands: [...form.brands, brand] });
    }
    setBrandInput("");
  };

  const removeBrand = (brand: string) => {
    update({ brands: form.brands.filter((b) => b !== brand) });
  };

  const filteredBrands = availableBrands.filter(
    (b) => !form.brands.includes(b) && b.toLowerCase().includes(brandInput.toLowerCase())
  );

  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-slate-400">
        <Loader2 className="animate-spin mr-3" size={28} />
        <span className="text-lg font-semibold">Profil wird geladen…</span>
      </div>
    );
  }

  const inputClass = "h-12 bg-slate-50 border-slate-200 rounded-xl px-4 focus:bg-white transition-colors";

  return (
    <div className="min-h-[calc(100vh-80px)] pb-24">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white">
        <div className="container mx-auto max-w-3xl px-4 md:px-8 py-6 md:py-8">
          <p className="text-sm font-medium text-slate-500 mb-1">Dashboard</p>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-navy-950">Mein Profil</h1>
          <p className="text-sm text-slate-500 mt-1">
            Verwalten Sie Ihre persönlichen Daten und Unternehmensangaben.
          </p>
        </div>
      </div>

      <div className="container mx-auto max-w-3xl px-4 md:px-8 mt-6 md:mt-8 space-y-8">
        {/* Welcome banner after registration */}
        {isWelcome && (
          <div className="bg-gradient-to-r from-blue-50 to-emerald-50 border border-blue-200 rounded-2xl p-6 flex items-start gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center shrink-0">
              <PartyPopper size={24} className="text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-navy-950 mb-1">Willkommen bei proFleet!</h3>
              <p className="text-sm text-slate-600">
                Ihr Konto wurde erfolgreich erstellt. Bitte vervollständigen Sie Ihr Profil, damit Sie die Plattform vollständig nutzen können.
              </p>
            </div>
          </div>
        )}
        {/* Quick-Link: Benachrichtigungen */}
        <Link
          href="/dashboard/profil/benachrichtigungen"
          className="group flex items-center gap-4 bg-white rounded-3xl border border-slate-200 shadow-sm px-6 py-5 hover:border-blue-300 hover:shadow-md transition-all"
        >
          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
            <Bell size={20} className="text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-navy-950">Benachrichtigungen</div>
            <p className="text-sm text-slate-500 mt-0.5">
              E-Mail-Einstellungen und Newsletter verwalten.
            </p>
          </div>
          <ChevronRight
            size={20}
            className="text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all shrink-0"
          />
        </Link>

        {/* Section 1: Persönliche Daten */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-8 py-6 border-b border-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
              <User size={20} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-navy-950">Persönliche Daten</h2>
              <p className="text-sm text-slate-500">Ihre Kontaktinformationen</p>
            </div>
          </div>
          <div className="p-8 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="first_name">Vorname</Label>
                <Input
                  id="first_name"
                  value={form.first_name}
                  onChange={(e) => update({ first_name: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">Nachname</Label>
                <Input
                  id="last_name"
                  value={form.last_name}
                  onChange={(e) => update({ last_name: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">E-Mail</Label>
              <Input
                id="email"
                value={user?.email || ""}
                disabled
                className="h-12 bg-slate-100 border-slate-200 rounded-xl px-4 text-slate-500 cursor-not-allowed"
              />
              <p className="text-xs text-slate-400">Die E-Mail-Adresse kann nicht geändert werden.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Telefonnummer</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="+49 123 4567890"
                value={form.phone}
                onChange={(e) => update({ phone: e.target.value })}
                className={inputClass}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email_public">Öffentliche Kontakt-E-Mail (optional)</Label>
              <Input
                id="email_public"
                type="email"
                placeholder="kontakt@firma.de"
                value={form.email_public}
                onChange={(e) => update({ email_public: e.target.value })}
                className={inputClass}
              />
              <p className="text-xs text-slate-400">
                Wird Geschäftspartnern angezeigt, sobald ein Kontakt zustande kommt. Lass das Feld leer, wenn du nicht per E-Mail kontaktiert werden möchtest.
              </p>
            </div>
          </div>
        </div>

        {/* Section 2: Unternehmensdaten */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-8 py-6 border-b border-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
              <Building2 size={20} className="text-emerald-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-navy-950">Unternehmensdaten</h2>
              <p className="text-sm text-slate-500">Angaben zu Ihrem Unternehmen</p>
            </div>
          </div>
          <div className="p-8 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="company_name">Firmenname</Label>
              <Input
                id="company_name"
                value={form.company_name}
                onChange={(e) => update({ company_name: e.target.value })}
                className={inputClass}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="industry">Branche</Label>
              <Select value={form.industry} onValueChange={(v) => update({ industry: v })}>
                <SelectTrigger id="industry" className="h-12 bg-slate-50 border-slate-200 rounded-xl px-4">
                  <SelectValue placeholder="Branche auswählen" />
                </SelectTrigger>
                <SelectContent>
                  {INDUSTRY_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="street">Straße + Hausnummer</Label>
              <Input
                id="street"
                placeholder="Musterstraße 123"
                value={form.street}
                onChange={(e) => update({ street: e.target.value })}
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="zip">PLZ</Label>
                <Input
                  id="zip"
                  placeholder="12345"
                  value={form.zip}
                  onChange={(e) => update({ zip: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label htmlFor="city">Stadt</Label>
                <Input
                  id="city"
                  placeholder="Berlin"
                  value={form.city}
                  onChange={(e) => update({ city: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="vat_id">USt-ID</Label>
              <Input
                id="vat_id"
                placeholder="DE123456789"
                value={form.vat_id}
                onChange={(e) => update({ vat_id: e.target.value })}
                className={inputClass}
              />
              <p className="text-xs text-slate-400">Optional — wird für die Rechnungsstellung benötigt.</p>
            </div>

            {/* Dealer-specific fields */}
            {isAnbieter && (
              <>
                <div className="pt-4 border-t border-slate-100">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">Händler-Angaben</h3>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dealer_type">Händlertyp</Label>
                  <Select value={form.dealer_type ?? ""} onValueChange={(v) => update({ dealer_type: v ?? "" })}>
                    <SelectTrigger id="dealer_type" className="h-12 bg-slate-50 border-slate-200 rounded-xl px-4">
                      <SelectValue placeholder="Händlertyp auswählen" />
                    </SelectTrigger>
                    <SelectContent>
                      {DEALER_TYPE_OPTIONS.map((dt) => (
                        <SelectItem key={dt.value} value={dt.value}>{dt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Vertretene Marken</Label>
                  {form.brands.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {form.brands.map((brand) => (
                        <Badge
                          key={brand}
                          className="bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 text-sm font-semibold flex items-center gap-1.5"
                        >
                          {brand}
                          <button
                            type="button"
                            onClick={() => removeBrand(brand)}
                            className="text-blue-400 hover:text-blue-700 transition-colors"
                          >
                            <X size={14} />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="relative">
                    <Input
                      placeholder="Marke eingeben oder auswählen…"
                      value={brandInput}
                      onChange={(e) => setBrandInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (filteredBrands.length > 0) addBrand(filteredBrands[0]);
                        }
                      }}
                      className={inputClass}
                    />
                    {brandInput && filteredBrands.length > 0 && (
                      <div className="absolute z-20 top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                        {filteredBrands.slice(0, 10).map((brand) => (
                          <button
                            key={brand}
                            type="button"
                            onClick={() => addBrand(brand)}
                            className="w-full text-left px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                          >
                            {brand}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold h-14 px-10 shadow-lg shadow-blue-600/20 text-base"
          >
            {saving ? <Loader2 className="animate-spin mr-2" size={18} /> : <Save size={18} className="mr-2" />}
            Profil speichern
          </Button>
        </div>

        {/* Alle Aktivitäten */}
        <div id="aktivitaeten" className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-8 py-6 border-b border-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
              <Activity size={20} className="text-slate-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-navy-950">Alle Aktivitäten</h2>
              <p className="text-sm text-slate-500">Ihre gesamte Aktivitätshistorie</p>
            </div>
          </div>
          <div className="p-6 md:p-8">
            {activitiesLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={24} className="animate-spin text-slate-300" />
              </div>
            ) : activities.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4 text-slate-300">
                  <InboxIcon size={32} />
                </div>
                <h4 className="text-lg font-bold text-navy-950 mb-2">Noch keine Aktivitäten</h4>
                <p className="text-sm text-slate-500 max-w-xs">Ihre Aktivitäten werden hier angezeigt, sobald es Neuigkeiten gibt.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {activities.map((a) => (
                  <Link key={a.id} href={a.href} className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group/item">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 mt-0.5 group-hover/item:bg-slate-200 transition-colors">
                      {activityIcon(a.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-navy-950 truncate">{a.title}</p>
                      <p className="text-xs text-slate-500 truncate">{a.subtitle}</p>
                    </div>
                    <span className="text-xs text-slate-400 shrink-0 mt-1">{timeAgo(a.time)}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
