import { memo, type ReactNode } from "react";

import { Text } from "@nema-io/weave";
import { TriangleAlert } from "@nema-io/weave/icons";

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
  inputChangedSinceDigestion: boolean;
  onSelect: (sourceId: string) => void;
}

export const IdleDraftCard = memo(function IdleDraftCard({
  sourceId,
  title,
  body,
  status,
  createdAt,
  inputChangedSinceDigestion,
  onSelect,
}: IdleDraftCardProps) {
  // 결과없음 아이콘의 근거는 "정리해봤자 같은 결과"라, 원문·Space가 실제로 바뀌어
  // 다른 결과가 나올 여지가 생기면 뗀다.
  //
  // 상세의 재정리 버튼과 조건이 완전히 같지는 않다 — 버튼은 아직 저장 안 된 편집도
  // 인정해서 blur 없이 바로 누를 수 있게 하지만, 목록 카드는 저장된 변경만 본다.
  // 타이핑 중(blur 전)에는 버튼이 먼저 풀리고 아이콘은 저장된 뒤에 사라진다. 카드는
  // 여러 초안을 훑는 자리라 아직 확정 안 된 편집으로 표시가 흔들리면 안 된다.
  const statusIcon =
    status === "empty" && inputChangedSinceDigestion
      ? null
      : STATUS_ICON[status];

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
      <Text size="sm" color="tertiary" className="line-clamp-4">
        {body}
      </Text>
    </DraftCardShell>
  );
});
