"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { InstantOfferCard } from "@/components/tenders/InstantOfferCard";
import { MultiSelectDropdown } from "@/components/ui-custom/MultiSelectDropdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Search,
  SlidersHorizontal,
  Zap,
  Loader2,
  X,
  Plus,
  Lock,
  UserPlus,
  LogIn,
  Sparkles,
  Info,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase";
import { useAuth } from "@/components/providers/auth-provider";
import { useSubscription } from "@/components/providers/subscription-provider";
import { HeroSection } from "@/components/ui-custom/HeroSection";
import { type InstantOfferRow } from "@/lib/instant-offers";
import { psToKwFloor, psToKwCeil } from "@/lib/vehicle-units";
import { EXTERIOR_COLOR_OPTIONS } from "@/lib/vehicle-options";

// ─── Constants ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 12;
const PUBLIC_LIMIT = 10;
type MarketplaceTab = "all" | "bookmarked" | "mine";

// ─── Advanced filter state ───────────────────────────────────────────────────

interface AdvancedFilters {
  vehicleType: "" | "PKW" | "NFZ";
  brands: string[];
  modelSeries: string[];
  modelName: string;
  trimLevel: string;
  bodyTypes: string[];
  doors: number[];
  fuelTypes: string[];
  transmission: "" | "Manuell" | "Automatik";
  awd: "" | "yes" | "no";
  powerMin: number;
  powerMax: number;
  color: string;
  metallic: "" | "yes" | "no";
  equipment: string[];
  priceMin: number;
  priceMax: number;
  leasingMin: number;
  leasingMax: number;
  financingMin: number;
  financingMax: number;
  plz: string;
  radius: string;
  deliveryBefore: string;
}

const DEFAULT_ADVANCED: AdvancedFilters = {
  vehicleType: "",
  brands: [],
  modelSeries: [],
  modelName: "",
  trimLevel: "",
  bodyTypes: [],
  doors: [],
  fuelTypes: [],
  transmission: "",
  awd: "",
  powerMin: 50,
  powerMax: 700,
  color: "",
  metallic: "",
  equipment: [],
  priceMin: 0,
  priceMax: 500000,
  leasingMin: 0,
  leasingMax: 5000,
  financingMin: 0,
  financingMax: 5000,
  plz: "",
  radius: "",
  deliveryBefore: "",
};

// ─── Equipment features ─────────────────────────────────────────────────────

interface EquipmentFeature {
  key: string;
  label: string;
  check: (eq: Record<string, unknown> | null) => boolean;
}

interface EquipmentGroup {
  label: string;
  items: EquipmentFeature[];
}

function extCheck(name: string): (eq: Record<string, unknown> | null) => boolean {
  return (eq) => !!(eq?.exteriorExtras as string[])?.includes?.(name);
}

function intCheck(name: string): (eq: Record<string, unknown> | null) => boolean {
  return (eq) => !!(eq?.interiorExtras as string[])?.includes?.(name);
}

function extItem(name: string): EquipmentFeature {
  return { key: `ext:${name}`, label: name, check: extCheck(name) };
}

function intItem(name: string): EquipmentFeature {
  return { key: `int:${name}`, label: name, check: intCheck(name) };
}

const EQUIPMENT_GROUPS: EquipmentGroup[] = [
  {
    label: "Highlights",
    items: [
      {
        key: "klimaautomatik",
        label: "Klimaautomatik",
        check: (eq) =>
          eq?.climate === "Klimaautomatik" || eq?.climate === "Automatik",
      },
      {
        key: "leder",
        label: "Lederausstattung",
        check: (eq) =>
          typeof eq?.interiorMaterial === "string" &&
          (eq.interiorMaterial as string).toLowerCase().includes("leder"),
      },
      {
        key: "einparkhilfe",
        label: "Einparkhilfe",
        check: (eq) =>
          Array.isArray(eq?.parkingAid) &&
          (eq!.parkingAid as string[]).length > 0,
      },
      {
        key: "tempomat",
        label: "Tempomat",
        check: (eq) => !!eq?.cruiseControl,
      },
    ],
  },
  {
    label: "Licht & Sicht",
    items: [
      "Adaptives Kurvenlicht", "Bi-Xenon Scheinwerfer", "Blendfreies Fernlicht",
      "Fernlichtassistent", "Kurvenlicht", "Laserlicht", "LED-Scheinwerfer",
      "LED-Tagfahrlicht", "Lichtsensor", "Nachtsicht-Assistent",
      "Nebelscheinwerfer", "Scheinwerferreinigung", "Tagfahrlicht",
      "Xenonscheinwerfer",
    ].map(extItem),
  },
  {
    label: "Sicherheit & Assistenz",
    items: [
      "ABS", "Abstandswarner", "Berganfahrassistent", "ESP",
      "Notbremsassistent", "Spurhalteassistent", "Totwinkel-Assistent",
      "Traktionskontrolle", "Verkehrszeichenerkennung",
      "Geschwindigkeitsbegrenzer", "Reifendruckkontrolle",
      "Elektr. Wegfahrsperre",
    ].map(extItem),
  },
  {
    label: "Fahrwerk & Räder",
    items: [
      "Adaptives Fahrwerk", "Luftfederung", "Sportfahrwerk",
      "Leichtmetallfelgen", "Stahlfelgen", "Allwetterreifen",
      "Sommerreifen", "Winterreifen", "Winterpaket", "Sportpaket",
    ].map(extItem),
  },
  {
    label: "Komfort & Karosserie",
    items: [
      "Abgedunkelte Scheiben", "Beheizbare Frontscheibe", "Dachreling",
      "Elektr. Heckklappe", "Faltdach", "Panorama-Dach", "Regensensor",
      "Schiebedach", "Schlüssellose Zentralverriegelung", "Servolenkung",
      "Start/Stopp-Automatik", "Zentralverriegelung", "Notrad", "Pannenkit",
      "Reserverad", "Behindertengerecht",
    ].map(extItem),
  },
  {
    label: "Infotainment & Konnektivität",
    items: [
      "Android Auto", "Apple CarPlay", "Bluetooth", "CD-Spieler",
      "Freisprecheinrichtung", "Induktionsladen Smartphones",
      "Musikstreaming integriert", "Navigationssystem", "Radio DAB",
      "Soundsystem", "Sprachsteuerung", "Touchscreen", "Tuner/Radio", "TV",
      "USB", "Volldigitales Kombiinstrument", "WLAN/Wifi Hotspot",
      "Head-Up Display",
    ].map(intItem),
  },
  {
    label: "Sitze & Komfort",
    items: [
      "Armlehne", "Beheizbares Lenkrad", "Elektr. Sitzeinstellung",
      "Elektr. Sitzeinstellung mit Memory", "Elektr. Sitzeinstellung hinten",
      "Lederlenkrad", "Lordosenstütze", "Massagesitze", "Sitzbelüftung",
      "Sitzheizung", "Sitzheizung hinten", "Sportsitze",
      "Umklappbarer Beifahrersitz", "Multifunktionslenkrad", "Schaltwippen",
    ].map(intItem),
  },
  {
    label: "Sicherheit & Überwachung",
    items: [
      "Alarmanlage", "Bordcomputer", "Elektr. Seitenspiegel",
      "Elektr. Seitenspiegel anklappbar", "Elektr. Fensterheber",
      "Innenspiegel autom. abblendend", "Isofix", "Isofix Beifahrersitz",
      "Müdigkeitswarner", "Notrufsystem", "Virtuelle Seitenspiegel",
    ].map(intItem),
  },
  {
    label: "Sonstiges Interieur",
    items: [
      "Ambiente-Beleuchtung", "Gepäckraumabtrennung", "Raucherpaket",
      "Rechtslenker", "Skisack", "Standheizung",
    ].map(intItem),
  },
];

