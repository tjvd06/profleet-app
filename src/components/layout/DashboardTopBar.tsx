"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Menu, Search, Bell, User, LogOut, Settings, ChevronRight } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { MARKETING_URL } from "@/lib/site";
import { createClient } from "@/lib/supabase";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";

const BREADCRUMB_MAP: Record<string, string> = {
  "/dashboard": "Übersicht",
  "/dashboard/ausschreibung/neu": "Neue Ausschreibung",
  "/dashboard/ausschreibungen": "Meine Ausschreibungen",
  "/dashboard/eingang": "Eingang",
  "/dashboard/angebote": "Meine Angebote",
  "/dashboard/sofort-angebote": "Sofort-Angebote",
  "/dashboard/nachrichten": "Nachrichten",
  "/dashboard/bewertungen": "Bewertungen",
  "/dashboard/rechnungen": "Rechnungen",
  "/dashboard/abo": "Abo & Abrechnung",
  "/dashboard/profil": "Profil",
  "/dashboard/einstellungen": "Einstellungen",
};

function getBreadcrumb(pathname: string): string {
  if (BREADCRUMB_MAP[pathname]) return BREADCRUMB_MAP[pathname];
  // Try prefix match
  const match = Object.entries(BREADCRUMB_MAP)
    .filter(([k]) => k !== "/dashboard" && pathname.startsWith(k))
    .sort((a, b) => b[0].length - a[0].length)[0];
  return match ? match[1] : "Dashboard";
}

export function DashboardTopBar({ onMobileMenuToggle }: { onMobileMenuToggle: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, signOut } = useAuth();
  const [supabase] = useState(() => createClient());
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    const fetchUnread = async () => {
      const { data } = await supabase.rpc("get_unread_message_count");
      if (typeof data === "number") setUnreadCount(data);
    };
    fetchUnread();
    const channel = supabase
      .channel("topbar-messages")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => fetchUnread())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  const handleSignOut = async () => {
    try { await fetch("/api/auth/signout", { method: "POST" }); } catch {}
    await signOut();
    window.location.href = MARKETING_URL;
  };

  const breadcrumb = getBreadcrumb(pathname);

  return (
    <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200 h-14 flex items-center px-4 md:px-6 gap-4">
      {/* Mobile hamburger */}
      <button
        onClick={onMobileMenuToggle}
        className="md:hidden text-slate-500 hover:text-navy-950 -ml-1"
      >
        <Menu size={22} />
      </button>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm min-w-0">
        <Link href="/dashboard" className="text-slate-400 hover:text-slate-600 font-medium hidden sm:inline">
          Dashboard
        </Link>
        {breadcrumb !== "Übersicht" && (
          <>
            <ChevronRight size={14} className="text-slate-300 hidden sm:inline shrink-0" />
            <span className="font-semibold text-navy-950 truncate">{breadcrumb}</span>
          </>
        )}
        {breadcrumb === "Übersicht" && (
          <span className="font-semibold text-navy-950 sm:hidden">Dashboard</span>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right side actions */}
      <div className="flex items-center gap-3">
        {/* Messages bell */}
        <Link
          href="/dashboard/nachrichten"
          className="relative text-slate-400 hover:text-navy-950 transition-colors p-1.5"
        >
          <Bell size={18} />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[15px] h-[15px] flex items-center justify-center px-0.5">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Link>

        {/* User dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-100 text-navy-800 hover:bg-navy-200 transition-colors outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 text-xs font-bold">
            {profile?.first_name && profile?.last_name
              ? `${profile.first_name[0]}${profile.last_name[0]}`.toUpperCase()
              : <User size={14} />}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 mt-2 rounded-2xl p-2 bg-white border-slate-200">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="font-bold flex flex-col gap-0.5">
                <span className="text-navy-950">{profile?.first_name || "User"} {profile?.last_name || ""}</span>
                <span className="text-[11px] text-slate-500 font-medium truncate">{user?.email}</span>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator className="bg-slate-100 my-1" />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => router.push("/dashboard/profil")} className="cursor-pointer rounded-lg px-3 py-2.5 hover:bg-slate-50 focus:bg-slate-50 flex items-center w-full font-semibold text-slate-600">
                <User className="mr-2 h-4 w-4 text-slate-400" />
                Profil
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/dashboard/einstellungen")} className="cursor-pointer rounded-lg px-3 py-2.5 hover:bg-slate-50 focus:bg-slate-50 flex items-center w-full font-semibold text-slate-600">
                <Settings className="mr-2 h-4 w-4 text-slate-400" />
                Einstellungen
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator className="bg-slate-100 my-1" />
            <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-red-600 hover:bg-red-50 focus:bg-red-50 focus:text-red-700 rounded-lg px-3 py-2.5 font-bold">
              <LogOut className="mr-2 h-4 w-4" />
              Abmelden
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
