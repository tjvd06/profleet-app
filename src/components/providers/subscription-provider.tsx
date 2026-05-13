"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { useAuth } from "./auth-provider";
import type { SubscriptionTier } from "@/constants/enums";

export type { SubscriptionTier };

type SubscriptionContextType = {
  tier: SubscriptionTier;
  subscriptionSince: string | null;
  subscriptionUntil: string | null;
  monthlyOfferCount: number;
  activeInstantOfferCount: number;
  canCreateOffer: () => boolean;
  canCreateInstantOffer: () => boolean;
  getOfferLimit: () => number | null;
  getInstantOfferLimit: () => number | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
};

const OFFER_LIMITS: Record<SubscriptionTier, number | null> = {
  starter: 3,
  pro: null,
  premium: null,
};

const INSTANT_OFFER_LIMITS: Record<SubscriptionTier, number | null> = {
  starter: 1,
  pro: 10,
  premium: null,
};

const SubscriptionContext = createContext<SubscriptionContextType>({
  tier: "starter",
  subscriptionSince: null,
  subscriptionUntil: null,
  monthlyOfferCount: 0,
  activeInstantOfferCount: 0,
  canCreateOffer: () => true,
  canCreateInstantOffer: () => true,
  getOfferLimit: () => 3,
  getInstantOfferLimit: () => 1,
  isLoading: true,
  refresh: async () => {},
});

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth();
  const [supabase] = useState(() => createClient());
  const [tier, setTier] = useState<SubscriptionTier>("starter");
  const [subscriptionSince, setSubscriptionSince] = useState<string | null>(null);
  const [subscriptionUntil, setSubscriptionUntil] = useState<string | null>(null);
  const [monthlyOfferCount, setMonthlyOfferCount] = useState(0);
  const [activeInstantOfferCount, setActiveInstantOfferCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const isDealer = profile?.role === "anbieter";

  const fetchSubscriptionData = useCallback(async () => {
    if (!user || !isDealer) {
      setIsLoading(false);
      return;
    }

    try {
      // Fetch subscription tier from profile
      const { data: profileData } = await supabase
        .from("profiles")
        .select("subscription_tier, subscription_since, subscription_until")
        .eq("id", user.id)
        .single();

      if (profileData) {
        setTier((profileData.subscription_tier as SubscriptionTier) || "starter");
        setSubscriptionSince(profileData.subscription_since || null);
        setSubscriptionUntil(profileData.subscription_until || null);
      }

      // Count offers this month
      const now = new Date();
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const { count: offerCount } = await supabase
        .from("offers")
        .select("*", { count: "exact", head: true })
        .eq("dealer_id", user.id)
        .gte("created_at", firstOfMonth);

      setMonthlyOfferCount(offerCount ?? 0);

      // Count active instant offers (safe: table may not exist yet)
      try {
        const { count: instantCount } = await supabase
          .from("instant_offers")
          .select("*", { count: "exact", head: true })
          .eq("dealer_id", user.id)
          .eq("status", "active");
        setActiveInstantOfferCount(instantCount ?? 0);
      } catch {
        setActiveInstantOfferCount(0);
      }
    } catch (e) {
      console.error("[SubscriptionProvider] Error loading subscription data:", e);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, isDealer]);

  useEffect(() => {
    fetchSubscriptionData();
  }, [fetchSubscriptionData]);

  const canCreateOffer = useCallback(() => {
    const limit = OFFER_LIMITS[tier];
    if (limit === null) return true;
    return monthlyOfferCount < limit;
  }, [tier, monthlyOfferCount]);

  const canCreateInstantOffer = useCallback(() => {
    const limit = INSTANT_OFFER_LIMITS[tier];
    if (limit === null) return true;
    return activeInstantOfferCount < limit;
  }, [tier, activeInstantOfferCount]);

  const getOfferLimit = useCallback(() => OFFER_LIMITS[tier], [tier]);
  const getInstantOfferLimit = useCallback(() => INSTANT_OFFER_LIMITS[tier], [tier]);

  return (
    <SubscriptionContext.Provider
      value={{
        tier,
        subscriptionSince,
        subscriptionUntil,
        monthlyOfferCount,
        activeInstantOfferCount,
        canCreateOffer,
        canCreateInstantOffer,
        getOfferLimit,
        getInstantOfferLimit,
        isLoading,
        refresh: fetchSubscriptionData,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error("useSubscription must be used within a SubscriptionProvider");
  }
  return context;
};
