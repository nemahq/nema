import { getStorage, setStorage } from "./localStorage";

export type Theme = "light" | "dark";
export type ThemePreference = "light" | "dark" | "system";

export function isThemePreference(v: string): v is ThemePreference {
  return v === "light" || v === "dark" || v === "system";
}

const MEDIA = "(prefers-color-scheme: dark)";

function resolveTheme(pref: ThemePreference | null): Theme {
  if (pref === "light" || pref === "dark") return pref;
  return window.matchMedia(MEDIA).matches ? "dark" : "light";
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

  window.matchMedia(MEDIA).addEventListener("change", () => {
    if (getStorage("theme") !== "system") return;
    applyTheme(resolveTheme("system"));
  });
}
