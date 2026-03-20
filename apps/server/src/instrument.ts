import * as Sentry from "@sentry/node";

declare const __COMMIT_SHA__: string;

const appEnv = process.env.APP_ENV ?? process.env.NODE_ENV ?? "local";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: appEnv === "production",
  environment: appEnv,
  release: typeof __COMMIT_SHA__ !== "undefined" ? __COMMIT_SHA__ : undefined,
  tracesSampleRate: 0,
});
