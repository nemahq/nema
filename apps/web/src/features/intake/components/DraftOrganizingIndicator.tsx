import { Circle } from "@nema-io/weave/icons";

import { useElapsedSeconds } from "@web/features/intake/hooks/useElapsedSeconds";
import { useTranslation } from "@web/lib/tolgee";

const SECONDS_PER_MINUTE = 60;

interface DraftOrganizingIndicatorProps {
  since: string;
}

export function DraftOrganizingIndicator({
  since,
}: DraftOrganizingIndicatorProps) {
  const { t } = useTranslation();
  const elapsedSeconds = useElapsedSeconds(since);
  const minutes = Math.floor(elapsedSeconds / SECONDS_PER_MINUTE);
  const seconds = elapsedSeconds % SECONDS_PER_MINUTE;
  const elapsedLabel =
    minutes > 0
      ? t("intake.draft_organizing_elapsed_minutes", { minutes, seconds })
      : t("intake.draft_organizing_elapsed_seconds", { count: seconds });

  return (
    <div className="flex items-center justify-between text-xs">
      <div className="flex items-center gap-1.5 text-status-info">
        <Circle className="size-2.5 shrink-0 animate-pulse fill-current" />
        {t("intake.draft_organizing")}
      </div>
      <span className="text-fg-tertiary">{elapsedLabel}</span>
    </div>
  );
}
