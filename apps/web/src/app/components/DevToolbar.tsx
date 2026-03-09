import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { useTheme } from "@web/app/providers/ThemeProvider";
import { useAuth } from "@web/features/auth/hooks/useAuth";
import { supabase } from "@web/lib/supabase";
import { changeLocale } from "@web/lib/tolgee";
import type { Locale } from "@web/lib/tolgee/types";
import { getStorage } from "@web/utils/localStorage";
import type { ThemePreference } from "@web/utils/theme";

const THEMES: ThemePreference[] = ["light", "dark", "system"];
const LOCALES: Locale[] = ["ko", "en"];

function toggleClass(active: boolean) {
  return `cursor-pointer rounded px-2 py-0.5 transition-colors duration-fast ${
    active
      ? "bg-brand text-brand-fg"
      : "text-fg-secondary hover:bg-surface-raised-hover"
  }`;
}

export function DevToolbar() {
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [locale, setLocale] = useState<Locale>(
    () => (getStorage("locale") as Locale) ?? "ko",
  );

  function handleLocaleChange(next: Locale) {
    setLocale(next);
    changeLocale(next);
  }

  return (
    <div className="fixed bottom-3 left-3 z-50">
      {open && (
        <div className="mb-2 flex flex-col gap-3 rounded-lg border border-border bg-surface-raised p-3 text-xs shadow-lg">
          <div className="flex flex-col gap-1.5">
            <span className="font-semibold text-fg-tertiary">Theme</span>
            <div className="flex items-center gap-1">
              {THEMES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTheme(t)}
                  className={toggleClass(theme === t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {user && (
            <div className="flex flex-col gap-1.5">
              <span className="font-semibold text-fg-tertiary">Auth</span>
              <div className="flex items-center gap-2">
                <span className="truncate text-fg-tertiary max-w-[120px]">
                  {user.email}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    await supabase.auth.signOut();
                    await navigate({
                      to: "/signin",
                      search: { redirect: undefined },
                    });
                  }}
                  className="cursor-pointer rounded bg-status-error/10 px-2 py-0.5 text-status-error transition-colors duration-fast hover:bg-status-error/20"
                >
                  Sign out
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <span className="font-semibold text-fg-tertiary">Locale</span>
            <div className="flex items-center gap-1">
              {LOCALES.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => handleLocaleChange(l)}
                  className={toggleClass(locale === l)}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="cursor-pointer rounded-md bg-surface-raised px-2.5 py-1 text-xs font-semibold text-fg-secondary shadow-md border border-border transition-colors duration-fast hover:bg-surface-raised-hover"
      >
        Dev
      </button>
    </div>
  );
}
