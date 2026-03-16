import { useCallback, useEffect, useRef } from "react";

import type { DisplayMessage } from "@web/features/session/contexts/ChatStreamContext";

export function useScrollAnchor({ messages }: { messages: DisplayMessage[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(messages.length);
  const isProgrammaticScrollRef = useRef(false);
  const isUserScrollingRef = useRef(false);

  const scrollToLastUserMessage = useCallback(function scrollToLastUserMessage(
    behavior: ScrollBehavior = "smooth",
  ) {
    const container = scrollRef.current;
    if (!container) {
      return;
    }

    const userMessages = container.querySelectorAll('[data-role="user"]');
    const lastUserEl = userMessages[userMessages.length - 1] as
      | HTMLElement
      | undefined;
    if (lastUserEl) {
      isProgrammaticScrollRef.current = true;
      const top =
        container.scrollTop +
        lastUserEl.getBoundingClientRect().top -
        container.getBoundingClientRect().top;
      container.scrollTo({ top, behavior });
    }
    isUserScrollingRef.current = false;
  }, []);

  useEffect(function attachScrollListener() {
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

  useEffect(
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
        requestAnimationFrame(() => scrollToLastUserMessage("instant"));
        return;
      }

      if (!isUserScrollingRef.current) {
        requestAnimationFrame(() => scrollToLastUserMessage("instant"));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- track by count only
    [messages.length, scrollToLastUserMessage],
  );

  return { scrollRef, scrollToLastUserMessage };
}
