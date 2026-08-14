import { Suspense } from "react";

import { Alert } from "@nema-io/weave";

import { LoadingWatermark } from "@web/components/ui/LoadingWatermark";
import { useSourceDraftListSuspenseQuery } from "@web/features/drafts/hooks/useSourceDraftListQuery";
import { SourceDetailPanel } from "@web/features/source";
import { useTranslation } from "@web/lib/tolgee";

interface DraftDetailPanelProps {
  sourceId: string;
  onClose: () => void;
}

// 원문 상세는 공용 컴포넌트라 "결과 없음" 여부를 스스로 못 잰다 — 이미 그 판단이
// 끝난 초안 목록 쿼리(캐시 재사용)에서 이 원문의 status를 찾아 배너로 얹는다.
// pending(처리 중/실패, 아직 아무것도 안 나온 상태)에는 안 띄운다 — "결과가
// 없다"고 단정할 근거가 아직 없다.
function DraftDetailPanelContent({ sourceId, onClose }: DraftDetailPanelProps) {
  const { t } = useTranslation();
  const [drafts] = useSourceDraftListSuspenseQuery();
  const draft = drafts.find((item) => item.sourceId === sourceId);
  const banner =
    draft?.status === "completed" ? (
      <Alert variant="warning">{t("draft.no_result_banner")}</Alert>
    ) : undefined;

  return (
    <SourceDetailPanel sourceId={sourceId} onClose={onClose} banner={banner} />
  );
}

export function DraftDetailPanel(props: DraftDetailPanelProps) {
  return (
    <Suspense fallback={<LoadingWatermark />}>
      <DraftDetailPanelContent {...props} />
    </Suspense>
  );
}
