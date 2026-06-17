import { useEffect, useRef, useState } from "react";
import { useSearch } from "@tanstack/react-router";

import { Button } from "@nema-io/weave";

import { supabase } from "@web/lib/supabase";
import { useTranslation } from "@web/lib/tolgee";

// Supabase OAuth 서버가 동의 UI를 앱에 위임한다(Authorization Path).
export function OAuthConsentPage() {
  const { authorization_id: authorizationId } = useSearch({
    from: "/oauth/consent",
  });
  const { t } = useTranslation();
  const [clientName, setClientName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState(false);
  const loadedRef = useRef(false);

  useEffect(
    function loadAuthorization() {
      if (loadedRef.current) {
        return;
      }
      loadedRef.current = true;
      void (async () => {
        try {
          const { data, error: detailsError } =
            await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
          if (detailsError) {
            setError(detailsError.message);
            return;
          }
          if ("authorization_id" in data) {
            setClientName(data.client.name);
          } else {
            // 이미 동의한 요청은 곧장 클라이언트로 돌려보낸다.
            window.location.href = data.redirect_url;
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : t("common.unknown_error"));
        }
      })();
    },
    [authorizationId, t],
  );

  async function decide(approve: boolean) {
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
        setError(decisionError.message);
        setDeciding(false);
        return;
      }
      window.location.href = data.redirect_url;
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.unknown_error"));
      setDeciding(false);
    }
  }

  if (error) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
        <p className="text-sm text-status-error">{error}</p>
      </main>
    );
  }

  if (!clientName) {
    return null;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <p className="text-sm">
        {t("oauth.consent_request", { client: clientName })}
      </p>
      <div className="flex gap-2">
        <Button onClick={() => decide(true)} disabled={deciding}>
          {t("oauth.approve")}
        </Button>
        <Button
          variant="secondary"
          onClick={() => decide(false)}
          disabled={deciding}
        >
          {t("oauth.deny")}
        </Button>
      </div>
    </main>
  );
}
