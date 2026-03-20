import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  enabled: import.meta.env.PROD,
  release: typeof __COMMIT_SHA__ !== "undefined" ? __COMMIT_SHA__ : undefined,
  tracesSampleRate: 0,
});

export { Sentry };
