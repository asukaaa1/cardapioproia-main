import { createContext, useContext, useEffect, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type UserProfile = Tables<"user_profiles">;

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (input: { email: string; password: string; fullName?: string }) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  profile: null,
  loading: true,
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (authUser: User | null) => {
    if (!authUser) {
      setProfile(null);
      return true;
    }

    const { data, error } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("user_id", authUser.id)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      console.error("Profile load error:", error);
      setProfile(null);
      return true;
    }

    if (data?.is_active === false) {
      sessionStorage.setItem("blocked_access_message", "Seu acesso à plataforma está desativado no momento.");
      await supabase.auth.signOut();
      setProfile(null);
      return false;
    }

    setProfile(data ?? null);
    return true;
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      await loadProfile(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      void (async () => {
        setSession(session);
        setUser(session?.user ?? null);
        await loadProfile(session?.user ?? null);
        setLoading(false);
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        console.error("Sign in error:", error);
        return { error: error as Error };
      }
      // Force update after login
      if (data.session) {
        const accessAllowed = await loadProfile(data.session.user);
        if (!accessAllowed) {
          return { error: new Error("Seu acesso está desativado no momento.") };
        }
        setSession(data.session);
        setUser(data.session.user);
      }
      return { error: null };
    } catch (e) {
      console.error("Sign in exception:", e);
      return { error: e as Error };
    }
  };

  const signOut = async () => {
    sessionStorage.removeItem("blocked_access_message");
    await supabase.auth.signOut();
  };

  const signUp = async ({ email, password, fullName }: { email: string; password: string; fullName?: string }) => {
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName?.trim() || undefined,
          },
        },
      });

      if (error) {
        console.error("Sign up error:", error);
        return { error: error as Error };
      }

      return { error: null };
    } catch (e) {
      console.error("Sign up exception:", e);
      return { error: e as Error };
    }
  };

  const refreshProfile = async () => {
    await loadProfile(user);
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, signIn, signUp, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
