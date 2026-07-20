import { memo, type ReactNode } from "react";

import { TriangleAlert } from "@nema-io/weave/icons";

import { useIsDraftEdited } from "@web/features/intake/contexts/DraftEditingContext";
import type { IdleDraftStatus } from "@web/features/intake/utils";

import { DraftCardShell } from "./DraftCardShell";
import { DraftIdleHeader } from "./DraftIdleHeader";
import { DraftNoResultIcon } from "./DraftNoResultIcon";

// failed/empty만 "왜 여기 있는지"를 알려준다 — 배지 문구 대신 LNB(DraftsNavItem)의
// 실패 표시와 같은 아이콘 언어를 그대로 쓴다. cancelled·discarded는 사용자가 스스로
// 한 행동이라 별도 안내가 필요 없다.
//
// Partial이 아니라 모든 키를 채운 Record다 — 서버 digestionOutcome에 값이 추가되면
// 여기서 컴파일 에러가 나야 한다. null은 누락이 아니라 "아이콘 없음"이라는 판단이다.
const STATUS_ICON: Record<IdleDraftStatus, ReactNode | null> = {
  failed: <TriangleAlert className="size-4 shrink-0 text-status-error" />,
  empty: <DraftNoResultIcon />,
  cancelled: null,
  discarded: null,
};

interface IdleDraftCardProps {
  sourceId: string;
  title: string | null;
  body: string;
  status: IdleDraftStatus;
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
