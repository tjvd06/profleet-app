"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Plus, FileText, Zap, Star, Inbox, Handshake,
  ReceiptText, UserCircle, MessageCircle, Settings, LogOut,
  ChevronLeft, ChevronRight, X,
} from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { createClient } from "@/lib/supabase";
import { useAuth } from "@/components/providers/auth-provider";
import { SITE_URL } from "@/lib/site";

type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
  exact?: boolean;
  badge?: boolean;
  gradient?: boolean;
};

type NavSection = {
  items: NavItem[];
};

const NACHFRAGER_NAV: NavSection[] = [
  {
    // Überblick
    items: [
      { label: "Übersicht", href: "/dashboard", icon: LayoutDashboard, exact: true },
    ],
  },
  {
    // Fahrzeuge
    items: [
      { label: "Neue Ausschreibung", href: "/dashboard/ausschreibung/neu", icon: Plus, gradient: true },
      { label: "Meine Ausschreibungen", href: "/dashboard/ausschreibungen", icon: FileText },
      { label: "Sofort-Angebote", href: "/dashboard/sofort-angebote", icon: Zap },
    ],
  },
  {
    // Kommunikation
    items: [
      { label: "Nachrichten", href: "/dashboard/nachrichten", icon: MessageCircle, badge: true },
      { label: "Bewertungen", href: "/dashboard/bewertungen", icon: Star },
    ],
  },
  {
    // Konto
    items: [
      { label: "Profil", href: "/dashboard/profil", icon: UserCircle },
      { label: "Einstellungen", href: "/dashboard/einstellungen", icon: Settings },
    ],
  },
];

const ANBIETER_NAV: NavSection[] = [
  {
    // Überblick
    items: [
      { label: "Übersicht", href: "/dashboard", icon: LayoutDashboard, exact: true },
    ],
  },
  {
    // Ausschreibungen
    items: [
      { label: "Eingang", href: "/dashboard/eingang", icon: Inbox },
      { label: "Meine Angebote", href: "/dashboard/angebote", icon: Handshake },
    ],
  },
  {
    // Sofort-Angebote
    items: [
      { label: "Sofort-Angebote", href: "/dashboard/sofort-angebote", icon: Zap },
      { label: "Neues Sofort-Angebot", href: "/dashboard/sofort-angebote/neu", icon: Plus, gradient: true },
    ],
  },
  {
    // Kommunikation
    items: [
      { label: "Nachrichten", href: "/dashboard/nachrichten", icon: MessageCircle, badge: true },
      { label: "Bewertungen", href: "/dashboard/bewertungen", icon: Star },
    ],
  },
  {
    // Konto
    items: [
      { label: "Abo & Abrechnung", href: "/dashboard/abo", icon: ReceiptText },
      { label: "Profil", href: "/dashboard/profil", icon: UserCircle },
      { label: "Einstellungen", href: "/dashboard/einstellungen", icon: Settings },
    ],
  },
];

const STORAGE_KEY = "profleet-sidebar-collapsed";

