import { type ComponentType, useState } from "react";

import { Badge, type BadgeVariant, Button } from "@nema-io/weave";
import { Pencil } from "@nema-io/weave/icons";

import { RelativeTime } from "@web/components/ui/RelativeTime";
import type { DraftFooterProps } from "@web/features/intake/types";
import type { DraftStatus } from "@web/features/intake/utils";
import { type TranslationKey, useTranslation } from "@web/lib/tolgee";

import { DraftIdleActions } from "./DraftIdleActions";
import { DraftProcessingActions } from "./DraftProcessingActions";
import { EditSourceTitleDialog } from "./EditSourceTitleDialog";

// failed 배지는 PendingSourceItem.errorMessage(워커가 원본 예외 메시지를 그대로 저장한
// 내부 디버그 텍스트)를 절대 안 쓴다 — 고정 안내 문구로 대체한다는 게 의도된 결정이다
// (design-decisions-log.md 2026-07-12 참고). 나중에 "더 친절하게" errorMessage를
// 이어붙이고 싶어지면 그 전에 서버가 사용자 노출용 메시지를 별도로 다듬어야 한다.
// cancelled는 배지 없음 — 취소는 사용자가 스스로 한 행동이라 별도 안내가 필요 없는
// 평범한 대기 상태다(failed/empty처럼 서버가 알려야 하는 사정이 없다). processing도
// 배지 없음 — Working 섹션 소속·풋터의 잠금 문구가 이미 같은 정보를 전달해 중복이었다.
const STATUS_META: Record<
  DraftStatus,
  { labelKey: TranslationKey; variant: BadgeVariant } | null
> = {
  processing: null,
  cancelled: null,
  failed: { labelKey: "intake.draft_failed", variant: "error" },
  empty: { labelKey: "intake.draft_no_result", variant: "neutral" },
};

// processing(잠금)만 예외고, cancelled·failed·empty는 전부 같은 "평범한 대기" 상태라
// 동일한 DraftIdleActions(추출 실행·삭제·Space 재지정)를 쓴다 — start_source_digestion
// RPC가 이미 셋 다 재클레임 가능하도록 서버에서 가드하고 있고(PR #394), 제목 편집도
// 같은 기준으로 이미 cancelled·failed·empty 전부 열려 있다(canEditTitle 참고).
const FOOTER_BY_STATUS: Record<
  DraftStatus,
  ComponentType<DraftFooterProps> | null
> = {
  processing: DraftProcessingActions,
  cancelled: DraftIdleActions,
  failed: DraftIdleActions,
  empty: DraftIdleActions,
};

interface DraftCardProps {
  sourceId: string;
  spaceId: string;
  title: string | null;
  body: string;
  status: DraftStatus;
  createdAt: string;
}

export function DraftCard({
  sourceId,
  spaceId,
  title,
  body,
  status,
  createdAt,
}: DraftCardProps) {
  const { t } = useTranslation();
  const [editTitleOpen, setEditTitleOpen] = useState(false);
  const meta = STATUS_META[status];
  const Footer = FOOTER_BY_STATUS[status];
  // 제목 편집은 잠금 상태(processing)를 제외한 모든 "평범한 대기" 상태(cancelled·
  // failed·empty)에서 열린다 — 추출 실행/삭제와 달리 failed·empty도 제외할 이유가
  // 없다(둘 다 BE 가드 digestion_status<>'pending' 범위 안). Extract/Delete 풋터와
  // 묶지 않고 여기서 독립적으로 게이팅한다.
  const canEditTitle = status !== "processing";

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-surface-raised p-4">
      {meta && (
        <Badge
          variant={meta.variant}
          className="inline-flex w-fit items-center gap-1.5"
        >
          {t(meta.labelKey)}
        </Badge>
      )}
      <div className="flex items-center justify-between gap-2">
        <p
          className={
            title
              ? "text-sm font-medium text-fg-primary"
              : "text-sm font-medium text-fg-tertiary italic"
          }
        >
          {title ?? t("intake.draft_title_placeholder")}
        </p>
        {canEditTitle && (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t("intake.draft_title_edit_action")}
            onClick={() => setEditTitleOpen(true)}
          >
            <Pencil />
          </Button>
        )}
      </div>
      <p className="line-clamp-2 text-sm text-fg-secondary">{body}</p>
      {status !== "processing" && <RelativeTime dateTime={createdAt} />}
      {Footer && (
        <Footer sourceId={sourceId} spaceId={spaceId} createdAt={createdAt} />
      )}
      <EditSourceTitleDialog
        sourceId={sourceId}
        title={title}
        open={editTitleOpen}
        onOpenChange={setEditTitleOpen}
      />
    </div>
  );
}
