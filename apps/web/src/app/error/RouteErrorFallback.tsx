import type { ErrorComponentProps } from "@tanstack/react-router";
import { useRouter } from "@tanstack/react-router";

import { ErrorFallback } from "@web/app/error/ErrorFallback";

export function RouteErrorFallback({ error, reset }: ErrorComponentProps) {
  const router = useRouter();

  function handleRetry() {
    reset();
    router.invalidate();
  }

  return (
    <ErrorFallback
      detail={error?.message}
      onRetry={handleRetry}
      className="flex-1"
    />
  );
}
