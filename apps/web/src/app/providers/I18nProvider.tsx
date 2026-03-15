import type { ReactNode } from "react";
import { TolgeeProvider } from "@tolgee/react";

import { tolgee } from "@web/lib/tolgee/client";

export function I18nProvider({ children }: { children: ReactNode }) {
  return (
    <TolgeeProvider tolgee={tolgee} fallback={null}>
      {children}
    </TolgeeProvider>
  );
}
