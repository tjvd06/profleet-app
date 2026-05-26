"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, AlertTriangle } from "lucide-react";

const TYPE_LABELS: Record<string, string> = {
  new_message: "Neue Nachricht",
  new_offer: "Neues Angebot auf Ausschreibung",
  new_tender_matching: "Neue Ausschreibung für meine Marken",
  review_received: "Neue Bewertung erhalten",
  billing: "Rechnungen & Vertragsstatus",
  all: "Alle Benachrichtigungen",
};

export default function UnsubscribePage() {
  return (
    <Suspense fallback={<LoadingShell />}>
      <UnsubscribeContent />
    </Suspense>
  );
}

function LoadingShell() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm border border-slate-200 text-center">
        <Loader2 className="mx-auto h-10 w-10 animate-spin text-blue-600" />
      </div>
    </div>
  );
}

function UnsubscribeContent() {
  const params = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [type, setType] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setState("error");
      setErrorMsg("Kein Token in der URL — der Link ist unvollständig.");
      return;
    }
    (async () => {
      try {
        const res = await fetch("/api/email/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (!res.ok) {
          setState("error");
          setErrorMsg(data.error ?? "Fehler beim Abmelden.");
          return;
        }
        setType(data.type ?? null);
        setState("success");
      } catch {
        setState("error");
        setErrorMsg("Verbindungsfehler. Bitte später erneut versuchen.");
      }
    })();
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm border border-slate-200 text-center">
        {state === "loading" && (
          <>
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-blue-600" />
            <h1 className="mt-4 text-xl font-bold text-navy-950">
              Abmeldung wird verarbeitet…
            </h1>
          </>
        )}

        {state === "success" && (
          <>
            <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
            <h1 className="mt-4 text-2xl font-bold text-navy-950">
              Abmeldung bestätigt
            </h1>
            <p className="mt-3 text-sm text-slate-500 leading-relaxed">
              Sie erhalten ab sofort keine E-Mails mehr für:
              <br />
              <strong className="text-navy-950">
                {type ? TYPE_LABELS[type] ?? type : "diese Kategorie"}
              </strong>
              .
            </p>
            <p className="mt-3 text-xs text-slate-400">
              Andere wichtige Mails (z.B. Konto-Sicherheit, Rechnungen) bleiben aktiv.
              Alle Benachrichtigungen verwalten Sie unter „Profil → Benachrichtigungen".
            </p>
            <div className="mt-6">
              <Link href="/dashboard/profil/benachrichtigungen">
                <Button className="rounded-xl bg-navy-950 hover:bg-navy-900 text-white">
                  Zu den Benachrichtigungseinstellungen
                </Button>
              </Link>
            </div>
          </>
        )}

        {state === "error" && (
          <>
            <AlertTriangle className="mx-auto h-12 w-12 text-amber-500" />
            <h1 className="mt-4 text-2xl font-bold text-navy-950">
              Abmeldung nicht möglich
            </h1>
            <p className="mt-3 text-sm text-slate-500 leading-relaxed">
              {errorMsg ?? "Der Link ist ungültig oder abgelaufen."}
            </p>
            <p className="mt-3 text-xs text-slate-400">
              Benachrichtigungen können Sie nach dem Login direkt in der App verwalten.
            </p>
            <div className="mt-6">
              <Link href="/anmelden">
                <Button
                  variant="outline"
                  className="rounded-xl border-slate-200 text-slate-700"
                >
                  Zum Login
                </Button>
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
