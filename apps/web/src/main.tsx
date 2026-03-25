import "./index.css";
import "@web/lib/sentry";

import type React from "react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import { RouterProvider } from "@tanstack/react-router";

import { initTheme } from "@web/utils/theme";

import { ErrorBoundary } from "./app/error/ErrorBoundary";
import { PageErrorFallback } from "./app/error/PageErrorFallback";
import { AppProviders } from "./app/providers";
import { router } from "./app/router";

initTheme();

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
        <PageErrorFallback
          error={error}
          onRetry={hasRetried ? undefined : reset}
        />
      )}
    >
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>
    </ErrorBoundary>
  </StrictMode>,
);
