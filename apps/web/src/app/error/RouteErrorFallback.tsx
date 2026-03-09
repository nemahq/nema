import type { ErrorComponentProps } from "@tanstack/react-router";
import { useRouter } from "@tanstack/react-router";

import { Button } from "@nema-io/weave";

import { useTranslation } from "@web/lib/tolgee";

export function RouteErrorFallback({ reset }: ErrorComponentProps) {
  const { t } = useTranslation();
  const router = useRouter();

  function handleRetry() {
    reset();
    router.invalidate();
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <p className="text-fg-tertiary text-sm">{t("common.unknown_error")}</p>
      <Button variant="primary" size="sm" onClick={handleRetry}>
        {t("common.retry")}
      </Button>
    </div>
  );
}
