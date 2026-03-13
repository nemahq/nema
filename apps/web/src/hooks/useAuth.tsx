import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import type { Session, User } from "@supabase/supabase-js";

import { posthog } from "@web/lib/posthog";
import { supabase } from "@web/lib/supabase";

interface AuthContext {
  user: User | null;
  session: Session | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContext | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(function subscribeAuth() {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      setLoading(false);

      if (newSession?.user) {
        posthog.identify(newSession.user.id, {
          email: newSession.user.email,
        });
      } else if (event === "SIGNED_OUT") {
        posthog.reset();
      }

      if (event === "SIGNED_IN" && window.location.href.includes("#")) {
        window.history.replaceState(null, "", window.location.pathname);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const user = session?.user ?? null;

  return (
    <AuthContext value={{ user, session, loading }}>{children}</AuthContext>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth는 AuthProvider 내부에서만 사용할 수 있습니다.");
  }
  return ctx;
}
