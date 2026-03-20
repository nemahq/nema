import type { ReactNode } from "react";

import { Toast, TooltipProvider } from "@nema-io/weave";

import { ProfileProvider } from "@web/features/profile";
import { AuthProvider } from "@web/hooks/useAuth";
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
            <ProfileProvider>
              <ActionRegistryProvider>
                <TooltipProvider>
                  {children}
                  <ThemedToast />
                </TooltipProvider>
              </ActionRegistryProvider>
            </ProfileProvider>
          </AuthProvider>
        </QueryProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}
