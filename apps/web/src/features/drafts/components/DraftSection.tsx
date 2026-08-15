import { type ReactNode, useId, useState } from "react";

import { cn, Text } from "@nema-io/weave";
import { Triangle } from "@nema-io/weave/icons";

interface DraftSectionProps {
  label: string;
  count: number;
  icon: ReactNode;
  tone?: "neutral" | "warning" | "info";
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
    <section className="flex flex-col">
      {/* 간격을 top 오프셋이 아니라 sticky 박스 안쪽 padding-top으로 준다 — top을
          올리면 그 틈이 이 박스 바깥이 되어 버려서, 아래에서 스크롤되어 올라오는
          카드가 그 틈으로 비쳐 보인다. padding은 여전히 불투명 배경 안쪽이라 안 비친다. */}
      <div className="sticky top-0 z-10 bg-surface-card pt-1 will-change-transform">
        {/* weave Button은 안 쓴다 — 이 행은 톤 배경 위에 아이콘+라벨+개수(Text 둘)를
            나란히 두는 자체 타이포·색 표현이 있는 자리라, Button의 강제
            text-[13px] font-semibold를 되돌리는 비용이 더 크다(weave-usage.md
            "탭·내비게이션"과 같은 이유). */}
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          aria-controls={contentId}
          className={cn(
            "group flex w-full items-center gap-2 rounded-md px-4 py-1.5",
            tone === "warning" && "bg-status-warning-tint",
            tone === "info" && "bg-status-info-tint",
            tone === "neutral" && "bg-surface-raised-hover/40",
          )}
        >
          <Triangle
            className={cn(
              "size-1.5 shrink-0 fill-current text-fg-tertiary/50 transition-transform duration-fast group-hover:text-fg-primary",
              // Triangle은 위(▲)를 기본으로 그려서, 펼침(▼)은 180도, 접힘(▶)은 90도 회전.
              expanded ? "rotate-180" : "rotate-90",
            )}
          />
          <span className="ml-1.5 flex size-4 shrink-0 items-center justify-center">
            {icon}
          </span>
          <Text as="span" size="sm" weight="medium" color="primary">
            {label}
          </Text>
          <Text as="span" size="xs" color="tertiary">
            {count}
          </Text>
        </button>
      </div>

      {expanded && (
        <div id={contentId} className="flex flex-col pt-1">
          {children}
        </div>
      )}
    </section>
  );
}
