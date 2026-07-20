import { memo, type ReactNode } from "react";

import { TriangleAlert } from "@nema-io/weave/icons";

import { useIsDraftEdited } from "@web/features/intake/contexts/DraftEditingContext";
import type { DraftStatus } from "@web/features/intake/utils";

import { DraftCardShell } from "./DraftCardShell";
import { DraftIdleHeader } from "./DraftIdleHeader";
import { DraftNoResultIcon } from "./DraftNoResultIcon";

// cancelled는 표시 없음 — 취소는 사용자가 스스로 한 행동이라 별도 안내가 필요
// 없다. failed/empty만 "왜 여기 있는지"를 알려준다 — 배지 문구 대신 LNB
// (DraftsNavItem)의 실패 표시와 같은 아이콘 언어를 그대로 쓴다.
const STATUS_ICON: Partial<Record<DraftStatus, ReactNode>> = {
  failed: <TriangleAlert className="size-4 shrink-0 text-status-error" />,
  empty: <DraftNoResultIcon />,
};

interface IdleDraftCardProps {
  sourceId: string;
  title: string | null;
  body: string;
  status: DraftStatus;
  createdAt: string;
  onSelect: (sourceId: string) => void;
}

export const IdleDraftCard = memo(function IdleDraftCard({
  sourceId,
  title,
  body,
  status,
  createdAt,
  onSelect,
}: IdleDraftCardProps) {
  // 결과없음 아이콘의 근거는 "원문을 아직 안 고쳤다"라, 상세에서 실제로 고치는
  // 순간(정리 버튼이 풀리는 조건과 동일) 카드에서도 같이 뗀다.
  const isEdited = useIsDraftEdited(sourceId);
  const statusIcon =
    status === "empty" && isEdited ? null : STATUS_ICON[status];

  function handleSelect() {
    onSelect(sourceId);
  }

  return (
    <DraftCardShell onSelect={handleSelect}>
      <DraftIdleHeader
        sourceId={sourceId}
        title={title}
        createdAt={createdAt}
        icon={statusIcon}
      />
      <p className="line-clamp-4 text-sm leading-relaxed text-fg-tertiary">
        {body}
      </p>
    </DraftCardShell>
  );
});
