import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Session, User } from "@supabase/supabase-js";

import { posthog } from "@web/lib/posthog";
import { supabase } from "@web/lib/supabase";

interface AppUser {
  id: string;
  displayName: string;
  email: string;
  avatarUrl?: string;
}

interface AuthContext {
  user: AppUser | null;
  session: Session | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContext | null>(null);

const NAME_PRIORITY: Array<(u: User) => unknown> = [
  (u) => u.user_metadata?.given_name,
  (u) => u.user_metadata?.full_name,
  (u) => u.email,
];

function toAppUser(user: User): AppUser {
  let displayName = "";
  for (const resolve of NAME_PRIORITY) {
    const resolved = resolve(user);
    if (typeof resolved === "string" && resolved) {
      displayName = resolved;
      break;
    }
  }

  return {
    id: user.id,
    displayName,
    email: user.email ?? "",
    avatarUrl: user.user_metadata?.avatar_url as string | undefined,
  };
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
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

  const rawUser = session?.user ?? null;
  const user = useMemo(() => (rawUser ? toAppUser(rawUser) : null), [rawUser]);

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
