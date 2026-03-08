import type { ReactNode } from "react";

import { Toast, TooltipProvider } from "@nema-io/weave";

import { AuthProvider } from "@web/features/auth/hooks/useAuth";

import { I18nProvider } from "./I18nProvider";
import { QueryProvider } from "./QueryProvider";
import { ThemeProvider, useTheme } from "./ThemeProvider";

function ThemedToast() {
  const { theme } = useTheme();
  return <Toast theme={theme} />;
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <ThemeProvider>
        <QueryProvider>
          <AuthProvider>
            <TooltipProvider>
              {children}
              <ThemedToast />
            </TooltipProvider>
          </AuthProvider>
        </QueryProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}
