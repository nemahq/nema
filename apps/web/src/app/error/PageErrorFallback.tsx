import { Link } from "@tanstack/react-router";

import { Button } from "@nema-io/weave";
import { Home, RefreshCw, RotateCcw } from "@nema-io/weave/icons";

import { useTranslation } from "@web/lib/tolgee";

interface PageErrorFallbackProps {
  variant?: "error" | "not-found";
  onRetry?: () => void;
}

export function PageErrorFallback({
  variant = "error",
  onRetry,
}: PageErrorFallbackProps) {
  const { t } = useTranslation();

  if (variant === "not-found") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
        <p className="text-sm text-fg-tertiary">{t("error.not_found")}</p>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/">
            <Home className="size-3.5" />
            {t("error.go_home")}
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
      <p className="text-sm text-fg-tertiary">{t("error.page_error")}</p>
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
