import { Button } from "@nema-io/weave";

import { useReExtractSource } from "@web/features/drafts/hooks/useReExtractSource";
import { useTranslation } from "@web/lib/tolgee";

interface DraftReExtractActionProps {
  sourceId: string;
}

// 실패한 초안 상세 하단에 붙는 재시도 액션. 서버 상태는 클릭 즉시
// processing으로 바뀌지만, 화면 카드는 이 뮤테이션이 끝나 source.list가
// 무효화돼야(useReExtractSource) 그 결과를 반영한다 — 성공하면 카드가 빠진
// 채로 남고, 실패하면 failed로 되돌아와 그대로 다시 노출된다.
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
