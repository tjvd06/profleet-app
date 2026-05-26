"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2, Bell, Save } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { useAuth } from "@/components/providers/auth-provider";
import { toast } from "sonner";

type NotificationKey =
  | "new_message"
  | "new_offer"
  | "new_tender_matching"
  | "review_received"
  | "billing";

type ToggleDef = {
  key: NotificationKey;
  label: string;
  description: string;
  roles: ("nachfrager" | "anbieter")[]; // empty = all roles
};

const DEFAULT_TOGGLES: Record<NotificationKey, boolean> = {
  new_message: true,
  new_offer: true,
  new_tender_matching: true,
  review_received: true,
  billing: true,
};

const COMMON_TOGGLES: ToggleDef[] = [
  {
    key: "new_message",
    label: "Neue Nachricht",
    description: "Sie bekommen eine E-Mail wenn jemand Ihnen in einer Konversation schreibt.",
    roles: ["nachfrager", "anbieter"],
  },
  {
    key: "review_received",
    label: "Neue Bewertung erhalten",
    description: "Sie bekommen eine E-Mail wenn jemand Sie nach einem Abschluss bewertet.",
    roles: ["nachfrager", "anbieter"],
  },
  {
    key: "billing",
    label: "Rechnungen & Vertragsstatus",
    description: "App-eigene Mails zu Abo, Aktivierungen, Vertragsstatus.",
    roles: ["nachfrager", "anbieter"],
  },
];

const NACHFRAGER_ONLY: ToggleDef[] = [
  {
    key: "new_offer",
    label: "Neues Angebot auf meine Ausschreibung",
    description: "Wenn ein Händler ein Angebot auf eine Ihrer Ausschreibungen abgibt.",
    roles: ["nachfrager"],
  },
];

const ANBIETER_ONLY: ToggleDef[] = [
  {
    key: "new_tender_matching",
    label: "Neue Ausschreibung mit meinen vertretenen Marken",
    description: "Wenn eine Ausschreibung veröffentlicht wird, die zu Ihren Marken passt.",
    roles: ["anbieter"],
  },
];

export default function NotificationSettingsPage() {
  const { user, profile } = useAuth();
  const [supabase] = useState(() => createClient());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [settings, setSettings] = useState<Record<NotificationKey, boolean>>(DEFAULT_TOGGLES);

  const role = (profile?.role ?? "nachfrager") as "nachfrager" | "anbieter";

  const togglesForRole: ToggleDef[] = [
    ...COMMON_TOGGLES,
    ...(role === "nachfrager" ? NACHFRAGER_ONLY : ANBIETER_ONLY),
  ];

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("email_notifications, notification_settings")
        .eq("id", user.id)
        .single();

      if (error) {
        toast.error("Einstellungen konnten nicht geladen werden");
        setLoading(false);
        return;
      }

      setEmailNotifications(data.email_notifications ?? true);
      const stored = (data.notification_settings ?? {}) as Partial<Record<NotificationKey, boolean>>;
      setSettings({
        new_message: stored.new_message !== false,
        new_offer: stored.new_offer !== false,
        new_tender_matching: stored.new_tender_matching !== false,
        review_received: stored.review_received !== false,
        billing: stored.billing !== false,
      });
      setLoading(false);
    })();
  }, [user, supabase]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        email_notifications: emailNotifications,
        notification_settings: settings,
      })
      .eq("id", user.id);

    setSaving(false);
    if (error) {
      toast.error("Speichern fehlgeschlagen: " + error.message);
      return;
    }
    toast.success("Benachrichtigungen aktualisiert");
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[40vh]">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 md:px-8 py-8 md:py-12">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Bell className="text-blue-500" size={24} />
          <h1 className="text-3xl font-bold text-navy-950">Benachrichtigungen</h1>
        </div>
        <p className="text-slate-500">
          Steuern Sie welche E-Mails Sie von proFleet erhalten möchten. Auth-Mails (Login,
          Passwort-Reset) und kritische Account-Mails kommen unabhängig dieser Einstellung.
        </p>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-start justify-between gap-6">
          <div>
            <div className="font-semibold text-navy-950">
              Alle E-Mail-Benachrichtigungen
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Master-Schalter. Wenn aus, bekommen Sie keine der u.g. Benachrichtigungen.
            </p>
          </div>
          <Switch
            checked={emailNotifications}
            onCheckedChange={(v: boolean) => setEmailNotifications(v)}
          />
        </div>

        {togglesForRole.map((t) => (
          <div
            key={t.key}
            className={`p-6 border-b border-slate-100 last:border-0 flex items-start justify-between gap-6 ${
              !emailNotifications ? "opacity-50 pointer-events-none" : ""
            }`}
          >
            <div>
              <div className="font-semibold text-navy-950">{t.label}</div>
              <p className="text-sm text-slate-500 mt-1">{t.description}</p>
            </div>
            <Switch
              checked={settings[t.key]}
              onCheckedChange={(v: boolean) =>
                setSettings((prev) => ({ ...prev, [t.key]: v }))
              }
            />
          </div>
        ))}
      </div>

      <div className="mt-6 flex justify-end">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl bg-navy-950 hover:bg-navy-900 text-white h-12 px-6 font-semibold"
        >
          {saving ? (
            <Loader2 className="animate-spin mr-2" size={16} />
          ) : (
            <Save className="mr-2" size={16} />
          )}
          Einstellungen speichern
        </Button>
      </div>
    </div>
  );
}
