import { Button } from "@nema-io/weave";
import { RefreshCw, RotateCcw } from "@nema-io/weave/icons";

import { NemaMarkIcon } from "@web/components/ui/NemaMarkIcon";
import { useTranslation } from "@web/lib/tolgee";

interface PageErrorFallbackProps {
  error?: Error;
  onRetry?: () => void;
}

export function PageErrorFallback({ error, onRetry }: PageErrorFallbackProps) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-8">
      <NemaMarkIcon
        width={32}
        height={39}
        className="mb-4 fill-teal-500 dark:fill-fg-primary"
      />
      <p className="text-sm text-fg-tertiary">{t("error.page_error")}</p>
      {error?.message && (
        <p className="max-w-md text-center text-xs text-fg-tertiary/60">
          {error.message}
        </p>
      )}
      {onRetry ? (
        <Button variant="ghost" size="sm" onClick={onRetry}>
          <RotateCcw className="size-3.5" />
          {t("common.retry")}
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => window.location.reload()}
        >
          <RefreshCw className="size-3.5" />
          {t("error.refresh")}
        </Button>
      )}
    </div>
  );
}
