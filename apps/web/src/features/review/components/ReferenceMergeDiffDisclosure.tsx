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
// 의심이 들 때만 펼쳐 보는 대조용이다. 제안이 없으면(원본과 같으면) 펼칠 것도
// 없으므로 트리거 자체를 안 낸다.
export function ReferenceMergeDiffDisclosure({
  original,
  revised,
}: ReferenceMergeDiffDisclosureProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();

  if (original === revised) {
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
        className="group flex w-fit items-center gap-1.5"
      >
        <Triangle
          className={cn(
            "size-1.5 shrink-0 fill-current text-fg-tertiary/50 transition-transform duration-fast group-hover:text-fg-primary",
            expanded ? "rotate-180" : "rotate-90",
          )}
        />
        <Text
          as="span"
          size="sm"
          weight="medium"
          color="tertiary"
          className="group-hover:text-fg-primary"
        >
          {t("review.reference_merge_diff_toggle_label")}
        </Text>
      </button>
      {expanded && (
        <div id={contentId}>
          <ReferenceMergeDiff original={original} revised={revised} />
        </div>
      )}
    </div>
  );
}
