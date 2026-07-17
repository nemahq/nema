import { type ReactNode } from "react";

import { cn, LIST_ITEM_HOVER_CLASSNAME } from "@nema-io/weave";

import { useTranslation } from "@web/lib/tolgee";

interface DraftCardShellProps {
  onSelect: () => void;
  children: ReactNode;
}

// 카드 전체가 열기 트리거지만 안에 삭제/취소 같은 실제 버튼도 있어(button 안에
// button은 불가) 실제 <button>을 콘텐츠 뒤에 깔아두는 방식(stretched button)을
// 쓴다. 히트테스트: 콘텐츠 wrapper가 DOM 순서상 위라 기본적으로 클릭을
// 가로채므로, pointer-events-none으로 클릭이 그 아래 이 버튼까지 그대로
// 통과하게 한다. 액션 버튼(삭제·취소, 상태 아이콘 툴팁)만 pointer-events-auto로
// 되돌려 각자 히트테스트 대상을 되찾는다 — 이 버튼들과 stretched button은
// 조상-자손이 아니라 형제라서, 클릭이 액션 버튼 자체에서 시작돼 버블링돼도
// stretched button의 onClick 경로는 애초에 거치지 않는다(별도 안전장치 불필요).
export function DraftCardShell({ onSelect, children }: DraftCardShellProps) {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        "group relative flex flex-col gap-2 px-4 py-3",
        LIST_ITEM_HOVER_CLASSNAME,
      )}
    >
      <button
        type="button"
        aria-label={t("intake.draft_open")}
        onClick={onSelect}
        className="absolute inset-0 rounded-lg"
      />
      <div className="relative flex flex-col gap-2 pointer-events-none">
        {children}
      </div>
    </div>
  );
}
