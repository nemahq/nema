import type { ErrorComponentProps } from "@tanstack/react-router";
import { useRouter } from "@tanstack/react-router";

import { ErrorFallback } from "@web/app/error/ErrorFallback";
import { NotAuthenticatedError } from "@web/lib/auth";
import { isUnauthorizedError } from "@web/lib/trpc";

let lastRetriedError: string | null = null;

// 로그아웃 처리 중 인증이 사라져서 나는 에러(UNAUTHORIZED, 언마운트
// 직전 useUser() 등)는 이미 /signin 리다이렉트가 보장돼 있다 — 화면과
// Sentry 보고 양쪽에서 같은 기준으로 "예상된 에러"로 취급한다.
export function isExpectedAuthTransitionError(error: unknown): boolean {
  return isUnauthorizedError(error) || error instanceof NotAuthenticatedError;
}

export function RouteErrorFallback({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const hasRetried = lastRetriedError === error.message;

  if (isExpectedAuthTransitionError(error)) {
    return null;
  }

  function handleRetry() {
    lastRetriedError = error.message;
    reset();
    router.invalidate();
  }

  return (
    <ErrorFallback
      detail={error?.message}
      onRetry={hasRetried ? undefined : handleRetry}
      onRefresh={hasRetried ? () => window.location.reload() : undefined}
      size="page"
      // min-h-dvh: 루트 라우트 에러는 App이 flex 부모 없는 Fragment라 flex-1이
      // 안 먹는다 — 중첩 라우트(AppLayout의 flex h-dvh 안)에선 이미 꽉 차 있어 no-op.
      className="min-h-dvh flex-1"
    />
  );
}
