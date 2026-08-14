import type { DigestionStatus } from "@nema-io/shared";
import { Badge, type BadgeVariant, Button, cn, Text } from "@nema-io/weave";
import { Circle, RotateCw } from "@nema-io/weave/icons";

import { RelativeTime } from "@web/components/ui/RelativeTime";
import { useReExtractSource } from "@web/features/drafts/hooks/useReExtractSource";
import { classifyPendingSource } from "@web/features/drafts/pendingSourceStatus";
import { type TranslationKey, useTranslation } from "@web/lib/tolgee";

import { DraftCardShell } from "./DraftCardShell";

type DraftCardStatus = "processing" | "stalled" | "empty";

function draftCardStatus(
  status: DigestionStatus,
  createdAt: string,
): DraftCardStatus {
  if (status === "completed") {
    return "empty";
  }
  return classifyPendingSource(createdAt) === "processing"
    ? "processing"
    : "stalled";
}

const STATUS_LABEL_KEY: Record<DraftCardStatus, TranslationKey> = {
  processing: "draft.status_processing",
  stalled: "draft.status_failed",
  empty: "draft.status_empty",
};

const STATUS_BADGE_VARIANT: Record<DraftCardStatus, BadgeVariant> = {
  processing: "info",
  stalled: "error",
  empty: "neutral",
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
  const cardStatus = draftCardStatus(status, createdAt);

  function handleSelect() {
    onSelect(sourceId);
  }

  function handleRetry() {
    reExtract.mutate({ sourceId });
  }

  return (
    <DraftCardShell name={name} onSelect={handleSelect}>
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
        <Badge size="sm" variant={STATUS_BADGE_VARIANT[cardStatus]}>
          <span className="inline-flex items-center gap-1">
            {cardStatus === "processing" && (
              <Circle className="size-1.5 shrink-0 animate-pulse fill-current" />
            )}
            {t(STATUS_LABEL_KEY[cardStatus])}
          </span>
        </Badge>
      </div>
      {/* 처리 중엔 다른 액션이 없다(legacy DraftProcessingHeader와 같은 이유) —
          지금 정말 진행 중인지 이 화면은 모르니, 재시도가 겹쳐 도는 걸 막는다. */}
      {cardStatus !== "processing" && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleRetry}
            disabled={reExtract.isPending}
            className={cn(
              "pointer-events-auto opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100",
              reExtract.isPending && "opacity-100",
            )}
          >
            <RotateCw className="size-3.5" />
            {reExtract.isPendingAfterDelay
              ? t("draft.retry_pending")
              : t("common.retry")}
          </Button>
        </div>
      )}
    </DraftCardShell>
  );
}
