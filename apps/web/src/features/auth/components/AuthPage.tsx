import { useState } from "react";

import { SignInForm } from "./SignInForm";
import { SignUpForm } from "./SignUpForm";

export function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  return (
    <div className="flex min-h-screen items-center justify-center">
      {mode === "signin" ? (
        <SignInForm onToggle={() => setMode("signup")} />
      ) : (
        <SignUpForm onToggle={() => setMode("signin")} />
      )}
    </div>
  );
}
