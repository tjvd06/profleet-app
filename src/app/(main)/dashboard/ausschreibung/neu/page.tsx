"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { WizardStepper } from "@/components/ui-custom/WizardStepper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { ChevronRight, ChevronLeft, CheckCircle2, PartyPopper, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase";
import { useAuth } from "@/components/providers/auth-provider";
import { VehicleConfigForm } from "@/components/wizard/VehicleConfigForm";
import { VehicleSummaryList } from "@/components/wizard/VehicleSummaryList";
import type { VehicleConfig } from "@/types/vehicle";
import { createEmptyVehicleConfig, buildEquipmentJson } from "@/types/vehicle";
import { usePlzLookup } from "@/hooks/usePlzLookup";

const STEPS = ["Fahrzeug", "Details", "Lieferung", "Starten"];
const DURATION_DAYS: Record<string, number> = { "7": 7, "14": 14, "30": 30 };

export default function NewTenderWizard() {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = createClient();

  const [step, setStep] = useState(0);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [duration, setDuration] = useState("14");

  // Multi-vehicle state
  const [vehicles, setVehicles] = useState<VehicleConfig[]>([createEmptyVehicleConfig()]);
  const [editingIndex, setEditingIndex] = useState<number | null>(0);

  // Shared fields (apply to the entire tender, not per vehicle)
  const [sharedData, setSharedData] = useState({
    fleetDiscount: false,
    fleetDiscountPercent: "",
    acceptOtherColor: false,
    acceptHigherTrim: true,
    acceptDayRegistration: false,
    zipCode: "",
  });

  const { city: deliveryCity, loading: cityLoading } = usePlzLookup(sharedData.zipCode);

  const nextStep = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const prevStep = () => setStep((s) => Math.max(s - 1, 0));

  const canProceedStep0 = vehicles.length > 0 && editingIndex === null && vehicles.every((v) => v.brand && v.model);

  // Vehicle management
  const handleVehicleSave = () => setEditingIndex(null);

  const handleVehicleCancel = () => {
    if (editingIndex !== null && vehicles[editingIndex]) {
      const v = vehicles[editingIndex];
      if (!v.brand || !v.model) {
        setVehicles((prev) => prev.filter((_, i) => i !== editingIndex));
      }
    }
    setEditingIndex(null);
  };

  const handleAddVehicle = () => {
    const newVehicle = createEmptyVehicleConfig();
    setVehicles((prev) => [...prev, newVehicle]);
    setEditingIndex(vehicles.length);
  };

  const handleEditVehicle = (index: number) => setEditingIndex(index);

  const handleDeleteVehicle = (index: number) => {
    setVehicles((prev) => prev.filter((_, i) => i !== index));
    if (editingIndex === index) setEditingIndex(null);
    else if (editingIndex !== null && editingIndex > index) setEditingIndex(editingIndex - 1);
  };

  const handleVehicleChange = (updated: VehicleConfig) => {
    if (editingIndex === null) return;
    setVehicles((prev) => prev.map((v, i) => (i === editingIndex ? updated : v)));
  };

  const totalQuantity = vehicles.reduce((sum, v) => sum + v.quantity, 0);

  const handlePublish = async () => {
    if (!user) return;
    setIsPublishing(true);
    setPublishError(null);

    try {
      const now = new Date();
      const endDate = new Date(now);
      endDate.setDate(endDate.getDate() + DURATION_DAYS[duration]);

      const { data: tender, error: tenderError } = await supabase
        .from("tenders")
        .insert({
          buyer_id: user.id,
          status: "active",
          start_at: now.toISOString(),
          end_at: endDate.toISOString(),
          delivery_plz: sharedData.zipCode || null,
          delivery_city: deliveryCity || null,
        })
        .select()
        .single();

      if (tenderError) throw tenderError;

      const vehiclePayloads = vehicles.map((v) => ({
        tender_id: tender.id,
        config_method: v.method,
        vehicle_type: v.vehicleType,
        brand: v.brand,
        model_name: v.model,
        body_type: v.bodyType,
        fuel_type: v.fuelType,
        transmission: v.transmission,
        power_kw: v.powerFrom,
        awd: v.driveType === "Allrad",
        color: v.exteriorColor,
        metallic: v.metallic,
        doors: v.doors,
        quantity: v.quantity,
        equipment: buildEquipmentJson(v),
        fleet_discount:
          sharedData.fleetDiscount && sharedData.fleetDiscountPercent
            ? parseFloat(sharedData.fleetDiscountPercent)
            : null,
        alt_preferences: {
          accept_other_color: sharedData.acceptOtherColor,
          accept_higher_trim: sharedData.acceptHigherTrim,
          accept_day_registration: sharedData.acceptDayRegistration,
        },
        leasing: v.leasingRequested ? { requested: true, duration: v.leasingDuration, km_year: v.leasingKmYear } : null,
        financing: v.financingRequested ? { requested: true, duration: v.financingDuration, down_payment: v.financingDownPayment || null } : null,
      }));

      const { data: insertedVehicles, error: vehicleError } = await supabase
        .from("tender_vehicles")
        .insert(vehiclePayloads)
        .select("id");
      if (vehicleError) throw vehicleError;

      // Upload config files for vehicles with method="upload"
      if (insertedVehicles) {
        for (let i = 0; i < vehicles.length; i++) {
          const v = vehicles[i];
          if (v.method === "upload" && v.uploadFile) {
            const vehicleId = insertedVehicles[i]?.id;
            if (!vehicleId) continue;
            const ext = v.uploadFile.name.split(".").pop() || "pdf";
            const safeName = v.uploadFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
            const storagePath = `${user.id}/${vehicleId}/${safeName}`;
            const formData = new FormData();
            formData.append("file", v.uploadFile);
            formData.append("storagePath", storagePath);
            formData.append("bucket", "tender-config-files");
            const uploadRes = await fetch("/api/storage/upload", { method: "POST", body: formData });
            if (!uploadRes.ok) {
              const err = await uploadRes.json().catch(() => ({}));
              throw new Error(`Datei-Upload fehlgeschlagen: ${err.details || "Unbekannter Fehler"}`);
            }
            // Save the storage path to the tender_vehicle row
            const { error: updateError } = await supabase
              .from("tender_vehicles")
              .update({ config_file_path: storagePath })
              .eq("id", vehicleId);
            if (updateError) throw updateError;
          }
        }
      }

      setIsSuccess(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Fehler beim Veröffentlichen. Bitte erneut versuchen.";
      console.error("Publish error:", err);
      setPublishError(message);
    } finally {
      setIsPublishing(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-4 animate-in fade-in zoom-in duration-500">
        <div className="w-28 h-28 bg-gradient-to-tr from-green-400 to-green-500 text-white rounded-[2rem] shadow-xl flex items-center justify-center mb-10 rotate-12 hover:rotate-0 transition-transform duration-500">
          <PartyPopper size={56} className="drop-shadow-md" />
        </div>
        <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-navy-950 mb-6">Ihre Ausschreibung ist live!</h2>
        <p className="text-xl text-slate-500 max-w-lg mx-auto mb-12 leading-relaxed">
          Lehnen Sie sich zurück. Wir benachrichtigen Sie per E-Mail, sobald die ersten Angebote von unseren Händlern eintreffen.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
          <Button variant="outline" className="rounded-xl border-slate-200 h-14 px-8 text-lg font-semibold text-slate-600 hover:text-navy-950 hover:bg-slate-50" onClick={() => router.push("/dashboard/ausschreibungen")}>
            Zur Übersicht
          </Button>
          <Button className="rounded-xl bg-navy-900 hover:bg-navy-950 text-white h-14 px-8 text-lg font-semibold shadow-lg shadow-navy-900/20" onClick={() => { setIsSuccess(false); setStep(0); setVehicles([createEmptyVehicleConfig()]); setEditingIndex(0); }}>
            Weitere Ausschreibung anlegen
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-12 px-4 min-h-screen">
      <div className="mb-12">
        <h1 className="text-3xl font-bold text-navy-950 mb-4 text-center">Neue Ausschreibung erstellen</h1>
        <WizardStepper steps={STEPS} currentStep={step} />
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 md:p-12 mb-8 min-h-[450px]">

        {/* Step 0: Fahrzeug (multi-vehicle) */}
        {step === 0 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <VehicleSummaryList
              vehicles={vehicles}
              editingIndex={editingIndex}
              onEdit={handleEditVehicle}
              onDelete={handleDeleteVehicle}
              onAddNew={handleAddVehicle}
            />

            {editingIndex !== null && vehicles[editingIndex] && (
              <VehicleConfigForm
                vehicle={vehicles[editingIndex]}
                onChange={handleVehicleChange}
                onSave={handleVehicleSave}
                onCancel={handleVehicleCancel}
                showCancel={vehicles.filter((v) => v.brand && v.model).length > 0}
              />
            )}

            {editingIndex === null && vehicles.length === 0 && (
              <div className="text-center py-16">
                <p className="text-lg text-slate-500 mb-6">Noch kein Fahrzeug konfiguriert.</p>
                <Button onClick={handleAddVehicle} className="rounded-xl bg-blue-500 hover:bg-blue-600 text-white h-12 px-8 font-semibold">
                  Fahrzeug hinzufügen
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Step 1: Details (shared fields) */}
        {step === 1 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <h2 className="text-2xl font-bold text-navy-950 mb-8">Details & Vereinbarungen</h2>

            <Card className="mb-8 border-slate-200 shadow-none bg-slate-50/50 rounded-3xl overflow-hidden">
              <CardContent className="p-8 space-y-8">
                <div className="border-b border-slate-200 pb-8 flex items-center justify-between gap-4">
                  <div>
                    <Label className="text-lg font-bold text-navy-950 block mb-1">Großkundenvertrag vorhanden</Label>
                    <p className="text-base text-slate-500">Haben Sie bereits verhandelte Konditionen beim Hersteller?</p>
                  </div>
                  <Switch checked={sharedData.fleetDiscount} onCheckedChange={(c) => setSharedData({ ...sharedData, fleetDiscount: c })} className="scale-125" />
                </div>

                {sharedData.fleetDiscount && (
                  <div className="animate-in fade-in slide-in-from-top-2">
                    <Label className="text-base font-semibold text-blue-800 block mb-3">Rabatt in %</Label>
                    <Input
                      placeholder="z.B. 15.5"
                      className="rounded-xl h-14 text-lg border-blue-200 bg-blue-50/50 w-full md:w-1/3 focus-visible:ring-blue-500"
                      value={sharedData.fleetDiscountPercent}
                      onChange={(e) => setSharedData({ ...sharedData, fleetDiscountPercent: e.target.value })}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-none bg-white rounded-3xl">
              <CardContent className="p-8 space-y-8">
                <h3 className="text-xl font-bold text-navy-950 border-b border-slate-100 pb-3">Alternative Angebote akzeptieren</h3>
                <div className="flex items-center justify-between">
                  <Label className="text-lg font-medium text-slate-700 cursor-pointer">Andere Farbe akzeptabel</Label>
                  <Switch checked={sharedData.acceptOtherColor} onCheckedChange={(c) => setSharedData({ ...sharedData, acceptOtherColor: c })} className="scale-110" />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-lg font-medium text-slate-700 cursor-pointer">Höhere Ausstattung akzeptabel</Label>
                  <Switch checked={sharedData.acceptHigherTrim} onCheckedChange={(c) => setSharedData({ ...sharedData, acceptHigherTrim: c })} className="scale-110" />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-lg font-medium text-slate-700 cursor-pointer">Tageszulassung akzeptabel</Label>
                  <Switch checked={sharedData.acceptDayRegistration} onCheckedChange={(c) => setSharedData({ ...sharedData, acceptDayRegistration: c })} className="scale-110" />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 2: Lieferung */}
        {step === 2 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <h2 className="text-2xl font-bold text-navy-950 mb-8">Auslieferung & Region</h2>

            <div className="space-y-10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-8 bg-slate-50 border border-slate-100 rounded-3xl">
                <div className="space-y-3">
                  <Label className="text-base text-slate-700 font-semibold">PLZ Auslieferung</Label>
                  <Input placeholder="z.B. 80331" value={sharedData.zipCode} onChange={(e) => setSharedData({ ...sharedData, zipCode: e.target.value })} className="rounded-xl text-xl font-bold h-14 bg-white border-slate-300 focus-visible:ring-blue-500" />
                </div>
                <div className="space-y-3">
                  <Label className="text-base text-slate-700 font-semibold">Ort (Autom. erkannt)</Label>
                  <div className="relative">
                    <Input placeholder="Ort" className="rounded-xl text-xl font-semibold h-14 bg-slate-100 border-transparent text-slate-500" readOnly value={cityLoading ? "Wird gesucht…" : deliveryCity} />
                    {cityLoading && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-slate-400" size={20} />}
                  </div>
                </div>
              </div>

              <Card className="border-green-200 bg-green-50 rounded-2xl">
                <CardContent className="p-6 flex gap-5">
                  <CheckCircle2 size={24} className="text-green-600 shrink-0" />
                  <div>
                    <h4 className="font-bold text-green-900 text-lg mb-1">Inklusivleistungen sind Standard</h4>
                    <p className="text-base text-green-800/80 leading-relaxed">Alle Preise auf unserer Plattform verstehen sich als garantierte Gesamtpreise für das fertig zugelassene Fahrzeug (inklusive Überführung, Übergabeinspektion und amtlichen Zulassungskosten).</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Step 3: Zusammenfassung */}
        {step === 3 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <h2 className="text-3xl font-bold text-navy-950 mb-8 border-b border-slate-100 pb-6">Zusammenfassung prüfen & Veröffentlichen</h2>

            {/* Vehicle summary */}
            <div className="bg-white border-2 border-slate-100 shadow-sm rounded-3xl p-8 mb-8 overflow-hidden relative">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-blue-100 to-transparent opacity-50 pointer-events-none" />
              <h3 className="text-xl font-bold text-navy-950 mb-6">Fahrzeuge</h3>
              <div className="space-y-3 mb-6">
                {vehicles.map((v) => (
                  <div key={v.id} className="p-4 bg-slate-50 rounded-2xl">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold text-navy-950">
                          {[v.brand, v.model].filter(Boolean).join(" ")}
                        </span>
                        {v.fuelType && <span className="text-slate-500 text-sm ml-2">· {v.fuelType}</span>}
                        {v.exteriorColor && <span className="text-slate-400 text-sm ml-2">· {v.exteriorColor}</span>}
                      </div>
                      <span className="px-3 py-1 bg-blue-100 text-blue-700 text-sm font-bold rounded-lg shrink-0">{v.quantity}x</span>
                    </div>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      <span className="px-2 py-0.5 bg-slate-200 text-slate-700 text-xs font-semibold rounded-md">Barkauf</span>
                      {v.leasingRequested && <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-semibold rounded-md">Leasing ({v.leasingDuration} Mon.)</span>}
                      {v.financingRequested && <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-semibold rounded-md">Finanzierung ({v.financingDuration} Mon.)</span>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                <span className="font-bold text-navy-950 text-lg">Gesamt</span>
                <span className="px-3 py-1 bg-navy-900 text-white text-sm font-bold rounded-lg">
                  {totalQuantity} Fahrzeug{totalQuantity !== 1 ? "e" : ""}
                </span>
              </div>
            </div>

            {/* Shared data summary */}
            <div className="bg-white border-2 border-slate-100 shadow-sm rounded-3xl p-8 mb-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                <div>
                  <dt className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-2">Lieferort</dt>
                  <dd className="font-bold text-navy-950 text-lg">{sharedData.zipCode ? `${sharedData.zipCode} ${deliveryCity}` : "Nicht angegeben"}</dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-2">Großkunde</dt>
                  <dd className="font-bold text-navy-950 text-lg">
                    {sharedData.fleetDiscount ? `Ja (${sharedData.fleetDiscountPercent}%)` : "Nein"}
                  </dd>
                </div>
              </div>
            </div>

            {/* Duration Selection */}
            <div className="p-8 bg-slate-50 rounded-3xl border border-slate-100">
              <h3 className="text-xl font-bold text-navy-950 mb-6">Wie lange soll die Ausschreibung laufen?</h3>
              <RadioGroup value={duration} onValueChange={setDuration} className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 flex items-center p-4 bg-white border border-slate-200 rounded-2xl cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-all [&:has([data-state=checked])]:border-blue-500 [&:has([data-state=checked])]:bg-blue-50">
                  <RadioGroupItem value="7" id="p-7" className="scale-125 mr-4" />
                  <Label htmlFor="p-7" className="text-lg font-bold cursor-pointer w-full">7 Tage</Label>
                </div>
                <div className="flex-1 flex flex-col justify-center p-4 bg-white border border-slate-200 rounded-2xl cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-all [&:has([data-state=checked])]:border-blue-500 [&:has([data-state=checked])]:bg-blue-50 relative overflow-hidden">
                  <div className="absolute top-0 right-0 bg-blue-500 text-white text-[10px] uppercase font-bold px-3 py-1 rounded-bl-xl">Empfohlen</div>
                  <div className="flex items-center">
                    <RadioGroupItem value="14" id="p-14" className="scale-125 mr-4" />
                    <Label htmlFor="p-14" className="text-lg font-bold cursor-pointer w-full text-blue-700">14 Tage</Label>
                  </div>
                </div>
                <div className="flex-1 flex items-center p-4 bg-white border border-slate-200 rounded-2xl cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-all [&:has([data-state=checked])]:border-blue-500 [&:has([data-state=checked])]:bg-blue-50">
                  <RadioGroupItem value="30" id="p-30" className="scale-125 mr-4" />
                  <Label htmlFor="p-30" className="text-lg font-bold cursor-pointer w-full">30 Tage</Label>
                </div>
              </RadioGroup>
            </div>

            {publishError && (
              <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 font-semibold text-sm">
                {publishError}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation Bar */}
      <div className="flex justify-between items-center bg-white/80 backdrop-blur-xl p-4 sm:p-6 rounded-[2rem] border border-slate-200 shadow-xl sticky bottom-6 z-50">
        <Button variant="ghost" onClick={prevStep} disabled={step === 0 || isPublishing} className="rounded-xl text-slate-500 hover:text-navy-950 font-semibold text-base h-12 px-6">
          <ChevronLeft className="mr-2" size={18} /> Zurück
        </Button>
        {step < STEPS.length - 1 ? (
          <Button
            onClick={nextStep}
            disabled={step === 0 && !canProceedStep0}
            className="rounded-xl bg-navy-800 hover:bg-navy-950 text-white shadow-lg h-12 px-10 text-lg font-bold transition-all hover:pr-8 hover:pl-12 group disabled:opacity-40"
          >
            Weiter <ChevronRight className="ml-2 group-hover:translate-x-1 transition-transform" size={18} />
          </Button>
        ) : (
          <Button onClick={handlePublish} disabled={isPublishing} className="rounded-xl bg-gradient-to-r from-blue-500 to-cyan-400 hover:from-blue-600 hover:to-cyan-500 text-white shadow-lg shadow-blue-500/30 h-14 px-10 text-lg font-bold transition-transform hover:scale-105 active:scale-95 group">
            {isPublishing ? (
              <><Loader2 className="animate-spin mr-2" size={20} /> Wird veröffentlicht...</>
            ) : (
              <>Jetzt veröffentlichen <CheckCircle2 className="ml-3 drop-shadow-sm" size={22} /></>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
