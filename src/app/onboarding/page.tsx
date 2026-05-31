"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { useAuth } from "@/components/providers/auth-provider";
import { Logo } from "@/components/ui/Logo";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardList,
  Crown,
  Gauge,
  Handshake,
  Inbox,
  Loader2,
  Rocket,
  Search,
  Send,
  Sparkles,
  Target,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  DEALER_TYPES,
  DEALER_TYPE_LABELS,
  type DealerType,
  type SubscriptionTier,
  type UserRole,
} from "@/constants/enums";

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

type FeatureCard = {
  icon: React.ReactNode;
  title: string;
  body: string;
};

const FEATURE_CARDS: Record<UserRole, FeatureCard[]> = {
  nachfrager: [
    {
      icon: <ClipboardList size={22} />,
      title: "Ausschreibung erstellen",
      body: "Definieren Sie Fahrzeuge und Konditionen in Minuten.",
    },
    {
      icon: <Search size={22} />,
      title: "Angebote vergleichen",
      body: "Händler bieten, Sie behalten den Überblick.",
    },
    {
      icon: <Gauge size={22} />,
      title: "Bestpreis sichern",
      body: "Im Schnitt 11,8 Prozent unter Listenpreis.",
    },
  ],
  anbieter: [
    {
      icon: <Inbox size={22} />,
      title: "Passende Ausschreibungen",
      body: "Nur Anfragen für Ihre Marken landen in der Inbox.",
    },
    {
      icon: <Send size={22} />,
      title: "Schnell anbieten",
      body: "Konditionen direkt zur Ausschreibung hochladen.",
    },
    {
      icon: <Users size={22} />,
      title: "Neue Kunden gewinnen",
      body: "Klare Profile, faire Vergaben, transparente Vergleiche.",
    },
  ],
};

type Form = {
  first_name: string;
  last_name: string;
  phone: string;
  email_public: string;
  company_name: string;
  street: string;
  zip: string;
  city: string;
  vat_id: string;
  industry: string;
  dealer_type: string;
  brands: string[];
  subscription_tier: SubscriptionTier;
};

const EMPTY_FORM: Form = {
  first_name: "",
  last_name: "",
  phone: "",
  email_public: "",
  company_name: "",
  street: "",
  zip: "",
  city: "",
  vat_id: "",
  industry: "",
  dealer_type: "",
  brands: [],
  subscription_tier: "starter",
};

type StepKey = "welcome" | "personal" | "company" | "tariff" | "finish";

const STEP_LABELS: Record<StepKey, string> = {
  welcome: "Willkommen",
  personal: "Persönlich",
  company: "Unternehmen",
  tariff: "Tarif",
  finish: "Fertig",
};

function stepsForRole(role: UserRole): StepKey[] {
  return role === "anbieter"
    ? ["welcome", "personal", "company", "tariff", "finish"]
    : ["welcome", "personal", "company", "finish"];
}

type TariffInfo = {
  id: SubscriptionTier;
  name: string;
  price: string;
  tagline: string;
  perks: string[];
  recommended?: boolean;
};

