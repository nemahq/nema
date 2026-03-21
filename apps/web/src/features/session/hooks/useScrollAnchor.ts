/* eslint-disable react-compiler/react-compiler -- deps 제한이 의도적 (count-only 트래킹) */
import { useLayoutEffect, useRef } from "react";

import type { DisplayMessage } from "@web/features/session/contexts/ChatStreamContext";

export const USER_TURN_DATA_ROLE = "user";

const USER_TURN_SELECTOR = `[data-role="${USER_TURN_DATA_ROLE}"]`;
const SCROLL_POSITION_TOLERANCE_PX = 1;

export function useScrollAnchor({ messages }: { messages: DisplayMessage[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(messages.length);
  const isProgrammaticScrollRef = useRef(false);
  const isUserScrollingRef = useRef(false);

  function scrollToLastUserMessage(behavior: ScrollBehavior = "instant") {
    const container = scrollRef.current;
    if (!container) {
      return;
    }

    const userTurns = container.querySelectorAll(USER_TURN_SELECTOR);
    const lastUserEl =
      userTurns.length > 0 ? userTurns[userTurns.length - 1] : undefined;

    const targetTop = lastUserEl
      ? container.scrollTop +
        lastUserEl.getBoundingClientRect().top -
        container.getBoundingClientRect().top
      : container.scrollHeight;

    if (
      Math.abs(container.scrollTop - targetTop) > SCROLL_POSITION_TOLERANCE_PX
    ) {
      isProgrammaticScrollRef.current = true;
      container.scrollTo({ top: targetTop, behavior });
    }
    isUserScrollingRef.current = false;
  }

  useLayoutEffect(function attachScrollListener() {
    const el = scrollRef.current;
    if (!el) {
      return;
    }

    function onScroll() {
      if (isProgrammaticScrollRef.current) {
        isProgrammaticScrollRef.current = false;
        return;
      }
      isUserScrollingRef.current = true;
    }

    el.addEventListener("scroll", onScroll, { passive: true });
    return function cleanup() {
      el.removeEventListener("scroll", onScroll);
    };
  }, []);

  useLayoutEffect(
    function anchorOnNewMessage() {
      const prev = prevMessageCountRef.current;
      prevMessageCountRef.current = messages.length;

      if (messages.length <= prev) {
        return;
      }

      const lastMessage = messages[messages.length - 1];
      if (!lastMessage) {
        return;
      }

      if (lastMessage.role === "user") {
        isUserScrollingRef.current = false;
        scrollToLastUserMessage("instant");
        return;
      }

      if (!isUserScrollingRef.current) {
        scrollToLastUserMessage("instant");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- track by count only
    [messages.length, scrollToLastUserMessage],
  );

  return { scrollRef, scrollToLastUserMessage };
}
