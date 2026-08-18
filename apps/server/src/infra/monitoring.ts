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
