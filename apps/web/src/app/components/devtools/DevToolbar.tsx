/* eslint-disable react-compiler/react-compiler -- dev-only 컴포넌트 */
import { lazy, Suspense, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import { useTheme } from "@web/app/providers/ThemeProvider";
import { useAuth } from "@web/hooks/useAuth";
import { supabase } from "@web/lib/supabase";
import { changeLocale } from "@web/lib/tolgee";
import { tolgee } from "@web/lib/tolgee/client";
import type { Locale } from "@web/lib/tolgee/types";
import { trpc } from "@web/lib/trpc";
import type { ThemePreference } from "@web/utils/theme-preference";

const ReactQueryDevtools = lazy(() =>
  import("@tanstack/react-query-devtools").then((m) => ({
    default: m.ReactQueryDevtools,
  })),
);

const THEMES: ThemePreference[] = ["light", "dark", "system"];
const LOCALES: Locale[] = ["ko", "en"];
const LLM_PRESETS = ["all-nano", "real-tiers"] as const;

function formatModelMap(models: {
  standard: string;
  mini: string;
  nano: string;
}): string {
  const allSame =
    models.standard === models.mini && models.mini === models.nano;
  if (allSame) {
    return `all: ${models.standard}`;
  }
  return `S: ${models.standard} · M: ${models.mini} · N: ${models.nano}`;
}

function toggleClass(active: boolean) {
  return `cursor-pointer rounded px-2 py-0.5 transition-colors duration-fast ${
    active
      ? "bg-brand text-brand-fg"
      : "text-fg-secondary hover:bg-surface-raised-hover"
  }`;
}

function LlmPresetSection() {
  const [presetData] = trpc.dev.getModelPreset.useSuspenseQuery(undefined, {
    staleTime: Infinity,
  });
  const utils = trpc.useUtils();
  const presetMutation = trpc.dev.setModelPreset.useMutation({
    onSuccess: (data) => {
      utils.dev.getModelPreset.setData(undefined, data);
    },
  });

  useEffect(function resetPresetOnMount() {
    if (presetData.preset !== "all-nano") {
      presetMutation.mutate({ preset: "all-nano" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 시 1회만
  }, []);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-semibold text-fg-tertiary">LLM</span>
      <div className="flex items-center gap-1">
        {LLM_PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            disabled={presetMutation.isPending}
            onClick={() => presetMutation.mutate({ preset: p })}
            className={toggleClass(presetData.preset === p)}
          >
            {p}
          </button>
        ))}
      </div>
      <div className="text-[10px] text-fg-tertiary">
        {formatModelMap(presetData.models)}
      </div>
    </div>
  );
}

export function DevToolbar() {
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [queryDevtools, setQueryDevtools] = useState(false);
  const currentLocale = tolgee.getLanguage();

  return (
    <>
      <div className="fixed bottom-3 right-3 z-50 flex flex-col items-end">
        {open && (
          <div className="mb-2 flex w-56 flex-col gap-3 rounded-lg border border-border bg-surface-raised p-3 text-xs shadow-lg">
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
                    onClick={() => changeLocale(l)}
                    className={toggleClass(currentLocale === l)}
                  >
                    {l.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <ErrorBoundary
              fallback={
                <span className="text-[10px] text-status-error">
                  LLM preset unavailable
                </span>
              }
            >
              <Suspense>
                <LlmPresetSection />
              </Suspense>
            </ErrorBoundary>

            <div className="flex flex-col gap-1.5">
              <span className="font-semibold text-fg-tertiary">Query</span>
              <button
                type="button"
                onClick={() => setQueryDevtools((prev) => !prev)}
                className={toggleClass(queryDevtools)}
              >
                {queryDevtools ? "ON" : "OFF"}
              </button>
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
