import "./index.css";

import type React from "react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";

import { getEnv } from "@web/app/env";
import type { ErrorFallbackLabels } from "@web/app/error/ErrorFallback";
import { getAppVersion } from "@web/app/error/errorReport";
import { recordRouteErrorReport } from "@web/app/error/routeErrorReports";
import { detectLanguage } from "@web/utils/locale";
import { initTheme } from "@web/utils/theme";

import { ErrorBoundary } from "./app/error/ErrorBoundary";
import { ErrorFallback } from "./app/error/ErrorFallback";
import { isExpectedAuthTransitionError } from "./app/error/RouteErrorFallback";
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
  const appEnv = getEnv().APP_ENV;
  const version = getAppVersion();
  const builtAt = new Date(__BUILD_TIMESTAMP__).toLocaleString();
  // eslint-disable-next-line no-console -- build metadata
  console.log(`[nema] ${appEnv} · ${version} (built ${builtAt})`);
}

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element not found");
}

// TanStack Router의 errorComponent는 자체 에러 보고가 없다 — 라우트 에러는
// React 19 root의 이 콜백을 거쳐서만 잡힌다. 결과(componentStack)를 던져진
// 에러 객체 자체에 연결해두면 RouteErrorFallback이 같은 참조로 조회해
// 복사 리포트에 반영한다.
function reportRenderError(error: unknown, errorInfo: React.ErrorInfo): void {
  if (isExpectedAuthTransitionError(error)) {
    return;
  }
  recordRouteErrorReport(error, {
    componentStack: errorInfo.componentStack ?? undefined,
  });
}

createRoot(root, {
  onCaughtError: reportRenderError,
  onUncaughtError: reportRenderError,
}).render(
  <StrictMode>
    <ErrorBoundary
      boundaryName="root"
      fallbackRender={({
        error,
        reset,
        hasRetried,
        eventId,
        componentStack,
        route,
        timestamp,
      }) => (
        <ErrorFallback
          error={error}
          eventId={eventId}
          componentStack={componentStack}
          route={route}
          timestamp={timestamp}
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
