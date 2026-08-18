import { Suspense, useEffect } from "react";

import { Alert } from "@nema-io/weave";

import { LoadingWatermark } from "@web/components/ui/LoadingWatermark";
import { useSourceDraftListSuspenseQuery } from "@web/features/drafts/hooks/useSourceDraftListQuery";
import { SourceDetailPanel } from "@web/features/source";
import { useTranslation } from "@web/lib/tolgee";

import { DraftReExtractAction } from "./DraftReExtractAction";

interface DraftDetailPanelProps {
  sourcePublicId: string;
  onClose: () => void;
}

// 원문 상세는 공용 컴포넌트라 "결과 없음" 여부를 스스로 못 잰다 — 이미 그 판단이
// 끝난 초안 목록 쿼리(캐시 재사용)에서 이 원문의 status를 찾아 배너·재추출
// 버튼으로 얹는다. completed(결과없음)엔 배너만, failed엔 재추출 버튼만 —
// processing은 애초에 이 목록에 안 온다(v_draft_sources가 미리 거른다).
function DraftDetailPanelContent({
  sourcePublicId,
  onClose,
}: DraftDetailPanelProps) {
  const { t } = useTranslation();
  const [drafts] = useSourceDraftListSuspenseQuery();
  const draft = drafts.find((item) => item.publicId === sourcePublicId);

  // conventions.md React "MUST NOT use useEffect for ... event response logic"의
  // 예외(Loading 절 "manual !data는 last resort" 조항)에 해당한다 — !draft가
  // "닫는다"는 imperative 동작을 몰아야 하는데, onClose는 상위(DraftsPage)
  // 상태를 바꾸는 콜백이라 렌더 중 직접 호출할 수 없다(render fork로 표현 불가).
  // 같은 패턴이 SourceDetailPanel의 closeOnMissingSource에도 이미 있다.
  useEffect(
    function closeWhenNoLongerADraft() {
      // 카드(hover 휴지통)·상단 바 벌크 삭제는 이 패널에 알릴 방법이 없다 —
      // source.delete/deleteMany는 source.list만 무효화하고 source.get은 그대로라,
      // 삭제된 원문이 여기 계속 남아 있을 수 있다. 목록에서 이 원문이 사라졌는지를
      // 여기서 직접 재확인해 스스로 닫는다(legacy DraftDetailPanel의
      // clearMissingSource와 같은 이유).
      if (!draft) {
        onClose();
      }
    },
    [draft, onClose],
  );

  if (!draft) {
    return null;
  }

  const banner =
    draft.status === "completed" ? (
      <Alert variant="warning">{t("draft.no_result_banner")}</Alert>
    ) : undefined;

  const footer =
    draft.status === "failed" ? (
      <DraftReExtractAction sourceId={draft.sourceId} />
    ) : undefined;

  return (
    <SourceDetailPanel
      sourcePublicId={sourcePublicId}
      knownSourceId={draft.sourceId}
      onClose={onClose}
      banner={banner}
      footer={footer}
    />
  );
}

export function DraftDetailPanel(props: DraftDetailPanelProps) {
  return (
    <Suspense fallback={<LoadingWatermark />}>
      <DraftDetailPanelContent {...props} />
    </Suspense>
  );
}
