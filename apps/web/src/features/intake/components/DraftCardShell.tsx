import { type ReactNode } from "react";

import { useTranslation } from "@web/lib/tolgee";

interface DraftCardShellProps {
  onSelect: () => void;
  children: ReactNode;
}

// 카드 전체가 열기 트리거지만 안에 삭제/취소 같은 실제 버튼도 있어(button 안에
// button은 불가) 실제 <button>을 콘텐츠 뒤에 깔아두는 방식(stretched button)을
// 쓴다. 내부 버튼이 stopPropagation 없이도 되는 이유는 두 가지: (1) 히트테스트 —
// DOM 순서상 뒤에 그려지는 콘텐츠가 위에 있어 내부 버튼을 클릭하면 이벤트
// 타겟 자체가 이 버튼이 아니라 내부 버튼이 된다. (2) 이 버튼은 콘텐츠의 조상이
// 아니라 형제라서, 내부 버튼 클릭이 버블링돼도 이 버튼의 onClick 경로를 안 거친다.
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
