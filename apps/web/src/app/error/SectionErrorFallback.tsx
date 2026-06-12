import type { ErrorFallbackProps } from "@web/app/error/ErrorBoundary";
import { ErrorFallback } from "@web/app/error/ErrorFallback";

export function SectionErrorFallback({
  reset,
  hasRetried,
}: ErrorFallbackProps) {
  return (
    <ErrorFallback
      onRetry={hasRetried ? undefined : reset}
      onRefresh={hasRetried ? () => window.location.reload() : undefined}
      showBranding={false}
      className="flex-1"
    />
  );
}
