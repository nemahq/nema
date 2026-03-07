import { type FormEvent, useState } from "react";
import { useSearch, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";

export function SignInForm({ onToggle }: { onToggle: () => void }) {
  const search = useSearch({ from: "/signin" });
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    const to = search.redirect?.startsWith("/") ? search.redirect : "/";
    await navigate({ to });
  }

  async function handleGoogleSignIn() {
    await supabase.auth.signInWithOAuth({ provider: "google" });
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>로그인</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            type="email"
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={loading}>
            {loading ? "로그인 중..." : "로그인"}
          </Button>
        </form>

        <div className="mt-4 flex flex-col gap-2">
          <Button variant="outline" onClick={handleGoogleSignIn}>
            Google로 계속하기
          </Button>
          <Button variant="link" onClick={onToggle}>
            계정이 없으신가요? 회원가입
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
