import { type FormEvent, useState } from "react";
import { Link } from "@tanstack/react-router";

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Input,
} from "@nema-io/weave";

import { supabase } from "@web/lib/supabase";
import { useTranslation } from "@web/lib/tolgee";

export function SignUpForm({ onToggle }: { onToggle: () => void }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedPrivacy, setAgreedPrivacy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!agreedTerms || !agreedPrivacy) return;
    setError(null);
    setLoading(true);

    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (signUpError) {
        setError(signUpError.message);
      } else {
        setSuccess(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.unknown_error"));
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <Card className="w-full max-w-sm">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            {t("auth.verification_email_sent")}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{t("auth.sign_up")}</CardTitle>
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
            placeholder={t("auth.password_placeholder_signup")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
          <div className="flex flex-col gap-2">
            <div className="flex items-start gap-2 text-sm">
              <Checkbox
                id="agree-terms"
                checked={agreedTerms}
                onCheckedChange={(v) => setAgreedTerms(v === true)}
                className="mt-0.5"
              />
              <label htmlFor="agree-terms">
                {t("auth.agree_pre")}
                <Link to="/terms" target="_blank" className="underline">
                  {t("auth.terms")}
                </Link>
                {t("auth.agree_post")}
              </label>
            </div>
            <div className="flex items-start gap-2 text-sm">
              <Checkbox
                id="agree-privacy"
                checked={agreedPrivacy}
                onCheckedChange={(v) => setAgreedPrivacy(v === true)}
                className="mt-0.5"
              />
              <label htmlFor="agree-privacy">
                {t("auth.agree_pre")}
                <Link to="/privacy" target="_blank" className="underline">
                  {t("auth.privacy")}
                </Link>
                {t("auth.agree_post")}
              </label>
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            type="submit"
            disabled={loading || !agreedTerms || !agreedPrivacy}
          >
            {loading ? t("auth.sign_up_loading") : t("auth.sign_up")}
          </Button>
        </form>

        <div className="mt-4">
          <Button variant="link" onClick={onToggle}>
            {t("auth.has_account")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
