import { useRef, useState } from "react";

import { SOURCE_BODY_MAX_LENGTH } from "@nema-io/shared";
import { Button } from "@nema-io/weave";

import { useStartSourceDigestion } from "@web/features/intake/hooks/useStartSourceDigestion";
import { useUpdateSourceBody } from "@web/features/intake/hooks/useUpdateSourceBody";
import type { IdleDraftStatus } from "@web/features/intake/utils";
import { useRegisterAction } from "@web/lib/command/shortcut/useRegisterAction";
import { useTranslation } from "@web/lib/tolgee";

import { DraftBodyView } from "./DraftBodyView";

interface DraftBodyEditorProps {
  sourceId: string;
  initialBody: string;
  status: IdleDraftStatus;
  inputChangedSinceDigestion: boolean;
  // 정리 시작은 제목·삭제·Space까지 같이 잠그므로 상위가 알아야 한다.
  onStartingDigestionChange: (starting: boolean) => void;
  isStartingDigestion: boolean;
}

export function DraftBodyEditor({
  sourceId,
  initialBody,
  status,
  inputChangedSinceDigestion,
  onStartingDigestionChange,
  isStartingDigestion,
}: DraftBodyEditorProps) {
  const { t } = useTranslation();
  const [body, setBody] = useState(initialBody);
  const updateBodyMutation = useUpdateSourceBody();
  const startDigestionMutation = useStartSourceDigestion();
  // blur가 이미 저장을 쏜 상태로 곧바로 정리 버튼을 누르면 handleRegenerate가
  // 같은 내용으로 또 저장을 쏴 mutation 인스턴스를 두 요청이 공유하게 된다 —
  // 새로 쏘는 대신 이 promise를 기다리게 해 중복 호출 자체를 없앤다.
  const pendingSaveRef = useRef<Promise<unknown> | null>(null);
  // 서버가 btrim해서 저장하므로(update_source_body) 앞뒤 공백만 다른 편집은 저장해도
  // 아무것도 안 바뀐다 — 원시 비교로 두면 그 편집이 영영 dirty로 남아 게이트가 계속
  // 열린 채 굳는다. 서버 정규화와 같은 기준으로 비교한다.
  const savableBody = body.trim();
  const bodyDirty = savableBody !== initialBody.trim();
  // 빈 본문은 서버가 거부하므로(p_body must be a non-empty text) 저장이 건너뛰어지고,
  // 그대로 두면 dirty만 true로 남아 바뀐 것 없이 정리가 다시 돈다.
  const hasSavableEdit = bodyDirty && savableBody.length > 0;

  // 결과없음은 원문을 안 바꾸고 정리해봐야 또 결과없음이 나올 가능성이 높다 —
  // 원문이 실제로 바뀌기 전까진 정리를 막아 헛수고를 예방한다. failed/cancelled는
  // 내용 문제가 아닐 수 있어(일시적 시스템 오류 등) 이 제약을 안 둔다.
  //
  // 저장된 변경(서버 판정)과 아직 저장 안 된 편집을 모두 인정한다 — 후자를 빼면
  // 고치자마자 누르려는데 버튼이 잠겨 blur부터 시켜야 하고, 전자를 빼면 blur로
  // 저장되는 순간 버튼이 도로 잠긴다.
  const canRegenerate =
    status !== "empty" || inputChangedSinceDigestion || hasSavableEdit;
  const regenerateDisabled = !canRegenerate || isStartingDigestion;

  function saveBody() {
    const promise = updateBodyMutation.mutateAsync({
      sourceId,
      body: savableBody,
    });
    pendingSaveRef.current = promise;
    void promise.finally(() => {
      if (pendingSaveRef.current === promise) {
        pendingSaveRef.current = null;
      }
    });
    return promise;
  }

  // blur 시점에 저장해 편집 중 이탈(다른 초안 클릭 등)로 잃는 걸 막는다. 실패는
  // 전역 토스트(mutationCache.onError)가 이미 알리므로, 여기선 그 결과를 안 쓰고
  // unhandled rejection만 막는다 — pendingSaveRef엔 원본 promise를 그대로 둬서
  // handleRegenerate가 실패를 스스로 다시 확인할 수 있게 한다.
  function handleBlur() {
    if (!hasSavableEdit) {
      return;
    }
    void saveBody().catch(() => {});
  }

  async function handleRegenerate() {
    onStartingDigestionChange(true);
    try {
      if (pendingSaveRef.current) {
        await pendingSaveRef.current;
      } else if (hasSavableEdit) {
        await saveBody();
      }
      await startDigestionMutation.mutateAsync({ sourceId });
    } catch {
      // 전역 토스트(mutationCache.onError)가 이미 띄운다.
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
          placeholder={t("intake.compose_body_placeholder")}
        />
      </div>
      <div className="flex shrink-0 flex-col gap-2 px-6 py-4">
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
