import { type ReactNode } from "react";

import { cn, LIST_ITEM_HOVER_CLASSNAME } from "@nema-io/weave";

import { useTranslation } from "@web/lib/tolgee";

interface DraftCardShellProps {
  name: string;
  onSelect: () => void;
  children: ReactNode;
}

// 카드 전체가 열기 트리거지만 안에 재시도 같은 실제 버튼도 있어(button 안에
// button은 불가) 실제 <button>을 콘텐츠 뒤에 깔아두는 방식(stretched button)을
// 쓴다. 콘텐츠 wrapper가 DOM 순서상 위라 기본적으로 클릭을 가로채므로,
// pointer-events-none으로 클릭이 그 아래 이 버튼까지 그대로 통과하게 한다.
// 액션 버튼(재시도)만 pointer-events-auto로 되돌려 각자 히트테스트 대상을
// 되찾는다 — legacy DraftCardShell과 동일한 트릭.
export function DraftCardShell({
  name,
  onSelect,
  children,
}: DraftCardShellProps) {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        "group relative flex flex-col gap-2 px-4 py-3",
        LIST_ITEM_HOVER_CLASSNAME,
      )}
    >
      {/* weave Button 대신 raw button — 전체 카드에 깔리는 투명 히트타깃이라
          Button의 시각 스타일(패딩·배경·타이포)이 전부 불필요하다. */}
      <button
        type="button"
        // 카드마다 같은 라벨이면 스크린리더로는 어느 카드인지 구분이 안 된다 —
        // 원문 이름을 붙여 카드별로 다르게 읽히게 한다.
        aria-label={`${t("draft.card_open_label")} — ${name}`}
        onClick={onSelect}
        className="absolute inset-0 rounded-lg"
      />
      <div className="relative flex flex-col gap-2 pointer-events-none">
        {children}
      </div>
    </div>
  );
}
