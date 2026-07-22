import type { FocusEventHandler, ReactNode } from "react";

import { cn } from "@nema-io/weave";

interface CandidateCardFrameProps {
  viewed: boolean;
  // 헤더 워시 구역에 들어갈 것들 — 카드를 이해하는 데 필수인, 접혀도 남아야 하는
  // 정보다(Digest는 타입·Topic·제목·description, Reference는 타입·제목).
  wash: ReactNode;
  className?: string;
  onFocus?: FocusEventHandler<HTMLDivElement>;
  onBlur?: FocusEventHandler<HTMLDivElement>;
  children?: ReactNode;
}

// 후보 하나는 독립된 메모지 폼이 아니라는 게 이 카드들의 전제다 — 4방향 테두리 대신
// 헤더에만 옅은 워시를 깔아 "여기부터 새 카드"만 알리고, 본문은 배경 없이 그대로
// 둔다(design-decisions-log.md). Digest·신규 Reference·병합 Reference 세 카드가
// 같은 시각 언어를 쓰기로 한 규칙이라, 여백값과 워시를 각자 베끼는 대신 여기 모은다.
export function CandidateCardFrame({
  viewed,
  wash,
  className,
  onFocus,
  onBlur,
  children,
}: CandidateCardFrameProps) {
  return (
    <div
      onFocus={onFocus}
      onBlur={onBlur}
      className={cn(
        "flex flex-col gap-2",
        // 접힌 카드는 3줄로 짧아져서 같은 여백이면 헐거워 보인다 — 뒤쪽이 더
        // 촘촘한 피드 리듬이 되도록 좁힌다.
        viewed ? "pb-4" : "pb-8",
        className,
      )}
    >
      {/* 각진 모서리 — 둥근 모서리는 이 앱에서 클릭 가능한 컨트롤의 시각 언어라,
          여기 쓰면 헤더가 영역 표시가 아니라 또 하나의 컨트롤처럼 보인다. 배경은
          LNB(Sidebar)와 같은 톤(라이트 surface-raised·다크 surface-base) — 반투명
          틴트 대신 이 페이지가 얹힌 surface-card와 항상 같은 정도로 구분되는 절대
          색이라, 다크에서 카드 배경(surface-card)에 얹은 틴트가 흐려 보이던 문제가
          없다. */}
      <div className="flex flex-col gap-2 bg-surface-raised px-2 py-2 dark:bg-surface-base">
        {wash}
      </div>
      {/* 읽음 처리되면 본문을 통째로 안 그린다 — 헤더만 남아 피드 행처럼 접힌다. */}
      {!viewed && children}
    </div>
  );
}
