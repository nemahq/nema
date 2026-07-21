import type { ErrorFallbackProps } from "@web/app/error/ErrorBoundary";
import { ErrorFallback } from "@web/app/error/ErrorFallback";
import { useTranslation } from "@web/lib/tolgee";

export function SectionErrorFallback({
  error,
  reset,
  hasRetried,
}: ErrorFallbackProps) {
  const { t } = useTranslation();
  return (
    <ErrorFallback
      detail={error.message}
      onRetry={hasRetried ? undefined : reset}
      onRefresh={hasRetried ? () => window.location.reload() : undefined}
      labels={{ pageError: t("error.section_load_failed") }}
      className="flex-1"
    />
  );
}
