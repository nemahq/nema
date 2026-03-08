import { type FormEvent, useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
} from "@nema-io/weave";

import { supabase } from "@web/lib/supabase";
import { useTranslation } from "@web/lib/tolgee";

export function SignInForm({ onToggle }: { onToggle: () => void }) {
  const search = useSearch({ from: "/signin" });
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    const to = search.redirect?.startsWith("/") ? search.redirect : "/";
    await navigate({ to });
  }

  // TODO: Google OAuth 최초 가입 시 약관·개인정보처리방침 동의 플로우 필요
  async function handleGoogleSignIn() {
    setError(null);
    setLoading(true);
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      if (oauthError) {
        setError(oauthError.message);
        setLoading(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.unknown_error"));
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{t("auth.sign_in")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            type="email"
            placeholder={t("auth.email_placeholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            type="password"
            placeholder={t("auth.password_placeholder")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={loading}>
            {loading ? t("auth.sign_in_loading") : t("auth.sign_in")}
          </Button>
        </form>

        <div className="mt-4 flex flex-col gap-2">
          <Button variant="outline" onClick={handleGoogleSignIn}>
            {t("auth.continue_with_google")}
          </Button>
          <Button variant="link" onClick={onToggle}>
            {t("auth.no_account")}
          </Button>
        </div>

        <div className="mt-4 flex justify-center gap-3 text-xs text-muted-foreground">
          <Link to="/privacy" className="hover:text-foreground hover:underline">
            {t("auth.privacy")}
          </Link>
          <span>&middot;</span>
          <Link to="/terms" className="hover:text-foreground hover:underline">
            {t("auth.terms")}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
