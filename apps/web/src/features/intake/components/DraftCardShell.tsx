import { type ReactNode } from "react";

import { useTranslation } from "@web/lib/tolgee";

interface DraftCardShellProps {
  onSelect: () => void;
  children: ReactNode;
}

// 카드 전체가 열기 트리거지만 안에 삭제/취소 같은 실제 버튼도 있어(button 안에
// button은 불가) 실제 <button>을 콘텐츠 뒤에 깔아두는 방식(stretched button)을
// 쓴다 — DOM 순서상 뒤에 오는 콘텐츠 레이어가 항상 위에 그려져 내부 버튼 클릭이
// 자연히 먼저 잡히고, 나머지 빈 영역만 이 버튼이 받는다. 내부 버튼들이 별도로
// stopPropagation을 안 해도 되는 이유이기도 하다.
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
      <div className="relative flex flex-col gap-2">{children}</div>
    </div>
  );
}
