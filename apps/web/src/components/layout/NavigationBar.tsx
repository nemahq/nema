import type { ReactNode } from "react";

interface NavigationBarProps {
  children: ReactNode;
}

// 스크롤 컨테이너 밖(형제)에 렌더해서 쓴다 — sticky로 안에 두면 관성 스크롤
// 바운스에 같이 끌려간다(DraftsScreen에서 확인된 문제). 콘텐츠 제목의 미러링이
// 아니라 지금 위치를 알려주는 내비게이션 chrome이라, 아래 콘텐츠 폭과 맞출
// 필요가 없다(Notion 브레드크럼과 같은 성격).
export function NavigationBar({ children }: NavigationBarProps) {
  return (
    <div className="flex h-11 shrink-0 items-center overscroll-none border-b border-border/50 bg-surface-card px-4">
      {children}
    </div>
  );
}
