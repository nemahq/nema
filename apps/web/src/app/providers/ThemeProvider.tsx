import { createContext, useContext, useState } from "react";

import { getStorage } from "@web/utils/storage";
import {
  setTheme as setThemePref,
  type ThemePreference,
} from "@web/utils/theme";

type ThemeProviderState = {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
};

const ThemeProviderContext = createContext<ThemeProviderState | undefined>(
  undefined,
);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(
    () => getStorage("theme") ?? "light",
  );

  const setTheme = (next: ThemePreference) => {
    setThemePref(next);
    setThemeState(next);
  };

  return (
    <ThemeProviderContext.Provider value={{ theme, setTheme }}>
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
