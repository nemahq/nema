import { memo, type ReactNode } from "react";

import type { DigestionStatus } from "@nema-io/shared";
import { Text } from "@nema-io/weave";
import { TriangleAlert } from "@nema-io/weave/icons";

import { DraftCardShell } from "./DraftCardShell";
import { DraftIdleHeader } from "./DraftIdleHeader";
import { DraftNoResultIcon } from "./DraftNoResultIcon";

// v_draft_sources 뷰가 이미 "pending 이거나 completed+다이제스트 0개"만 걸러
// 보내므로, completed로 들어온 행은 항상 결과없음이다 — status 두 값이 우리
// 두 케이스에 정확히 대응한다.
const STATUS_ICON: Record<DigestionStatus, ReactNode> = {
  pending: <TriangleAlert className="size-4 shrink-0 text-status-error" />,
  completed: <DraftNoResultIcon />,
};

interface DraftCardProps {
  sourceId: string;
  name: string;
  bodyPreview: string;
  status: DigestionStatus;
  createdAt: string;
  onSelect: (sourceId: string) => void;
}

export const DraftCard = memo(function DraftCard({
  sourceId,
  name,
  bodyPreview,
  status,
  createdAt,
  onSelect,
}: DraftCardProps) {
  function handleSelect() {
    onSelect(sourceId);
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
