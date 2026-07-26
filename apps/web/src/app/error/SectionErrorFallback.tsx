import type { ErrorFallbackProps } from "@web/app/error/ErrorBoundary";
import { ErrorFallback } from "@web/app/error/ErrorFallback";
import { useTranslation } from "@web/lib/tolgee";

export function SectionErrorFallback({
  error,
  reset,
  hasRetried,
  eventId,
  componentStack,
}: ErrorFallbackProps) {
  const { t } = useTranslation();
  return (
    <ErrorFallback
      error={error}
      eventId={eventId}
      componentStack={componentStack}
      onRetry={hasRetried ? undefined : reset}
      onRefresh={hasRetried ? () => window.location.reload() : undefined}
      labels={{ pageError: t("error.section_load_failed") }}
      className="flex-1"
    />
  );
}
