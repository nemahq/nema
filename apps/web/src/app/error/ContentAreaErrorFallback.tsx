import type { ErrorComponentProps } from "@tanstack/react-router";
import { useRouter } from "@tanstack/react-router";

import { Button } from "@nema-io/weave";
import { RotateCcw } from "@nema-io/weave/icons";

import { useTranslation } from "@web/lib/tolgee";

export function ContentAreaErrorFallback({
  error,
  reset,
}: ErrorComponentProps) {
  const { t } = useTranslation();
  const router = useRouter();

  function handleRetry() {
    reset();
    router.invalidate();
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
      <p className="text-sm text-fg-tertiary">{t("error.page_error")}</p>
      {error?.message && (
        <p className="max-w-md text-center text-xs text-fg-tertiary/60">
          {error.message}
        </p>
      )}
      <Button variant="ghost" size="sm" onClick={handleRetry}>
        <RotateCcw className="size-3.5" />
        {t("common.retry")}
      </Button>
    </div>
  );
}
