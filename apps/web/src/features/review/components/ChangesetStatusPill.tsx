import { cn, Text } from "@nema-io/weave";

import {
  type ChangesetDisplayState,
  type ChangesetStateIcon,
  changesetStateIcon,
  changesetStateMeta,
} from "@web/features/review/constants";
import { useTranslation } from "@web/lib/tolgee";

interface ChangesetStatusPillProps {
  state: ChangesetDisplayState;
  className?: string;
}

interface PillVisual {
  container: string;
  label: string | undefined;
}

function pillVisual(icon: ChangesetStateIcon): PillVisual {
  // border를 두 variant 다 항상 넣는다(filled는 투명) — open→closed 전환처럼
  // 같은 자리에서 outline↔filled를 오갈 때, border 유무로 pill 자체 높이가
  // 2px(위아래 1px씩) 갈려 헤더 2번째 행이 흔들리는 걸 막기 위해서다.
  if (icon.kind === "filled") {
    return {
      container: cn("border border-transparent", icon.bg, icon.iconTone),
      label: undefined,
    };
  }
  return {
    container: cn("border border-current", icon.tone),
    label: "text-fg-primary",
  };
}

// ChangesetListRow는 아이콘 자체에만 원형 배경을 칠하고 라벨은 툴팁 뒤에 숨기지만,
// 여기서는 그 배경·텍스트 색을 pill 전체로 확장해 라벨을 바로 옆에 노출한다 — 리스트는
// 여러 행을 훑는 맥락이라 아이콘만으로 스캔, 상세는 지금 보는 이 하나를 바로 읽는
// 맥락이라서 다르게 낸다.
export function ChangesetStatusPill({
  state,
  className,
}: ChangesetStatusPillProps) {
  const { t } = useTranslation();
  const icon = changesetStateIcon(state);
  const { labelKey } = changesetStateMeta(state);
  const visual = pillVisual(icon);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full py-1 pl-2 pr-3 text-sm",
        visual.container,
        className,
      )}
    >
      <icon.Icon className="size-4 shrink-0" strokeWidth={2.5} />
      <Text
        as="span"
        size="sm"
        weight="medium"
        className={cn(!visual.label && "text-inherit")}
      >
        {t(labelKey)}
      </Text>
    </span>
  );
}
