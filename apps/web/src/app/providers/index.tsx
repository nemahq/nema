import type { ReactNode } from "react";
import { AuthProvider } from "../../features/auth/hooks/useAuth.js";
import { I18nProvider } from "./I18nProvider.js";
import { QueryProvider } from "./QueryProvider.js";
import { ThemeProvider } from "./ThemeProvider.js";

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
