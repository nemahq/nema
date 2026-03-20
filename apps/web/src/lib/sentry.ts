import * as Sentry from "@sentry/react";

import { getEnv } from "@web/app/env";

const { APP_ENV } = getEnv();

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  enabled: APP_ENV !== "development",
  environment: APP_ENV,
  release: typeof __COMMIT_SHA__ !== "undefined" ? __COMMIT_SHA__ : undefined,
  tracesSampleRate: 0,
});

export { Sentry };
