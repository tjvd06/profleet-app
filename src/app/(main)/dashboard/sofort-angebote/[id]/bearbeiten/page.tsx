"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { uuid } from "@/types/vehicle";
import {
  ChevronLeft, Plus, Minus, Loader2, CheckCircle, Camera,
  MapPin, Euro, Clock, Truck, FileText, Trash2, UploadCloud,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { SITE_URL } from "@/lib/site";
import { useAuth } from "@/components/providers/auth-provider";
import { VehicleConfigForm } from "@/components/wizard/VehicleConfigForm";
import { ImageUpload, type ImageItem } from "@/components/ui-custom/ImageUpload";
import type { VehicleConfig } from "@/types/vehicle";
import { buildEquipmentJson, dbRowToVehicleConfig } from "@/types/vehicle";
import { type InstantOfferRow, getImageUrl, getConfigDocUrl } from "@/lib/instant-offers";

const RADIUS_OPTIONS = [25, 50, 75, 100, 150, 200];

export default function EditInstantOfferPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const supabase = createClient();
  const offerId = params.id as string;

  // Loading existing data
  const [initialLoading, setInitialLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [existingOffer, setExistingOffer] = useState<InstantOfferRow | null>(null);

  // Vehicle config
  const [vehicle, setVehicle] = useState<VehicleConfig | null>(null);

  // Quantity
  const [quantity, setQuantity] = useState(1);

  // Images — mix of existing (storagePath set) and new (file set)
  const [images, setImages] = useState<ImageItem[]>([]);

  // Config documents — existing entries from DB + new files
  const [existingConfigDocs, setExistingConfigDocs] = useState<{ path: string; name: string }[]>([]);
  const [newConfigDocs, setNewConfigDocs] = useState<File[]>([]);

  // Delivery
  const [deliveryPlz, setDeliveryPlz] = useState("");
  const [deliveryCity, setDeliveryCity] = useState("");
  const [deliveryRadius, setDeliveryRadius] = useState(100);

  // Pricing
  const [purchasePriceNet, setPurchasePriceNet] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");

  // Leasing
  const [leasingEnabled, setLeasingEnabled] = useState(false);
  const [leasingRate, setLeasingRate] = useState("");
  const [leasingDuration, setLeasingDuration] = useState("36");
  const [leasingMileage, setLeasingMileage] = useState("15000");
  const [leasingConditions, setLeasingConditions] = useState("");

  // Financing
  const [financingEnabled, setFinancingEnabled] = useState(false);
  const [financingRate, setFinancingRate] = useState("");
  const [financingDuration, setFinancingDuration] = useState("48");
  const [financingDownpayment, setFinancingDownpayment] = useState("");
  const [financingConditions, setFinancingConditions] = useState("");

  // Additional costs
  const [transferCost, setTransferCost] = useState("");
  const [registrationCost, setRegistrationCost] = useState("");

  // Duration
  const [duration, setDuration] = useState(14);

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  // Computed
  const purchaseNet = parseFloat(purchasePriceNet) || 0;
  const transfer = parseFloat(transferCost) || 0;
  const registration = parseFloat(registrationCost) || 0;
  const totalPrice = purchaseNet + transfer + registration;
  const isValid = vehicle?.brand != null && vehicle?.model != null && purchaseNet > 0;

  /* -------------------------------------------------------------- */
  /* Fetch existing offer and populate form                          */
  /* -------------------------------------------------------------- */
  useEffect(() => {
    if (!offerId) return;
    (async () => {
      const { data, error: fetchError } = await supabase
        .from("instant_offers")
        .select("*")
        .eq("id", offerId)
        .single();

      if (fetchError || !data) {
        setNotFound(true);
        setInitialLoading(false);
        return;
      }

      const offer = data as InstantOfferRow;
      setExistingOffer(offer);

      // Vehicle config from DB row
      setVehicle(dbRowToVehicleConfig(offer as unknown as Record<string, unknown>));

      // Quantity
      setQuantity(offer.quantity);

      // Existing images → ImageItem with storagePath
      if (offer.images && offer.images.length > 0) {
        setImages(
          offer.images.map((path) => ({
            id: uuid(),
            preview: getImageUrl(path),
            storagePath: path,
          }))
        );
      }

      // Config documents
      if (offer.config_documents && offer.config_documents.length > 0) {
        setExistingConfigDocs(offer.config_documents as { path: string; name: string }[]);
      }

      // Delivery
      setDeliveryPlz(offer.delivery_plz || "");
      setDeliveryCity(offer.delivery_city || "");
      setDeliveryRadius(offer.delivery_radius || 100);

      // Pricing
      setPurchasePriceNet(offer.purchase_price_net != null ? String(offer.purchase_price_net) : "");
      setDiscountPercent(offer.discount_percent != null ? String(offer.discount_percent) : "");

      // Leasing
      setLeasingEnabled(offer.leasing_enabled);
      setLeasingRate(offer.leasing_rate_net != null ? String(offer.leasing_rate_net) : "");
      setLeasingDuration(offer.leasing_duration != null ? String(offer.leasing_duration) : "36");
      setLeasingMileage(offer.leasing_mileage != null ? String(offer.leasing_mileage) : "15000");
      setLeasingConditions(offer.leasing_conditions || "");

      // Financing
      setFinancingEnabled(offer.financing_enabled);
      setFinancingRate(offer.financing_rate_net != null ? String(offer.financing_rate_net) : "");
      setFinancingDuration(offer.financing_duration != null ? String(offer.financing_duration) : "48");
      setFinancingDownpayment(offer.financing_downpayment != null ? String(offer.financing_downpayment) : "");
      setFinancingConditions(offer.financing_conditions || "");

      // Additional costs
      setTransferCost(offer.transfer_cost != null ? String(offer.transfer_cost) : "");
      setRegistrationCost(offer.registration_cost != null ? String(offer.registration_cost) : "");

      // Duration
      setDuration(offer.duration_days);

      setInitialLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerId]);

  /* -------------------------------------------------------------- */
  /* Upload only NEW images, return all paths in order               */
  /* -------------------------------------------------------------- */
  const resolveImagePaths = async (userId: string): Promise<string[]> => {
    const paths: string[] = [];
    for (const img of images) {
      if (img.storagePath) {
        // Existing image — keep its storage path
        paths.push(img.storagePath);
      } else if (img.file) {
        // New image — upload to storage
        const ext = img.file.name.split(".").pop() || "jpg";
        const path = `${userId}/${uuid()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("instant-offer-images")
          .upload(path, img.file, { contentType: img.file.type });
        if (uploadError) throw new Error(`Bild-Upload fehlgeschlagen: ${uploadError.message}`);
        paths.push(path);
      }
    }
    return paths;
  };

  /* -------------------------------------------------------------- */
  /* Delete removed images from storage                              */
  /* -------------------------------------------------------------- */
  const deleteRemovedImages = async () => {
    if (!existingOffer?.images) return;
    const currentPaths = new Set(images.filter((i) => i.storagePath).map((i) => i.storagePath!));
    const removedPaths = existingOffer.images.filter((p) => !currentPaths.has(p));
    if (removedPaths.length > 0) {
      await supabase.storage.from("instant-offer-images").remove(removedPaths);
    }
  };

  /* -------------------------------------------------------------- */
  /* Upload new config docs & merge with existing                    */
  /* -------------------------------------------------------------- */
  const resolveConfigDocs = async (userId: string): Promise<{ path: string; name: string }[]> => {
    const results = [...existingConfigDocs];
    for (const doc of newConfigDocs) {
      const ext = doc.name.split(".").pop() || "pdf";
      const path = `${userId}/${uuid()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("instant-offer-config-docs")
        .upload(path, doc, { contentType: doc.type });
      if (uploadError) throw new Error(`Dokument-Upload fehlgeschlagen: ${uploadError.message}`);
      results.push({ path, name: doc.name });
    }
    return results;
  };

  const deleteRemovedConfigDocs = async () => {
    if (!existingOffer?.config_documents) return;
    const currentPaths = new Set(existingConfigDocs.map((d) => d.path));
    const removedPaths = (existingOffer.config_documents as { path: string; name: string }[])
      .filter((d) => !currentPaths.has(d.path))
      .map((d) => d.path);
    if (removedPaths.length > 0) {
      await supabase.storage.from("instant-offer-config-docs").remove(removedPaths);
    }
  };

  /* -------------------------------------------------------------- */
  /* Save (UPDATE)                                                   */
  /* -------------------------------------------------------------- */
  const handleSave = async () => {
    if (!user || !vehicle || !isValid) return;
    setIsSaving(true);
    setError(null);

    try {
      // Upload new images & get all paths in order
      const imagePaths = await resolveImagePaths(user.id);

      // Upload new config docs & get all entries
      const configDocPaths = await resolveConfigDocs(user.id);

      // Delete removed images & config docs from storage
      await deleteRemovedImages();
      await deleteRemovedConfigDocs();

      const payload = {
        // Vehicle
        vehicle_type: vehicle.vehicleType,
        brand: vehicle.brand,
        model_name: vehicle.model,
        body_type: vehicle.bodyType,
        fuel_type: vehicle.fuelType,
        transmission: vehicle.transmission,
        power_kw: vehicle.powerFrom,
        power_ps: vehicle.powerFrom ? Math.round(vehicle.powerFrom * 1.36) : null,
        awd: vehicle.driveType === "Allrad",
        color: vehicle.exteriorColor,
        metallic: vehicle.metallic,
        doors: vehicle.doors,
        equipment: buildEquipmentJson(vehicle),

        // Images & config documents
        images: imagePaths,
        config_documents: configDocPaths,

        // Quantity
        quantity,

        // Delivery
        delivery_plz: deliveryPlz || null,
        delivery_city: deliveryCity || null,
        delivery_radius: deliveryRadius,

        // Pricing
        purchase_price_net: purchaseNet || null,
        discount_percent: parseFloat(discountPercent) || null,

        // Leasing
        leasing_enabled: leasingEnabled,
        leasing_rate_net: leasingEnabled ? (parseFloat(leasingRate) || null) : null,
        leasing_duration: leasingEnabled ? parseInt(leasingDuration) : null,
        leasing_mileage: leasingEnabled ? parseInt(leasingMileage) : null,
        leasing_conditions: leasingEnabled ? (leasingConditions || null) : null,

        // Financing
        financing_enabled: financingEnabled,
        financing_rate_net: financingEnabled ? (parseFloat(financingRate) || null) : null,
        financing_duration: financingEnabled ? parseInt(financingDuration) : null,
        financing_downpayment: financingEnabled ? (parseFloat(financingDownpayment) || null) : null,
        financing_conditions: financingEnabled ? (financingConditions || null) : null,

        // Additional costs
        transfer_cost: transfer || null,
        registration_cost: registration || null,
        total_price: totalPrice || null,

        // Duration
        duration_days: duration,
      };

      const { error: updateError } = await supabase
        .from("instant_offers")
        .update(payload)
        .eq("id", offerId);

      if (updateError) throw updateError;

      setIsSuccess(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Fehler beim Speichern. Bitte erneut versuchen.";
      console.error("Update error:", err);
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  /* -------------------------------------------------------------- */
  /* Loading / Not Found                                             */
  /* -------------------------------------------------------------- */
  if (initialLoading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Loader2 className="animate-spin text-blue-600" size={40} />
      </div>
    );
  }

  if (notFound || !vehicle) {
    return (
      <div className="text-center py-24 max-w-4xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-navy-950 mb-4">Angebot nicht gefunden</h1>
        <p className="text-slate-500 mb-8">Das Sofort-Angebot existiert nicht oder Sie haben keinen Zugriff.</p>
        <Link href="/dashboard/sofort-angebote">
          <Button className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold px-8 h-12">
            Zurück zur Übersicht
          </Button>
        </Link>
      </div>
    );
  }

  /* -------------------------------------------------------------- */
  /* Success Screen                                                  */
  /* -------------------------------------------------------------- */
  if (isSuccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-4 animate-in fade-in zoom-in duration-500">
        <div className="w-28 h-28 bg-gradient-to-tr from-green-400 to-green-500 text-white rounded-[2rem] shadow-xl flex items-center justify-center mb-10 rotate-12 hover:rotate-0 transition-transform duration-500">
          <CheckCircle size={56} className="drop-shadow-md" />
        </div>
        <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-navy-950 mb-6">
          Änderungen gespeichert!
        </h2>
        <p className="text-xl text-slate-500 max-w-lg mx-auto mb-12 leading-relaxed">
          Ihr Sofort-Angebot wurde erfolgreich aktualisiert.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
          <Button
            variant="outline"
            className="rounded-xl border-slate-200 h-14 px-8 text-lg font-semibold text-slate-600"
            onClick={() => router.push("/dashboard/sofort-angebote")}
          >
            Zur Übersicht
          </Button>
          <Button
            className="rounded-xl bg-navy-900 hover:bg-navy-950 text-white h-14 px-8 text-lg font-semibold shadow-lg"
            onClick={() => { window.location.href = `${SITE_URL}/sofort-angebote/${offerId}`; }}
          >
            Angebot ansehen
          </Button>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------- */
  /* RENDER                                                          */
  /* -------------------------------------------------------------- */
  return (
    <div className="bg-slate-50 min-h-screen pb-24">
      {/* Top Banner */}
      <div className="bg-navy-950 text-white py-4 sticky top-0 z-40 shadow-md">
        <div className="container mx-auto max-w-4xl px-4 md:px-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard/sofort-angebote">
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 rounded-full h-8 w-8">
                <ChevronLeft size={20} />
              </Button>
            </Link>
            <h1 className="font-bold text-lg md:text-xl">Sofort-Angebot bearbeiten</h1>
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-4xl px-4 md:px-8 py-8 md:py-12 space-y-10">

        {/* 1. Fahrzeug-Konfiguration */}
        <section className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-sm">
          <h2 className="text-xl font-bold text-navy-950 mb-6">1. Fahrzeug-Konfiguration</h2>
          <VehicleConfigForm
            vehicle={vehicle}
            onChange={setVehicle}
            onSave={() => {}}
            mode="instant-offer"
          />
        </section>

        {/* 2. Verfügbare Anzahl */}
        <section className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-sm">
          <h2 className="text-xl font-bold text-navy-950 mb-6">2. Verfügbare Anzahl</h2>
          <div className="flex items-center gap-6">
            <Button
              variant="outline"
              size="icon"
              className="rounded-full w-12 h-12 bg-slate-50 hover:bg-slate-100 text-slate-500"
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
            >
              <Minus />
            </Button>
            <div className="text-3xl font-black text-navy-950 w-16 text-center">{quantity}</div>
            <Button
              variant="outline"
              size="icon"
              className="rounded-full w-12 h-12 bg-blue-50 border-blue-200 text-blue-600 hover:bg-blue-100"
              onClick={() => setQuantity(quantity + 1)}
            >
              <Plus />
            </Button>
            <span className="text-slate-500 font-medium">Fahrzeuge</span>
          </div>
        </section>

        {/* 3. Fahrzeugbilder */}
        <section className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <Camera size={16} className="text-blue-600" />
            </div>
            <h2 className="text-xl font-bold text-navy-950">3. Fahrzeugbilder</h2>
          </div>
          <ImageUpload images={images} onChange={setImages} />
        </section>

        {/* 4. Herstellerkonfiguration */}
        <section className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-8 w-8 rounded-lg bg-indigo-100 flex items-center justify-center">
              <FileText size={16} className="text-indigo-600" />
            </div>
            <h2 className="text-xl font-bold text-navy-950">4. Herstellerkonfiguration</h2>
            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">Optional</span>
          </div>
          <p className="text-sm text-slate-500 mb-4">
            Laden Sie die genaue Herstellerkonfiguration des Fahrzeugs hoch (PDF, DOC, DOCX oder TXT). Max. 10 MB pro Datei.
          </p>

          {/* Existing docs */}
          {existingConfigDocs.length > 0 && (
            <div className="space-y-2 mb-4">
              {existingConfigDocs.map((doc, idx) => (
                <div key={doc.path} className="border border-slate-200 bg-white rounded-xl p-4 flex items-center justify-between gap-4">
                  <a href={getConfigDocUrl(doc.path)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 min-w-0 hover:opacity-80">
                    <div className="h-10 w-10 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
                      <FileText size={18} className="text-indigo-600" />
                    </div>
                    <p className="font-semibold text-navy-950 text-sm truncate">{doc.name}</p>
                  </a>
                  <button
                    type="button"
                    onClick={() => setExistingConfigDocs((prev) => prev.filter((_, i) => i !== idx))}
                    className="h-8 w-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-red-500 hover:bg-red-50 hover:border-red-200 transition-colors shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* New docs */}
          {newConfigDocs.length > 0 && (
            <div className="space-y-2 mb-4">
              {newConfigDocs.map((doc, idx) => (
                <div key={idx} className="border border-slate-200 bg-white rounded-xl p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
                      <FileText size={18} className="text-indigo-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-navy-950 text-sm truncate">{doc.name}</p>
                      <p className="text-xs text-slate-400">{(doc.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNewConfigDocs((prev) => prev.filter((_, i) => i !== idx))}
                    className="h-8 w-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-red-500 hover:bg-red-50 hover:border-red-200 transition-colors shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Drop zone */}
          <div
            className="border-2 border-dashed border-slate-300 bg-slate-50/50 rounded-2xl p-8 flex flex-col items-center justify-center text-slate-500 hover:bg-slate-50 hover:border-indigo-300 transition-colors cursor-pointer group relative"
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const files = Array.from(e.dataTransfer.files);
              const ALLOWED = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"];
              const MAX_SIZE = 10 * 1024 * 1024;
              const valid = files.filter((f) => ALLOWED.includes(f.type) && f.size <= MAX_SIZE);
              if (valid.length > 0) setNewConfigDocs((prev) => [...prev, ...valid]);
            }}
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = ".pdf,.doc,.docx,.txt";
              input.multiple = true;
              input.onchange = () => {
                const files = Array.from(input.files || []);
                const MAX_SIZE = 10 * 1024 * 1024;
                const valid = files.filter((f) => f.size <= MAX_SIZE);
                if (valid.length > 0) setNewConfigDocs((prev) => [...prev, ...valid]);
              };
              input.click();
            }}
          >
            <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-3 group-hover:bg-indigo-100 transition-colors">
              <UploadCloud size={22} className="text-slate-400 group-hover:text-indigo-500 transition-colors" />
            </div>
            <p className="text-sm font-semibold text-navy-900 mb-1">Konfigurationsdokumente hochladen</p>
            <p className="text-xs text-slate-400 text-center">PDF, DOC, DOCX oder TXT - Max. 10 MB pro Datei</p>
          </div>
        </section>

        {/* 5. Lieferung */}
        <section className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-8 w-8 rounded-lg bg-green-100 flex items-center justify-center">
              <MapPin size={16} className="text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-navy-950">5. Lieferung</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700">PLZ</Label>
              <Input
                placeholder="z.B. 80331"
                value={deliveryPlz}
                onChange={(e) => setDeliveryPlz(e.target.value)}
                className="rounded-xl h-12 bg-slate-50 border-slate-200"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700">Ort</Label>
              <Input
                placeholder="z.B. München"
                value={deliveryCity}
                onChange={(e) => setDeliveryCity(e.target.value)}
                className="rounded-xl h-12 bg-slate-50 border-slate-200"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700">Umkreis</Label>
              <select
                value={deliveryRadius}
                onChange={(e) => setDeliveryRadius(parseInt(e.target.value))}
                className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-base outline-none focus:ring-2 focus:ring-blue-500"
              >
                {RADIUS_OPTIONS.map((r) => (
                  <option key={r} value={r}>{r} km</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* 6. Preise & Konditionen */}
        <section className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center">
              <Euro size={16} className="text-amber-600" />
            </div>
            <h2 className="text-xl font-bold text-navy-950">6. Preise & Konditionen</h2>
          </div>

          <div className="space-y-8">
            {/* Purchase Price */}
            <div>
              <h3 className="font-bold text-navy-950 text-lg mb-4">Kaufpreis</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-700">Kaufpreis netto (€) *</Label>
                  <Input
                    type="number"
                    placeholder="z.B. 35000"
                    value={purchasePriceNet}
                    onChange={(e) => setPurchasePriceNet(e.target.value)}
                    className="rounded-xl h-12 bg-slate-50 border-slate-200 text-lg font-bold"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-700">Nachlass in %</Label>
                  <Input
                    type="number"
                    placeholder="z.B. 15"
                    value={discountPercent}
                    onChange={(e) => setDiscountPercent(e.target.value)}
                    className="rounded-xl h-12 bg-slate-50 border-slate-200"
                  />
                </div>
              </div>
            </div>

            {/* Leasing */}
            <div className="border border-slate-200 rounded-2xl p-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-slate-100 px-4 py-2 rounded-bl-2xl">
                <Switch checked={leasingEnabled} onCheckedChange={setLeasingEnabled} className="scale-125" />
              </div>
              <h3 className={`font-bold text-lg mb-4 ${leasingEnabled ? "text-navy-950" : "text-slate-400"}`}>
                Leasing anbieten
              </h3>
              {leasingEnabled && (
                <div className="space-y-4 animate-in slide-in-from-top-2">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold text-slate-700">Rate netto p.M. (€)</Label>
                      <Input
                        type="number"
                        placeholder="z.B. 429"
                        value={leasingRate}
                        onChange={(e) => setLeasingRate(e.target.value)}
                        className="rounded-xl h-12 border-blue-200 font-bold"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold text-slate-700">Laufzeit (Monate)</Label>
                      <select
                        value={leasingDuration}
                        onChange={(e) => setLeasingDuration(e.target.value)}
                        className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-base outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="24">24</option>
                        <option value="36">36</option>
                        <option value="48">48</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold text-slate-700">Kilometer p.a.</Label>
                      <select
                        value={leasingMileage}
                        onChange={(e) => setLeasingMileage(e.target.value)}
                        className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-base outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="10000">10.000 km</option>
                        <option value="15000">15.000 km</option>
                        <option value="20000">20.000 km</option>
                        <option value="25000">25.000 km</option>
                        <option value="30000">30.000 km</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-slate-700">Konditionen / Hinweis</Label>
                    <Textarea
                      placeholder="z.B. inkl. Wartung & Verschleiß..."
                      value={leasingConditions}
                      onChange={(e) => setLeasingConditions(e.target.value)}
                      className="rounded-xl bg-slate-50 border-slate-200 resize-none"
                      rows={2}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Financing */}
            <div className="border border-slate-200 rounded-2xl p-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-slate-100 px-4 py-2 rounded-bl-2xl">
                <Switch checked={financingEnabled} onCheckedChange={setFinancingEnabled} className="scale-125" />
              </div>
              <h3 className={`font-bold text-lg mb-4 ${financingEnabled ? "text-navy-950" : "text-slate-400"}`}>
                Finanzierung anbieten
              </h3>
              {financingEnabled && (
                <div className="space-y-4 animate-in slide-in-from-top-2">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold text-slate-700">Rate netto p.M. (€)</Label>
                      <Input
                        type="number"
                        placeholder="z.B. 389"
                        value={financingRate}
                        onChange={(e) => setFinancingRate(e.target.value)}
                        className="rounded-xl h-12 border-blue-200 font-bold"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold text-slate-700">Laufzeit (Monate)</Label>
                      <select
                        value={financingDuration}
                        onChange={(e) => setFinancingDuration(e.target.value)}
                        className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-base outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="36">36</option>
                        <option value="48">48</option>
                        <option value="60">60</option>
                        <option value="72">72</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold text-slate-700">Anzahlung (€)</Label>
                      <Input
                        type="number"
                        placeholder="z.B. 5000"
                        value={financingDownpayment}
                        onChange={(e) => setFinancingDownpayment(e.target.value)}
                        className="rounded-xl h-12 bg-slate-50 border-slate-200"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-slate-700">Konditionen / Hinweis</Label>
                    <Textarea
                      placeholder="z.B. Schlussrate 30%, Sondertilgung möglich..."
                      value={financingConditions}
                      onChange={(e) => setFinancingConditions(e.target.value)}
                      className="rounded-xl bg-slate-50 border-slate-200 resize-none"
                      rows={2}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 7. Zusatzkosten */}
        <section className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-8 w-8 rounded-lg bg-purple-100 flex items-center justify-center">
              <Truck size={16} className="text-purple-600" />
            </div>
            <h2 className="text-xl font-bold text-navy-950">7. Zusatzkosten</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700">Überführungskosten netto (€)</Label>
              <Input
                type="number"
                placeholder="z.B. 800"
                value={transferCost}
                onChange={(e) => setTransferCost(e.target.value)}
                className="rounded-xl h-12 bg-slate-50 border-slate-200"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700">Zulassungskosten netto (€)</Label>
              <Input
                type="number"
                placeholder="z.B. 190"
                value={registrationCost}
                onChange={(e) => setRegistrationCost(e.target.value)}
                className="rounded-xl h-12 bg-slate-50 border-slate-200"
              />
            </div>
          </div>
          {totalPrice > 0 && (
            <div className="flex items-center justify-between p-5 bg-gradient-to-r from-slate-50 to-blue-50 border border-slate-200 rounded-2xl">
              <span className="font-bold text-navy-950 text-lg">Gesamtpreis netto</span>
              <span className="text-2xl font-black text-navy-950">
                {totalPrice.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €
              </span>
            </div>
          )}
        </section>

        {/* 8. Sichtbarkeit */}
        <section className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-8 w-8 rounded-lg bg-cyan-100 flex items-center justify-center">
              <Clock size={16} className="text-cyan-600" />
            </div>
            <h2 className="text-xl font-bold text-navy-950">8. Sichtbarkeit</h2>
          </div>
          <Label className="text-sm font-semibold text-slate-700 mb-3 block">Wie lange soll das Angebot sichtbar sein?</Label>
          <div className="flex gap-3">
            {[7, 14, 30].map((days) => (
              <div
                key={days}
                onClick={() => setDuration(days)}
                className={`cursor-pointer px-8 py-4 rounded-2xl border-2 font-bold transition-all text-center ${
                  duration === days
                    ? "bg-navy-950 text-white border-navy-950 shadow-md"
                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                }`}
              >
                {days} Tage
              </div>
            ))}
          </div>
        </section>

        {/* Error display */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 font-semibold text-sm">
            {error}
          </div>
        )}

        {/* Sticky Action Buttons */}
        <div className="bg-white/90 backdrop-blur-xl p-4 sm:p-6 rounded-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.05)] border border-slate-200 sticky bottom-6 z-50 flex flex-col sm:flex-row justify-between items-center gap-4">
          <Button
            variant="outline"
            className="w-full sm:w-auto rounded-xl hover:bg-slate-100 h-14 px-8 text-slate-600 font-semibold text-lg border-slate-300"
            onClick={() => router.push("/dashboard/sofort-angebote")}
          >
            Abbrechen
          </Button>
          <Button
            className="w-full sm:w-auto rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:opacity-90 text-white shadow-lg shadow-blue-500/20 px-10 h-14 text-lg font-bold transition-transform hover:scale-105 disabled:opacity-40"
            onClick={handleSave}
            disabled={!isValid || isSaving}
          >
            {isSaving ? (
              <><Loader2 className="animate-spin mr-2" size={18} /> Wird gespeichert...</>
            ) : (
              "Änderungen speichern"
            )}
          </Button>
        </div>

      </div>
    </div>
  );
}
