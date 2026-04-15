import "./index.css";
import "@web/lib/sentry";

import type React from "react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import { RouterProvider } from "@tanstack/react-router";

import type { ErrorFallbackLabels } from "@web/app/error/ErrorFallback";
import { detectLanguage } from "@web/utils/locale";
import { initTheme } from "@web/utils/theme";

import { ErrorBoundary } from "./app/error/ErrorBoundary";
import { ErrorFallback } from "./app/error/ErrorFallback";
import { AppProviders } from "./app/providers";
import { router } from "./app/router";

initTheme();

const ROOT_FALLBACK_LABELS: Record<string, ErrorFallbackLabels> = {
  ko: {
    pageError: "잠깐, 다시 불러올게요.",
    retry: "다시 시도",
    refresh: "새로고침",
    copyError: "에러 정보 복사",
  },
  en: {
    pageError: "Hold on, let's try that again.",
    retry: "Retry",
    refresh: "Refresh",
    copyError: "Copy error info",
  },
};

const rootLabels = ROOT_FALLBACK_LABELS[detectLanguage()];

if (typeof __COMMIT_SHA__ !== "undefined") {
  // eslint-disable-next-line no-console -- build metadata, not capturable by Sentry
  console.log(`[nema] ${__COMMIT_SHA__} (built ${__BUILD_TIMESTAMP__})`);
}

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element not found");
}

function reportRenderError(error: unknown, errorInfo: React.ErrorInfo): void {
  Sentry.captureException(error, {
    extra: { componentStack: errorInfo.componentStack },
  });
}

createRoot(root, {
  onCaughtError: reportRenderError,
  onUncaughtError: reportRenderError,
}).render(
  <StrictMode>
    <ErrorBoundary
      boundaryName="root"
      fallbackRender={({ error, reset, hasRetried }) => (
        <ErrorFallback
          detail={error?.message}
          onRetry={hasRetried ? undefined : reset}
          onRefresh={hasRetried ? () => window.location.reload() : undefined}
          size="page"
          className="min-h-dvh"
          labels={rootLabels}
        />
      )}
    >
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>
    </ErrorBoundary>
  </StrictMode>,
);
