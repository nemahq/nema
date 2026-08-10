import { Tooltip, TooltipContent, TooltipTrigger } from "@nema-io/weave";
import { SearchX } from "@nema-io/weave/icons";

import { useTranslation } from "@web/lib/tolgee";

// failed(경고 삼각형)는 업계에서 이미 명시적인 기호라 툴팁 없이 두지만, 결과없음
// (돋보기+X)은 관용화된 기호가 아니라 툴팁으로 의미를 보완한다 — 일괄 적용이
// 아니라 실제로 모호한 것만.
export function DraftNoResultIcon() {
  const { t } = useTranslation();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <SearchX className="pointer-events-auto size-4 shrink-0 text-fg-tertiary" />
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {t("intake.draft_no_result")}
      </TooltipContent>
    </Tooltip>
  );
}
