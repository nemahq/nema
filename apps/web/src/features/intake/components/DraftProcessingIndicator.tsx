import { Circle } from "@nema-io/weave/icons";

import { useElapsedSeconds } from "@web/features/intake/hooks/useElapsedSeconds";
import { useTranslation } from "@web/lib/tolgee";

const SECONDS_PER_MINUTE = 60;

interface DraftProcessingIndicatorProps {
  since: string;
}

export function DraftProcessingIndicator({
  since,
}: DraftProcessingIndicatorProps) {
  const { t } = useTranslation();
  const elapsedSeconds = useElapsedSeconds(since);
  const minutes = Math.floor(elapsedSeconds / SECONDS_PER_MINUTE);
  const seconds = elapsedSeconds % SECONDS_PER_MINUTE;
  const elapsedLabel =
    minutes > 0
      ? t("intake.draft_processing_elapsed_minutes", { minutes, seconds })
      : t("intake.draft_processing_elapsed_seconds", { count: seconds });

  return (
    <div className="flex items-center justify-between text-xs text-fg-tertiary">
      <div className="flex items-center gap-1.5">
        <Circle className="size-2.5 shrink-0 animate-pulse fill-current" />
        {t("intake.draft_processing")}
      </div>
      {elapsedLabel}
    </div>
  );
}
