import type { ReactNode } from "react";

import { AuthProvider } from "@web/features/auth/hooks/useAuth";

import { I18nProvider } from "./I18nProvider";
import { QueryProvider } from "./QueryProvider";
import { ThemeProvider } from "./ThemeProvider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <ThemeProvider>
        <QueryProvider>
          <AuthProvider>{children}</AuthProvider>
        </QueryProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}
