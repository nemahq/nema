import { useCallback, useEffect, useRef, useState } from "react";

import type { Message } from "@nema-io/shared";

const DEFAULT_THRESHOLD = 100;

export function useAutoScroll({
  messages,
  threshold = DEFAULT_THRESHOLD,
}: {
  messages: Message[];
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
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    setShowNewMessageButton(false);
  }, []);

  const handleUserSentMessage = useCallback(
    function handleUserSentMessage() {
      requestAnimationFrame(() => scrollToBottom("smooth"));
    },
    [scrollToBottom],
  );

  useEffect(
    function attachScrollListener() {
      const el = scrollRef.current;
      if (!el) return;

      const target = el;
      function onScroll() {
        const distance =
          target.scrollHeight - target.scrollTop - target.clientHeight;
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

      if (messages.length <= prev) return;

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
    handleUserSentMessage,
  };
}
