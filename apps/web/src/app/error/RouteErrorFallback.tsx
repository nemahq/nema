import type { ErrorComponentProps } from "@tanstack/react-router";
import { useRouter } from "@tanstack/react-router";

import { PageErrorFallback } from "./PageErrorFallback";

export function RouteErrorFallback({ error, reset }: ErrorComponentProps) {
  const router = useRouter();

  function handleRetry() {
    reset();
    router.invalidate();
  }

  return <PageErrorFallback error={error} onRetry={handleRetry} />;
}
