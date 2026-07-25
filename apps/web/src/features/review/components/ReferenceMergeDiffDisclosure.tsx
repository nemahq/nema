import { diffWords } from "diff";
import { useId, useState } from "react";

import { cn, Text } from "@nema-io/weave";
import { Triangle } from "@nema-io/weave/icons";

import { useTranslation } from "@web/lib/tolgee";

import { ReferenceMergeDiff } from "./ReferenceMergeDiff";

interface ReferenceMergeDiffDisclosureProps {
  original: string;
  revised: string;
}

// 기본 접힘 — 대부분은 편집 필드의 현재 값만 보면 되고, "엔진이 원래 뭘 제안했나"는
// 의심이 들 때만 펼쳐 보는 대조용이다. 제안이 없으면 펼칠 것도 없으므로 트리거
// 자체를 안 낸다 — 문자열 단순 비교(!==) 대신 diffWords 결과에 실제 추가·삭제
// 구간이 있는지로 판단한다. diffWords의 토큰 비교는 공백을 trim해 같다고 보므로,
// 공백만 다른 두 문자열은 !==는 참이어도 하이라이트할 게 없다 — 그 경우 문자열
// 비교만 믿으면 토글은 뜨는데 눌러도 아무 것도 강조되지 않는다.
export function ReferenceMergeDiffDisclosure({
  original,
  revised,
}: ReferenceMergeDiffDisclosureProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  const segments = diffWords(original, revised);
  const hasChanges = segments.some(
    (segment) => segment.added || segment.removed,
  );

  if (!hasChanges) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1">
      {/* weave Button 대신 raw — DraftSection의 접기/펼치기 트리거와 같은 이유:
          아이콘+Text 조합이 주변 타이포를 그대로 상속해야 해서 Button의 강제
          text-[13px] font-semibold와 안 맞는다. */}
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        aria-controls={contentId}
        className="flex w-fit items-center gap-1.5"
      >
        <Triangle
          className={cn(
            "size-1.5 shrink-0 fill-current text-fg-tertiary/50 transition-transform duration-fast",
            expanded ? "rotate-180" : "rotate-90",
          )}
        />
        <Text as="span" size="sm" weight="medium" color="tertiary">
          {t("review.reference_merge_diff_toggle_label")}
        </Text>
      </button>
      {expanded && (
        <div id={contentId}>
          <ReferenceMergeDiff segments={segments} />
        </div>
      )}
    </div>
  );
}
