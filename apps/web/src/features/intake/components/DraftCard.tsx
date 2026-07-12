import { Badge, type BadgeVariant } from "@nema-io/weave";
import { Circle } from "@nema-io/weave/icons";

import { RelativeTime } from "@web/components/ui/RelativeTime";
import type { DraftStatus } from "@web/features/intake/utils";
import { type TranslationKey, useTranslation } from "@web/lib/tolgee";

const STATUS_META: Record<
  DraftStatus,
  { labelKey: TranslationKey; variant: BadgeVariant }
> = {
  processing: { labelKey: "intake.draft_processing", variant: "info" },
  failed: { labelKey: "intake.draft_failed", variant: "error" },
  empty: { labelKey: "intake.draft_no_result", variant: "neutral" },
};

interface DraftCardProps {
  body: string;
  status: DraftStatus;
  createdAt: string;
}

export function DraftCard({ body, status, createdAt }: DraftCardProps) {
  const { t } = useTranslation();
  const { labelKey, variant } = STATUS_META[status];

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-surface-raised p-4">
      <Badge
        variant={variant}
        className="inline-flex w-fit items-center gap-1.5"
      >
        {status === "processing" && (
          <Circle className="size-1.5 animate-pulse fill-current" />
        )}
        {t(labelKey)}
      </Badge>
      <p className="line-clamp-2 text-sm text-fg-secondary">{body}</p>
      <RelativeTime dateTime={createdAt} />
    </div>
  );
}
