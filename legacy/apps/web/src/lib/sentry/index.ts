import * as Sentry from "@sentry/react";

import { getEnv } from "@web/app/env";

const { APP_ENV } = getEnv();

// captureException은 enabled: false여도 항상 uuid를 생성해 반환한다 — 실제
// 전송 여부와 무관하다. 이 값으로 이벤트 존재를 약속하는 곳(에러 리포트의
// Event ID 등)은 이 플래그로 한 번 더 걸러야 한다.
export const SENTRY_ENABLED = APP_ENV === "production";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  enabled: SENTRY_ENABLED,
  environment: APP_ENV,
  release: typeof __COMMIT_SHA__ !== "undefined" ? __COMMIT_SHA__ : undefined,
  tracesSampleRate: 0,
});
