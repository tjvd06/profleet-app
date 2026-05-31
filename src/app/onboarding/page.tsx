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
  CheckCircle2,
  ClipboardList,
  Gauge,
  Handshake,
  Inbox,
  Loader2,
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
};

const STEPS = ["Willkommen", "Persönlich", "Unternehmen", "Fertig"] as const;

export default function OnboardingPage() {
  const { user, profile, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [availableBrands, setAvailableBrands] = useState<string[]>([]);
  const [brandInput, setBrandInput] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const role: UserRole = profile?.role ?? "nachfrager";
  const isAnbieter = role === "anbieter";

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

  const validateStep3 = (): string | null => {
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
    if (isAnbieter && form.brands.length === 0) {
      return "Bitte wählen Sie mindestens eine vertretene Marke aus.";
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
    if (step === 1) {
      const err = validateStep2();
      if (err) return toast.error(err);
      setStep(2);
      return;
    }

    if (step === 2) {
      const err = validateStep3();
      if (err) return toast.error(err);
      const ok = await submitProfile();
      if (ok) setStep(3);
      return;
    }

    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const handleBack = () => setStep((s) => Math.max(s - 1, 0));

  if (authLoading || loadingProfile) {
    return (
      <GlassShell role={role}>
        <div className="flex items-center justify-center py-24 text-white/70">
          <Loader2 className="animate-spin mr-3" size={24} />
          <span className="text-base font-medium">Onboarding wird geladen…</span>
        </div>
      </GlassShell>
    );
  }

  return (
    <GlassShell role={role}>
      <Stepper step={step} />

      <div className="px-8 md:px-12 pb-8 md:pb-10">
        {step === 0 && <StepWelcome role={role} firstName={form.first_name} />}
        {step === 1 && (
          <StepPersonal form={form} update={update} />
        )}
        {step === 2 && (
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
        {step === 3 && <StepFinish role={role} router={router} />}

        {step !== 3 && (
          <div className="flex items-center justify-between mt-10 pt-6 border-t border-white/10">
            {step > 0 ? (
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
                  {step === 2 ? "Profil speichern" : "Weiter"}
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
  role,
  children,
}: {
  role: UserRole;
  children: React.ReactNode;
}) {
  const roleLabel = role === "anbieter" ? "Händler-Konto" : "Nachfrager-Konto";
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
          <div className="flex items-center justify-between mb-5 px-2">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-white"
            >
              <Logo size={28} className="rounded-lg shadow-md" />
              <span className="text-base font-black tracking-tight">
                proFleet
              </span>
            </Link>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/70 bg-white/5 backdrop-blur-xl border border-white/10 rounded-full px-3 py-1.5">
              <Sparkles size={12} className="text-cyan-300" />
              {roleLabel}
            </span>
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

function Stepper({ step }: { step: number }) {
  return (
    <div className="px-8 md:px-12 pt-8 md:pt-10 pb-6">
      <div className="flex items-center gap-2">
        {STEPS.map((label, idx) => {
          const isActive = idx === step;
          const isDone = idx < step;
          return (
            <div key={label} className="flex-1 flex items-center gap-2">
              <div className="flex flex-col items-start gap-1.5 flex-1 min-w-0">
                <div className="w-full h-1 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isDone || isActive
                        ? "bg-gradient-to-r from-blue-400 to-cyan-300"
                        : "bg-transparent"
                    }`}
                    style={{ width: isDone || isActive ? "100%" : "0%" }}
                  />
                </div>
                <span
                  className={`text-[11px] font-bold uppercase tracking-wider transition-colors ${
                    isActive
                      ? "text-white"
                      : isDone
                        ? "text-white/70"
                        : "text-white/30"
                  }`}
                >
                  {label}
                </span>
              </div>
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
                  <span className="text-cyan-300 ml-1">*</span>
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

// ─── Step 4: Finish ────────────────────────────────────────────────────────

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
