import { type FormEvent, useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { Button, Input, Separator } from "@nema-io/weave";
import { Loader, Mail } from "@nema-io/weave/icons";

import { NemaWordmark } from "@web/components/ui/NemaWordmark";
import { GoogleIcon } from "@web/features/auth";
import { consumeMagicLinkExpiredError, useAuth } from "@web/lib/auth";
import { supabase } from "@web/lib/supabase";
import { useTranslation } from "@web/lib/tolgee";

export function SignInPage() {
  const search = useSearch({ from: "/signin" });
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useTranslation();

  useEffect(
    function redirectOnSignIn() {
      if (!user) {
        return;
      }
      const target = search.redirect?.startsWith("/") ? search.redirect : "/";
      // target에 쿼리스트링이 있으면 SPA navigate가 이를 떨궈 도착 라우트의
      // validateSearch가 깨진다(예: OAuth 동의의 authorization_id). 전체
      // 내비게이션으로 쿼리를 보존한다.
      if (target.includes("?")) {
        window.location.href = `${window.location.origin}${target}`;
      } else {
        void navigate({ to: target });
      }
    },
    [user, navigate, search.redirect],
  );

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(() =>
    consumeMagicLinkExpiredError() ? t("auth.magic_link_invalid") : null,
  );
  const [googleLoading, setGoogleLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  // startsWith("/") 가드로 외부 URL 주입(open redirect)을 차단한다.
  function resolveRedirectUrl() {
    return search.redirect?.startsWith("/")
      ? `${window.location.origin}${search.redirect}`
      : window.location.origin;
  }

  async function handleGoogleSignIn() {
    setError(null);
    setGoogleLoading(true);
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: resolveRedirectUrl() },
      });
      // 성공 시 signInWithOAuth는 이미 구글로 리다이렉트를 걸어 둔
      // 뒤라, 굳이 여기서 로딩을 풀지 않아도 된다 — 에러일 때만 풀어서
      // 재시도할 수 있게 한다.
      if (oauthError) {
        setError(oauthError.message);
        setGoogleLoading(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.unknown_error"));
      setGoogleLoading(false);
    }
  }

  async function handleEmailSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEmailLoading(true);

    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: resolveRedirectUrl() },
      });

      if (otpError) {
        setError(otpError.message);
      } else {
        setMagicLinkSent(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.unknown_error"));
    } finally {
      setEmailLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface p-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-5">
        <NemaWordmark />

        <div className="flex min-h-[260px] w-full flex-col items-center justify-center rounded-xl border border-border p-6">
          {magicLinkSent ? (
            <div className="flex flex-col items-center gap-4">
              <div className="flex flex-col items-center gap-2 text-center">
                <p className="text-sm text-fg-secondary">
                  {t("auth.magic_link_sent")}
                </p>
                <p className="text-xs text-fg-tertiary">{email}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMagicLinkSent(false)}
              >
                {t("auth.back_to_login")}
              </Button>
            </div>
          ) : (
            <div className="flex w-full flex-col gap-3">
              <Button
                variant="neutral"
                size="lg"
                onClick={handleGoogleSignIn}
                disabled={googleLoading || emailLoading}
                // Radix 트리거 전용인 data-[state=open] 톤을 로딩 중 hover
                // 표시로 그대로 재사용한다 — 새 CSS 없이 기존 톤을 빌린다.
                data-state={googleLoading ? "open" : undefined}
                className={`w-full ${googleLoading ? "!opacity-100" : ""}`}
                aria-label={
                  googleLoading ? t("auth.continue_with_google") : undefined
                }
              >
                {googleLoading ? (
                  <Loader className="size-5 animate-spin" />
                ) : (
                  <>
                    <GoogleIcon className="size-5" />
                    {t("auth.continue_with_google")}
                  </>
                )}
              </Button>

              <div className="flex items-center gap-3">
                <Separator className="flex-1 bg-border" />
                <span className="text-sm text-fg-tertiary">{t("auth.or")}</span>
                <Separator className="flex-1 bg-border" />
              </div>

              <form
                onSubmit={handleEmailSubmit}
                className="flex flex-col gap-3"
              >
                <Input
                  type="email"
                  placeholder={t("auth.email_placeholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={emailLoading || googleLoading}
                  required
                />
                <Button
                  variant="neutral"
                  size="lg"
                  type="submit"
                  disabled={emailLoading || googleLoading}
                  data-state={emailLoading ? "open" : undefined}
                  className={`w-full ${emailLoading ? "!opacity-100" : ""}`}
                  aria-label={
                    emailLoading ? t("auth.continue_with_email") : undefined
                  }
                >
                  {emailLoading ? (
                    <Loader className="size-4 animate-spin" />
                  ) : (
                    <>
                      <Mail className="size-4" />
                      {t("auth.continue_with_email")}
                    </>
                  )}
                </Button>
              </form>

              {/* weave FormMessage는 FormField 하나에 딸린 필드 에러용이다 —
                  이 에러는 Google과 이메일, 두 독립된 액션 중 어느 쪽에서
                  나든 같은 자리에 뜨는 페이지 레벨 상태라 특정 필드에
                  묶이지 않는다. */}
              <p
                role="alert"
                className={`text-center text-xs ${error ? "text-status-error" : "text-transparent"}`}
              >
                {error ?? "\u00A0"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
