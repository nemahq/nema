import type { DigestionStatus } from "@nema-io/shared";
import { Badge, type BadgeVariant, Button, Text } from "@nema-io/weave";
import { RotateCw } from "@nema-io/weave/icons";

import { RelativeTime } from "@web/components/ui/RelativeTime";
import { useReExtractSource } from "@web/features/drafts/hooks/useReExtractSource";
import { type TranslationKey, useTranslation } from "@web/lib/tolgee";

import { DraftCardShell } from "./DraftCardShell";

const STATUS_BADGE_VARIANT: Record<DigestionStatus, BadgeVariant> = {
  pending: "error",
  completed: "neutral",
};

const STATUS_LABEL_KEY: Record<DigestionStatus, TranslationKey> = {
  pending: "draft.status_pending",
  completed: "draft.status_empty",
};

interface DraftCardProps {
  sourceId: string;
  name: string;
  createdAt: string;
  status: DigestionStatus;
  onSelect: (sourceId: string) => void;
}

export function DraftCard({
  sourceId,
  name,
  createdAt,
  status,
  onSelect,
}: DraftCardProps) {
  const { t } = useTranslation();
  const reExtract = useReExtractSource();

  function handleSelect() {
    onSelect(sourceId);
  }

  function handleRetry() {
    reExtract.mutate({ sourceId });
  }

  return (
    <DraftCardShell onSelect={handleSelect}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Text
            size="sm"
            weight="medium"
            color="primary"
            className="min-w-0 truncate"
          >
            {name}
          </Text>
          <RelativeTime dateTime={createdAt} />
        </div>
        <Badge size="sm" variant={STATUS_BADGE_VARIANT[status]}>
          {t(STATUS_LABEL_KEY[status])}
        </Badge>
      </div>
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="ghost"
          onClick={handleRetry}
          disabled={reExtract.isPending}
          className="pointer-events-auto"
        >
          <RotateCw className="size-3.5" />
          {reExtract.isPendingAfterDelay
            ? t("draft.retry_pending")
            : t("common.retry")}
        </Button>
      </div>
    </DraftCardShell>
  );
}
