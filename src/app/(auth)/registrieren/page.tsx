"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Loader2, Building2, User } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function RegisterPage() {
  const [role, setRole] = useState<"nachfrager" | "anbieter">("nachfrager");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          role,
          first_name: firstName,
          last_name: lastName,
          company_name: companyName,
        }
      }
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    // Sign the user out immediately — accounts must be approved by an admin
    // before they can use the platform.
    await supabase.auth.signOut();
    setError("Vielen Dank für Ihre Registrierung! Wir prüfen Ihre Angaben und schalten Ihr Konto manuell frei. Sie erhalten dann eine Bestätigung per E-Mail.");
    setLoading(false);
    setPassword("");
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 flex items-center justify-center p-4 py-12">
      <Card className="w-full max-w-lg p-8 rounded-3xl border-slate-200 shadow-xl bg-white relative overflow-hidden">
        <div className="absolute top-0 left-0 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl -translate-y-1/2 -translate-x-1/2 pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl translate-y-1/2 translate-x-1/2 pointer-events-none" />
        
        <div className="relative z-10 flex flex-col items-center mb-8">
          <Link href="/" className="flex items-center gap-2 mb-6">
            <Logo size={40} className="rounded-xl shadow-md" />
            <span className="text-xl font-black text-navy-700 tracking-tight">proFleet</span>
          </Link>
          <h1 className="text-2xl font-bold text-navy-950 text-center">Konto erstellen</h1>
          <p className="text-sm text-slate-500 text-center mt-1">Registrieren Sie sich kostenlos auf der Plattform.</p>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6 rounded-xl border-red-200 bg-red-50 text-red-800">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="font-semibold">{error}</AlertDescription>
          </Alert>
        )}

        <div className="w-full mb-8 relative z-10">
          <div className="grid w-full grid-cols-2 p-1 bg-slate-100 rounded-2xl h-14">
            <button
              type="button"
              onClick={() => setRole("nachfrager")}
              className={`flex items-center justify-center rounded-xl font-bold transition-all h-full ${
                role === "nachfrager" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <User size={16} className="mr-2" /> Nachfrager
            </button>
            <button
              type="button"
              onClick={() => setRole("anbieter")}
              className={`flex items-center justify-center rounded-xl font-bold transition-all h-full ${
                role === "anbieter" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Building2 size={16} className="mr-2" /> Händler
            </button>
          </div>
        </div>

        <form onSubmit={handleRegister} className="space-y-5 relative z-10">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">Vorname</Label>
              <Input id="firstName" required value={firstName} onChange={(e) => setFirstName(e.target.value)} className="h-12 bg-slate-50 border-slate-200 rounded-xl px-4 focus:bg-white" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Nachname</Label>
              <Input id="lastName" required value={lastName} onChange={(e) => setLastName(e.target.value)} className="h-12 bg-slate-50 border-slate-200 rounded-xl px-4 focus:bg-white" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="companyName">Unternehmensname</Label>
            <Input id="companyName" required value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="h-12 bg-slate-50 border-slate-200 rounded-xl px-4 focus:bg-white" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Geschäftliche E-Mail</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 bg-slate-50 border-slate-200 rounded-xl px-4 focus:bg-white" />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="password">Passwort</Label>
            <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 bg-slate-50 border-slate-200 rounded-xl px-4 focus:bg-white" />
          </div>

          <Button type="submit" className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-base shadow-lg shadow-blue-600/20 mt-6" disabled={loading}>
            {loading ? <Loader2 className="animate-spin mr-2" /> : null}
            Jetzt registrieren
          </Button>
          
          <p className="text-xs text-center text-slate-400 mt-4 leading-relaxed px-4">
            Mit der Registrierung bestätigen Sie unsere <Link href="#" className="underline hover:text-navy-950">AGB</Link> und haben unsere <Link href="#" className="underline hover:text-navy-950">Datenschutzerklärung</Link> zur Kenntnis genommen.
          </p>
        </form>

        <div className="mt-8 text-center text-sm font-medium text-slate-500 relative z-10 pt-6 border-t border-slate-100">
          Haben Sie bereits ein Konto?{' '}
          <Link href="/anmelden" className="text-navy-950 font-bold hover:text-blue-600 transition-colors">
            Hier anmelden
          </Link>
        </div>
      </Card>
    </div>
  );
}
