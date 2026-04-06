import { type FormEvent, useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { Button, Input, Separator } from "@nema-io/weave";
import { LoaderCircle, Mail } from "@nema-io/weave/icons";

import { GoogleIcon } from "@web/features/auth";
import { useAuth } from "@web/hooks/useAuth";
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
      <div className="flex w-full max-w-sm flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-3">
          <svg
            width="48"
            height="59"
            viewBox="96 74 178 211"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              className="fill-teal-700 dark:fill-teal-400"
              transform="scale(0.359375)"
              d="M568.753 234.706C586.198 233.287 607.4 236.769 623.81 242.245C662.228 255.13 693.907 282.828 711.803 319.183C730.607 357.939 733.54 402.504 719.979 443.39C707.252 481.858 679.667 513.636 643.371 531.644C604.636 550.756 559.554 552.296 518.912 538.466L518.948 764.748C496.855 765.492 469.93 765.079 447.62 764.814L447.633 661.087L447.733 548.375C448.002 542.117 447.942 535.849 447.555 529.597C444.157 538.654 440.906 549.426 437.843 558.755L420.716 610.852L370.279 764.83C346.492 765.555 319.093 764.921 295.07 764.928L382.644 498.632L416.797 394.906C424.149 372.668 430.572 350.744 439.721 329.12C462.84 274.475 508.965 238.939 568.753 234.706Z M570.056 306.702C573.068 306.307 578.511 306.44 581.5 306.72C603.689 308.799 624.12 319.68 638.229 336.931C666.042 371.186 663.385 427.91 628.386 456.561C608.385 472.934 581.628 476.182 556.617 473.571C539.649 471.385 529.317 467.272 513.899 460.315C499.315 453.734 486.592 451.18 471.423 457.149C475.018 443.964 480.391 430.208 484.547 417.084C498.586 372.756 514.773 312.253 570.056 306.702Z"
            />
          </svg>
          <p className="text-lg font-semibold text-fg-primary">
            {t("auth.tagline")}
          </p>
        </div>

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
