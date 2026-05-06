"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Send, Loader2, MessageCircle, Search, ArrowLeft,
  Phone, Check, CheckCheck, Mail, MapPin, Car, ExternalLink,
  Smile, Trash2, ChevronDown,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { useAuth } from "@/components/providers/auth-provider";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";

// ─── Types ──────────────────────────────────────────────────────────────────
type Message = {
  id: string;
  contact_id: string;
  sender_id: string;
  content: string;
  read: boolean;
  created_at: string;
};

type PartnerProfile = {
  id: string;
  company_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email_public: string | null;
  city: string | null;
  zip: string | null;
  street: string | null;
  role: string | null;
  subscription_tier: string | null;
  industry: string | null;
  dealer_type: string | null;
};

type TenderInfo = {
  id: string;
  status: string;
  tender_vehicles: { brand: string | null; model_name: string | null; quantity: number }[];
};

type InstantOfferInfo = {
  id: string;
  brand: string | null;
  model_name: string | null;
  status: string;
};

type ContactWithProfile = {
  id: string;
  tender_id: string | null;
  offer_id: string | null;
  instant_offer_id: string | null;
  buyer_id: string;
  dealer_id: string;
  status: string;
  created_at: string;
  partner: PartnerProfile | null;
  tender: TenderInfo | null;
  instantOffer: InstantOfferInfo | null;
  tenderLabel: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
};

// ─── Helpers ────────────────────────────────────────────────────────────────
function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  if (isToday) return time;
  if (isYesterday) return `Gestern ${time}`;
  return `${d.toLocaleDateString("de-DE", { day: "2-digit", month: "short" })} ${time}`;
}

function formatListTime(dateStr: string | null) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Gestern";
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
}

// ─── Hidden chats persistence (localStorage) ───────────────────────────────
const HIDDEN_KEY = "profleet_hidden_chats";

function getHiddenChats(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(HIDDEN_KEY) || "{}");
  } catch {
    return {};
  }
}

function hideChat(contactId: string) {
  const hidden = getHiddenChats();
  hidden[contactId] = new Date().toISOString();
  localStorage.setItem(HIDDEN_KEY, JSON.stringify(hidden));
}

function unhideChat(contactId: string) {
  const hidden = getHiddenChats();
  delete hidden[contactId];
  localStorage.setItem(HIDDEN_KEY, JSON.stringify(hidden));
}

function isChatVisible(contact: ContactWithProfile): boolean {
  const hidden = getHiddenChats();
  const hiddenAt = hidden[contact.id];
  if (!hiddenAt) return true;
  // Show chat again if there's a message after it was hidden
  if (contact.lastMessageAt && new Date(contact.lastMessageAt) > new Date(hiddenAt)) {
    unhideChat(contact.id);
    return true;
  }
  return false;
}