const TARIFFS: TariffInfo[] = [
  {
    id: "starter",
    name: "Starter",
    price: "Kostenlos",
    tagline: "Plattform testen, keine Kreditkarte.",
    perks: [
      "3 Angebote pro Monat",
      "1 aktives Sofort-Angebot",
      "Grundprofil sichtbar",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "99 € / Monat",
    tagline: "Für aktiv vertreibende Händler.",
    recommended: true,
    perks: [
      "Unbegrenzt Angebote",
      "10 aktive Sofort-Angebote",
      "E-Mail-Benachrichtigungen",
      "Statistik-Dashboard",
    ],
  },
  {
    id: "premium",
    name: "Premium",
    price: "249 € / Monat",
    tagline: "Maximale Sichtbarkeit und Support.",
    perks: [
      "Unbegrenzt alles",
      "Bevorzugte Platzierung",
      "Erweiterte Statistiken",
      "Persönlicher Support",
    ],
  },
];

export default function OnboardingPage() {
  const { user, profile, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const [stepIdx, setStepIdx] = useState(0);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [availableBrands, setAvailableBrands] = useState<string[]>([]);
  const [brandInput, setBrandInput] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const role: UserRole = profile?.role ?? "nachfrager";
  const isAnbieter = role === "anbieter";
  const steps = useMemo(() => stepsForRole(role), [role]);
  const currentKey = steps[stepIdx];
  const isLastDataStep =
    currentKey === (isAnbieter ? "tariff" : "company");

  useEffect(() => {
    if (authLoading || !user) return;

    (async () => {
      const [profileRes, brandsRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase.from("vehicle_models").select("brand"),
      ]);

      if (profileRes.data) {
        const p = profileRes.data;
        setForm({
          first_name: p.first_name || "",
          last_name: p.last_name || "",
          phone: p.phone || "",
          email_public: p.email_public || "",
          company_name: p.company_name || "",
          street: p.street || "",
          zip: p.zip || "",
          city: p.city || "",
          vat_id: p.vat_id || "",
          industry: p.industry || "",
          dealer_type: p.dealer_type || "",
          brands: [],
          subscription_tier:
            (p.subscription_tier as SubscriptionTier) || "starter",
        });
      }

      if (brandsRes.data) {
        const unique = Array.from(
          new Set(brandsRes.data.map((r: any) => r.brand)),
        ).sort() as string[];
        setAvailableBrands(unique);
      }

      setLoadingProfile(false);
    })();
  }, [authLoading, user?.id]);

  const update = (patch: Partial<Form>) =>
    setForm((prev) => ({ ...prev, ...patch }));

  const filteredBrands = useMemo(
    () =>
      availableBrands.filter(
        (b) =>
          !form.brands.includes(b) &&
          b.toLowerCase().includes(brandInput.toLowerCase()),
      ),
    [availableBrands, brandInput, form.brands],
  );

  const addBrand = (brand: string) => {
    if (brand && !form.brands.includes(brand)) {
      update({ brands: [...form.brands, brand] });
    }
    setBrandInput("");
  };

  const removeBrand = (brand: string) =>
    update({ brands: form.brands.filter((b) => b !== brand) });

  const validateStep2 = (): string | null => {
    if (!form.phone.trim()) return "Bitte geben Sie eine Telefonnummer an.";
    if (form.email_public.trim()) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email_public.trim())) {
        return "Bitte eine gültige öffentliche E-Mail-Adresse angeben.";
      }
    }
    return null;
  };

  const validateCompany = (): string | null => {
    if (!form.company_name.trim()) return "Bitte geben Sie Ihren Firmennamen an.";
    if (!form.street.trim()) return "Bitte geben Sie die Straße an.";
    if (!form.zip.trim()) return "Bitte geben Sie die PLZ an.";
    if (!form.city.trim()) return "Bitte geben Sie die Stadt an.";
    if (!isAnbieter && !form.industry) {
      return "Bitte wählen Sie eine Branche aus.";
    }
    if (isAnbieter && !form.dealer_type) {
      return "Bitte wählen Sie einen Händler-Typ aus.";
    }
    return null;
  };

  const submitProfile = async (): Promise<boolean> => {
    if (!user) return false;
    setSubmitting(true);

    const payload: Record<string, unknown> = {
      first_name: form.first_name.trim() || null,
      last_name: form.last_name.trim() || null,
      phone: form.phone.trim() || null,
      email_public: form.email_public.trim() || null,
      company_name: form.company_name.trim() || null,
      street: form.street.trim() || null,
      zip: form.zip.trim() || null,
      city: form.city.trim() || null,
      vat_id: form.vat_id.trim() || null,
      profile_completed: true,
    };

    if (isAnbieter) {
      payload.dealer_type = form.dealer_type || null;
      payload.subscription_tier = form.subscription_tier;
    } else {
      payload.industry = form.industry || null;
    }

    const { error: profileErr } = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", user.id);

    if (profileErr) {
      setSubmitting(false);
      toast.error("Fehler beim Speichern: " + profileErr.message);
      return false;
    }

    if (isAnbieter) {
      const validBrands = form.brands.filter((b) =>
        availableBrands.includes(b),
      );

      const { error: delErr } = await supabase
        .from("dealer_brands")
        .delete()
        .eq("dealer_id", user.id);
      if (delErr) {
        setSubmitting(false);
        toast.error("Marken-Speicherung fehlgeschlagen: " + delErr.message);
        return false;
      }

      if (validBrands.length > 0) {
        const { error: insErr } = await supabase
          .from("dealer_brands")
          .insert(
            validBrands.map((b) => ({ dealer_id: user.id, brand: b })),
          );
        if (insErr) {
          setSubmitting(false);
          toast.error("Marken-Speicherung fehlgeschlagen: " + insErr.message);
          return false;
        }
      }
    }

    setSubmitting(false);
    return true;
  };

  const handleNext = async () => {
    if (currentKey === "personal") {
      const err = validateStep2();
      if (err) return toast.error(err);
      setStepIdx((s) => s + 1);
      return;
    }

    if (currentKey === "company") {
      const err = validateCompany();
      if (err) return toast.error(err);
      // For Nachfrager, company is the last data step → submit and finish.
      // For Anbieter, tariff step comes next; just advance.
      if (!isAnbieter) {
        const ok = await submitProfile();
        if (ok) setStepIdx((s) => s + 1);
      } else {
        setStepIdx((s) => s + 1);
      }
      return;
    }

    if (currentKey === "tariff") {
      const ok = await submitProfile();
      if (ok) setStepIdx((s) => s + 1);
      return;
    }

    setStepIdx((s) => Math.min(s + 1, steps.length - 1));
  };

  const handleBack = () => setStepIdx((s) => Math.max(s - 1, 0));

  if (authLoading || loadingProfile) {
    return (
      <GlassShell>
        <div className="flex items-center justify-center py-24 text-white/70">
          <Loader2 className="animate-spin mr-3" size={24} />
          <span className="text-base font-medium">Onboarding wird geladen…</span>
        </div>
      </GlassShell>
    );
  }

  return (
    <GlassShell>
      <Stepper steps={steps} stepIdx={stepIdx} />

      <div className="px-8 md:px-12 pb-8 md:pb-10">
        {currentKey === "welcome" && (
          <StepWelcome role={role} firstName={form.first_name} />
        )}
        {currentKey === "personal" && (
          <StepPersonal form={form} update={update} />
        )}
        {currentKey === "company" && (
          <StepCompany
            form={form}
            update={update}
            isAnbieter={isAnbieter}
            availableBrands={availableBrands}
            filteredBrands={filteredBrands}
            brandInput={brandInput}
            setBrandInput={setBrandInput}
            addBrand={addBrand}
            removeBrand={removeBrand}
          />
        )}
        {currentKey === "tariff" && (
          <StepTariff
            selected={form.subscription_tier}
            onSelect={(tier) => update({ subscription_tier: tier })}
          />
        )}
        {currentKey === "finish" && <StepFinish role={role} router={router} />}

        {currentKey !== "finish" && (
          <div className="flex items-center justify-between mt-10 pt-6 border-t border-white/10">
            {stepIdx > 0 ? (
              <button
                type="button"
                onClick={handleBack}
                className="inline-flex items-center gap-2 px-5 h-11 rounded-xl text-sm font-semibold text-white/70 hover:text-white hover:bg-white/5 transition-colors"
              >
                <ArrowLeft size={16} />
                Zurück
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={handleNext}
              disabled={submitting}
              className="inline-flex items-center gap-2 px-7 h-11 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-blue-500 to-cyan-400 hover:from-blue-400 hover:to-cyan-300 shadow-lg shadow-blue-500/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <>
                  {isLastDataStep ? "Profil speichern" : "Weiter"}
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </GlassShell>
  );
}

// ─── GlassShell ────────────────────────────────────────────────────────────

function GlassShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-slate-950 text-white">
      {/* Multi-color radial gradient orbs */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: [
            "radial-gradient(45% 55% at 18% 22%, rgba(59,130,246,0.45), transparent 60%)",
            "radial-gradient(45% 55% at 82% 28%, rgba(168,85,247,0.40), transparent 60%)",
            "radial-gradient(50% 50% at 70% 90%, rgba(34,211,238,0.35), transparent 60%)",
            "radial-gradient(40% 50% at 8% 85%, rgba(99,102,241,0.35), transparent 60%)",
          ].join(", "),
        }}
      />
      {/* Subtle dot pattern */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      />

      <div className="relative z-10 min-h-screen w-full flex items-center justify-center p-4 md:p-8">
        <div className="w-full max-w-3xl">
          {/* Header above card */}
          <div className="flex items-center justify-center mb-5 px-2">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-white"
            >
              <Logo size={28} className="rounded-lg shadow-md" />
              <span className="text-base font-black tracking-tight">
                proFleet
              </span>
            </Link>
          </div>

          {/* Glass card */}
          <div
            className="relative rounded-3xl border border-white/10 bg-white/[0.04] shadow-2xl shadow-black/30 overflow-hidden"
            style={{
              backdropFilter: "blur(28px) saturate(1.4)",
              WebkitBackdropFilter: "blur(28px) saturate(1.4)",
            }}
          >
            {children}
          </div>

          <p className="text-center text-xs text-white/40 mt-5">
            Sie können dieses Onboarding einmal durchlaufen. Alle Angaben sind später unter Profil bearbeitbar.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Stepper ───────────────────────────────────────────────────────────────

function Stepper({ steps, stepIdx }: { steps: StepKey[]; stepIdx: number }) {
  return (
    <div className="px-8 md:px-12 pt-8 md:pt-10 pb-6">
      <div className="flex items-center justify-center gap-3">
        {steps.map((key, idx) => {
          const isActive = idx === stepIdx;
          const isDone = idx < stepIdx;
          return (
            <div key={key} className="flex items-center gap-2">
              <div
                className={`rounded-full transition-all duration-500 ${
                  isActive
                    ? "h-2.5 w-2.5 bg-gradient-to-r from-blue-400 to-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.6)] scale-110"
                    : isDone
                      ? "h-2 w-2 bg-white/70"
                      : "h-2 w-2 bg-white/20"
                }`}
                aria-label={`Schritt ${idx + 1} ${isActive ? "(aktiv)" : isDone ? "(abgeschlossen)" : ""}`}
              />
              {isActive && (
                <span className="text-[11px] font-bold uppercase tracking-wider text-white">
                  {STEP_LABELS[key]}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 1: Welcome ───────────────────────────────────────────────────────

function StepWelcome({
  role,
  firstName,
}: {
  role: UserRole;
  firstName: string;
}) {
  const cards = FEATURE_CARDS[role];
  const greeting = firstName ? `Willkommen, ${firstName}.` : "Willkommen bei proFleet.";

  return (
    <div className="py-2">
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
        {greeting}
      </h1>
      <p className="text-base text-white/70 mt-3 max-w-2xl">
        Lassen Sie uns Ihr Konto einrichten. In wenigen Schritten sind Sie startklar.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-10">
        {cards.map((card) => (
          <div
            key={card.title}
            className="rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition-colors p-5"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/30 to-cyan-400/30 border border-white/10 flex items-center justify-center text-cyan-200 mb-4">
              {card.icon}
            </div>
            <h3 className="text-base font-bold text-white mb-1.5">
              {card.title}
            </h3>
            <p className="text-sm text-white/65 leading-relaxed">{card.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Step 2: Personal ──────────────────────────────────────────────────────

function StepPersonal({
  form,
  update,
}: {
  form: Form;
  update: (patch: Partial<Form>) => void;
}) {
  return (
    <div className="py-2 max-w-2xl">
      <h2 className="text-2xl font-bold tracking-tight">Ihre Daten</h2>
      <p className="text-sm text-white/65 mt-2">
        Wir nutzen diese Angaben für Rückfragen und Ihre Kontaktanzeige.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-8">
        <GlassField label="Vorname" htmlFor="first_name">
          <GlassInput
            id="first_name"
            value={form.first_name}
            onChange={(e) => update({ first_name: e.target.value })}
            placeholder="Max"
          />
        </GlassField>
        <GlassField label="Nachname" htmlFor="last_name">
          <GlassInput
            id="last_name"
            value={form.last_name}
            onChange={(e) => update({ last_name: e.target.value })}
            placeholder="Mustermann"
          />
        </GlassField>
      </div>

      <div className="mt-5">
        <GlassField
          label="Geschäftliche Telefonnummer"
          htmlFor="phone"
          required
        >
          <GlassInput
            id="phone"
            type="tel"
            value={form.phone}
            onChange={(e) => update({ phone: e.target.value })}
            placeholder="+49 30 1234567"
          />
        </GlassField>
      </div>

      <div className="mt-5">
        <GlassField
          label="Öffentliche Kontakt-E-Mail (optional)"
          htmlFor="email_public"
          hint="Falls leer, verwenden wir Ihre Anmelde-E-Mail."
        >
          <GlassInput
            id="email_public"
            type="email"
            value={form.email_public}
            onChange={(e) => update({ email_public: e.target.value })}
            placeholder="kontakt@firma.de"
          />
        </GlassField>
      </div>
    </div>
  );
}

// ─── Step 3: Company ───────────────────────────────────────────────────────

function StepCompany({
  form,
  update,
  isAnbieter,
  availableBrands,
  filteredBrands,
  brandInput,
  setBrandInput,
  addBrand,
  removeBrand,
}: {
  form: Form;
  update: (patch: Partial<Form>) => void;
  isAnbieter: boolean;
  availableBrands: string[];
  filteredBrands: string[];
  brandInput: string;
  setBrandInput: (v: string) => void;
  addBrand: (b: string) => void;
  removeBrand: (b: string) => void;
}) {
  return (
    <div className="py-2 max-w-2xl">
      <h2 className="text-2xl font-bold tracking-tight">
        {isAnbieter ? "Ihr Händlerprofil" : "Ihr Unternehmen"}
      </h2>
      <p className="text-sm text-white/65 mt-2">
        {isAnbieter
          ? "Diese Angaben bestimmen, welche Ausschreibungen Ihnen angeboten werden."
          : "Diese Angaben sind für Händler sichtbar, sobald Sie eine Ausschreibung starten."}
      </p>

      <div className="mt-8 space-y-5">
        <GlassField label="Firmenname" htmlFor="company_name" required>
          <GlassInput
            id="company_name"
            value={form.company_name}
            onChange={(e) => update({ company_name: e.target.value })}
            placeholder="Mustermann GmbH"
          />
        </GlassField>

        <GlassField label="Straße und Hausnummer" htmlFor="street" required>
          <GlassInput
            id="street"
            value={form.street}
            onChange={(e) => update({ street: e.target.value })}
            placeholder="Musterstraße 12"
          />
        </GlassField>

        <div className="grid grid-cols-3 gap-4">
          <GlassField label="PLZ" htmlFor="zip" required>
            <GlassInput
              id="zip"
              value={form.zip}
              onChange={(e) => update({ zip: e.target.value })}
              placeholder="10115"
            />
          </GlassField>
          <div className="col-span-2">
            <GlassField label="Stadt" htmlFor="city" required>
              <GlassInput
                id="city"
                value={form.city}
                onChange={(e) => update({ city: e.target.value })}
                placeholder="Berlin"
              />
            </GlassField>
          </div>
        </div>

        <GlassField
          label="USt-IdNr."
          htmlFor="vat_id"
          hint="Optional. Wird für die Rechnungsstellung benötigt."
        >
          <GlassInput
            id="vat_id"
            value={form.vat_id}
            onChange={(e) => update({ vat_id: e.target.value })}
            placeholder="DE123456789"
          />
        </GlassField>

        {!isAnbieter && (
          <GlassField label="Branche" htmlFor="industry" required>
            <GlassSelect
              id="industry"
              value={form.industry}
              onChange={(e) => update({ industry: e.target.value })}
            >
              <option value="" disabled>
                Branche auswählen
              </option>
              {INDUSTRY_OPTIONS.map((opt) => (
                <option key={opt} value={opt} className="bg-slate-900">
                  {opt}
                </option>
              ))}
            </GlassSelect>
          </GlassField>
        )}

        {isAnbieter && (
          <>
            <GlassField label="Händler-Typ" htmlFor="dealer_type" required>
              <GlassSelect
                id="dealer_type"
                value={form.dealer_type}
                onChange={(e) => update({ dealer_type: e.target.value })}
              >
                <option value="" disabled>
                  Händler-Typ auswählen
                </option>
                {DEALER_TYPES.map((dt) => (
                  <option key={dt} value={dt} className="bg-slate-900">
                    {DEALER_TYPE_LABELS[dt as DealerType]}
                  </option>
                ))}
              </GlassSelect>
            </GlassField>

            <div>
              <div className="flex items-baseline justify-between">
                <label
                  htmlFor="brand-input"
                  className="text-sm font-semibold text-white"
                >
                  Vertretene Marken
                  <span className="text-white/40 ml-1 font-normal">(optional)</span>
                </label>
                <span className="text-xs text-white/50">
                  {form.brands.length} ausgewählt
                </span>
              </div>

              <div className="relative mt-2">
                <label
                  htmlFor="brand-input"
                  className="flex flex-wrap items-center gap-2 min-h-12 px-3 py-2 bg-white/[0.06] border border-white/15 rounded-xl cursor-text transition-colors focus-within:bg-white/[0.1] focus-within:border-cyan-400/60 focus-within:ring-2 focus-within:ring-cyan-400/20"
                >
                  {form.brands.map((brand) => (
                    <span
                      key={brand}
                      className="inline-flex items-center gap-1 bg-gradient-to-r from-blue-500 to-cyan-400 text-white pl-3 pr-1 py-1 rounded-full text-sm font-semibold shadow-sm"
                    >
                      {brand}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          removeBrand(brand);
                        }}
                        aria-label={`${brand} entfernen`}
                        className="w-5 h-5 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center transition-colors"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                  <input
                    id="brand-input"
                    type="text"
                    placeholder={
                      form.brands.length === 0
                        ? "Marke suchen und hinzufügen…"
                        : "Weitere Marke…"
                    }
                    value={brandInput}
                    onChange={(e) => setBrandInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (filteredBrands.length > 0)
                          addBrand(filteredBrands[0]);
                      } else if (
                        e.key === "Backspace" &&
                        brandInput === "" &&
                        form.brands.length > 0
                      ) {
                        e.preventDefault();
                        removeBrand(form.brands[form.brands.length - 1]);
                      }
                    }}
                    className="flex-1 min-w-[140px] bg-transparent outline-none border-0 text-sm text-white placeholder:text-white/40 py-1"
                  />
                </label>
                {brandInput && (
                  <div className="absolute z-30 top-full mt-2 w-full bg-slate-900/95 backdrop-blur-xl border border-white/15 rounded-xl shadow-2xl max-h-56 overflow-y-auto">
                    {filteredBrands.length > 0 ? (
                      filteredBrands.slice(0, 10).map((brand, idx) => (
                        <button
                          key={brand}
                          type="button"
                          onClick={() => addBrand(brand)}
                          className={`w-full text-left px-4 py-2.5 text-sm font-medium text-white/85 hover:bg-white/10 hover:text-white transition-colors ${
                            idx === 0 ? "bg-white/5" : ""
                          }`}
                        >
                          {brand}
                          {idx === 0 && (
                            <span className="ml-2 text-[10px] uppercase tracking-wider text-cyan-300 font-bold">
                              Enter
                            </span>
                          )}
                        </button>
                      ))
                    ) : availableBrands.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-white/50 italic">
                        Markenliste wird geladen…
                      </div>
                    ) : (
                      <div className="px-4 py-3 text-sm text-white/50 italic">
                        Keine passende Marke gefunden.
                      </div>
                    )}
                  </div>
                )}
              </div>
              <p className="text-xs text-white/45 mt-2">
                Sie erhalten Benachrichtigungen für neue Ausschreibungen, die zu Ihren Marken passen.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Step Tariff (Anbieter only) ───────────────────────────────────────────

function StepTariff({
  selected,
  onSelect,
}: {
  selected: SubscriptionTier;
  onSelect: (tier: SubscriptionTier) => void;
}) {
  const tariffIcon = (id: SubscriptionTier) => {
    if (id === "starter") return <Rocket size={18} />;
    if (id === "pro") return <Sparkles size={18} />;
    return <Crown size={18} />;
  };

  return (
    <div className="py-2">
      <h2 className="text-2xl font-bold tracking-tight">Welcher Tarif passt zu Ihnen?</h2>
      <p className="text-sm text-white/65 mt-2 max-w-2xl">
        Starten Sie kostenlos und wechseln Sie jederzeit. Pro und Premium werden separat abgerechnet, wir kontaktieren Sie nach Ihrer Auswahl.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
        {TARIFFS.map((tariff) => {
          const isSelected = selected === tariff.id;
          return (
            <button
              key={tariff.id}
              type="button"
              onClick={() => onSelect(tariff.id)}
              className={`relative text-left rounded-2xl border p-5 transition-all ${
                isSelected
                  ? "border-cyan-300/70 bg-gradient-to-br from-blue-500/15 to-cyan-400/10 shadow-lg shadow-cyan-500/20"
                  : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20"
              }`}
            >
              {tariff.recommended && (
                <span className="absolute -top-2.5 right-4 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-white bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full px-2.5 py-1 shadow-md">
                  Empfohlen
                </span>
              )}
              <div className="flex items-center gap-2.5 mb-3">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
                    isSelected
                      ? "bg-gradient-to-br from-blue-500/40 to-cyan-400/40 border-white/20 text-cyan-100"
                      : "bg-white/5 border-white/10 text-white/70"
                  }`}
                >
                  {tariffIcon(tariff.id)}
                </div>
                <h3 className="text-base font-bold text-white">{tariff.name}</h3>
              </div>
              <p className="text-xl font-bold text-white">{tariff.price}</p>
              <p className="text-xs text-white/55 mt-1 mb-4">{tariff.tagline}</p>
              <ul className="space-y-1.5">
                {tariff.perks.map((perk) => (
                  <li
                    key={perk}
                    className="flex items-start gap-2 text-xs text-white/75"
                  >
                    <Check
                      size={13}
                      className={`mt-0.5 flex-shrink-0 ${
                        isSelected ? "text-cyan-300" : "text-white/40"
                      }`}
                    />
                    <span>{perk}</span>
                  </li>
                ))}
              </ul>
              {isSelected && (
                <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-gradient-to-br from-blue-400 to-cyan-300 flex items-center justify-center shadow-md">
                  <Check size={12} className="text-white" strokeWidth={3} />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step Finish ───────────────────────────────────────────────────────────

function StepFinish({
  role,
  router,
}: {
  role: UserRole;
  router: ReturnType<typeof useRouter>;
}) {
  const isAnbieter = role === "anbieter";
  return (
    <div className="py-6 text-center max-w-2xl mx-auto">
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-400/30 to-cyan-400/30 border border-white/15 mb-6 shadow-xl shadow-emerald-500/20">
        <CheckCircle2 size={42} className="text-emerald-300" />
      </div>

      <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
        Ihr Konto ist startklar.
      </h2>
      <p className="text-base text-white/70 mt-3">
        {isAnbieter
          ? "Sehen Sie sich passende Ausschreibungen an und geben Sie Ihr erstes Angebot ab."
          : "Erstellen Sie jetzt Ihre erste Ausschreibung oder erkunden Sie das Dashboard."}
      </p>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-10">
        <button
          type="button"
          onClick={() =>
            router.push(
              isAnbieter
                ? "/dashboard/eingang"
                : "/dashboard/ausschreibungen/neu",
            )
          }
          className="inline-flex items-center gap-2 px-6 h-12 rounded-xl text-sm font-bold text-white bg-white/10 hover:bg-white/15 border border-white/15 transition-colors"
        >
          {isAnbieter ? (
            <>
              <Inbox size={16} />
              Ausschreibungen ansehen
            </>
          ) : (
            <>
              <Target size={16} />
              Erste Ausschreibung erstellen
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => router.push("/dashboard?welcome=1")}
          className="inline-flex items-center gap-2 px-7 h-12 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-blue-500 to-cyan-400 hover:from-blue-400 hover:to-cyan-300 shadow-lg shadow-blue-500/30 transition-all"
        >
          <Handshake size={16} />
          Zum Dashboard
        </button>
      </div>
    </div>
  );
}

// ─── Glass UI primitives ───────────────────────────────────────────────────

function GlassField({
  label,
  htmlFor,
  required,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-sm font-semibold text-white mb-2"
      >
        {label}
        {required && <span className="text-cyan-300 ml-1">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-white/45 mt-2">{hint}</p>}
    </div>
  );
}

function GlassInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full h-12 bg-white/[0.06] border border-white/15 rounded-xl px-4 text-sm text-white placeholder:text-white/35 outline-none transition-colors focus:bg-white/[0.1] focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/20"
    />
  );
}

function GlassSelect(
  props: React.SelectHTMLAttributes<HTMLSelectElement> & {
    children: React.ReactNode;
  },
) {
  const { children, ...rest } = props;
  return (
    <select
      {...rest}
      className="w-full h-12 bg-white/[0.06] border border-white/15 rounded-xl px-4 text-sm text-white outline-none transition-colors focus:bg-white/[0.1] focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/20 appearance-none cursor-pointer"
    >
      {children}
    </select>
  );
}
