import type { ReactNode } from "react";
import { TolgeeProvider } from "@tolgee/react";
import { tolgee } from "../../lib/tolgee.js";

export function I18nProvider({ children }: { children: ReactNode }) {
  return (
    <TolgeeProvider tolgee={tolgee} fallback="Loading...">
      {children}
    </TolgeeProvider>
  );
}
