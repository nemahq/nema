import type { ErrorComponentProps } from "@tanstack/react-router";
import { useRouter } from "@tanstack/react-router";

import { PageErrorFallback } from "./PageErrorFallback";

export function RouteErrorFallback({ reset }: ErrorComponentProps) {
  const router = useRouter();

  function handleRetry() {
    reset();
    router.invalidate();
  }

  return <PageErrorFallback variant="error" onRetry={handleRetry} />;
}
