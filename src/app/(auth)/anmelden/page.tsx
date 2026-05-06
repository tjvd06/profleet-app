"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { AlertCircle, Loader2 } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    if (data?.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_active")
        .eq("id", data.user.id)
        .maybeSingle();

      if (!profile?.is_active) {
        await supabase.auth.signOut();
        setError("Ihr Konto wurde noch nicht freigeschaltet. Wir prüfen Ihre Registrierung und benachrichtigen Sie per E-Mail, sobald Sie loslegen können.");
        setLoading(false);
        return;
      }
    }

    router.push("/dashboard");
    router.refresh();
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 rounded-3xl border-slate-200 shadow-xl bg-white relative overflow-hidden">
        {/* Decorative flair */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2 pointer-events-none" />
        
        <div className="relative z-10 flex flex-col items-center mb-8">
          <Link href="/" className="flex items-center gap-2 mb-6">
            <Logo size={40} className="rounded-xl shadow-md" />
            <span className="text-xl font-black text-navy-700 tracking-tight">proFleet</span>
          </Link>
          <h1 className="text-2xl font-bold text-navy-950 text-center">Willkommen zurück</h1>
          <p className="text-sm text-slate-500 text-center mt-1">Geben Sie Ihre Zugangsdaten ein, um fortzufahren.</p>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6 rounded-xl border-red-200 bg-red-50 text-red-800">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="font-semibold">{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleLogin} className="space-y-5 relative z-10">
          <div className="space-y-2">
            <Label htmlFor="email">E-Mail Adresse</Label>
            <Input 
              id="email" 
              type="email" 
              placeholder="ihre@email.de" 
              required 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 bg-slate-50 border-slate-200 rounded-xl px-4 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Passwort</Label>
              <Link href="#" className="text-sm font-semibold text-blue-600 hover:text-blue-800">Passwort vergessen?</Link>
            </div>
            <Input 
              id="password" 
              type="password" 
              placeholder="••••••••" 
              required 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 bg-slate-50 border-slate-200 rounded-xl px-4 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <Button type="submit" className="w-full h-12 rounded-xl bg-navy-950 hover:bg-navy-900 text-white font-bold text-base shadow-lg shadow-navy-900/20 mt-6" disabled={loading}>
            {loading ? <Loader2 className="animate-spin mr-2" /> : null}
            Anmelden
          </Button>
        </form>

        <div className="mt-8 text-center text-sm font-medium text-slate-500 relative z-10">
          Noch kein Konto?{' '}
          <Link href="/registrieren" className="text-blue-600 font-bold hover:text-blue-800 underline underline-offset-4 decoration-blue-600/30 hover:decoration-blue-600">
            Jetzt kostenlos registrieren
          </Link>
        </div>
      </Card>
    </div>
  );
}
