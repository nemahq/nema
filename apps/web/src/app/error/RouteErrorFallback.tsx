import type { ErrorComponentProps } from "@tanstack/react-router";
import { useRouter } from "@tanstack/react-router";

import { ErrorFallback } from "@web/app/error/ErrorFallback";
import { NotAuthenticatedError } from "@web/lib/auth";
import { isUnauthorizedError } from "@web/lib/trpc";

let lastRetriedError: string | null = null;

export function RouteErrorFallback({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const hasRetried = lastRetriedError === error.message;

  // 로그아웃 처리 중 인증이 사라져서 나는 에러(UNAUTHORIZED, 언마운트
  // 직전 useUser() 등)는 이미 /signin 리다이렉트가 보장돼 있으므로
  // 에러 화면 대신 빈 화면으로 넘긴다.
  if (isUnauthorizedError(error) || error instanceof NotAuthenticatedError) {
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
      className="flex-1"
    />
  );
}
