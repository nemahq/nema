import type { ErrorComponentProps } from "@tanstack/react-router";
import { useRouter } from "@tanstack/react-router";

import { ErrorFallback } from "@web/app/error/ErrorFallback";

let lastRetriedError: string | null = null;

export function RouteErrorFallback({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const hasRetried = lastRetriedError === error.message;

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
