import { useEffect, useState } from "react";

import { SOURCE_BODY_MAX_LENGTH } from "@nema-io/shared";
import { Alert, Button } from "@nema-io/weave";

import { useMarkDraftEdited } from "@web/features/intake/contexts/DraftEditingContext";
import { useStartSourceDigestion } from "@web/features/intake/hooks/useStartSourceDigestion";
import { useUpdateSourceBody } from "@web/features/intake/hooks/useUpdateSourceBody";
import type { IdleDraftStatus } from "@web/features/intake/utils";
import { useRegisterAction } from "@web/lib/command/shortcut/useRegisterAction";
import { getErrorMessage } from "@web/lib/getErrorMessage";
import { useTranslation } from "@web/lib/tolgee";

import { DraftBodyView } from "./DraftBodyView";

interface DraftBodyEditorProps {
  sourceId: string;
  initialBody: string;
  status: IdleDraftStatus;
  // 정리 시작은 제목·삭제·Space까지 같이 잠그므로 상위가 알아야 한다.
  onStartingDigestionChange: (starting: boolean) => void;
  isStartingDigestion: boolean;
}

export function DraftBodyEditor({
  sourceId,
  initialBody,
  status,
  onStartingDigestionChange,
  isStartingDigestion,
}: DraftBodyEditorProps) {
  const { t } = useTranslation();
  const [body, setBody] = useState(initialBody);
  const markDraftEdited = useMarkDraftEdited();
  const updateBodyMutation = useUpdateSourceBody();
  const startDigestionMutation = useStartSourceDigestion();
  const bodyDirty = body !== initialBody;
  // 결과없음은 원본을 안 바꾸고 정리해봐야 또 결과없음이 나올 가능성이 높다 —
  // 원문이 실제로 바뀌기 전까진 정리를 막아 헛수고를 예방한다. failed/cancelled는
  // 내용 문제가 아닐 수 있어(일시적 시스템 오류 등) 이 제약을 안 둔다.
  const regenerateDisabled =
    (status === "empty" && !bodyDirty) || isStartingDigestion;

  // onChange 시점에만 알리면, 저장 후 폴링으로 initialBody가 따라잡아도(예:
  // Organize가 body를 저장한 뒤) 재계산할 트리거가 없어 dirty가 그대로
  // 굳어버린다 — bodyDirty 자체를 구독해 매번 최신값으로 동기화한다.
  useEffect(
    function syncBodyDirty() {
      markDraftEdited(bodyDirty ? sourceId : null);
      return function clearOnUnmount() {
        markDraftEdited(null);
      };
    },
    [bodyDirty, sourceId, markDraftEdited],
  );

  // blur 시점에 저장해 편집 중 이탈(다른 초안 클릭 등)로 잃는 걸 막는다 — 다만
  // Organize는 이 시점에 기대지 않고 클릭 시점에 한 번 더 직접 저장한다(아래).
  function handleBlur() {
    if (!bodyDirty || body.trim().length === 0) {
      return;
    }
    updateBodyMutation.mutate({ sourceId, body });
  }

  async function handleRegenerate() {
    onStartingDigestionChange(true);
    try {
      if (bodyDirty && body.trim().length > 0) {
        await updateBodyMutation.mutateAsync({ sourceId, body });
      }
      await startDigestionMutation.mutateAsync({ sourceId });
    } catch {
      // 실패는 각 뮤테이션의 isError로 인라인 표시된다 — 추가 처리 없음.
    } finally {
      onStartingDigestionChange(false);
    }
  }

  useRegisterAction("draft.regenerate", {
    execute: handleRegenerate,
    enabled: !regenerateDisabled,
  });

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-2 px-6 py-4">
        <DraftBodyView
          value={body}
          onChange={setBody}
          onBlur={handleBlur}
          readOnly={isStartingDigestion}
          maxLength={SOURCE_BODY_MAX_LENGTH}
          ariaInvalid={updateBodyMutation.isError}
        />
        {updateBodyMutation.isError && (
          <Alert variant="error">
            {getErrorMessage(updateBodyMutation.error)}
          </Alert>
        )}
      </div>
      <div className="flex shrink-0 flex-col gap-2 px-6 py-4">
        {startDigestionMutation.isError && (
          <Alert variant="error">
            {getErrorMessage(startDigestionMutation.error)}
          </Alert>
        )}
        <div className="flex justify-start">
          <Button
            size="sm"
            disabled={regenerateDisabled}
            onClick={handleRegenerate}
          >
            {isStartingDigestion
              ? t("intake.draft_organizing")
              : t("intake.remember")}
          </Button>
        </div>
      </div>
    </>
  );
}