export function DashboardSidebar({
  role,
  mobileOpen,
  onMobileClose,
}: {
  role: "nachfrager" | "anbieter";
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, signOut } = useAuth();
  const [supabase] = useState(() => createClient());
  const [collapsed, setCollapsed] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const sections = role === "anbieter" ? ANBIETER_NAV : NACHFRAGER_NAV;

  // Restore collapsed state
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "true") setCollapsed(true);
    } catch {}
  }, []);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(STORAGE_KEY, String(next)); } catch {}
  };

  // Unread count
  useEffect(() => {
    if (!user) return;
    const fetchUnread = async () => {
      const { data } = await supabase.rpc("get_unread_message_count");
      if (typeof data === "number") setUnreadCount(data);
    };
    fetchUnread();
    const channel = supabase
      .channel("sidebar-messages")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => fetchUnread())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  const handleSignOut = async () => {
    try { await fetch("/api/auth/signout", { method: "POST" }); } catch {}
    await signOut();
    window.location.href = SITE_URL || "/";
  };

  const sidebarWidth = collapsed ? "w-[70px]" : "w-[260px]";

  const renderItem = (item: NavItem) => {
    const isActive = item.exact
      ? pathname === item.href
      : pathname.startsWith(item.href);
    const Icon = item.icon;

    if (item.gradient) {
      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={onMobileClose}
          className={`flex items-center gap-3 rounded-xl font-bold text-white shadow-md shadow-blue-500/20 transition-all hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] ${
            collapsed ? "justify-center px-2 py-3 mx-1" : "px-4 py-3 mx-3"
          }`}
          style={{ background: "linear-gradient(135deg, #3B82F6, #22D3EE)" }}
          title={collapsed ? item.label : undefined}
        >
          <Icon size={18} />
          {!collapsed && <span className="text-sm">{item.label}</span>}
        </Link>
      );
    }

    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onMobileClose}
        className={`group flex items-center gap-3 rounded-xl text-sm font-medium transition-all relative ${
          collapsed ? "justify-center px-2 py-2.5 mx-1" : "px-4 py-2.5 mx-3"
        } ${
          isActive
            ? "bg-blue-50 text-blue-600 font-semibold"
            : "text-slate-600 hover:bg-slate-100 hover:text-navy-950"
        }`}
        title={collapsed ? item.label : undefined}
      >
        {isActive && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-blue-600 rounded-r-full" />
        )}
        <Icon size={18} className={isActive ? "text-blue-500" : "text-slate-400 group-hover:text-slate-600"} />
        {!collapsed && <span className="flex-1">{item.label}</span>}
        {item.badge && unreadCount > 0 && (
          <span className={`bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center ${
            collapsed ? "absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-0.5" : "min-w-[20px] h-[20px] px-1"
          }`}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Link>
    );
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo + collapse */}
      <div className={`flex items-center shrink-0 border-b border-slate-100 ${collapsed ? "justify-center px-2 h-16" : "justify-between px-5 h-16"}`}>
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center gap-2">
            <Logo size={32} className="rounded-lg" />
            <span className="text-lg font-black text-navy-700 tracking-tight">proFleet</span>
          </Link>
        )}
        {collapsed && (
          <Link href="/dashboard">
            <Logo size={32} className="rounded-lg" />
          </Link>
        )}
        <button
          onClick={toggleCollapsed}
          className={`hidden md:flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-navy-950 hover:bg-slate-100 transition-colors ${collapsed ? "absolute top-4 right-2" : ""}`}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Nav sections */}
      <div className="flex-1 overflow-y-auto py-4 space-y-1">
        {sections.map((section, si) => (
          <div key={si}>
            {si > 0 && <div className={`my-4 border-t border-slate-100 ${collapsed ? "mx-2" : "mx-5"}`} />}
            <div className="space-y-1">
              {section.items.map(renderItem)}
            </div>
          </div>
        ))}
      </div>

      {/* Signout */}
      <div className="border-t border-slate-100 py-3">
        <button
          onClick={handleSignOut}
          className={`flex items-center gap-3 rounded-xl text-sm font-medium text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all w-full ${
            collapsed ? "justify-center px-2 py-2.5 mx-1" : "px-4 py-2.5 mx-3"
          }`}
          title={collapsed ? "Abmelden" : undefined}
        >
          <LogOut size={18} />
          {!collapsed && <span>Abmelden</span>}
        </button>
      </div>

      {/* User info */}
      {!collapsed && profile && (
        <div className="border-t border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-navy-100 text-navy-800 flex items-center justify-center text-xs font-bold shrink-0">
              {profile.first_name && profile.last_name
                ? `${profile.first_name[0]}${profile.last_name[0]}`.toUpperCase()
                : "U"}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-navy-950 truncate">
                {profile.first_name} {profile.last_name}
              </p>
              <p className="text-[11px] text-slate-400 truncate">{user?.email}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`hidden md:flex flex-col bg-white border-r border-slate-200 shrink-0 h-screen sticky top-0 transition-all duration-300 ease-in-out ${sidebarWidth}`}
      >
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={onMobileClose} />
          <aside className="relative w-[280px] h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-left duration-300">
            {/* Mobile close button */}
            <button
              onClick={onMobileClose}
              className="absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-navy-950 hover:bg-slate-100 z-10"
            >
              <X size={18} />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}
