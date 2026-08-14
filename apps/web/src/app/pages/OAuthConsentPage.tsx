import { type ReactNode, useEffect, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { Button, Skeleton, Text, TextSkeleton } from "@nema-io/weave";

import { NemaWordmark } from "@web/components/ui/NemaWordmark";
import { supabase } from "@web/lib/supabase";
import { useTranslation } from "@web/lib/tolgee";
import { getStorage, removeStorage } from "@web/utils/localStorage";

// Supabase OAuth 서버가 동의 UI를 앱에 위임한다(Authorization Path).
export function OAuthConsentPage() {
  const search = useSearch({ from: "/oauth/consent" });
  const navigate = useNavigate();
  const { t } = useTranslation();
  // 구글 등 OAuth 공급자 왕복에서 authorization_id가 URL에서 사라질 수 있어,
  // 라우트 진입 때 저장해 둔 값으로 복구한다(없으면 URL 값을 그대로 쓴다).
  const [authorizationId] = useState(
    () => search.authorization_id ?? getStorage("oauthAuthorizationId"),
  );
  const [clientName, setClientName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState(false);
  const loadedRef = useRef(false);

  useEffect(function loadAccountEmail() {
    void supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user.email ?? "");
    });
  }, []);

  useEffect(
    function loadAuthorization() {
      if (loadedRef.current) {
        return;
      }
      loadedRef.current = true;
      removeStorage("oauthAuthorizationId");
      if (!authorizationId) {
        return;
      }
      void (async () => {
        try {
          const { data, error: detailsError } =
            await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
          if (detailsError) {
            setError(t("oauth.error"));
            return;
          }
          if ("authorization_id" in data) {
            setClientName(data.client.name);
          } else {
            // 이미 동의한 요청은 곧장 클라이언트로 돌려보낸다.
            window.location.href = data.redirect_url;
          }
        } catch {
          setError(t("oauth.error"));
        }
      })();
    },
    [authorizationId, t],
  );

  async function decide(approve: boolean) {
    if (!authorizationId) {
      return;
    }
    setDeciding(true);
    setError(null);
    try {
      // skipBrowserRedirect로 redirect_url을 직접 받아 명시적으로 이동한다.
      // 자동 리다이렉트에 기대면 그게 안 일어날 때 버튼이 영구 비활성으로 멈춘다.
      const { data, error: decisionError } = approve
        ? await supabase.auth.oauth.approveAuthorization(authorizationId, {
            skipBrowserRedirect: true,
          })
        : await supabase.auth.oauth.denyAuthorization(authorizationId, {
            skipBrowserRedirect: true,
          });
      if (decisionError) {
        setError(t("oauth.error"));
        setDeciding(false);
        return;
      }
      window.location.href = data.redirect_url;
    } catch {
      setError(t("oauth.error"));
      setDeciding(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    await navigate({ to: "/signin", search: { redirect: undefined } });
  }

  // authorization_id가 URL에도 저장소에도 없으면 잘못 들어온 요청이다.
  const invalidRequest = !authorizationId;
  const message = error ?? (invalidRequest ? t("common.unknown_error") : null);
  const ready = !message && clientName !== null && email !== null;

  let cardContent: ReactNode;
  if (message) {
    cardContent = (
      <p className="text-center text-sm text-status-error">{message}</p>
    );
  } else if (ready) {
    cardContent = (
      <>
        <div className="flex flex-col items-center gap-1 text-center">
          <Text size="xl" weight="bold">
            {clientName || t("oauth.unknown_client")}
          </Text>
          <Text size="sm" color="secondary">
            {t("oauth.connect_request")}
          </Text>
        </div>
        <Text size="xs" color="tertiary" className="text-center">
          {email}
        </Text>
        <div className="flex gap-2">
          <Button
            className="flex-1"
            onClick={() => decide(true)}
            disabled={deciding}
          >
            {t("oauth.approve")}
          </Button>
          <Button
            className="flex-1"
            variant="secondary"
            onClick={() => decide(false)}
            disabled={deciding}
          >
            {t("oauth.deny")}
          </Button>
        </div>
      </>
    );
  } else {
    cardContent = (
      <div className="flex flex-col items-center gap-5">
        <div className="flex w-full flex-col items-center gap-2">
          <TextSkeleton size="xl" className="w-2/3" />
          <TextSkeleton size="sm" className="w-1/2" />
        </div>
        <TextSkeleton size="xs" className="w-1/3" />
        <div className="flex w-full gap-2">
          <Skeleton className="h-9 flex-1 rounded-md" />
          <Skeleton className="h-9 flex-1 rounded-md" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface p-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-5">
        <NemaWordmark />

        {/* min-h로 로딩→확정 전환에서 레이아웃이 안 튀게 높이를 미리 잡아둔다
            (SignInPage의 min-h-[260px]와 같은 이유). */}
        <div className="flex min-h-[220px] w-full flex-col justify-center gap-5 rounded-xl border border-border bg-surface p-6">
          {cardContent}
        </div>

        {!invalidRequest && (
          <p className="text-center text-xs text-fg-tertiary">
            {t("oauth.logout_prompt")}{" "}
            {/* weave Button은 text-[13px] font-semibold를 강제해 문장 안에
                섞여야 하는 이 자리(주변 fg-tertiary/text-xs 상속)와 안 맞는다
                — weave-usage.md의 Button "안 쓴다" 사례. */}
            <button
              type="button"
              onClick={handleSignOut}
              className="underline hover:text-fg-secondary"
            >
              {t("oauth.logout")}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
