import { Button } from "@nema-io/weave";

import { useReExtractSource } from "@web/features/drafts/hooks/useReExtractSource";
import { useTranslation } from "@web/lib/tolgee";

interface DraftReExtractActionProps {
  sourceId: string;
}

// 실패한 초안 상세 하단에 붙는 재시도 액션. 클릭 즉시 서버가 processing으로
// 전환해 초안 탭에서 카드가 빠지고(v_draft_sources 필터), 끝나면 성공 시
// completed로 계속 빠진 채, 실패 시 failed로 되돌아와 다시 노출된다.
export function DraftReExtractAction({ sourceId }: DraftReExtractActionProps) {
  const { t } = useTranslation();
  const reExtractMutation = useReExtractSource();

  function handleClick() {
    reExtractMutation.mutate({ sourceId });
  }

  return (
    <Button
      size="sm"
      onClick={handleClick}
      disabled={reExtractMutation.isPending}
    >
      {reExtractMutation.isPendingAfterDelay
        ? t("draft.re_extract_pending")
        : t("draft.re_extract_action")}
    </Button>
  );
}