const ALL_EQUIPMENT_FEATURES = EQUIPMENT_GROUPS.flatMap((g) => g.items);

// ─── Static options ─────────────────────────────────────────────────────────

const BODY_TYPE_OPTIONS = [
  "Limousine",
  "Kombi",
  "SUV",
  "Cabrio",
  "Coupé",
  "Van",
  "Transporter",
  "Kleinwagen",
  "Kompaktklasse",
  "Pick-up",
  "Sonstige",
];

const FUEL_TYPE_OPTIONS = [
  "Benzin",
  "Diesel",
  "Elektro",
  "Hybrid",
  "Plug-in-Hybrid",
  "Erdgas",
  "Wasserstoff",
];

const DOOR_OPTIONS = [2, 3, 4, 5];

const RADIUS_OPTIONS = [
  { value: "25", label: "25 km" },
  { value: "50", label: "50 km" },
  { value: "100", label: "100 km" },
  { value: "150", label: "150 km" },
  { value: "200", label: "200 km" },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function offerMatchesEquipment(
  offer: InstantOfferRow,
  equipmentKeys: string[]
): boolean {
  if (equipmentKeys.length === 0) return true;
  return equipmentKeys.every((key) => {
    const feat = ALL_EQUIPMENT_FEATURES.find((f) => f.key === key);
    return feat ? feat.check(offer.equipment) : true;
  });
}

function plzInRadius(
  offerPlz: string | null,
  filterPlz: string,
  radiusKm: string
): boolean {
  if (!filterPlz || !offerPlz) return true;
  if (!radiusKm) return true;
  const digits =
    radiusKm === "25" ? 3 : radiusKm === "50" ? 2 : radiusKm === "100" ? 2 : 1;
  return offerPlz.substring(0, digits) === filterPlz.substring(0, digits);
}

function formatPrice(net: number): string {
  return net.toLocaleString("de-DE", { maximumFractionDigits: 0 });
}

// URL param serialization
function filtersToParams(
  search: string,
  sortBy: string,
  filters: AdvancedFilters,
  pricingPills: string[]
): URLSearchParams {
  const p = new URLSearchParams();
  if (search) p.set("q", search);
  if (sortBy !== "newest") p.set("sort", sortBy);
  if (filters.vehicleType) p.set("type", filters.vehicleType);
  if (filters.brands.length) p.set("brand", filters.brands.join(","));
  if (filters.modelSeries.length) p.set("series", filters.modelSeries.join(","));
  if (filters.modelName) p.set("model", filters.modelName);
  if (filters.bodyTypes.length) p.set("body", filters.bodyTypes.join(","));
  if (filters.doors.length) p.set("doors", filters.doors.join(","));
  if (filters.fuelTypes.length) p.set("fuel", filters.fuelTypes.join(","));
  if (filters.transmission) p.set("trans", filters.transmission);
  if (filters.awd) p.set("awd", filters.awd);
  if (filters.powerMin > 50) p.set("ps_min", String(filters.powerMin));
  if (filters.powerMax < 700) p.set("ps_max", String(filters.powerMax));
  if (filters.color) p.set("color", filters.color);
  if (filters.metallic) p.set("metallic", filters.metallic);
  if (filters.equipment.length) p.set("equip", filters.equipment.join(","));
  if (filters.priceMin > 0) p.set("price_min", String(filters.priceMin));
  if (filters.priceMax < 500000) p.set("price_max", String(filters.priceMax));
  if (filters.leasingMin > 0) p.set("lease_min", String(filters.leasingMin));
  if (filters.leasingMax < 5000) p.set("lease_max", String(filters.leasingMax));
  if (filters.financingMin > 0) p.set("fin_min", String(filters.financingMin));
  if (filters.financingMax < 5000) p.set("fin_max", String(filters.financingMax));
  if (filters.plz) p.set("plz", filters.plz);
  if (filters.radius) p.set("radius", filters.radius);
  if (filters.deliveryBefore) p.set("delivery", filters.deliveryBefore);
  if (pricingPills.length) p.set("pricing", pricingPills.join(","));
  return p;
}

function paramsToState(p: URLSearchParams) {
  return {
    search: p.get("q") || "",
    sortBy: p.get("sort") || "newest",
    pricingPills: p.get("pricing")?.split(",").filter(Boolean) || [],
    filters: {
      ...DEFAULT_ADVANCED,
      vehicleType: (p.get("type") as AdvancedFilters["vehicleType"]) || "",
      brands: p.get("brand")?.split(",").filter(Boolean) || [],
      modelSeries: p.get("series")?.split(",").filter(Boolean) || [],
      modelName: p.get("model") || "",
      bodyTypes: p.get("body")?.split(",").filter(Boolean) || [],
      doors:
        p
          .get("doors")
          ?.split(",")
          .map(Number)
          .filter((n) => !isNaN(n)) || [],
      fuelTypes: p.get("fuel")?.split(",").filter(Boolean) || [],
      transmission:
        (p.get("trans") as AdvancedFilters["transmission"]) || "",
      awd: (p.get("awd") as AdvancedFilters["awd"]) || "",
      powerMin: Number(p.get("ps_min")) || 50,
      powerMax: Number(p.get("ps_max")) || 700,
      color: p.get("color") || "",
      metallic: (p.get("metallic") as AdvancedFilters["metallic"]) || "",
      equipment: p.get("equip")?.split(",").filter(Boolean) || [],
      priceMin: Number(p.get("price_min")) || 0,
      priceMax: Number(p.get("price_max")) || 500000,
      leasingMin: Number(p.get("lease_min")) || 0,
      leasingMax: Number(p.get("lease_max")) || 5000,
      financingMin: Number(p.get("fin_min")) || 0,
      financingMax: Number(p.get("fin_max")) || 5000,
      plz: p.get("plz") || "",
      radius: p.get("radius") || "",
      deliveryBefore: p.get("delivery") || "",
    } as AdvancedFilters,
  };
}

// ─── Component ──────────────────────────────────────────────────────────────

export function InstantOfferMarketplace() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, profile } = useAuth();
  const { canCreateInstantOffer, getInstantOfferLimit } = useSubscription();
  const [supabase] = useState(() => createClient());
  const isInitialized = useRef(false);
  const isDashboard = pathname.startsWith("/dashboard");

  const isLoggedIn = !!user && !!profile;
  const isDealer = profile?.role === "anbieter";
  const isBuyer = profile?.role === "nachfrager";

  // ── Initialize from URL ──────────────────────────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initial = useMemo(() => paramsToState(searchParams), []);

  // Quick filters (apply immediately)
  const [search, setSearch] = useState(initial.search);
  const [sortBy, setSortBy] = useState(initial.sortBy);
  const [pricingPills, setPricingPills] = useState<string[]>(
    initial.pricingPills
  );

  // Advanced filters (applied)
  const [filters, setFilters] = useState<AdvancedFilters>(initial.filters);
  // Advanced filters (draft for expanded panel)
  const [draft, setDraft] = useState<AdvancedFilters>(initial.filters);

  // UI state
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [tab, setTab] = useState<MarketplaceTab>("all");
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [expandedEquipGroups, setExpandedEquipGroups] = useState<Set<string>>(
    new Set(["Highlights"])
  );

  // Data
  const [offers, setOffers] = useState<InstantOfferRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [dbAvailable, setDbAvailable] = useState(true);

  // ── Brands & models from vehicle_models table ────────────────────────────
  const [vmBrands, setVmBrands] = useState<string[]>([]);
  const [vmAllModels, setVmAllModels] = useState<{ brand: string; model: string }[]>([]);

  useEffect(() => {
    (async () => {
      try {
        let query = supabase.from("vehicle_models").select("brand, model, vehicle_type");
        const vt = filtersOpen ? draft.vehicleType : filters.vehicleType;
        if (vt) query = query.eq("vehicle_type", vt);
        const { data } = await query;
        if (data) {
          const brands = Array.from(
            new Set(data.map((r: { brand: string }) => r.brand))
          ).filter(Boolean).sort();
          setVmBrands(brands);
          setVmAllModels(
            data
              .filter((r: { brand: string; model: string }) => r.brand && r.model)
              .map((r: { brand: string; model: string }) => ({ brand: r.brand, model: r.model }))
          );
        }
      } catch {
        // DB not available
      }
    })();
  }, [supabase, filters.vehicleType, draft.vehicleType, filtersOpen]);

  // ── Load bookmarks from DB ───────────────────────────────────────────────
  useEffect(() => {
    if (!user) {
      setBookmarkedIds(new Set());
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("bookmarks")
        .select("instant_offer_id")
        .eq("user_id", user.id);
      if (data) {
        setBookmarkedIds(new Set(data.map((b: { instant_offer_id: string }) => b.instant_offer_id)));
      }
    })();
  }, [supabase, user]);

  // ── Models filtered by selected brands ───────────────────────────────────
  const filteredModels = useMemo(() => {
    const brandsToUse = filtersOpen ? draft.brands : filters.brands;
    const models = brandsToUse.length === 0
      ? vmAllModels
      : vmAllModels.filter((m) => brandsToUse.includes(m.brand));
    return Array.from(new Set(models.map((m) => m.model))).filter(Boolean).sort();
  }, [vmAllModels, filters.brands, draft.brands, filtersOpen]);

  // ── Fetch offers ─────────────────────────────────────────────────────────
  const fetchOffers = useCallback(
    async (pageNum: number, append: boolean) => {
      if (pageNum === 0) setLoading(true);
      else setLoadingMore(true);

      try {
        // Bookmarked tab with no bookmarks → empty
        if (tab === "bookmarked" && Array.from(bookmarkedIds).length === 0) {
          if (!append) setOffers([]);
          setTotalCount(0);
          setLoading(false);
          setLoadingMore(false);
          return;
        }

        let query = supabase
          .from("instant_offers")
          .select("*", { count: "exact" })
          .eq("status", "active")
          .gt("expires_at", new Date().toISOString());

        // Tab filters
        if (tab === "bookmarked") {
          query = query.in("id", Array.from(bookmarkedIds));
        } else if (tab === "mine" && isDealer && user) {
          query = query.eq("dealer_id", user.id);
        }

        // Text search
        if (search.trim()) {
          query = query.or(
            `brand.ilike.%${search.trim()}%,model_name.ilike.%${search.trim()}%`
          );
        }

        // Vehicle type
        if (filters.vehicleType) {
          query = query.eq("vehicle_type", filters.vehicleType);
        }

        // Brands
        if (filters.brands.length > 0) {
          query = query.in("brand", filters.brands);
        }

        // Model series / model name (mutually exclusive: series takes precedence)
        if (filters.modelSeries.length > 0) {
          query = query.in("model_name", filters.modelSeries);
        } else if (filters.modelName.trim()) {
          query = query.ilike("model_name", `%${filters.modelName.trim()}%`);
        }

        // Trim level → search in model_name (no dedicated column)
        if (filters.trimLevel.trim()) {
          query = query.ilike(
            "model_name",
            `%${filters.trimLevel.trim()}%`
          );
        }

        // Body types
        if (filters.bodyTypes.length > 0) {
          query = query.in("body_type", filters.bodyTypes);
        }

        // Doors
        if (filters.doors.length > 0) {
          query = query.in("doors", filters.doors);
        }

        // Fuel types
        if (filters.fuelTypes.length > 0) {
          query = query.in("fuel_type", filters.fuelTypes);
        }

        // Transmission
        if (filters.transmission) {
          query = query.eq("transmission", filters.transmission);
        }

        // AWD
        if (filters.awd === "yes") query = query.eq("awd", true);
        else if (filters.awd === "no") query = query.eq("awd", false);

        // Power range — UI is in PS, DB stores kW
        if (filters.powerMin > 50) {
          query = query.gte("power_kw", psToKwFloor(filters.powerMin));
        }
        if (filters.powerMax < 700) {
          query = query.lte("power_kw", psToKwCeil(filters.powerMax));
        }

        // Color
        if (filters.color) {
          query = query.ilike("color", `%${filters.color}%`);
        }

        // Metallic
        if (filters.metallic === "yes") query = query.eq("metallic", true);
        else if (filters.metallic === "no")
          query = query.eq("metallic", false);

        // Price ranges (all values are net)
        if (filters.priceMin > 0)
          query = query.gte("purchase_price_net", filters.priceMin);
        if (filters.priceMax < 500000)
          query = query.lte("purchase_price_net", filters.priceMax);
        if (filters.leasingMin > 0)
          query = query.gte("leasing_rate_net", filters.leasingMin);
        if (filters.leasingMax < 5000)
          query = query.lte("leasing_rate_net", filters.leasingMax);
        if (filters.financingMin > 0)
          query = query.gte("financing_rate_net", filters.financingMin);
        if (filters.financingMax < 5000)
          query = query.lte("financing_rate_net", filters.financingMax);

        // Pricing pills (OR logic)
        if (pricingPills.length > 0) {
          const conds: string[] = [];
          if (pricingPills.includes("kauf"))
            conds.push("purchase_price_net.gt.0");
          if (pricingPills.includes("leasing"))
            conds.push("leasing_enabled.eq.true");
          if (pricingPills.includes("finanzierung"))
            conds.push("financing_enabled.eq.true");
          if (conds.length > 0) query = query.or(conds.join(","));
        }

        // Delivery before
        if (filters.deliveryBefore) {
          query = query.lte("expires_at", filters.deliveryBefore);
        }

        // PLZ exact match (no radius → server-side)
        if (filters.plz && !filters.radius) {
          query = query.eq("delivery_plz", filters.plz);
        }

        // Sort
        switch (sortBy) {
          case "savings":
            query = query.order("discount_percent", {
              ascending: false,
              nullsFirst: false,
            });
            break;
          case "price_asc":
            query = query.order("purchase_price_net", {
              ascending: true,
              nullsFirst: false,
            });
            break;
          case "price_desc":
            query = query.order("purchase_price_net", {
              ascending: false,
              nullsFirst: false,
            });
            break;
          case "power_desc":
            query = query.order("power_kw", {
              ascending: false,
              nullsFirst: false,
            });
            break;
          default:
            query = query.order("published_at", { ascending: false });
        }

        // Pagination — fetch extra when client-side filters are active
        const hasClientFilters =
          filters.equipment.length > 0 || !!(filters.plz && filters.radius);
        const fetchSize = !isLoggedIn
          ? PUBLIC_LIMIT + 10
          : hasClientFilters
            ? PAGE_SIZE * 4
            : PAGE_SIZE;
        query = query.range(
          pageNum * fetchSize,
          (pageNum + 1) * fetchSize - 1
        );

        const { data, count, error } = await query;

        if (error) {
          setDbAvailable(false);
          setOffers([]);
          setTotalCount(0);
        } else if (data) {
          setDbAvailable(true);
          let filtered = data as InstantOfferRow[];

          // Client-side: equipment filter
          if (filters.equipment.length > 0) {
            filtered = filtered.filter((o) =>
              offerMatchesEquipment(o, filters.equipment)
            );
          }
          // Client-side: PLZ + radius
          if (filters.plz && filters.radius) {
            filtered = filtered.filter((o) =>
              plzInRadius(o.delivery_plz, filters.plz, filters.radius)
            );
          }

          if (append) {
            setOffers((prev) => [...prev, ...filtered]);
          } else {
            setOffers(filtered);
          }
          if (count != null) setTotalCount(count);
        }
      } catch {
        setDbAvailable(false);
        setOffers([]);
        setTotalCount(0);
      }

      setLoading(false);
      setLoadingMore(false);
    },
    [
      supabase,
      search,
      sortBy,
      filters,
      pricingPills,
      tab,
      bookmarkedIds,
      isLoggedIn,
      isDealer,
      user,
    ]
  );

  // Re-fetch on filter change
  useEffect(() => {
    setPage(0);
    fetchOffers(0, false);
  }, [fetchOffers]);

  // ── URL sync ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isInitialized.current) {
      isInitialized.current = true;
      return;
    }
    const params = filtersToParams(search, sortBy, filters, pricingPills);
    const str = params.toString();
    const newUrl = str ? `${pathname}?${str}` : pathname;
    router.replace(newUrl, { scroll: false });
  }, [search, sortBy, filters, pricingPills, pathname, router]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleLoadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchOffers(next, true);
  };

  const handleBookmarkToggle = async (offerId: string) => {
    if (!user) return;
    const wasBookmarked = bookmarkedIds.has(offerId);

    // Optimistic update
    setBookmarkedIds((prev) => {
      const next = new Set(prev);
      if (wasBookmarked) next.delete(offerId);
      else next.add(offerId);
      return next;
    });

    // Persist to DB
    if (wasBookmarked) {
      const { error } = await supabase
        .from("bookmarks")
        .delete()
        .eq("user_id", user.id)
        .eq("instant_offer_id", offerId);
      if (error) {
        // Revert on failure
        setBookmarkedIds((prev) => new Set(prev).add(offerId));
        toast.error("Lesezeichen konnte nicht entfernt werden");
      }
    } else {
      const { error } = await supabase
        .from("bookmarks")
        .insert({ user_id: user.id, instant_offer_id: offerId });
      if (error) {
        // Revert on failure
        setBookmarkedIds((prev) => {
          const next = new Set(prev);
          next.delete(offerId);
          return next;
        });
        toast.error("Lesezeichen konnte nicht gesetzt werden");
      }
    }
  };

  const handleInquiry = async (offerId: string, dealerId: string) => {
    if (!user) return;

    // Check if contact already exists
    const { data: existing } = await supabase
      .from("contacts")
      .select("id")
      .eq("buyer_id", user.id)
      .eq("instant_offer_id", offerId)
      .maybeSingle();

    if (existing) {
      router.push(`/dashboard/nachrichten?contact=${existing.id}`);
      return;
    }

    const { data, error } = await supabase
      .from("contacts")
      .insert({
        instant_offer_id: offerId,
        buyer_id: user.id,
        dealer_id: dealerId,
      })
      .select()
      .single();

    if (error) {
      toast.error("Fehler: " + error.message);
    } else if (data) {
      router.push(`/dashboard/nachrichten?contact=${data.id}`);
    }
  };

  const handleCreateClick = () => {
    if (canCreateInstantOffer()) {
      router.push("/dashboard/sofort-angebote/neu");
    } else {
      setShowUpgradeDialog(true);
    }
  };

  const openExpandedFilters = () => {
    setDraft({ ...filters });
    setFiltersOpen(true);
  };

  const applyExpandedFilters = () => {
    setFilters({ ...draft });
    setFiltersOpen(false);
    setMobileFiltersOpen(false);
  };

  const resetAllFilters = () => {
    setSearch("");
    setSortBy("newest");
    setPricingPills([]);
    const reset = { ...DEFAULT_ADVANCED };
    setFilters(reset);
    setDraft(reset);
  };

  const togglePricingPill = (pill: string) => {
    setPricingPills((prev) =>
      prev.includes(pill) ? prev.filter((p) => p !== pill) : [...prev, pill]
    );
  };

  const toggleVehicleType = (type: "PKW" | "NFZ") => {
    const newType = filters.vehicleType === type ? "" : type;
    setFilters((f) => ({ ...f, vehicleType: newType }));
    if (filtersOpen) setDraft((d) => ({ ...d, vehicleType: newType }));
  };

  // ── Active filter pills ──────────────────────────────────────────────────

  const activeFilterPills = useMemo(() => {
    const pills: { label: string; clear: () => void }[] = [];

    if (filters.vehicleType)
      pills.push({
        label: filters.vehicleType,
        clear: () => setFilters((f) => ({ ...f, vehicleType: "" })),
      });

    filters.brands.forEach((b) =>
      pills.push({
        label: b,
        clear: () =>
          setFilters((f) => ({
            ...f,
            brands: f.brands.filter((x) => x !== b),
          })),
      })
    );

    filters.modelSeries.forEach((m) =>
      pills.push({
        label: m,
        clear: () =>
          setFilters((f) => ({
            ...f,
            modelSeries: f.modelSeries.filter((x) => x !== m),
          })),
      })
    );

    if (filters.modelName)
      pills.push({
        label: `Modell: ${filters.modelName}`,
        clear: () => setFilters((f) => ({ ...f, modelName: "" })),
      });

    filters.bodyTypes.forEach((b) =>
      pills.push({
        label: b,
        clear: () =>
          setFilters((f) => ({
            ...f,
            bodyTypes: f.bodyTypes.filter((x) => x !== b),
          })),
      })
    );

    filters.doors.forEach((d) =>
      pills.push({
        label: `${d} Türen`,
        clear: () =>
          setFilters((f) => ({
            ...f,
            doors: f.doors.filter((x) => x !== d),
          })),
      })
    );

    filters.fuelTypes.forEach((ft) =>
      pills.push({
        label: ft,
        clear: () =>
          setFilters((f) => ({
            ...f,
            fuelTypes: f.fuelTypes.filter((x) => x !== ft),
          })),
      })
    );

    if (filters.transmission)
      pills.push({
        label: filters.transmission,
        clear: () => setFilters((f) => ({ ...f, transmission: "" })),
      });

    if (filters.awd === "yes")
      pills.push({
        label: "Allrad",
        clear: () => setFilters((f) => ({ ...f, awd: "" })),
      });

    if (filters.powerMin > 50 || filters.powerMax < 700)
      pills.push({
        label: `${filters.powerMin}–${filters.powerMax} PS`,
        clear: () =>
          setFilters((f) => ({ ...f, powerMin: 50, powerMax: 700 })),
      });

    if (filters.color)
      pills.push({
        label: filters.color,
        clear: () => setFilters((f) => ({ ...f, color: "" })),
      });

    if (filters.metallic === "yes")
      pills.push({
        label: "Metallic",
        clear: () => setFilters((f) => ({ ...f, metallic: "" })),
      });

    filters.equipment.forEach((eq) => {
      const feat = ALL_EQUIPMENT_FEATURES.find((f2) => f2.key === eq);
      if (feat)
        pills.push({
          label: feat.label,
          clear: () =>
            setFilters((f) => ({
              ...f,
              equipment: f.equipment.filter((x) => x !== eq),
            })),
        });
    });

    if (filters.priceMin > 0 || filters.priceMax < 500000)
      pills.push({
        label: `${formatPrice(filters.priceMin)}–${formatPrice(filters.priceMax)} €`,
        clear: () =>
          setFilters((f) => ({ ...f, priceMin: 0, priceMax: 500000 })),
      });

    if (filters.plz)
      pills.push({
        label: `PLZ ${filters.plz}${filters.radius ? ` (${filters.radius} km)` : ""}`,
        clear: () => setFilters((f) => ({ ...f, plz: "", radius: "" })),
      });

    pricingPills.forEach((p) =>
      pills.push({
        label:
          p === "kauf"
            ? "Kauf"
            : p === "leasing"
              ? "Leasing"
              : "Finanzierung",
        clear: () =>
          setPricingPills((prev) => prev.filter((x) => x !== p)),
      })
    );

    return pills;
  }, [filters, pricingPills]);

  const remaining = totalCount - offers.length;
  const instantOfferLimit = getInstantOfferLimit();
  const viewMode = !isLoggedIn
    ? ("public" as const)
    : isDealer
      ? ("seller" as const)
      : ("buyer" as const);

  // ── Filter content (shared between desktop and mobile) ───────────────────

  const filterGroupsJsx = (
    <>
      {/* Mobile-only: Sort + Brutto/Netto */}
      <div className="lg:hidden space-y-4 pb-4 border-b border-slate-100 mb-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
            Sortierung
          </span>
          <Select value={sortBy} onValueChange={(v) => v && setSortBy(v)}>
            <SelectTrigger className="w-[190px] h-9 border-slate-200 bg-white font-medium text-navy-950 rounded-lg text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Neueste zuerst</SelectItem>
              <SelectItem value="price_asc">Preis aufsteigend</SelectItem>
              <SelectItem value="price_desc">Preis absteigend</SelectItem>
              <SelectItem value="savings">Größte Ersparnis</SelectItem>
              <SelectItem value="power_desc">Leistung absteigend</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Filter groups – 2 columns + full-width equipment */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
        {/* ── Left: Fahrzeug ── */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider pb-1 border-b border-slate-100">
            Fahrzeug
          </h3>
          <div>
            <label className="text-sm font-medium text-slate-600 mb-1 block">Fahrzeugart</label>
            <div className="flex gap-1.5">
              {(["", "PKW", "NFZ"] as const).map((t) => (
                <button
                  key={t || "alle"}
                  onClick={() => setDraft((d) => ({ ...d, vehicleType: t }))}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                    draft.vehicleType === t
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {t || "Alle"}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-slate-600 mb-1 block">Marke</label>
              <MultiSelectDropdown
                options={vmBrands}
                selected={draft.brands}
                onChange={(v) => setDraft((d) => ({ ...d, brands: v, modelSeries: [] }))}
                placeholder="Alle Marken"
                searchPlaceholder="Marke suchen..."
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-600 mb-1 block">Modellreihe</label>
              <MultiSelectDropdown
                options={filteredModels}
                selected={draft.modelSeries}
                onChange={(v) => setDraft((d) => ({ ...d, modelSeries: v }))}
                placeholder="Alle Modelle"
                searchPlaceholder="Modell suchen..."
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-slate-600 mb-1 block">Modellbezeichnung</label>
              <Input
                value={draft.modelName}
                onChange={(e) => setDraft((d) => ({ ...d, modelName: e.target.value }))}
                placeholder="z.B. 320d xDrive"
                className="h-10 rounded-xl border-slate-200"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-600 mb-1 block">Ausstattungslinie</label>
              <Input
                value={draft.trimLevel}
                onChange={(e) => setDraft((d) => ({ ...d, trimLevel: e.target.value }))}
                placeholder="z.B. Sport Line"
                className="h-10 rounded-xl border-slate-200"
              />
            </div>
          </div>

          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider pb-1 border-b border-slate-100 !mt-5">
            Farbe & Optik
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-slate-600 mb-1 block">Farbe</label>
              <Input
                value={draft.color}
                onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))}
                placeholder="z.B. Schwarz, Weiß..."
                className="h-10 rounded-xl border-slate-200"
                list="color-opts"
              />
              <datalist id="color-opts">
                {EXTERIOR_COLOR_OPTIONS.map((c) => (
                  <option key={c.name} value={c.name} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-600 mb-1 block">Metallic</label>
              <div className="flex gap-1.5">
                {([{ v: "", l: "Egal" }, { v: "yes", l: "Ja" }, { v: "no", l: "Nein" }] as const).map(({ v, l }) => (
                  <button
                    key={v}
                    onClick={() => setDraft((d) => ({ ...d, metallic: v as AdvancedFilters["metallic"] }))}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                      draft.metallic === v
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Right: Karosserie, Antrieb, Preis, Standort ── */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider pb-1 border-b border-slate-100">
            Karosserie & Antrieb
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-slate-600 mb-1 block">Karosserieform</label>
              <MultiSelectDropdown
                options={BODY_TYPE_OPTIONS}
                selected={draft.bodyTypes}
                onChange={(v) => setDraft((d) => ({ ...d, bodyTypes: v }))}
                placeholder="Alle Karosserieformen"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-600 mb-1 block">Kraftstoffart</label>
              <MultiSelectDropdown
                options={FUEL_TYPE_OPTIONS}
                selected={draft.fuelTypes}
                onChange={(v) => setDraft((d) => ({ ...d, fuelTypes: v }))}
                placeholder="Alle Kraftstoffarten"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-600 mb-1 block">Türen</label>
            <div className="flex gap-1.5">
              {DOOR_OPTIONS.map((d) => (
                <button
                  key={d}
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      doors: prev.doors.includes(d)
                        ? prev.doors.filter((x) => x !== d)
                        : [...prev.doors, d],
                    }))
                  }
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                    draft.doors.includes(d)
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-slate-600 mb-1 block">Getriebe</label>
              <div className="flex gap-1.5">
                {([{ v: "", l: "Alle" }, { v: "Manuell", l: "Manuell" }, { v: "Automatik", l: "Auto" }] as const).map(({ v, l }) => (
                  <button
                    key={v}
                    onClick={() => setDraft((d) => ({ ...d, transmission: v as AdvancedFilters["transmission"] }))}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                      draft.transmission === v
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-600 mb-1 block">Allrad</label>
              <div className="flex gap-1.5">
                {([{ v: "", l: "Egal" }, { v: "yes", l: "Ja" }, { v: "no", l: "Nein" }] as const).map(({ v, l }) => (
                  <button
                    key={v}
                    onClick={() => setDraft((d) => ({ ...d, awd: v as AdvancedFilters["awd"] }))}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                      draft.awd === v
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-600 mb-1 block">Motorleistung (PS)</label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={draft.powerMin || ""}
                onChange={(e) => setDraft((d) => ({ ...d, powerMin: Number(e.target.value) || 0 }))}
                placeholder="von"
                className="h-10 rounded-xl border-slate-200 text-center"
              />
              <span className="text-slate-300 shrink-0">—</span>
              <Input
                type="number"
                value={draft.powerMax || ""}
                onChange={(e) => setDraft((d) => ({ ...d, powerMax: Number(e.target.value) || 700 }))}
                placeholder="bis"
                className="h-10 rounded-xl border-slate-200 text-center"
              />
              <span className="text-xs text-slate-400 shrink-0">PS</span>
            </div>
          </div>

          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider pb-1 border-b border-slate-100 !mt-5">
            Preis (Netto)
          </h3>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium text-slate-600 mb-1 block">Kaufpreis</label>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  value={draft.priceMin || ""}
                  onChange={(e) => setDraft((d) => ({ ...d, priceMin: Number(e.target.value) || 0 }))}
                  placeholder="von"
                  className="h-10 rounded-xl border-slate-200 text-center text-sm"
                />
                <span className="text-slate-300 shrink-0">–</span>
                <Input
                  type="number"
                  value={draft.priceMax >= 500000 ? "" : draft.priceMax}
                  onChange={(e) => setDraft((d) => ({ ...d, priceMax: Number(e.target.value) || 500000 }))}
                  placeholder="bis"
                  className="h-10 rounded-xl border-slate-200 text-center text-sm"
                />
                <span className="text-xs text-slate-400 shrink-0">€</span>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-600 mb-1 block">Leasing/Mon.</label>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  value={draft.leasingMin || ""}
                  onChange={(e) => setDraft((d) => ({ ...d, leasingMin: Number(e.target.value) || 0 }))}
                  placeholder="von"
                  className="h-10 rounded-xl border-slate-200 text-center text-sm"
                />
                <span className="text-slate-300 shrink-0">–</span>
                <Input
                  type="number"
                  value={draft.leasingMax >= 5000 ? "" : draft.leasingMax}
                  onChange={(e) => setDraft((d) => ({ ...d, leasingMax: Number(e.target.value) || 5000 }))}
                  placeholder="bis"
                  className="h-10 rounded-xl border-slate-200 text-center text-sm"
                />
                <span className="text-xs text-slate-400 shrink-0">€</span>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-600 mb-1 block">Finanz./Mon.</label>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  value={draft.financingMin || ""}
                  onChange={(e) => setDraft((d) => ({ ...d, financingMin: Number(e.target.value) || 0 }))}
                  placeholder="von"
                  className="h-10 rounded-xl border-slate-200 text-center text-sm"
                />
                <span className="text-slate-300 shrink-0">–</span>
                <Input
                  type="number"
                  value={draft.financingMax >= 5000 ? "" : draft.financingMax}
                  onChange={(e) => setDraft((d) => ({ ...d, financingMax: Number(e.target.value) || 5000 }))}
                  placeholder="bis"
                  className="h-10 rounded-xl border-slate-200 text-center text-sm"
                />
                <span className="text-xs text-slate-400 shrink-0">€</span>
              </div>
            </div>
          </div>

          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider pb-1 border-b border-slate-100 !mt-5">
            Standort & Lieferung
          </h3>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium text-slate-600 mb-1 block">PLZ / Ort</label>
              <Input
                value={draft.plz}
                onChange={(e) => setDraft((d) => ({ ...d, plz: e.target.value }))}
                placeholder="z.B. 80331"
                className="h-10 rounded-xl border-slate-200"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-600 mb-1 block">Umkreis</label>
              <Select
                value={draft.radius || "__bw__"}
                onValueChange={(v) => setDraft((d) => ({ ...d, radius: v === "__bw__" ? "" : (v ?? "") }))}
              >
                <SelectTrigger className="h-10 border-slate-200 rounded-xl">
                  <SelectValue placeholder="Bundesweit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__bw__">Bundesweit</SelectItem>
                  {RADIUS_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-600 mb-1 block">Lieferbar bis</label>
              <Input
                type="date"
                value={draft.deliveryBefore}
                onChange={(e) => setDraft((d) => ({ ...d, deliveryBefore: e.target.value }))}
                className="h-10 rounded-xl border-slate-200"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Ausstattung (full width) ── */}
      <div className="mt-5">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider pb-1 border-b border-slate-100 mb-3">
          Ausstattung
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {EQUIPMENT_GROUPS.map((group) => {
            const isOpen = expandedEquipGroups.has(group.label);
            const selectedCount = group.items.filter((f) =>
              draft.equipment.includes(f.key)
            ).length;
            return (
              <div key={group.label} className="border border-slate-200 rounded-xl overflow-hidden">
                <button
                  onClick={() =>
                    setExpandedEquipGroups((prev) => {
                      const next = new Set(prev);
                      if (next.has(group.label)) next.delete(group.label);
                      else next.add(group.label);
                      return next;
                    })
                  }
                  className="w-full flex items-center justify-between px-3 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors"
                >
                  <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    {group.label}
                    {selectedCount > 0 && (
                      <span className="ml-1.5 inline-flex items-center justify-center text-[10px] font-bold bg-blue-600 text-white rounded-full px-1.5 py-0.5">
                        {selectedCount}
                      </span>
                    )}
                  </span>
                  <ChevronDown
                    size={14}
                    className={`text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {isOpen && (
                  <div className="grid grid-cols-2 gap-1 p-2">
                    {group.items.map((feat) => {
                      const selected = draft.equipment.includes(feat.key);
                      return (
                        <button
                          key={feat.key}
                          onClick={() =>
                            setDraft((d) => ({
                              ...d,
                              equipment: selected
                                ? d.equipment.filter((x) => x !== feat.key)
                                : [...d.equipment, feat.key],
                            }))
                          }
                          className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors text-left ${
                            selected
                              ? "bg-blue-50 text-blue-700 border border-blue-200"
                              : "bg-slate-50 text-slate-600 hover:bg-slate-100 border border-transparent"
                          }`}
                        >
                          <div
                            className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                              selected
                                ? "bg-blue-600 border-blue-600"
                                : "border-slate-300"
                            }`}
                          >
                            {selected && (
                              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                          {feat.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Action bar ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-6 border-t border-slate-200/50 mt-6">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
          {activeFilterPills.map((pill, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 text-blue-600 text-xs font-semibold"
            >
              {pill.label}
              <button
                onClick={pill.clear}
                className="hover:text-blue-800"
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3 shrink-0 flex-wrap">
          <span className="text-sm text-slate-500 font-medium whitespace-nowrap">
            {totalCount} Sofort-Angebote
          </span>
          <button
            onClick={resetAllFilters}
            className="text-sm font-medium text-slate-400 hover:text-red-500 whitespace-nowrap"
          >
            Alle zurücksetzen
          </button>
          <Button
            onClick={applyExpandedFilters}
            className="h-10 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold"
          >
            Filter anwenden
          </Button>
        </div>
      </div>
    </>
  );

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="bg-slate-50 min-h-screen">
      {/* ── Hero Header (public only) ── */}
      {!isDashboard && (
        <HeroSection
          badge={totalCount > 0 ? `${totalCount} sofort verfügbare Flottenfahrzeuge` : "Sofort-Angebote Marktplatz"}
          badgeIcon={<Zap size={14} className="text-amber-400" />}
          title="Sofort-Angebote Marktplatz"
          subtitle="Entdecken Sie exklusive Lagerfahrzeuge und Tageszulassungen deutscher Markenhändler."
        />
      )}

      {/* ── Sticky Filter Bar ── */}
      <div
        className={`sticky ${isDashboard ? "top-0" : "top-16"} z-40 bg-white border-b border-slate-200 shadow-sm`}
      >
        <div
          className={
            isDashboard
              ? "px-4 md:px-6"
              : "container mx-auto max-w-7xl px-4 md:px-8"
          }
        >
          <div className="flex items-center gap-2 md:gap-3 py-3">
            {/* Search */}
            <div className="flex items-center gap-2 flex-1 min-w-0 bg-slate-50 rounded-xl px-3 h-10">
              <Search size={16} className="text-slate-400 shrink-0" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Marke, Modell oder Ausstattung suchen..."
                className="flex-1 bg-transparent text-sm font-medium outline-none min-w-0"
              />
              {search && (
                <button onClick={() => setSearch("")}>
                  <X size={14} className="text-slate-400" />
                </button>
              )}
            </div>

            {/* Quick filter pills (desktop only) */}
            <div className="hidden lg:flex items-center gap-1.5 shrink-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <button
                onClick={() => {
                  setFilters((f) => ({ ...f, brands: [] }));
                  if (filtersOpen)
                    setDraft((d) => ({ ...d, brands: [] }));
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                  filters.brands.length === 0
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Alle Marken
              </button>
              {(["PKW", "NFZ"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => toggleVehicleType(t)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                    filters.vehicleType === t
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {t}
                </button>
              ))}
              {(["kauf", "leasing", "finanzierung"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => togglePricingPill(p)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                    pricingPills.includes(p)
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {p === "kauf"
                    ? "Kauf"
                    : p === "leasing"
                      ? "Leasing"
                      : "Finanzierung"}
                </button>
              ))}
            </div>

            {/* Erweiterte Filter button */}
            <button
              onClick={() => {
                if (typeof window !== "undefined" && window.innerWidth < 768) {
                  setDraft({ ...filters });
                  setMobileFiltersOpen(true);
                } else {
                  if (filtersOpen) applyExpandedFilters();
                  else openExpandedFilters();
                }
              }}
              className={`flex items-center gap-2 px-3 md:px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors shrink-0 ${
                filtersOpen || activeFilterPills.length > 0
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <SlidersHorizontal size={14} />
              <span className="hidden sm:inline">Erweiterte Filter</span>
              <span className="sm:hidden">Filter</span>
              {activeFilterPills.length > 0 && (
                <span className="bg-white/20 text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                  {activeFilterPills.length}
                </span>
              )}
            </button>

            {/* Sort dropdown (desktop) */}
            <div className="hidden md:block shrink-0">
              <Select value={sortBy} onValueChange={(v) => v && setSortBy(v)}>
                <SelectTrigger className="w-[180px] h-10 border-slate-200 bg-white font-medium text-navy-950 rounded-xl text-sm">
                  <SelectValue placeholder="Sortierung" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Neueste zuerst</SelectItem>
                  <SelectItem value="price_asc">Preis aufsteigend</SelectItem>
                  <SelectItem value="price_desc">Preis absteigend</SelectItem>
                  <SelectItem value="savings">Größte Ersparnis</SelectItem>
                  <SelectItem value="power_desc">
                    Leistung absteigend
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

          </div>
        </div>
      </div>

      {/* ── Expanded Filter Panel (desktop) ── */}
      {filtersOpen && (
        <div className="hidden md:block">
          <div
            className={`${isDashboard ? "px-4 md:px-6" : "container mx-auto max-w-7xl px-4 md:px-8"} py-6`}
          >
            <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-2xl shadow-2xl p-6 md:p-8 animate-in slide-in-from-top-2 duration-300">
              {filterGroupsJsx}
            </div>
          </div>
        </div>
      )}

      {/* ── Mobile Filter Bottom Sheet ── */}
      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={applyExpandedFilters}
          />
          <div className="absolute inset-x-0 bottom-0 top-12 bg-white rounded-t-3xl shadow-2xl flex flex-col animate-in slide-in-from-bottom duration-300">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
              <h2 className="text-lg font-bold text-navy-950">Filter</h2>
              <button
                onClick={applyExpandedFilters}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-navy-950 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {filterGroupsJsx}
            </div>
          </div>
        </div>
      )}

      {/* ── Main Content ── */}
      <div
        className={`${isDashboard ? "px-4 md:px-6" : "container mx-auto max-w-7xl px-4 md:px-8"} py-8`}
      >
        {/* Active filter pills (when panel is closed) */}
        {!filtersOpen && activeFilterPills.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-6">
            {activeFilterPills.map((pill, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-500/10 text-blue-600 text-xs font-semibold"
              >
                {pill.label}
                <button
                  onClick={pill.clear}
                  className="hover:text-blue-800"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
            <button
              onClick={resetAllFilters}
              className="text-xs font-semibold text-slate-400 hover:text-red-500 ml-2"
            >
              Alle löschen
            </button>
          </div>
        )}

        {/* Tab Toggle + Create Button (logged in) */}
        {isLoggedIn && (
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
            <div className="inline-flex items-center bg-slate-100 rounded-full p-1 gap-0.5">
              <button
                onClick={() => setTab("all")}
                className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${
                  tab === "all"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-600 hover:text-navy-950"
                }`}
              >
                Alle Angebote
              </button>
              {isBuyer && (
                <button
                  onClick={() => setTab("bookmarked")}
                  className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${
                    tab === "bookmarked"
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-slate-600 hover:text-navy-950"
                  }`}
                >
                  Gemerkte
                </button>
              )}
              {isDealer && (
                <button
                  onClick={() => setTab("mine")}
                  className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${
                    tab === "mine"
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-slate-600 hover:text-navy-950"
                  }`}
                >
                  Meine Angebote
                </button>
              )}
            </div>
            {isDealer && (
              <Button
                onClick={handleCreateClick}
                className="h-12 px-6 rounded-xl font-bold shadow-lg shadow-blue-500/20 flex items-center gap-2 text-white shrink-0"
                style={{
                  background: "linear-gradient(135deg, #3B82F6, #22D3EE)",
                }}
              >
                <Plus size={18} /> Sofort-Angebot erstellen
              </Button>
            )}
          </div>
        )}

        {/* Results count */}
        <div className="flex items-center justify-between mb-6">
          <span className="text-sm font-semibold text-slate-500">
            {totalCount} Ergebnisse
          </span>
        </div>

        {/* ── Results ── */}
        {loading ? (
          <div className="flex justify-center py-24">
            <Loader2 className="animate-spin text-blue-600" size={40} />
          </div>
        ) : !dbAvailable ? (
          <div className="text-center py-24">
            {isDealer ? (
              <>
                <Zap size={48} className="mx-auto text-slate-300 mb-4" />
                <p className="text-xl font-bold text-slate-400 mb-2">
                  Noch keine Sofort-Angebote vorhanden.
                </p>
                <p className="text-slate-400 mb-6">
                  Erstellen Sie jetzt Ihr erstes Sofort-Angebot!
                </p>
                <Button
                  onClick={handleCreateClick}
                  className="rounded-xl font-bold px-8 h-12 text-white"
                  style={{
                    background:
                      "linear-gradient(135deg, #3B82F6, #22D3EE)",
                  }}
                >
                  <Plus size={18} className="mr-2" /> Sofort-Angebot
                  erstellen
                </Button>
              </>
            ) : (
              <>
                <Zap size={48} className="mx-auto text-slate-300 mb-4" />
                <p className="text-xl font-bold text-slate-400 mb-2">
                  Noch keine Sofort-Angebote vorhanden.
                </p>
                <p className="text-slate-400">
                  Schauen Sie bald wieder vorbei.
                </p>
              </>
            )}
          </div>
        ) : offers.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-xl font-bold text-slate-400 mb-2">
              {tab === "bookmarked"
                ? "Noch keine gemerkten Angebote"
                : tab === "mine"
                  ? "Sie haben noch keine Sofort-Angebote erstellt"
                  : "Keine Angebote gefunden"}
            </p>
            <p className="text-slate-400 mb-6">
              {tab === "bookmarked"
                ? "Klicken Sie auf das Lesezeichen-Symbol bei einem Angebot."
                : tab === "mine"
                  ? "Erstellen Sie jetzt Ihr erstes Sofort-Angebot!"
                  : "Versuchen Sie andere Suchkriterien oder entfernen Sie Filter."}
            </p>
            {tab === "mine" && isDealer && (
              <Button
                onClick={handleCreateClick}
                className="rounded-xl font-bold px-8 h-12 text-white"
                style={{
                  background:
                    "linear-gradient(135deg, #3B82F6, #22D3EE)",
                }}
              >
                <Plus size={18} className="mr-2" /> Sofort-Angebot erstellen
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Offer grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
              {(isLoggedIn ? offers : offers.slice(0, PUBLIC_LIMIT)).map(
                (offer) => (
                  <InstantOfferCard
                    key={offer.id}
                    offer={offer}
                    viewMode={viewMode}
                    isOwnOffer={isDealer && offer.dealer_id === user?.id}
                    initialBookmarked={bookmarkedIds.has(offer.id)}
                    userId={user?.id}
                    onBookmarkToggle={
                      isBuyer
                        ? () => handleBookmarkToggle(offer.id)
                        : undefined
                    }
                    onInquiry={isBuyer ? handleInquiry : undefined}
                  />
                )
              )}
            </div>

            {/* Public: CTA + blurred cards */}
            {!isLoggedIn && totalCount > PUBLIC_LIMIT && (
              <div className="relative mt-12">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 pointer-events-none select-none">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-[420px] rounded-3xl bg-gradient-to-br from-slate-100 to-slate-200 border border-slate-200"
                      style={{ filter: "blur(8px)" }}
                    >
                      <div className="p-5 space-y-4">
                        <div className="h-48 bg-slate-300/50 rounded-2xl" />
                        <div className="h-4 bg-slate-300/50 rounded w-1/3" />
                        <div className="h-6 bg-slate-300/50 rounded w-2/3" />
                        <div className="h-4 bg-slate-300/50 rounded w-1/2" />
                        <div className="h-10 bg-slate-300/50 rounded-xl w-full mt-auto" />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-3xl shadow-2xl p-8 md:p-12 max-w-2xl w-full mx-4 text-center">
                    <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 px-4 py-1.5 rounded-full text-sm font-semibold mb-5">
                      <Sparkles size={16} /> {totalCount - PUBLIC_LIMIT}{" "}
                      weitere Angebote
                    </div>
                    <h2 className="text-2xl md:text-3xl font-black text-navy-950 mb-3">
                      Weitere Angebote verfügbar
                    </h2>
                    <p className="text-slate-600 mb-8 max-w-lg mx-auto">
                      Registrieren Sie sich kostenlos um alle
                      Sofort-Angebote zu sehen, zu filtern und Händler zu
                      kontaktieren.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                      <Link href="/registrieren">
                        <Button
                          className="h-12 px-8 rounded-xl font-bold text-white shadow-lg shadow-blue-500/20 text-base"
                          style={{
                            background:
                              "linear-gradient(135deg, #3B82F6, #22D3EE)",
                          }}
                        >
                          <UserPlus size={18} className="mr-2" /> Kostenlos
                          registrieren
                        </Button>
                      </Link>
                      <Link href="/anmelden">
                        <Button
                          variant="ghost"
                          className="h-12 px-8 rounded-xl font-bold text-slate-700 hover:text-navy-950 text-base border border-slate-200"
                        >
                          <LogIn size={18} className="mr-2" /> Anmelden
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Load more (logged in) */}
            {isLoggedIn && remaining > 0 && tab !== "bookmarked" && (
              <div className="mt-16 flex justify-center">
                <Button
                  variant="outline"
                  size="lg"
                  className="rounded-xl px-12 h-14 border-slate-300 text-slate-600 bg-white hover:bg-slate-50 hover:text-navy-950 font-bold transition-colors"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? (
                    <>
                      <Loader2
                        className="animate-spin mr-2"
                        size={18}
                      />{" "}
                      Laden...
                    </>
                  ) : (
                    `Weitere Angebote laden (${remaining} übrig)`
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Upgrade Dialog ── */}
      <Dialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-black text-navy-950">
              <Lock size={20} className="text-amber-500" /> Kontingent
              erreicht
            </DialogTitle>
            <DialogDescription className="text-slate-600 pt-2">
              Sie haben Ihr Kontingent von{" "}
              <span className="font-bold text-navy-950">
                {instantOfferLimit} aktiven Sofort-Angebot
                {instantOfferLimit !== 1 ? "en" : ""}
              </span>{" "}
              erreicht. Upgraden Sie auf{" "}
              <span className="font-bold text-blue-600">
                {instantOfferLimit === 1 ? "Pro" : "Premium"}
              </span>{" "}
              für{" "}
              {instantOfferLimit === 1
                ? "bis zu 10 Sofort-Angebote"
                : "unbegrenzte Sofort-Angebote"}
              .
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setShowUpgradeDialog(false)}
              className="rounded-xl font-semibold"
            >
              Zurück
            </Button>
            <Link href="/dashboard/abo">
              <Button
                className="rounded-xl font-bold text-white w-full sm:w-auto"
                style={{
                  background:
                    "linear-gradient(135deg, #3B82F6, #22D3EE)",
                }}
              >
                Jetzt upgraden
              </Button>
            </Link>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
