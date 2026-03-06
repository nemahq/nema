import type { ReactNode } from "react";
import { QueryProvider } from "./QueryProvider.js";

export function AppProviders({ children }: { children: ReactNode }) {
  return <QueryProvider>{children}</QueryProvider>;
}
