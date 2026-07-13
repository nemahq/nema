import { type ComponentType } from "react";

import { Badge, type BadgeVariant } from "@nema-io/weave";
import { Circle } from "@nema-io/weave/icons";

import { RelativeTime } from "@web/components/ui/RelativeTime";
import type { DraftFooterProps } from "@web/features/intake/types";
import type { DraftStatus } from "@web/features/intake/utils";
import { type TranslationKey, useTranslation } from "@web/lib/tolgee";

import { DraftIdleActions } from "./DraftIdleActions";
import { DraftProcessingActions } from "./DraftProcessingActions";

// failed 배지는 PendingSourceItem.errorMessage(워커가 원본 예외 메시지를 그대로 저장한
// 내부 디버그 텍스트)를 절대 안 쓴다 — 고정 안내 문구로 대체한다는 게 의도된 결정이다
// (design-decisions-log.md 2026-07-12 참고). 나중에 "더 친절하게" errorMessage를
// 이어붙이고 싶어지면 그 전에 서버가 사용자 노출용 메시지를 별도로 다듬어야 한다.
// cancelled는 배지 없음 — 취소는 사용자가 스스로 한 행동이라 별도 안내가 필요 없는
// 평범한 대기 상태다(failed/empty처럼 서버가 알려야 하는 사정이 없다).
const STATUS_META: Record<
  DraftStatus,
  { labelKey: TranslationKey; variant: BadgeVariant } | null
> = {
  processing: { labelKey: "intake.draft_processing", variant: "info" },
  cancelled: null,
  failed: { labelKey: "intake.draft_failed", variant: "error" },
  empty: { labelKey: "intake.draft_no_result", variant: "neutral" },
};

// failed/empty는 재시도 액션을 2차 슬라이스로 미룬 기존 결정 그대로(intake-flow.md
// "Digest 추출 실패"/"결과 없음" 범위 참고) — 이번 슬라이스는 processing(잠금)과
// cancelled(취소 뒤 평범한 대기)만 액션을 연결한다.
const FOOTER_BY_STATUS: Record<
  DraftStatus,
  ComponentType<DraftFooterProps> | null
> = {
  processing: DraftProcessingActions,
  cancelled: DraftIdleActions,
  failed: null,
  empty: null,
};

interface DraftCardProps {
  sourceId: string;
  spaceId: string;
  body: string;
  status: DraftStatus;
  createdAt: string;
}

export function DraftCard({
  sourceId,
  spaceId,
  body,
  status,
  createdAt,
}: DraftCardProps) {
  const { t } = useTranslation();
  const meta = STATUS_META[status];
  const Footer = FOOTER_BY_STATUS[status];

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-surface-raised p-4">
      {meta && (
        <Badge
          variant={meta.variant}
          className="inline-flex w-fit items-center gap-1.5"
        >
          {status === "processing" && (
            <Circle className="size-1.5 animate-pulse fill-current" />
          )}
          {t(meta.labelKey)}
        </Badge>
      )}
      <p className="line-clamp-2 text-sm text-fg-secondary">{body}</p>
      <RelativeTime dateTime={createdAt} />
      {Footer && <Footer sourceId={sourceId} spaceId={spaceId} />}
    </div>
  );
}
