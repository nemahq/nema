import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import * as Sentry from "@sentry/react";
import type { Session, User } from "@supabase/supabase-js";

import { posthog } from "@web/lib/posthog";
import { supabase } from "@web/lib/supabase";
import { queryClient } from "@web/lib/tanstack-query";

interface AppUser {
  id: string;
  displayName: string;
  email: string;
  avatarUrl?: string;
}

// access_denied는 구글 로그인 취소·거부의 정상 종료 신호라 안내 없이 무시해야 한다
// (workspace-account-flow.md "구글 로그인 취소·거부" 케이스).
const MAGIC_LINK_EXPIRED_ERROR_CODE = "otp_expired";
const OAUTH_USER_DENIED_ERROR_CODE = "access_denied";

interface CapturedAuthRedirectError {
  code: string | null;
  description: string | null;
}

let capturedAuthRedirectError: CapturedAuthRedirectError | null = null;

// requireAuth의 beforeLoad가 이 해시를 /signin?redirect=... 쿼리로 통째로
// 인코딩해버리므로, 그보다 먼저(모듈 로드 시점) 읽고 지워야 한다.
function captureAuthRedirectErrorFromHash(): void {
  if (!window.location.hash) {
    return;
  }
  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  if (!hashParams.has("error")) {
    return;
  }
  capturedAuthRedirectError = {
    code: hashParams.get("error_code"),
    description: hashParams.get("error_description"),
  };
  window.history.replaceState(
    null,
    "",
    window.location.pathname + window.location.search,
  );
}
captureAuthRedirectErrorFromHash();

// access_denied 외의 예기치 않은 코드는 진짜 기술적 실패일 수 있어 Sentry로 보낸다.
export function consumeMagicLinkExpiredError(): boolean {
  const error = capturedAuthRedirectError;
  capturedAuthRedirectError = null;
  if (!error) {
    return false;
  }
  if (error.code === MAGIC_LINK_EXPIRED_ERROR_CODE) {
    return true;
  }
  if (error.code !== OAUTH_USER_DENIED_ERROR_CODE) {
    Sentry.captureMessage("Unhandled auth redirect error", {
      extra: { code: error.code, description: error.description },
    });
  }
  return false;
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

  const rawAvatar = user.user_metadata?.avatar_url;

  return {
    id: user.id,
    displayName: displayName || user.id.slice(0, 8),
    email: user.email ?? "",
    avatarUrl: typeof rawAvatar === "string" ? rawAvatar : undefined,
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
        // 쿼리 키가 유저 스코프가 아니라, 같은 탭에서 계정을 전환하면 이전
        // 계정의 캐시(예: space.list)가 그대로 재사용될 수 있다.
        queryClient.clear();
      }

      if (event === "SIGNED_IN" && window.location.href.includes("#")) {
        window.history.replaceState(null, "", window.location.pathname);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const rawUser = session?.user ?? null;
  const user = useMemo(() => (rawUser ? toAppUser(rawUser) : null), [rawUser]);

  if (loading) {
    return null;
  }

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

export function useUser(): AppUser {
  const { user } = useAuth();
  if (!user) {
    throw new Error("useUser is only available in authenticated routes");
  }
  return user;
}
