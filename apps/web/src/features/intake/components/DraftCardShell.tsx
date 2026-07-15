import { type ReactNode } from "react";

import { useTranslation } from "@web/lib/tolgee";

interface DraftCardShellProps {
  onSelect: () => void;
  children: ReactNode;
}

// 카드 전체가 열기 트리거지만 안에 삭제/취소 같은 실제 버튼도 있어(button 안에
// button은 불가) 실제 <button>을 콘텐츠 뒤에 깔아두는 방식(stretched button)을
// 쓴다. 콘텐츠 wrapper는 pointer-events-none이라 텍스트·아이콘 위를 클릭해도
// 그 아래 이 버튼이 그대로 받는다 — 형제 관계라 버블링으로는 절대 안 닿기
// 때문에(내부 버튼 클릭이 이 버튼의 onClick 경로를 거치지 않는 이유와 같은
// 근거) click-through가 필수다. 실제 액션(삭제·취소 버튼, 상태 아이콘
// 툴팁)만 pointer-events-auto로 되돌려 각자 히트테스트를 되찾는다.
export function DraftCardShell({ onSelect, children }: DraftCardShellProps) {
  const { t } = useTranslation();

  return (
    <div className="group relative flex flex-col gap-2 rounded-lg px-4 py-3 transition-colors duration-fast hover:bg-surface-raised-hover/40">
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
