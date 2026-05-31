import Link from "next/link";
import { CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NewsletterConfirmedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm border border-slate-200 text-center">
        <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
        <h1 className="mt-4 text-2xl font-bold text-navy-950">
          Newsletter-Anmeldung bestätigt
        </h1>
        <p className="mt-3 text-sm text-slate-500 leading-relaxed">
          Sie sind jetzt für den proFleet-Newsletter angemeldet. Wir freuen uns, Sie auf
          dem Laufenden zu halten.
        </p>
        <p className="mt-3 text-xs text-slate-400 leading-relaxed">
          Sie können sich jederzeit wieder abmelden — entweder über den Abmelde-Link in
          jeder Newsletter-Mail oder im Profil unter „Benachrichtigungen".
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Link href="/dashboard">
            <Button className="w-full rounded-xl bg-navy-950 hover:bg-navy-900 text-white">
              Zum Dashboard
            </Button>
          </Link>
          <Link href="/dashboard/profil/benachrichtigungen">
            <Button
              variant="outline"
              className="w-full rounded-xl border-slate-200 text-slate-700"
            >
              Einstellungen anpassen
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
