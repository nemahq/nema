import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { cn } from "@nema-io/weave";

const USER_MESSAGE_COLLAPSED_HEIGHT_PX = 160;
const USER_MESSAGE_EXPANDED_HEIGHT_PX = 400;

interface UserMessageProps {
  content: string;
}

export function UserMessage({ content }: UserMessageProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(
    function detectOverflow() {
      const el = contentRef.current;
      if (!el) {
        return;
      }
      setIsOverflowing(el.scrollHeight > USER_MESSAGE_COLLAPSED_HEIGHT_PX);
    },
    [content],
  );

  function handleToggle() {
    const el = contentRef.current;
    if (!el) {
      return;
    }
    const scrollContainer = el.closest<HTMLElement>("[data-scroll-container]");
    if (!scrollContainer) {
      setIsExpanded((prev) => !prev);
      return;
    }

    const scrollBefore = scrollContainer.scrollTop;
    const topBefore = el.getBoundingClientRect().top;

    flushSync(() => setIsExpanded((prev) => !prev));

    const topAfter = el.getBoundingClientRect().top;
    const drift = topAfter - topBefore;
    scrollContainer.scrollTop = scrollBefore + drift;
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleToggle();
    }
  }

  const maxHeight = isExpanded
    ? USER_MESSAGE_EXPANDED_HEIGHT_PX
    : USER_MESSAGE_COLLAPSED_HEIGHT_PX;

  return (
    <div className="relative">
      <div
        ref={contentRef}
        role={isOverflowing ? "button" : undefined}
        tabIndex={isOverflowing ? 0 : undefined}
        aria-expanded={isOverflowing ? isExpanded : undefined}
        onClick={isOverflowing ? handleToggle : undefined}
        onKeyDown={isOverflowing ? handleKeyDown : undefined}
        className={cn(
          "w-full text-left rounded-xl border border-border bg-surface-raised px-4 py-3",
          isExpanded ? "overflow-y-auto" : "overflow-hidden",
          isOverflowing && "cursor-pointer",
          "[scrollbar-width:thin] [scrollbar-color:var(--color-border)_transparent]",
        )}
        style={{ maxHeight }}
      >
        <span className="block text-[15px] leading-[1.7] text-fg-primary whitespace-pre-wrap">
          {content}
        </span>
      </div>
      {isOverflowing && !isExpanded && (
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 rounded-b-xl bg-gradient-to-t from-surface-raised to-transparent" />
      )}
    </div>
  );
}
