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
  // outline 쪽은 border 대신 ring-inset — auto-width 요소에서 border는 박스
  // 바깥으로 두께만큼 더해져 filled variant보다 실제로 더 커 보인다(Badge.tsx
  // OUTLINE_TONE_CLASSNAME과 같은 이유). ring은 box-shadow라 레이아웃에 안
  // 잡혀서, open→closed 전환처럼 같은 자리에서 outline↔filled를 오갈 때도
  // filled 쪽에 자리를 맞출 투명 테두리가 따로 필요 없다.
  if (icon.kind === "filled") {
    return {
      container: cn(icon.bg, icon.iconTone),
      label: undefined,
    };
  }
  return {
    container: cn("ring-1 ring-inset ring-current", icon.tone),
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
