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
      })();
    },
    [authorizationId],
  );

  async function decide(approve: boolean) {
    setDeciding(true);
    setError(null);
    const { error: decisionError } = approve
      ? await supabase.auth.oauth.approveAuthorization(authorizationId)
      : await supabase.auth.oauth.denyAuthorization(authorizationId);
    // 성공 시 브라우저가 클라이언트로 자동 리다이렉트되므로 아래로 내려오지 않는다.
    if (decisionError) {
      setError(decisionError.message);
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
