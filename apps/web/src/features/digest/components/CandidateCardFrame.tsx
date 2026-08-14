import type { ReactNode } from "react";

import { cn } from "@nema-io/weave";

interface CandidateCardFrameProps {
  // 헤더 워시 구역에 들어갈 것들 — 카드를 이해하는 데 필수인 정보(유형·제목·시각).
  wash: ReactNode;
  className?: string;
  children?: ReactNode;
}

// legacy 포팅(legacy/apps/web/src/features/review/components/CandidateCardFrame.tsx) —
// 다이제스트 상세 하나는 독립된 메모지 폼이 아니라는 게 이 카드의 전제다.
// 4방향 테두리 대신 헤더에만 옅은 워시를 깔아 "여기부터 카드"만 알리고, 본문은
// 배경 없이 그대로 둔다.
export function CandidateCardFrame({
  wash,
  className,
  children,
}: CandidateCardFrameProps) {
  return (
    <div className={cn("flex flex-col gap-2 pb-8", className)}>
      {/* 각진 모서리 — 둥근 모서리는 이 앱에서 클릭 가능한 컨트롤의 시각 언어라,
          여기 쓰면 헤더가 영역 표시가 아니라 또 하나의 컨트롤처럼 보인다. */}
      <div className="flex flex-col gap-2 bg-surface-raised px-2 py-2 dark:bg-surface-base">
        {wash}
      </div>
      {children}
    </div>
  );
}
