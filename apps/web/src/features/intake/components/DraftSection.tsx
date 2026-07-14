import { type ReactNode, useId, useState } from "react";

import { cn } from "@nema-io/weave";
import { Triangle } from "@nema-io/weave/icons";

interface DraftSectionProps {
  label: string;
  count: number;
  icon: ReactNode;
  // 색은 실제 판단이 필요한 섹션에만 준다 — 처리중은 항상 neutral.
  tone?: "neutral" | "warning";
  children: ReactNode;
}

// count===0이면 섹션 자체를 숨긴다 — LNB 초안 버튼과 같은 원칙("있을 때만 노출").
export function DraftSection({
  label,
  count,
  icon,
  tone = "neutral",
  children,
}: DraftSectionProps) {
  const [expanded, setExpanded] = useState(true);
  const contentId = useId();

  if (count === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-3">
      {/* 페이지 타이틀 바가 이제 스크롤 컨테이너 밖에 있어, 이 스크롤 영역 안에서는
          top-0이 곧 타이틀 바로 아래 지점이다. 불투명 bg-surface-card로 뒤에서
          스크롤되는 카드가 안 비치게 막는다. */}
      <div className="sticky top-0 z-10 bg-surface-card py-1">
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          aria-controls={contentId}
          className={cn(
            "group flex w-full items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium text-fg-primary",
            tone === "warning"
              ? "bg-status-warning-tint"
              : "bg-surface-raised-hover/40",
          )}
        >
          <Triangle
            className={cn(
              "size-1.5 shrink-0 fill-current text-fg-tertiary/50 transition-transform duration-fast group-hover:text-fg-primary",
              // Triangle은 위(▲)를 기본으로 그려서, 펼침(▼)은 180도, 접힘(▶)은 90도 회전.
              expanded ? "rotate-180" : "rotate-90",
            )}
          />
          <span className="ml-1.5 flex items-center">{icon}</span>
          {label}
          <span className="text-xs text-fg-tertiary">{count}</span>
        </button>
      </div>

      {expanded && (
        <div id={contentId} className="flex flex-col gap-3">
          {children}
        </div>
      )}
    </section>
  );
}
