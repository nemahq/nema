import type { ReactNode } from "react";

import { Badge, ComboboxItem, Text } from "@nema-io/weave";

interface LabelSearchRowProps {
  label: string;
  // Tag 전용 — 재사용 판단 기준이 되는 정의(07-modeling.md). 있으면 이름 아래에
  // 인라인으로 보여준다. Topic은 이 개념 자체가 없어 안 넘긴다.
  description?: string;
  // 이 Digest에 이미 붙은 라벨도 목록에서 그대로 보여준다 — "붙은 것"과 "안
  // 붙은 것"을 둘로 쪼개지 않고 이 목록 하나로 통일하기 위해서다. 대신 이미
  // 붙은 행은 클릭해도 다시 안 붙는다.
  attached: boolean;
  // 신규(draft) 라벨 행에만 실리는 미트볼 편집 진입점 — 레지스트리 기존 라벨
  // 행에는 절대 안 실린다(PR #506 컨센서스: 기존 라벨은 검색·첨부·해제만).
  actions?: ReactNode;
  // 신규(draft) 라벨 행은 이미 이 Digest에 속해 있어 다시 고를 동작 자체가 없다 —
  // attached가 항상 true라 ComboboxItem이 클릭을 이미 막지만, 프로퍼티 자체를
  // 선택으로 남겨 그 사실을 호출부에서도 드러낸다.
  onSelect?: () => void;
}

// 후보 이름을 위쪽 칩 목록과 같은 Badge로 감싼다 — 고르면 그대로 저 모양의 칩이
// 된다는 걸 고르기 전에 미리 보여준다.
export function LabelSearchRow({
  label,
  description,
  attached,
  actions,
  onSelect,
}: LabelSearchRowProps) {
  return (
    <li>
      <ComboboxItem
        alreadySelected={attached}
        onClick={onSelect}
        actions={actions}
        buttonClassName="flex-col items-start gap-0.5 py-1"
      >
        <Badge
          variant={attached ? "neutral" : "outline"}
          shape="rounded"
          truncated
        >
          {label}
        </Badge>
        {description && (
          // whitespace-normal을 직접 준다 — 부모 button이 ComboboxItem 기본
          // truncate(white-space:nowrap 포함)를 물려주고 있어, 안 주면 2줄
          // line-clamp가 줄바꿈 자체를 못 해 첫 줄만 어색하게 잘린다.
          <Text
            size="xs"
            color="tertiary"
            className="line-clamp-2 whitespace-normal"
          >
            {description}
          </Text>
        )}
      </ComboboxItem>
    </li>
  );
}
