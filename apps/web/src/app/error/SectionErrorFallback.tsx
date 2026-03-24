import { Button } from "@nema-io/weave";
import { RefreshCw, RotateCcw } from "@nema-io/weave/icons";

import type { ErrorFallbackProps } from "@web/app/error/ErrorBoundary";
import { useTranslation } from "@web/lib/tolgee";

export function SectionErrorFallback({
  reset,
  hasRetried,
}: ErrorFallbackProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
      <p className="text-sm text-fg-tertiary">
        {t("error.section_load_failed")}
      </p>
      {hasRetried ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => window.location.reload()}
        >
          <RefreshCw className="size-3.5" />
          {t("error.refresh")}
        </Button>
      ) : (
        <Button variant="ghost" size="sm" onClick={reset}>
          <RotateCcw className="size-3.5" />
          {t("common.retry")}
        </Button>
      )}
    </div>
  );
}