// ─── Main Page ──────────────────────────────────────────────────────────────
export default function MessagesPage() {
  const { user, profile, isLoading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const initialContactId = searchParams.get("contact");
  const [supabase] = useState(() => createClient());

  const [contactsList, setContactsList] = useState<ContactWithProfile[]>([]);
  const [activeContactId, setActiveContactId] = useState<string | null>(initialContactId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [mobileShowChat, setMobileShowChat] = useState(!!initialContactId);
  const [deleteTarget, setDeleteTarget] = useState<ContactWithProfile | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [, setHiddenVersion] = useState(0); // triggers re-filter on hide/unhide

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isDealer = profile?.role === "anbieter";
  const activeContact = contactsList.find((c) => c.id === activeContactId);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  }, []);

  // ── Load contacts with profiles ──────────────────────────────────────────
  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;

    (async () => {
      const { data: rawContacts } = await supabase
        .from("contacts")
        .select("*")
        .or(`buyer_id.eq.${user.id},dealer_id.eq.${user.id}`)
        .order("created_at", { ascending: false });

      if (cancelled || !rawContacts || rawContacts.length === 0) {
        if (!cancelled) setLoading(false);
        return;
      }

      const partnerIds = rawContacts.map((c: any) =>
        c.buyer_id === user.id ? c.dealer_id : c.buyer_id
      );
      const uniquePartnerIds = Array.from(new Set(partnerIds));

      const tenderIds = rawContacts.map((c: any) => c.tender_id).filter(Boolean);
      const instantOfferIds = rawContacts.map((c: any) => c.instant_offer_id).filter(Boolean);

      const profilesPromise = supabase.from("profiles").select("id, company_name, first_name, last_name, phone, email_public, city, zip, street, role, industry, dealer_type").in("id", uniquePartnerIds);
      const messagesPromise = supabase.from("messages").select("contact_id, content, sender_id, read, created_at").in("contact_id", rawContacts.map((c: any) => c.id)).order("created_at", { ascending: false });
      const tendersPromise = tenderIds.length > 0
        ? supabase.from("tenders").select("id, status, tender_vehicles(brand, model_name, quantity)").in("id", tenderIds)
        : null;
      const instantOffersPromise = instantOfferIds.length > 0
        ? supabase.from("instant_offers").select("id, brand, model_name, status").in("id", instantOfferIds)
        : null;

      const [profilesResult, messagesResult, tendersResult, instantOffersResult] = await Promise.all([
        profilesPromise, messagesPromise, tendersPromise, instantOffersPromise,
      ]);

      if (cancelled) return;

      const profileMap: Record<string, PartnerProfile> = {};
      (profilesResult.data || []).forEach((p: any) => { profileMap[p.id] = p; });

      const tenderMap: Record<string, TenderInfo> = {};
      (tendersResult?.data || []).forEach((t: any) => { tenderMap[t.id] = t; });

      const instantOfferMap: Record<string, InstantOfferInfo> = {};
      (instantOffersResult?.data || []).forEach((io: any) => { instantOfferMap[io.id] = io; });

      const msgByContact: Record<string, { last: any; unread: number }> = {};
      (messagesResult.data || []).forEach((m: any) => {
        if (!msgByContact[m.contact_id]) {
          msgByContact[m.contact_id] = { last: m, unread: 0 };
        }
        if (!m.read && m.sender_id !== user.id) {
          msgByContact[m.contact_id].unread++;
        }
      });

      const enriched: ContactWithProfile[] = rawContacts.map((c: any) => {
        const partnerId = c.buyer_id === user.id ? c.dealer_id : c.buyer_id;
        const partner = profileMap[partnerId] || null;
        const tender = c.tender_id ? (tenderMap[c.tender_id] || null) : null;
        const instantOffer = c.instant_offer_id ? (instantOfferMap[c.instant_offer_id] || null) : null;

        let tenderLabel: string;
        if (instantOffer) {
          tenderLabel = `${instantOffer.brand || ""} ${instantOffer.model_name || ""}`.trim() || "Sofort-Angebot";
        } else if (tender) {
          const v = tender.tender_vehicles?.[0];
          tenderLabel = v ? `${v.brand || ""} ${v.model_name || ""}`.trim() : "Ausschreibung";
        } else {
          tenderLabel = "Konversation";
        }

        const msgInfo = msgByContact[c.id];
        return {
          ...c,
          partner,
          tender,
          instantOffer,
          tenderLabel,
          lastMessage: msgInfo?.last?.content || null,
          lastMessageAt: msgInfo?.last?.created_at || c.created_at,
          unreadCount: msgInfo?.unread || 0,
        };
      });

      enriched.sort((a, b) => new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime());

      if (!cancelled) {
        setContactsList(enriched);
        // Auto-select first visible contact if none selected
        if (!activeContactId) {
          const firstVisible = enriched.find((c) => isChatVisible(c));
          if (firstVisible) setActiveContactId(firstVisible.id);
        }
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [authLoading, user?.id]);

  // ── Load messages for active contact ─────────────────────────────────────
  useEffect(() => {
    if (!activeContactId || !user) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setMessagesLoading(true);

    (async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("contact_id", activeContactId)
        .order("created_at", { ascending: true });

      if (!cancelled && data) {
        setMessages(data);
        const unread = data.filter((m) => !m.read && m.sender_id !== user.id);
        if (unread.length > 0) {
          await supabase.from("messages").update({ read: true }).in("id", unread.map((m) => m.id));
          setContactsList((prev) =>
            prev.map((c) => c.id === activeContactId ? { ...c, unreadCount: 0 } : c)
          );
        }
      }
      if (!cancelled) setMessagesLoading(false);
    })();

    return () => { cancelled = true; };
  }, [activeContactId, user?.id]);

  useEffect(() => {
    if (!messagesLoading) scrollToBottom();
  }, [messages.length, messagesLoading, scrollToBottom]);

  // ── Realtime subscription ────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("messages-page-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new as Message;

          if (msg.contact_id === activeContactId) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev;
              return [...prev, msg];
            });
            if (msg.sender_id !== user.id) {
              supabase.from("messages").update({ read: true }).eq("id", msg.id).then();
            }
          }

          setContactsList((prev) => {
            const updated = prev.map((c) => {
              if (c.id !== msg.contact_id) return c;
              return {
                ...c,
                lastMessage: msg.content,
                lastMessageAt: msg.created_at,
                unreadCount: msg.contact_id === activeContactId ? c.unreadCount : c.unreadCount + (msg.sender_id !== user.id ? 1 : 0),
              };
            });
            updated.sort((a, b) => new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime());
            return updated;
          });

          // Force re-check hidden state (new message might unhide a chat)
          setHiddenVersion((v) => v + 1);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id, activeContactId]);

  // ── Send message ─────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!text.trim() || !user || sending || !activeContactId) return;
    setSending(true);

    const { error } = await supabase.from("messages").insert({
      contact_id: activeContactId,
      sender_id: user.id,
      content: text.trim(),
    });

    if (!error) {
      setText("");
      inputRef.current?.focus();
    }
    setSending(false);
  };

  // ── Delete (hide) chat ──────────────────────────────────────────────────
  const handleDeleteChat = (contact: ContactWithProfile) => {
    hideChat(contact.id);
    setHiddenVersion((v) => v + 1);
    if (activeContactId === contact.id) {
      const nextVisible = contactsList.find((c) => c.id !== contact.id && isChatVisible(c));
      setActiveContactId(nextVisible?.id || null);
      setMobileShowChat(false);
    }
    setDeleteTarget(null);
  };

  // ── Filtered & visible contacts ──────────────────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const visibleContacts = contactsList.filter((c) => isChatVisible(c));

  const filteredContacts = searchQuery
    ? visibleContacts.filter((c) =>
      (c.partner?.company_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.tenderLabel.toLowerCase().includes(searchQuery.toLowerCase())
    )
    : visibleContacts;

  const selectContact = (id: string) => {
    setActiveContactId(id);
    setMobileShowChat(true);
    setShowDetails(false);
  };

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-130px)]">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center">
              <MessageCircle size={28} className="text-white" />
            </div>
            <Loader2 className="animate-spin text-blue-500 absolute -bottom-1 -right-1" size={20} />
          </div>
          <span className="text-sm font-medium text-slate-400">Nachrichten werden geladen...</span>
        </div>
      </div>
    );
  }

  if (visibleContacts.length === 0 && contactsList.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-130px)] text-center px-4">
        <div className="w-24 h-24 bg-gradient-to-br from-slate-100 to-slate-50 rounded-3xl flex items-center justify-center mb-6 shadow-inner">
          <MessageCircle size={40} className="text-slate-300" />
        </div>
        <h3 className="text-2xl font-bold text-navy-950 mb-2">Keine Nachrichten</h3>
        <p className="text-slate-500 max-w-sm leading-relaxed">
          {isDealer
            ? "Sobald ein Nachfrager Sie kontaktiert, erscheinen Ihre Nachrichten hier."
            : "Nehmen Sie über Ihre Ausschreibungen Kontakt mit Händlern auf."}
        </p>
      </div>
    );
  }

  const p = activeContact?.partner;
  const t = activeContact?.tender;
  const partnerInitials = p?.company_name
    ? p.company_name.substring(0, 2).toUpperCase()
    : "??";

  return (
    <>
      <div className="flex h-[calc(100vh-130px)] bg-slate-50">
        {/* ── Left: Conversation List ──────────────────────────────── */}
        <div className={`w-full md:w-[360px] md:min-w-[360px] border-r border-slate-200/80 flex flex-col bg-white ${mobileShowChat ? "hidden md:flex" : "flex"}`}>
          {/* Search header */}
          <div className="p-4 pb-3">
            <h2 className="text-lg font-bold text-navy-950 mb-3">Nachrichten</h2>
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Suchen..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-10 bg-slate-50/80 border-slate-200/60 rounded-xl text-sm placeholder:text-slate-400 focus:bg-white"
              />
            </div>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto">
            {filteredContacts.length === 0 && visibleContacts.length === 0 && contactsList.length > 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
                  <MessageCircle size={24} className="text-slate-300" />
                </div>
                <p className="text-sm font-medium text-slate-500 mb-1">Alle Chats ausgeblendet</p>
                <p className="text-xs text-slate-400">Neue Nachrichten lassen Chats automatisch wieder erscheinen.</p>
              </div>
            ) : filteredContacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                <p className="text-sm text-slate-400">Keine Ergebnisse</p>
              </div>
            ) : (
              filteredContacts.map((contact) => {
                const isActive = contact.id === activeContactId;
                const companyName = contact.partner?.company_name || "Unbekannt";
                const initials = companyName.substring(0, 2).toUpperCase();
                const hasUnread = contact.unreadCount > 0;

                return (
                  <div
                    key={contact.id}
                    className={`relative group ${isActive ? "bg-blue-50/70" : "hover:bg-slate-50/80"}`}
                  >
                    <button
                      onClick={() => selectContact(contact.id)}
                      className="w-full text-left px-4 py-3.5 transition-all flex items-center gap-3"
                    >
                      {/* Active indicator */}
                      {isActive && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-8 bg-blue-600 rounded-r-full" />
                      )}

                      {/* Avatar */}
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-sm shrink-0 transition-colors ${isActive
                          ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-md shadow-blue-500/20"
                          : hasUnread
                            ? "bg-gradient-to-br from-blue-100 to-blue-50 text-blue-600"
                            : "bg-slate-100 text-slate-500"
                        }`}>
                        {initials}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className={`text-[13px] truncate flex items-center gap-1.5 ${hasUnread ? "font-bold text-navy-950" : "font-semibold text-navy-950"
                            }`}>
                            {companyName}
                          </span>
                          <span className={`text-[11px] shrink-0 ml-2 ${hasUnread ? "text-blue-600 font-semibold" : "text-slate-400"}`}>
                            {formatListTime(contact.lastMessageAt)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <p className={`text-xs truncate leading-relaxed ${hasUnread ? "text-slate-700 font-medium" : "text-slate-500"}`}>
                            {contact.lastMessage || "Neue Konversation"}
                          </p>
                          {hasUnread && (
                            <span className="ml-2 bg-blue-600 text-white text-[10px] font-bold rounded-full min-w-[20px] h-[20px] flex items-center justify-center px-1 shrink-0 shadow-sm shadow-blue-600/30">
                              {contact.unreadCount > 99 ? "99+" : contact.unreadCount}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <Car size={10} className="text-slate-400 shrink-0" />
                          <span className="text-[10px] text-slate-400 truncate">{contact.tenderLabel}</span>
                        </div>
                      </div>
                    </button>

                    {/* Delete button - visible on hover */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(contact);
                      }}
                      className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500"
                      title="Chat ausblenden"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── Center: Chat Area ────────────────────────────────────── */}
        <div className={`flex-1 flex flex-col min-w-0 ${!mobileShowChat ? "hidden md:flex" : "flex"}`}>
          {activeContact ? (
            <>
              {/* Chat header — clicks to expand details below */}
              <div className="bg-white shrink-0 border-b border-slate-200/80">
                <button
                  onClick={() => setShowDetails((v) => !v)}
                  className="w-full px-5 py-3 flex items-center justify-between cursor-pointer hover:bg-slate-50/60 transition-colors text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); setMobileShowChat(false); }}
                      className="md:hidden text-slate-400 hover:text-navy-950 transition-colors"
                    >
                      <ArrowLeft size={20} />
                    </button>
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center font-bold text-xs text-white shadow-sm shadow-blue-500/20 shrink-0">
                      {partnerInitials}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-navy-950 truncate">
                        {p?.company_name || "Unbekannt"}
                      </h3>
                      <p className="text-xs text-slate-400 truncate">
                        {activeContact.tenderLabel !== "Ausschreibung" && (
                          <span className="inline-flex items-center gap-1">
                            <Car size={10} className="shrink-0" />
                            {activeContact.tenderLabel}
                          </span>
                        )}
                        {activeContact.tenderLabel === "Ausschreibung" && (p?.city ? `${p.zip || ""} ${p.city}` : "—")}
                      </p>
                    </div>
                  </div>
                  <ChevronDown size={16} className={`text-slate-400 shrink-0 ml-2 transition-transform duration-200 ${showDetails ? "rotate-180" : ""}`} />
                </button>

                {/* Expanded details panel */}
                <div
                  className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${showDetails ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
                >
                  <div className="overflow-hidden">
                    <div className="border-t border-slate-100">
                      {/* Partner hero */}
                      <div className="bg-gradient-to-br from-slate-50/80 to-white px-5 py-5">
                        <div className="flex items-start gap-4">
                          <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-2xl flex items-center justify-center font-bold text-base text-white shadow-lg shadow-blue-500/20 shrink-0">
                            {partnerInitials}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-navy-950 text-base truncate">{p?.company_name || "Unbekannt"}</p>
                            {p?.city && (
                              <p className="text-sm text-slate-500 mt-0.5 flex items-center gap-1.5">
                                <MapPin size={12} className="shrink-0 text-slate-400" />
                                {[p.street, [p.zip, p.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
                              </p>
                            )}
                            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                              {p?.dealer_type && (
                                <Badge variant="outline" className="text-[10px] border-slate-200 text-slate-500 font-medium">{p.dealer_type}</Badge>
                              )}
                              {p?.industry && (
                                <Badge variant="outline" className="text-[10px] border-slate-200 text-slate-500 font-medium">{p.industry}</Badge>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Contact action buttons */}
                        <div className="flex items-center gap-2 mt-4">
                          {p?.phone && (
                            <a
                              href={`tel:${p.phone}`}
                              className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-white border border-slate-200/80 text-sm font-medium text-navy-950 hover:bg-green-50 hover:border-green-200 hover:text-green-700 transition-colors shadow-sm"
                            >
                              <Phone size={14} />
                              <span className="truncate">{p.phone}</span>
                            </a>
                          )}
                          {p?.email_public && (
                            <a
                              href={`mailto:${p.email_public}`}
                              className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-white border border-slate-200/80 text-sm font-medium text-navy-950 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-colors shadow-sm"
                            >
                              <Mail size={14} />
                              <span className="truncate">{p.email_public}</span>
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Tender info */}
                      {t && (
                        <div className="px-5 py-4 border-t border-slate-100">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Ausschreibung</p>
                          <div className="flex items-center gap-2 mb-3">
                            <Badge variant="outline" className="text-[10px] font-mono text-slate-500 bg-white">{t.id.split("-")[0].toUpperCase()}</Badge>
                            <Badge className={`text-[10px] border-none ${t.status === "active" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"}`}>
                              {t.status === "active" ? "Aktiv" : t.status === "cancelled" ? "Zurückgezogen" : "Abgeschlossen"}
                            </Badge>
                          </div>
                          {t.tender_vehicles.map((v, i) => (
                            <div key={i} className="flex items-center gap-2.5 mb-1.5">
                              <Car size={14} className="text-blue-500 shrink-0" />
                              <span className="font-semibold text-navy-950 text-sm">{v.quantity}x {v.brand || "—"} {v.model_name || ""}</span>
                            </div>
                          ))}
                          <Link
                            href={isDealer ? `/dashboard/eingang/${t.id}/angebot` : `/dashboard/ausschreibungen`}
                            className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-semibold mt-2 transition-colors"
                          >
                            <ExternalLink size={13} />
                            Zur Ausschreibung
                          </Link>
                        </div>
                      )}

                      {/* Instant offer info */}
                      {activeContact.instantOffer && (
                        <div className="px-5 py-4 border-t border-slate-100">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Sofort-Angebot</p>
                          <div className="flex items-center gap-2.5 mb-1.5">
                            <Car size={14} className="text-blue-500 shrink-0" />
                            <span className="font-semibold text-navy-950 text-sm">
                              {activeContact.instantOffer.brand || "—"} {activeContact.instantOffer.model_name || ""}
                            </span>
                          </div>
                          <a
                            href={`${SITE_URL}/sofort-angebote/${activeContact.instantOffer.id}`}
                            className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-semibold mt-2 transition-colors"
                          >
                            <ExternalLink size={13} />
                            Zum Sofort-Angebot
                          </a>
                        </div>
                      )}

                      {/* Footer */}
                      <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
                        <span className="text-[11px] text-slate-400 font-medium">
                          Kontakt seit {new Date(activeContact.created_at).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" })}
                        </span>
                        <button
                          onClick={() => setDeleteTarget(activeContact)}
                          className="flex items-center gap-1.5 text-xs font-medium text-red-500 hover:text-red-600 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition-colors"
                        >
                          <Trash2 size={13} />
                          Ausblenden
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Messages area */}
              <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                <div
                  ref={scrollRef}
                  className="flex-1 overflow-y-auto px-4 md:px-6 py-5 space-y-1"
                  style={{ background: "linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)" }}
                >
                  {messagesLoading ? (
                    <div className="flex items-center justify-center py-20 text-slate-400">
                      <Loader2 className="animate-spin mr-2" size={18} />
                      <span className="text-sm">Nachrichten laden...</span>
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                      <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center mb-4">
                        <Smile size={28} className="text-slate-300" />
                      </div>
                      <p className="text-sm font-medium text-slate-500 mb-1">Noch keine Nachrichten</p>
                      <p className="text-xs text-slate-400">Sagen Sie Hallo!</p>
                    </div>
                  ) : (
                    <>
                      {messages.map((msg, i) => {
                        const isOwn = msg.sender_id === user?.id;
                        const prevMsg = i > 0 ? messages[i - 1] : null;
                        const sameSender = prevMsg?.sender_id === msg.sender_id;
                        const timeDiff = prevMsg
                          ? new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime()
                          : Infinity;
                        const showGap = timeDiff > 300000;

                        return (
                          <div key={msg.id}>
                            {showGap && (
                              <div className="flex justify-center my-4">
                                <span className="text-[10px] text-slate-400 bg-white/80 backdrop-blur-sm px-3 py-1 rounded-full border border-slate-100 shadow-sm">
                                  {formatTime(msg.created_at)}
                                </span>
                              </div>
                            )}
                            <div className={`flex ${isOwn ? "justify-end" : "justify-start"} ${sameSender && !showGap ? "mt-0.5" : "mt-3"}`}>
                              <div
                                className={`max-w-[70%] px-4 py-2.5 ${isOwn
                                    ? "bg-gradient-to-br from-blue-600 to-blue-500 text-white rounded-2xl rounded-br-lg shadow-sm shadow-blue-500/10"
                                    : "bg-white text-slate-800 rounded-2xl rounded-bl-lg shadow-sm border border-slate-100"
                                  }`}
                              >
                                <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
                                <div className={`flex items-center gap-1 justify-end mt-1 ${isOwn ? "text-blue-200/80" : "text-slate-400"}`}>
                                  <span className="text-[10px]">
                                    {new Date(msg.created_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                                  </span>
                                  {isOwn && (
                                    msg.read
                                      ? <CheckCheck size={13} className="text-blue-200" />
                                      : <Check size={13} className="text-blue-300/40" />
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>

                {/* Message input */}
                <div className="px-4 md:px-6 py-3 bg-white border-t border-slate-200/60 shrink-0">
                  <div className="flex items-end gap-2.5">
                    <div className="flex-1 relative">
                      <textarea
                        ref={inputRef}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                          }
                        }}
                        placeholder="Nachricht schreiben..."
                        rows={1}
                        className="w-full resize-none rounded-2xl border border-slate-200/80 bg-slate-50/50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-300 focus:bg-white max-h-32 transition-all placeholder:text-slate-400"
                      />
                    </div>
                    <Button
                      onClick={handleSend}
                      disabled={!text.trim() || sending}
                      className="rounded-2xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white h-[46px] w-[46px] p-0 shrink-0 shadow-md shadow-blue-500/20 disabled:opacity-40 disabled:shadow-none transition-all"
                    >
                      {sending ? <Loader2 className="animate-spin" size={17} /> : <Send size={17} />}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-center px-4 bg-slate-50/50">
              <div className="flex flex-col items-center">
                <div className="w-20 h-20 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center mb-5">
                  <MessageCircle size={32} className="text-slate-300" />
                </div>
                <h3 className="text-lg font-bold text-navy-950 mb-1">Wählen Sie eine Konversation</h3>
                <p className="text-sm text-slate-500 max-w-xs">Klicken Sie links auf eine Konversation, um den Chat zu öffnen.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Delete confirmation dialog ──────────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Chat ausblenden?</DialogTitle>
            <DialogDescription>
              Der Chat mit <span className="font-semibold text-navy-950">{deleteTarget?.partner?.company_name || "diesem Kontakt"}</span> wird
              aus Ihrer Liste entfernt. Alle Nachrichten bleiben erhalten &mdash; wenn Sie eine neue Nachricht erhalten,
              erscheint der Chat automatisch wieder mit dem gesamten Verlauf.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <DialogClose render={<Button variant="outline" className="rounded-xl" />}>
              Abbrechen
            </DialogClose>
            <Button
              variant="destructive"
              className="rounded-xl"
              onClick={() => deleteTarget && handleDeleteChat(deleteTarget)}
            >
              <Trash2 size={14} className="mr-1.5" />
              Ausblenden
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
