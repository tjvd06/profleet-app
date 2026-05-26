"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RatingBadge } from "@/components/ui-custom/RatingBadge";
import { SavingsBadge } from "@/components/ui-custom/SavingsBadge";
import { Bookmark, MapPin, Pencil, Send, Trash2, Package } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase";
import { type InstantOfferRow, buildSpecsString, getImageUrl, buildLocationString } from "@/lib/instant-offers";

type ViewMode = "public" | "buyer" | "seller";

export function InstantOfferCard({
  offer,
  viewMode = "public",
  isOwnOffer = false,
  initialBookmarked = false,
  userId,
  onDelete,
  onBookmarkToggle,
  onInquiry,
}: {
  offer: InstantOfferRow;
  viewMode?: ViewMode;
  isOwnOffer?: boolean;
  initialBookmarked?: boolean;
  userId?: string | null;
  onDelete?: (id: string) => void;
  onBookmarkToggle?: () => void;
  onInquiry?: (offerId: string, dealerId: string) => void;
}) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [isDeleting, setIsDeleting] = useState(false);
  const supabase = createClient();

  const specs = buildSpecsString(offer);
  const location = buildLocationString(offer);
  const offerPrice = offer.purchase_price_net ?? 0;
  const savingsPercent = offer.discount_percent ?? 0;
  const imageUrl = offer.images && offer.images.length > 0 ? getImageUrl(offer.images[0]) : null;

  const handleBookmark = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!userId) return;

    const newState = !bookmarked;
    setBookmarked(newState);

    // If an in-memory toggle handler is provided, use it instead of Supabase
    if (onBookmarkToggle) {
      onBookmarkToggle();
      return;
    }

    if (newState) {
      await supabase.from("bookmarks").insert({ user_id: userId, instant_offer_id: offer.id });
    } else {
      await supabase.from("bookmarks").delete().eq("user_id", userId).eq("instant_offer_id", offer.id);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Möchten Sie dieses Angebot wirklich löschen?")) return;
    setIsDeleting(true);
    const { error } = await supabase.from("instant_offers").delete().eq("id", offer.id);
    if (!error && onDelete) onDelete(offer.id);
    setIsDeleting(false);
  };

  return (
    <Link href={`/dashboard/sofort-angebote/${offer.id}`}>
      <Card className="flex flex-col overflow-hidden rounded-3xl border-slate-200 shadow-sm hover:shadow-xl transition-all duration-300 group bg-white h-full relative">
        {/* Image Area */}
        <div className="relative h-48 sm:h-56 bg-gradient-to-br from-slate-100 to-slate-200 overflow-hidden shrink-0">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={`${offer.brand} ${offer.model_name}`}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center opacity-30">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="w-24 h-24 text-slate-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 19v-1c0-1.1.9-2 2-2h4a2 2 0 012 2v1M3 13.5v-1c0-2.8 2.2-5 5-5h8a5 5 0 015 5v1M3 13.5C3 15.4 4.6 17 6.5 17h11c1.9 0 3.5-1.6 3.5-3.5M6.5 17A2.5 2.5 0 014 14.5M17.5 17a2.5 2.5 0 002.5-2.5 2.5 2.5 0 00-2.5-2.5" />
              </svg>
            </div>
          )}

          {/* Quantity badge */}
          {offer.quantity > 1 && (
            <div className="absolute top-4 left-4">
              <Badge className="bg-white/95 text-navy-950 font-bold border-none shadow-sm backdrop-blur-md px-2.5 py-1 text-xs flex items-center gap-1">
                <Package size={12} /> {offer.quantity}x verfügbar
              </Badge>
            </div>
          )}

          {/* Own-offer badge for sellers */}
          {viewMode === "seller" && isOwnOffer && (
            <div className="absolute top-4 right-4">
              <Badge className="bg-blue-600 text-white border-none shadow-sm px-2.5 py-1 text-xs font-bold flex items-center gap-1.5">
                <Pencil size={11} /> Ihr Angebot
              </Badge>
            </div>
          )}

          {/* Bookmark button — shown for public and buyer */}
          {viewMode !== "seller" && (
            <button
              onClick={handleBookmark}
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/50 hover:bg-white/95 backdrop-blur-md flex items-center justify-center transition-all shadow-sm text-slate-400 hover:text-red-500 z-10"
              title="Merken"
            >
              <Bookmark size={20} className={bookmarked ? "fill-red-500 text-red-500" : ""} />
            </button>
          )}

          {/* Fade overlay bottom */}
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
        </div>

        {/* Content Area */}
        <div className="p-5 flex flex-col flex-1">
          {/* Title & Specs */}
          <div className="mb-4">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 mt-1">{offer.brand}</div>
            <h3 className="font-bold text-navy-950 text-xl leading-tight mb-2 line-clamp-1 group-hover:text-blue-600 transition-colors">
              {offer.model_name}
            </h3>
            {specs && <p className="text-sm text-slate-500 line-clamp-1">{specs}</p>}
          </div>

          {/* Pricing */}
          <div className="mt-auto pt-4 border-t border-slate-100">
            <div className="flex justify-between items-end mb-2">
              <div>
                <div className="font-black text-navy-950 text-3xl tracking-tight">
                  {offerPrice > 0 ? `${offerPrice.toLocaleString("de-DE")} €` : "Auf Anfrage"}
                </div>
              </div>
              {savingsPercent > 0 && (
                <div className="pb-1">
                  <SavingsBadge savings={savingsPercent} />
                </div>
              )}
            </div>

            {/* Financing pills */}
            <div className="flex gap-2 mb-4 flex-wrap">
              {offer.leasing_enabled && offer.leasing_rate_net && (
                <Badge variant="outline" className="bg-blue-50/50 border-blue-100 text-blue-700 font-semibold px-2">
                  Leasing ab {Number(offer.leasing_rate_net).toLocaleString("de-DE")} €
                </Badge>
              )}
              {offer.financing_enabled && offer.financing_rate_net && (
                <Badge variant="outline" className="bg-emerald-50/50 border-emerald-100 text-emerald-700 font-semibold px-2">
                  Finanzierung ab {Number(offer.financing_rate_net).toLocaleString("de-DE")} €
                </Badge>
              )}
            </div>

            {/* Buyer CTA */}
            {viewMode === "buyer" && (
              <Button
                className="w-full h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm mb-3 shadow-sm"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onInquiry?.(offer.id, offer.dealer_id);
                }}
              >
                <Send size={14} className="mr-2" /> Anfrage senden
              </Button>
            )}

            {/* Seller: edit + delete for own offers */}
            {viewMode === "seller" && isOwnOffer && (
              <div className="flex gap-2 mb-3">
                <Link href={`/dashboard/sofort-angebote/${offer.id}/bearbeiten`} className="flex-1" onClick={(e) => e.stopPropagation()}>
                  <Button variant="outline" className="w-full h-10 rounded-xl border-blue-200 text-blue-700 hover:bg-blue-50 font-bold text-sm">
                    <Pencil size={14} className="mr-2" /> Bearbeiten
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  className="h-10 rounded-xl border-red-200 text-red-600 hover:bg-red-50 font-bold text-sm px-3"
                  onClick={handleDelete}
                  disabled={isDeleting}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            )}
          </div>

          {/* Dealer Info Footer */}
          <div className="flex justify-between items-center bg-slate-50 rounded-xl p-3 border border-slate-100">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <MapPin size={14} className="text-slate-400" />
              <span className="truncate max-w-[140px]">{location}</span>
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
