import { Badge, type BadgeVariant } from "@nema-io/weave";
import { Circle } from "@nema-io/weave/icons";

import { RelativeTime } from "@web/components/ui/RelativeTime";
import type { DraftStatus } from "@web/features/intake/utils";
import { type TranslationKey, useTranslation } from "@web/lib/tolgee";

// failed 배지는 PendingSourceItem.errorMessage(워커가 원본 예외 메시지를 그대로 저장한
// 내부 디버그 텍스트)를 절대 안 쓴다 — 고정 안내 문구로 대체한다는 게 의도된 결정이다
// (design-decisions-log.md 2026-07-12 참고). 나중에 "더 친절하게" errorMessage를
// 이어붙이고 싶어지면 그 전에 서버가 사용자 노출용 메시지를 별도로 다듬어야 한다.
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
