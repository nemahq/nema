import type { ReactNode } from "react";
import { useId } from "react";

import type { TagColor } from "@nema-io/shared";
import {
  Badge,
  ComboboxItem,
  TAG_COLOR_CLASSNAME,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@nema-io/weave";

import { NewLabelIndicator } from "./NewLabelIndicator";

interface LabelSearchRowProps {
  label: string;
  // Tag 전용 — 재사용 판단 기준이 되는 정의(07-modeling.md). 있으면 호버 시
  // 우측 툴팁으로 보여준다. Topic은 이 개념 자체가 없어 안 넘긴다.
  description?: string;
  // Tag 전용 — 이미 붙은 행은 attached 스타일을 그대로 유지하고, 아직 안 붙은
  // 후보 행에만 이 색을 입힌다(DigestTagPicker가 트리거 칩에 색을 입히는 것과
  // 같은 규칙). Topic은 색 개념이 없어 안 넘긴다.
  color?: TagColor;
  // 이 Digest에 이미 붙은 라벨도 목록에서 그대로 보여준다 — "붙은 것"과 "안
  // 붙은 것"을 둘로 쪼개지 않고 이 목록 하나로 통일하기 위해서다. 대신 이미
  // 붙은 행은 클릭해도 다시 안 붙는다.
  attached: boolean;
  // 신규(draft) 라벨 행에만 true — 상단 칩 목록이 아니라 여기(검색 리스트)에서
  // "+" 표식을 보여주기로 했다.
  isNew?: boolean;
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
  color,
  attached,
  isNew,
  actions,
  onSelect,
}: LabelSearchRowProps) {
  const descriptionId = useId();
  const showColor = color !== undefined && !attached;
  let badgeVariant: "neutral" | "outline" | undefined;
  if (!showColor) {
    badgeVariant = attached ? "neutral" : "outline";
  }

  const row = (
    <ComboboxItem
      readOnly={attached}
      onClick={onSelect}
      actions={actions}
      // aria-label로 이름을 label에 고정한다 — 안 하면 버튼 접근성 이름이
      // 아래 숨김 설명 span의 텍스트까지 이어붙여 계산돼(hidden이어도 aria-
      // hidden이 아니라 이름 계산에서 안 빠짐) 라벨 이름이 장황해진다.
      aria-label={label}
      aria-describedby={description ? descriptionId : undefined}
    >
      <span className="inline-flex min-w-0 items-center gap-0">
        {isNew && <NewLabelIndicator />}
        <Badge
          variant={badgeVariant}
          shape="rounded"
          truncated
          className={showColor ? TAG_COLOR_CLASSNAME[color] : undefined}
        >
          {label}
        </Badge>
      </span>
      {description && (
        <span
          id={descriptionId}
          className="inline-block size-px overflow-hidden whitespace-nowrap"
        >
          {description}
        </span>
      )}
    </ComboboxItem>
  );

  if (!description) {
    return <li>{row}</li>;
  }

  return (
    <li>
      <Tooltip>
        {/* asChild를 ComboboxItem에 바로 걸면 안 된다 — ComboboxItem은 자기 props를
            전체 폭 바깥 div가 아니라 안쪽 flex-1 버튼에만 전달해서, actions(미트볼)
            유무에 따라 그 버튼 폭이 달라져 툴팁 기준점이 행마다 어긋난다. 여기서
            직접 만든 w-full div를 기준점으로 고정한다(span이 아니라 div인 이유 —
            ComboboxItem의 루트가 div라 span 안에 div를 넣으면 잘못된 HTML 중첩이
            된다). */}
        <TooltipTrigger asChild>
          <div className="block w-full">{row}</div>
        </TooltipTrigger>
        {/* text-wrap으로 기본 text-balance를 되돌린다 — balance는 한글처럼
            공백 없는 구간이 섞인 텍스트의 줄 길이를 부정확하게 계산해 짧은
            줄만 남기고 오른쪽에 여백을 만든다. break-keep은 그 공백 없는
            구간(예: "다듬을지") 중간을 끊지 않고 실제 공백에서만 줄바꿈한다. */}
        <TooltipContent
          side="right"
          sideOffset={12}
          className="max-w-56 text-wrap break-keep"
        >
          {description}
        </TooltipContent>
      </Tooltip>
    </li>
  );
}
