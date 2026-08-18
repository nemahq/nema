import { memo, type ReactNode } from "react";

import type { SourceDraftStatus } from "@nema-io/shared";
import { Text } from "@nema-io/weave";
import { TriangleAlert } from "@nema-io/weave/icons";

import { DraftCardShell } from "./DraftCardShell";
import { DraftIdleHeader } from "./DraftIdleHeader";
import { DraftNoResultIcon } from "./DraftNoResultIcon";

const STATUS_ICON: Record<SourceDraftStatus, ReactNode> = {
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
  status: SourceDraftStatus;
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
