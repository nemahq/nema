import { useState } from "react";

import type { DraftStatus } from "@web/features/intake/utils";

import { DraftBodyEditor } from "./DraftBodyEditor";
import { DraftDeleteAction } from "./DraftDeleteAction";
import { DraftDetailHeader } from "./DraftDetailHeader";
import { DraftSpaceSelect } from "./DraftSpaceSelect";
import { DraftTitleInput } from "./DraftTitleInput";

interface IdleDraftDetailPanelProps {
  sourceId: string;
  spaceId: string;
  title: string | null;
  body: string;
  status: DraftStatus;
  onClose: () => void;
}

// 정리를 시작하는 순간 이 패널의 모든 편집 수단(제목·원문·삭제·Space 재지정)이
// 한꺼번에 잠긴다 — 네 자식이 공유하는 유일한 상태라 여기서 든다.
export function IdleDraftDetailPanel({
  sourceId,
  spaceId,
  title,
  body,
  status,
  onClose,
}: IdleDraftDetailPanelProps) {
  const [isStartingDigestion, setIsStartingDigestion] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <DraftDetailHeader
        onClose={onClose}
        spaceSlot={
          <DraftSpaceSelect
            sourceId={sourceId}
            spaceId={spaceId}
            disabled={isStartingDigestion}
          />
        }
        extraAction={
          <DraftDeleteAction
            sourceId={sourceId}
            disabled={isStartingDigestion}
            onDeleted={onClose}
          />
        }
      />
      <DraftTitleInput
        sourceId={sourceId}
        initialTitle={title}
        readOnly={isStartingDigestion}
      />
      <DraftBodyEditor
        sourceId={sourceId}
        initialBody={body}
        status={status}
        isStartingDigestion={isStartingDigestion}
        onStartingDigestionChange={setIsStartingDigestion}
      />
    </div>
  );
}
