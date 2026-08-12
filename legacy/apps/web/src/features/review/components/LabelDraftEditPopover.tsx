import type { ReactNode } from "react";

import { HoverIcon, PopoverContent, PopoverTrigger } from "@nema-io/weave";
import { Ellipsis } from "@nema-io/weave/icons";

import { Popover } from "@web/components/ui/Popover";
import { useTranslation } from "@web/lib/tolgee";

interface LabelDraftEditPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

// PR #506이 걷어낸 LabelInlineEditPopover와 같은 문제(중첩 팝오버 바깥 클릭)를
// 풀지만, 그 컴포넌트를 복원하는 게 아니다 — 대상이 신규(draft) 라벨 자기 자신
// 뿐이고(레지스트리 기존 라벨 인라인 수정은 팀 컨센서스로 재발 금지), 스토어
// 전역 액션·서버 mutation 없이 로컬 배열 하나(topics/tags)만 바꾼다. modal —
// 이 팝오버는 항상 다른 팝오버(DigestTagPicker·DigestTopicPicker) 안에 중첩된다.
// 두 layer 모두 기본값(non-modal)이면 바깥 클릭이 두 layer에 동시에 "바깥"으로
// 잡혀 한 번에 같이 닫힌다. 이 안쪽 layer만 modal로 두면 열려 있는 동안 바깥
// layer의 바깥-클릭 판정이 억제돼, 첫 클릭엔 이것만 닫히고 다음 클릭에야 바깥
// 팝오버가 닫힌다.
export function LabelDraftEditPopover({
  open,
  onOpenChange,
  children,
}: LabelDraftEditPopoverProps) {
  const { t } = useTranslation();

  return (
    <Popover open={open} onOpenChange={onOpenChange} modal>
      <PopoverTrigger asChild>
        <HoverIcon
          active={open}
          aria-label={t("common.edit_action")}
          className="group-hover:opacity-100"
        >
          <Ellipsis className="size-3" />
        </HoverIcon>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={4}
        // weave PopoverContent 기본값에 p-2(사방)가 이미 있다 — py-2만 얹으면
        // 세로만 새로 지정될 뿐 p-2의 좌우(px)는 안 지워진다(tailwind-merge가
        // shorthand와 축 단위 유틸을 서로 다른 클래스로 남겨두고, CSS 쪽에서
        // 나중에 생성되는 축 단위 규칙이 겹치는 축만 덮어쓰는 구조라 px-0을
        // 명시해야 실제로 사라진다). 좌우 패딩은 아래 children(Input·색상
        // 리스트) 쪽이 각자 갖는다.
        className="w-56 px-0 py-2"
      >
        <div className="flex flex-col gap-1.5">{children}</div>
      </PopoverContent>
    </Popover>
  );
}
