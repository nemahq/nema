import { useCallback, useRef, useState } from "react";
import { skipToken } from "@tanstack/react-query";

import type { ChatInput, ChatStreamEvent, Message } from "@nema-io/shared";

import { useTrackEvent } from "@web/hooks/useTrackEvent";
import { trpc } from "@web/lib/trpc";

export function useSendMessage({ sessionId }: { sessionId: string }) {
  const utils = trpc.useUtils();
  const trackEvent = useTrackEvent();

  const [streamInput, setStreamInput] = useState<ChatInput | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const fullTextRef = useRef("");
  const [streamStartedAt, setStreamStartedAt] = useState("");

  const handleData = useCallback(
    (event: ChatStreamEvent) => {
      switch (event.type) {
        case "token":
          fullTextRef.current += event.text;
          setStreamingText(fullTextRef.current);
          break;
        case "title":
          utils.session.list.invalidate();
          break;
        case "done":
          setStreamInput(null);
          setIsStreaming(false);
          setStreamingText("");
          fullTextRef.current = "";
          utils.message.list.invalidate({ sessionId });
          utils.session.get.invalidate({ sessionId });
          break;
      }
    },
    [sessionId, utils],
  );

  // TODO: 인라인 에러 메시지 + 재시도 버튼 UI 추가
  const handleError = useCallback(
    (error: unknown) => {
      console.error("[useSendMessage] streaming error:", error);
      setStreamInput(null);
      setIsStreaming(false);
      setStreamingText("");
      fullTextRef.current = "";
      utils.message.list.invalidate({ sessionId });
      utils.session.get.invalidate({ sessionId });
    },
    [sessionId, utils],
  );

  trpc.message.chat.useSubscription(streamInput ?? skipToken, {
    onData: handleData,
    onError: handleError,
  });

  const send = useCallback(
    (content: string) => {
      if (isStreaming) {
        return;
      }

      trackEvent("message.send", sessionId, {
        content_length: content.length,
      });

      const optimistic: Message = {
        id: crypto.randomUUID(),
        role: "user",
        type: "text",
        content,
        createdAt: new Date().toISOString(),
      };

      utils.message.list.setData({ sessionId }, (old) =>
        old ? [...old, optimistic] : [optimistic],
      );

      fullTextRef.current = "";
      setStreamStartedAt(new Date().toISOString());
      setStreamingText("");
      setIsStreaming(true);
      setStreamInput({ sessionId, content });
    },
    [isStreaming, sessionId, trackEvent, utils],
  );

  const cancel = useCallback(() => {
    setStreamInput(null);
    setIsStreaming(false);
    setStreamingText("");
    fullTextRef.current = "";
    utils.message.list.invalidate({ sessionId });
  }, [sessionId, utils]);

  return {
    send,
    cancel,
    isStreaming,
    streamingText,
    streamStartedAt,
  };
}
