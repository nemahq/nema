import { getStorage, setStorage } from "./localStorage";

export type Theme = "light" | "dark";

const THEME_PREFERENCES = ["light", "dark", "system"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export function isThemePreference(v: string): v is ThemePreference {
  return (THEME_PREFERENCES as readonly string[]).includes(v);
}

export const MEDIA_DARK = "(prefers-color-scheme: dark)";

export function resolveTheme(pref: ThemePreference | null): Theme {
  if (pref === "light" || pref === "dark") return pref;
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
    if (getStorage("theme") !== "system") return;
    applyTheme(resolveTheme("system"));
  });
}
