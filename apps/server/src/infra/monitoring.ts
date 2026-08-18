import type { FastifyInstance } from "fastify";
import * as Sentry from "@sentry/node";

// 종료 직전 미전송 이벤트를 내보낼 유예 시간.
const FLUSH_TIMEOUT_MS = 2000;

export function initMonitoring(): void {
  const appEnv = process.env.APP_ENV ?? process.env.NODE_ENV ?? "local";

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    // staging/local에서 자동으로 꺼진다 — 개발 중 에러가 알림으로 쏟아지면 진짜
    // 신호가 묻힌다.
    enabled: appEnv === "production",
    environment: appEnv,
    // 성능 추적(트레이싱)은 이벤트를 대량 발생시켜 무료 할당량을 빨리 태운다.
    // 에러만 받는다.
    tracesSampleRate: 0,
    // OnUnhandledRejection 기본 통합의 mode는 "warn"이라 캡처만 하고 프로세스를
    // 살려둔다 — 이 통합을 등록하는 순간 Node의 자체 기본 동작(리스너가 하나도
    // 없을 때 처리되지 않은 거부를 크래시로 승격)이 무효화된다. Sentry 도입 전엔
    // 이 앱에 리스너가 없어 크래시 후 Railway 재시작이 안전망이었다 — "strict"로
    // 그 동작을 그대로 유지한다.
    integrations: (defaults) =>
      defaults.map((integration) =>
        integration.name === "OnUnhandledRejection"
          ? Sentry.onUnhandledRejectionIntegration({ mode: "strict" })
          : integration,
      ),
  });
}

export function setupFastifyErrorHandler(server: FastifyInstance): void {
  Sentry.setupFastifyErrorHandler(server);
}

export function captureException(
  exception: unknown,
  hint?: Parameters<typeof Sentry.captureException>[1],
): void {
  Sentry.captureException(exception, hint);
}

export async function flushMonitoring(): Promise<void> {
  await Sentry.flush(FLUSH_TIMEOUT_MS);
}
