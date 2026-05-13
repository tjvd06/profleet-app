"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import type { UserRole } from "@/constants/enums";

type Profile = {
  id: string;
  role: UserRole;
  company_name: string | null;
  first_name: string | null;
  last_name: string | null;
  last_login: string | null;
};

type AuthContextType = {
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  isLoading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [supabase] = useState(() => createClient());
  const router = useRouter();

  const fetchProfile = async (userId: string, updateLastLogin = false) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();
      if (error) {
        console.error("[AuthProvider] fetchProfile Supabase error:", error.message);
      } else if (data) {
        // Store the OLD last_login so dashboard can use it for "since last login"
        setProfile(data as Profile);
        console.log("[AuthProvider] Profile loaded:", data.role, data.company_name ?? data.first_name);

        // Update last_login to now (fire-and-forget)
        if (updateLastLogin) {
          supabase
            .from("profiles")
            .update({ last_login: new Date().toISOString() })
            .eq("id", userId)
            .then(({ error: updateErr }) => {
              if (updateErr) console.error("[AuthProvider] last_login update error:", updateErr.message);
            });
        }
      }
    } catch (e) {
      console.error("[AuthProvider] fetchProfile exception:", e);
    }
  };

  useEffect(() => {
    console.log("[AuthProvider] Mounting, subscribing to onAuthStateChange");

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("[AuthProvider] Auth event:", event, "| user:", session?.user?.id ?? "null");

      try {
        if (session?.user) {
          setUser(session.user);
          if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "USER_UPDATED") {
            const shouldUpdateLogin = event === "SIGNED_IN";
            // Race fetchProfile against a 5-second timeout so isLoading never hangs forever
            await Promise.race([
              fetchProfile(session.user.id, shouldUpdateLogin),
              new Promise<void>(resolve => setTimeout(resolve, 5000)),
            ]);
          }
        } else {
          setUser(null);
          setProfile(null);
        }
      } catch (e) {
        console.error("[AuthProvider] onAuthStateChange handler error:", e);
      } finally {
        // Always release isLoading — no matter what happens above
        console.log("[AuthProvider] Setting isLoading = false");
        setIsLoading(false);
      }

      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        router.refresh();
      }
    });

    return () => {
      console.log("[AuthProvider] Unmounting, unsubscribing");
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, profile, isLoading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
