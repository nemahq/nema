import type { ReactNode } from "react";

import { Toast, TooltipProvider } from "@nema-io/weave";

import { ServiceWorkerUpdatePrompt } from "@web/features/pwa";
import { AuthProvider } from "@web/lib/auth";
import { ActionRegistryProvider } from "@web/lib/command/shortcut/context";

import { I18nProvider } from "./I18nProvider";
import { QueryProvider } from "./QueryProvider";
import { ThemeProvider, useTheme } from "./ThemeProvider";

function ThemedToast() {
  const { theme } = useTheme();
  return <Toast theme={theme} />;
}

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <I18nProvider>
      <ThemeProvider>
        <QueryProvider>
          <AuthProvider>
            <ActionRegistryProvider>
              <TooltipProvider>
                {children}
                <ThemedToast />
                <ServiceWorkerUpdatePrompt />
              </TooltipProvider>
            </ActionRegistryProvider>
          </AuthProvider>
        </QueryProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}
