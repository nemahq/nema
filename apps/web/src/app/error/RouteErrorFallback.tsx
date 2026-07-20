import type { ErrorComponentProps } from "@tanstack/react-router";
import { useRouter } from "@tanstack/react-router";

import { ErrorFallback } from "@web/app/error/ErrorFallback";
import { isUnauthorizedError } from "@web/lib/trpc";

let lastRetriedError: string | null = null;

export function RouteErrorFallback({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const hasRetried = lastRetriedError === error.message;

  // UNAUTHORIZED는 authRedirectLink가 이미 /signin 리다이렉트를 보장하므로
  // 리다이렉트 직전 순간적으로 에러 화면을 띄우지 않는다.
  if (isUnauthorizedError(error)) {
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
