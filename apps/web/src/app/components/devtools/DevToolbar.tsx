import { lazy, Suspense, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { cn, POPOVER_SURFACE_CLASSNAME } from "@nema-io/weave";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import { useTheme } from "@web/app/providers/ThemeProvider";
import { useAuth } from "@web/lib/auth";
import { supabase } from "@web/lib/supabase";
import { changeLocale, isLocale, type Locale, tolgee } from "@web/lib/tolgee";
import type { ThemePreference } from "@web/utils/theme-preference";

const ReactQueryDevtools = lazy(() =>
  import("@tanstack/react-query-devtools").then((m) => ({
    default: m.ReactQueryDevtools,
  })),
);

const THEMES: ThemePreference[] = ["light", "dark", "system"];
const LOCALES: Locale[] = ["ko", "en"];

function toggleClass(active: boolean) {
  return `cursor-pointer rounded px-2 py-0.5 transition-colors duration-fast ${
    active
      ? "bg-brand text-brand-fg dark:bg-fg-primary dark:text-surface-base"
      : "text-fg-secondary hover:bg-surface-raised-hover"
  }`;
}

export function DevToolbar() {
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [queryDevtools, setQueryDevtools] = useState(false);
  // tolgee의 'language' 이벤트는 changeLanguage()의 cache.loadRecords()가 끝난
  // 뒤에만 발화돼서, 그 값을 그대로 구독하면 실제 언어 전환보다 패널 표시가
  // 뒤처진다 — PreferencesSection의 App language 셀렉트와 동일하게 클릭 시
  // 낙관적으로 반영하고 실패하면 롤백한다.
  const [currentLocale, setCurrentLocale] = useState<Locale>(() => {
    const lang = tolgee.getLanguage();
    return lang && isLocale(lang) ? lang : "ko";
  });

  async function handleLocaleChange(l: Locale) {
    const previousLocale = currentLocale;
    setCurrentLocale(l);
    try {
      await changeLocale(l);
    } catch (error) {
      setCurrentLocale(previousLocale);
      // eslint-disable-next-line no-console
      console.error(error);
    }
  }

  return (
    <>
      <div className="fixed bottom-3 right-3 z-50 flex flex-col items-end">
        {/* dev 전용 오버레이라 weave Button/Tab 대신 최소 스타일의 raw button을 쓴다 —
            프로덕션 UI가 아니라 디자인 시스템 일관성보다 가벼움을 우선한다. */}
        {open && (
          <div
            className={cn(
              POPOVER_SURFACE_CLASSNAME,
              "mb-2 flex w-56 flex-col gap-3 p-3 text-xs",
            )}
          >
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
                    className={toggleClass(currentLocale === l)}
                  >
                    {l.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="font-semibold text-fg-tertiary">
                Query Devtools
              </span>
              <button
                type="button"
                onClick={() => setQueryDevtools((prev) => !prev)}
                className={toggleClass(queryDevtools)}
              >
                {queryDevtools ? "OFF" : "ON"}
              </button>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="cursor-pointer rounded-md bg-surface-overlay px-2.5 py-1 text-xs font-semibold text-fg-secondary shadow-md border border-border transition-colors duration-fast hover:bg-surface-raised-hover"
        >
          Dev
        </button>
      </div>

      {queryDevtools && (
        <ErrorBoundary fallback={null}>
          <Suspense>
            <ReactQueryDevtools initialIsOpen />
          </Suspense>
        </ErrorBoundary>
      )}
    </>
  );
}
