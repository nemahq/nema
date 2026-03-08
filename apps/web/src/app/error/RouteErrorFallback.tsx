import type { ErrorComponentProps } from "@tanstack/react-router";
import { useRouter } from "@tanstack/react-router";

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
      <p className="text-muted-foreground text-sm">
        {t("common.unknown_error")}
      </p>
      <button
        type="button"
        onClick={handleRetry}
        className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm"
      >
        {t("common.retry")}
      </button>
    </div>
  );
}
