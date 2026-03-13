import { createContext, useContext, useEffect, useState } from "react";

import { getStorage } from "@web/utils/localStorage";
import {
  resolveTheme,
  setTheme as setThemePref,
  type Theme,
  type ThemePreference,
} from "@web/utils/theme";

type ThemeProviderState = {
  theme: ThemePreference;
  resolvedTheme: Theme;
  setTheme: (theme: ThemePreference) => void;
};

const MEDIA = "(prefers-color-scheme: dark)";

const ThemeProviderContext = createContext<ThemeProviderState | undefined>(
  undefined,
);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(
    () => getStorage("theme") ?? "system",
  );
  const [resolvedTheme, setResolvedTheme] = useState<Theme>(() =>
    resolveTheme(getStorage("theme") ?? "system"),
  );

  useEffect(() => {
    if (theme !== "system") return;
    const media = window.matchMedia(MEDIA);
    const onChange = () => setResolvedTheme(resolveTheme("system"));
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = (next: ThemePreference) => {
    setThemePref(next);
    setThemeState(next);
    setResolvedTheme(resolveTheme(next));
  };

  return (
    <ThemeProviderContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeProviderContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
