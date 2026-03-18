import type { ReactNode } from "react";

import { Toast, TooltipProvider } from "@nema-io/weave";

import { AuthProvider } from "@web/hooks/useAuth";
import { ActionRegistryProvider } from "@web/lib/command/shortcut/context";

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
            <ActionRegistryProvider>
              <TooltipProvider>
                {children}
                <ThemedToast />
              </TooltipProvider>
            </ActionRegistryProvider>
          </AuthProvider>
        </QueryProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}
