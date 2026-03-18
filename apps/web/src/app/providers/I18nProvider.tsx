import type { ReactNode } from "react";
import { TolgeeProvider } from "@tolgee/react";

import { tolgee } from "@web/lib/tolgee/client";

interface I18nProviderProps {
  children: ReactNode;
}

export function I18nProvider({ children }: I18nProviderProps) {
  return (
    <TolgeeProvider tolgee={tolgee} fallback={null}>
      {children}
    </TolgeeProvider>
  );
}
