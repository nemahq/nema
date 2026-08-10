import "./index.css";
import "@web/lib/sentry";

import type React from "react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import { RouterProvider } from "@tanstack/react-router";

import { getEnv } from "@web/app/env";
import type { ErrorFallbackLabels } from "@web/app/error/ErrorFallback";
import { getAppVersion } from "@web/app/error/errorReport";
import { recordRouteErrorReport } from "@web/app/error/routeErrorReports";
import { SENTRY_ENABLED } from "@web/lib/sentry";
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
  // 풀 SHA는 Sentry 릴리스 태그·소스맵 연결용(lib/sentry)이고 콘솔 표시만 축약한다.
  const version = getAppVersion();
  const builtAt = new Date(__BUILD_TIMESTAMP__).toLocaleString();
  // eslint-disable-next-line no-console -- build metadata, not capturable by Sentry
  console.log(`[nema] ${appEnv} · ${version} (built ${builtAt})`);

  // 스탬프가 빌드에 안 실리면 조용히 dev로 회귀해 Sentry 릴리스 태그까지 오염시킨다.
  // 빌드 시점엔 감지할 신호가 없어(서버 index.ts와 동일) 배포 런타임에서 잡는다.
  if (appEnv !== "local" && __COMMIT_SHA__ === "dev") {
    Sentry.captureMessage(
      '[bootstrap] Deployed web build has no commit SHA stamp — console and Sentry release report "dev". CI must write .commit-sha before railway up.',
      { level: "error" },
    );
  }
}

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element not found");
}

// TanStack Router의 errorComponent는 자체 Sentry 보고가 없다 — 라우트 에러는
// React 19 root의 이 콜백을 거쳐서만 캡처된다. 결과를 던져진 에러 객체에
// 연결해두면 RouteErrorFallback이 같은 참조로 조회해 복사 리포트에 반영한다.
function reportRenderError(error: unknown, errorInfo: React.ErrorInfo): void {
  if (isExpectedAuthTransitionError(error)) {
    return;
  }
  const eventId = SENTRY_ENABLED
    ? Sentry.captureException(error, {
        extra: { componentStack: errorInfo.componentStack },
      })
    : undefined;
  recordRouteErrorReport(error, {
    eventId,
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
