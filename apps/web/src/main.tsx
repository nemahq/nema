import "./index.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";

import { Sentry } from "@web/lib/sentry";
import { initTheme } from "@web/utils/theme";

import { ErrorBoundary } from "./app/error/ErrorBoundary";
import { AppProviders } from "./app/providers";
import { router } from "./app/router";

initTheme();

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

createRoot(root, {
  onCaughtError(error, errorInfo) {
    Sentry.captureException(error, {
      extra: { componentStack: errorInfo.componentStack },
    });
  },
  onUncaughtError(error, errorInfo) {
    Sentry.captureException(error, {
      extra: { componentStack: errorInfo.componentStack },
    });
  },
}).render(
  <StrictMode>
    <ErrorBoundary>
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>
    </ErrorBoundary>
  </StrictMode>,
);
