"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { WizardStepper } from "@/components/ui-custom/WizardStepper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ChevronRight, ChevronLeft, CheckCircle2, Loader2, Save } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase";
import { useAuth } from "@/components/providers/auth-provider";
import { VehicleConfigForm } from "@/components/wizard/VehicleConfigForm";
import { VehicleSummaryList } from "@/components/wizard/VehicleSummaryList";
import type { VehicleConfig } from "@/types/vehicle";
import { createEmptyVehicleConfig, buildEquipmentJson, dbRowToVehicleConfig } from "@/types/vehicle";
import { usePlzLookup } from "@/hooks/usePlzLookup";

const STEPS = ["Fahrzeug", "Details", "Lieferung", "Speichern"];

export default function EditTenderWizard({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = createClient();

  const [step, setStep] = useState(0);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Multi-vehicle state
  const [vehicles, setVehicles] = useState<VehicleConfig[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // Shared fields
  const [sharedData, setSharedData] = useState({
    fleetDiscount: false,
    fleetDiscountPercent: "",
    acceptOtherColor: false,
    acceptHigherTrim: true,
    acceptDayRegistration: false,
    zipCode: "",
  });

  const { city: deliveryCity, loading: cityLoading } = usePlzLookup(sharedData.zipCode);

  // Load existing tender data
  useEffect(() => {
    if (!params.id) return;

    (async () => {
      try {
        const { data, error } = await supabase
          .from("tenders")
          .select("*, tender_vehicles(*)")
          .eq("id", params.id)
          .single();

        if (error) { setPageError(error.message); return; }

        // Map tender-level data
        setSharedData({
          fleetDiscount: false,
          fleetDiscountPercent: "",
          acceptOtherColor: data.tender_vehicles?.[0]?.alt_preferences?.accept_other_color || false,
          acceptHigherTrim: data.tender_vehicles?.[0]?.alt_preferences?.accept_higher_trim ?? true,
          acceptDayRegistration: data.tender_vehicles?.[0]?.alt_preferences?.accept_day_registration || false,
          zipCode: data.delivery_plz || "",
        });

        // Map vehicles
        const loadedVehicles: VehicleConfig[] = (data.tender_vehicles || []).map((v: Record<string, unknown>) => {
          const vc = dbRowToVehicleConfig(v);

          // Fleet discount from first vehicle
          if (v.fleet_discount && (v.fleet_discount as number) > 0) {
            setSharedData((prev) => ({
              ...prev,
              fleetDiscount: true,
              fleetDiscountPercent: String(v.fleet_discount),
            }));
          }

          return vc;
        });

        if (loadedVehicles.length > 0) {
          setVehicles(loadedVehicles);
          setEditingIndex(null);
        } else {
          setVehicles([createEmptyVehicleConfig()]);
          setEditingIndex(0);
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Fehler beim Laden";
        setPageError(message);
      } finally {
        setPageLoading(false);
      }
    })();
  }, [params.id, supabase]);

  const canProceedStep0 = vehicles.length > 0 && editingIndex === null && vehicles.every((v) => v.brand && v.model);

  // Vehicle management
  const handleVehicleSave = () => setEditingIndex(null);

  const handleVehicleCancel = () => {
    if (editingIndex !== null && vehicles[editingIndex] && (!vehicles[editingIndex].brand || !vehicles[editingIndex].model)) {
      setVehicles((prev) => prev.filter((_, i) => i !== editingIndex));
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

  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);
    setSaveError(null);

    try {
      const { error: tenderError } = await supabase
        .from("tenders")
        .update({
          delivery_plz: sharedData.zipCode || null,
          delivery_city: deliveryCity || null,
        })
        .eq("id", params.id);

      if (tenderError) throw tenderError;

      const { error: deleteError } = await supabase
        .from("tender_vehicles")
        .delete()
        .eq("tender_id", params.id);

      if (deleteError) throw deleteError;

      const vehiclePayloads = vehicles.map((v) => ({
        tender_id: params.id,
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

      const { error: insertError } = await supabase.from("tender_vehicles").insert(vehiclePayloads);
      if (insertError) throw insertError;

      router.push("/dashboard/ausschreibungen");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Fehler beim Speichern.";
      console.error("Save error:", err);
      setSaveError(message);
    } finally {
      setIsSaving(false);
    }
  };

  if (pageLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-slate-400">
        <Loader2 className="animate-spin mr-3" size={28} />
        <span className="text-lg font-semibold">Ausschreibung wird geladen…</span>
      </div>
    );
  }

  if (pageError) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8 max-w-lg text-center">
          <h3 className="text-lg font-bold text-red-800 mb-2">Fehler</h3>
          <p className="text-red-600 text-sm mb-4">{pageError}</p>
          <Button variant="outline" onClick={() => router.push("/dashboard/ausschreibungen")} className="rounded-xl border-red-200 text-red-700">
            Zurück
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-12 px-4 min-h-screen">
      <div className="mb-12">
        <h1 className="text-3xl font-bold text-navy-950 mb-4 text-center">Ausschreibung bearbeiten</h1>
        <WizardStepper steps={STEPS} currentStep={step} />
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 md:p-12 mb-8 min-h-[450px]">

        {/* Step 0: Vehicle */}
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

        {/* Step 1: Details */}
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

        {/* Step 2: Delivery */}
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
                    <Input readOnly placeholder="Ort" className="rounded-xl text-xl font-semibold h-14 bg-slate-100 border-transparent text-slate-500" value={cityLoading ? "Wird gesucht…" : deliveryCity} />
                    {cityLoading && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-slate-400" size={20} />}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Summary */}
        {step === 3 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <h2 className="text-3xl font-bold text-navy-950 mb-8 border-b border-slate-100 pb-6">Zusammenfassung & Speichern</h2>

            <div className="bg-white border-2 border-slate-100 shadow-sm rounded-3xl p-8 mb-8">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 bg-white border-2 border-slate-100 rounded-3xl p-8 mb-8">
              <div>
                <dt className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-2">Lieferort</dt>
                <dd className="font-bold text-navy-950">{sharedData.zipCode ? `${sharedData.zipCode} ${deliveryCity}` : "Nicht angegeben"}</dd>
              </div>
              <div>
                <dt className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-2">Großkunde</dt>
                <dd className="font-bold text-navy-950">
                  {sharedData.fleetDiscount ? `Ja (${sharedData.fleetDiscountPercent}%)` : "Nein"}
                </dd>
              </div>
            </div>

            {saveError && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 font-semibold text-sm">
                {saveError}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation Bar */}
      <div className="flex justify-between items-center bg-white/80 backdrop-blur-xl p-4 sm:p-6 rounded-[2rem] border border-slate-200 shadow-xl sticky bottom-6 z-50">
        <Button variant="ghost" onClick={() => setStep((s) => Math.max(s - 1, 0))} disabled={step === 0 || isSaving} className="rounded-xl text-slate-500 hover:text-navy-950 font-semibold text-base h-12 px-6">
          <ChevronLeft className="mr-2" size={18} /> Zurück
        </Button>
        {step < STEPS.length - 1 ? (
          <Button
            onClick={() => setStep((s) => Math.min(s + 1, STEPS.length - 1))}
            disabled={step === 0 && !canProceedStep0}
            className="rounded-xl bg-navy-800 hover:bg-navy-950 text-white shadow-lg h-12 px-10 text-lg font-bold group disabled:opacity-40"
          >
            Weiter <ChevronRight className="ml-2 group-hover:translate-x-1 transition-transform" size={18} />
          </Button>
        ) : (
          <Button onClick={handleSave} disabled={isSaving} className="rounded-xl bg-gradient-to-r from-blue-500 to-cyan-400 hover:from-blue-600 hover:to-cyan-500 text-white shadow-lg shadow-blue-500/30 h-14 px-10 text-lg font-bold transition-transform hover:scale-105 active:scale-95">
            {isSaving ? (
              <><Loader2 className="animate-spin mr-2" size={20} /> Wird gespeichert…</>
            ) : (
              <><Save className="mr-2" size={20} /> Änderungen speichern</>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
