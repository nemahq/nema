import { Button } from "@nema-io/weave";
import { RefreshCw, RotateCcw } from "@nema-io/weave/icons";

import { NemaMarkIcon } from "@web/components/ui/NemaMarkIcon";
import { useTranslation } from "@web/lib/tolgee";

interface ErrorFallbackProps {
  detail?: string;
  onRetry?: () => void;
  onRefresh?: () => void;
  showBranding?: boolean;
  className?: string;
}

export function ErrorFallback({
  detail,
  onRetry,
  onRefresh,
  showBranding,
  className,
}: ErrorFallbackProps) {
  const { t } = useTranslation();

  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 p-8 ${className ?? ""}`}
    >
      {showBranding && (
        <NemaMarkIcon
          width={32}
          height={39}
          className="mb-4 fill-teal-500 dark:fill-fg-primary"
        />
      )}
      <p className="text-sm text-fg-tertiary">{t("error.page_error")}</p>
      {detail && (
        <p className="max-w-md text-center text-xs text-fg-tertiary/60">
          {detail}
        </p>
      )}
      {onRetry && (
        <Button variant="ghost" size="sm" onClick={onRetry}>
          <RotateCcw className="size-3.5" />
          {t("common.retry")}
        </Button>
      )}
      {onRefresh && (
        <Button variant="ghost" size="sm" onClick={onRefresh}>
          <RefreshCw className="size-3.5" />
          {t("error.refresh")}
        </Button>
      )}
    </div>
  );
}
