import { useCallback, useEffect, useRef, useState } from "react";

import type { Message } from "@nema-io/shared";

import type { StreamingMessage } from "@web/features/session/contexts/ChatStreamContext";

const DEFAULT_THRESHOLD = 100;

export function useAutoScroll({
  messages,
  threshold = DEFAULT_THRESHOLD,
}: {
  messages: (Message | StreamingMessage)[];
  threshold?: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const prevMessageCountRef = useRef(messages.length);
  const [showNewMessageButton, setShowNewMessageButton] = useState(false);

  const scrollToBottom = useCallback(function scrollToBottom(
    behavior: ScrollBehavior = "smooth",
  ) {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    el.scrollTo({ top: el.scrollHeight, behavior });
    setShowNewMessageButton(false);
  }, []);

  useEffect(
    function attachScrollListener() {
      const el = scrollRef.current;
      if (!el) {
        return;
      }

      function onScroll(this: HTMLDivElement) {
        const distance = this.scrollHeight - this.scrollTop - this.clientHeight;
        isNearBottomRef.current = distance < threshold;
        if (isNearBottomRef.current) {
          setShowNewMessageButton(false);
        }
      }

      el.addEventListener("scroll", onScroll, { passive: true });
      return function cleanup() {
        el.removeEventListener("scroll", onScroll);
      };
    },
    [threshold],
  );

  useEffect(
    function trackNewMessages() {
      const prev = prevMessageCountRef.current;
      prevMessageCountRef.current = messages.length;

      if (messages.length <= prev) {
        return;
      }

      if (isNearBottomRef.current) {
        scrollToBottom("smooth");
      } else {
        setShowNewMessageButton(true);
      }
    },
    [messages.length, scrollToBottom],
  );

  useEffect(function scrollToBottomOnMount() {
    if (messages.length > 0) {
      requestAnimationFrame(() => scrollToBottom("instant"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    scrollRef,
    showNewMessageButton,
    scrollToBottom,
  };
}
