import { getStorage, setStorage } from "./localStorage";
import type { ThemePreference } from "./theme-preference";

export type Theme = "light" | "dark";

export const MEDIA_DARK = "(prefers-color-scheme: dark)";

export function resolveTheme(pref: ThemePreference | null): Theme {
  if (pref === "light" || pref === "dark") {
    return pref;
  }
  return window.matchMedia(MEDIA_DARK).matches ? "dark" : "light";
}

function applyTheme(theme: Theme): void {
  const cl = document.documentElement.classList;
  if (theme === "dark") {
    cl.add("dark");
  } else {
    cl.remove("dark");
  }
}

export function setTheme(pref: ThemePreference): void {
  setStorage("theme", pref);
  applyTheme(resolveTheme(pref));
}

export function initTheme(): void {
  const pref = getStorage("theme");
  applyTheme(resolveTheme(pref));

  window.matchMedia(MEDIA_DARK).addEventListener("change", () => {
    if (getStorage("theme") !== "system") {
      return;
    }
    applyTheme(resolveTheme("system"));
  });
}
