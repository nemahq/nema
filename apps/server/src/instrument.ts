import * as Sentry from "@sentry/node";

declare const __COMMIT_SHA__: string;

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: process.env.NODE_ENV === "production",
  release: typeof __COMMIT_SHA__ !== "undefined" ? __COMMIT_SHA__ : undefined,
  tracesSampleRate: 0,
});
