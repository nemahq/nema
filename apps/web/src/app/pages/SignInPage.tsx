import { type FormEvent, useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { Button, Input, Separator } from "@nema-io/weave";
import { LoaderCircle, Mail } from "@nema-io/weave/icons";

import { GoogleIcon } from "@web/features/auth";
import { useAuth } from "@web/lib/auth";
import { supabase } from "@web/lib/supabase";
import { useTranslation } from "@web/lib/tolgee";

export function SignInPage() {
  const search = useSearch({ from: "/signin" });
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useTranslation();

  useEffect(
    function redirectOnSignIn() {
      if (user) {
        void navigate({ to: search.redirect ?? "/" });
      }
    },
    [user, navigate, search.redirect],
  );

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  async function handleGoogleSignIn() {
    setError(null);
    setGoogleLoading(true);
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      if (oauthError) {
        setError(oauthError.message);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.unknown_error"));
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleEmailSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEmailLoading(true);

    try {
      const redirectTo = search.redirect?.startsWith("/")
        ? `${window.location.origin}${search.redirect}`
        : window.location.origin;

      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
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
        <span className="text-[40px] font-bold leading-none tracking-tight text-teal-500 dark:text-fg-primary">
          Nema
        </span>

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
                className="w-full"
              >
                <GoogleIcon className="size-5" />
                {t("auth.continue_with_google")}
              </Button>

              <div className="flex items-center gap-3">
                <Separator className="flex-1" />
                <span className="text-sm text-fg-tertiary">{t("auth.or")}</span>
                <Separator className="flex-1" />
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
                  required
                />
                <Button
                  variant="neutral"
                  size="lg"
                  type="submit"
                  disabled={emailLoading || googleLoading}
                  className="w-full"
                >
                  {emailLoading ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <>
                      <Mail className="size-4" />
                      {t("auth.continue_with_email")}
                    </>
                  )}
                </Button>
              </form>

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
