import { memo, type ReactNode } from "react";

import type { DigestionStatus } from "@nema-io/shared";
import { Text } from "@nema-io/weave";
import { TriangleAlert } from "@nema-io/weave/icons";

import { DraftCardShell } from "./DraftCardShell";
import { DraftIdleHeader } from "./DraftIdleHeader";
import { DraftNoResultIcon } from "./DraftNoResultIcon";

// v_draft_sources 뷰가 이미 "failed 이거나 completed+다이제스트 0개"만 걸러
// 보내므로, 실전에선 processing이 여기 안 온다 — exhaustive record라 값은
// 채워두되(TS가 DigestionStatus 전체를 요구), 실제로 렌더될 일은 없다.
const STATUS_ICON: Record<DigestionStatus, ReactNode> = {
  processing: null,
  failed: <TriangleAlert className="size-4 shrink-0 text-status-error" />,
  completed: <DraftNoResultIcon />,
};

interface DraftCardProps {
  // sourceId(내부)는 카드의 휴지통 삭제(source.delete)가 쓴다. sourcePublicId는
  // 상세를 여는 값(onSelect, ?source=)이다 — 둘의 쓰임이 갈리는 이유는
  // SourceDetailPanel의 knownSourceId 주석 참고.
  sourceId: string;
  sourcePublicId: string;
  name: string;
  bodyPreview: string;
  status: DigestionStatus;
  createdAt: string;
  onSelect: (sourcePublicId: string) => void;
}

export const DraftCard = memo(function DraftCard({
  sourceId,
  sourcePublicId,
  name,
  bodyPreview,
  status,
  createdAt,
  onSelect,
}: DraftCardProps) {
  function handleSelect() {
    onSelect(sourcePublicId);
  }

  return (
    <DraftCardShell onSelect={handleSelect}>
      <DraftIdleHeader
        sourceId={sourceId}
        name={name}
        createdAt={createdAt}
        icon={STATUS_ICON[status]}
      />
      <Text size="sm" color="tertiary" className="line-clamp-4">
        {bodyPreview}
      </Text>
    </DraftCardShell>
  );
});
