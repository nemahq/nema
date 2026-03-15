import { useCallback, useRef, useState } from "react";
import { skipToken, useIsMutating } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";

import type { ChatInput, ChatStreamEvent, Message } from "@nema-io/shared";

import { useTrackEvent } from "@web/hooks/useTrackEvent";
import { trpc } from "@web/lib/trpc";

export function useSendMessage({ sessionId }: { sessionId: string }) {
  const utils = trpc.useUtils();
  const trackEvent = useTrackEvent();
  const isSessionCreating =
    useIsMutating({ mutationKey: getQueryKey(trpc.session.create) }) > 0;

  const [streamInput, setStreamInput] = useState<ChatInput | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isDraftStreaming, setIsDraftStreaming] = useState(false);
  const isDraftStreamingRef = useRef(false);
  const [streamingText, setStreamingText] = useState("");
  const fullTextRef = useRef("");
  const [streamStartedAt, setStreamStartedAt] = useState("");

  function resetStreamState() {
    setStreamInput(null);
    setIsStreaming(false);
    setIsDraftStreaming(false);
    isDraftStreamingRef.current = false;
    setStreamingText("");
    fullTextRef.current = "";
  }

  const handleStreamEvent = useCallback(
    (event: ChatStreamEvent) => {
      switch (event.type) {
        case "draft_start":
          isDraftStreamingRef.current = true;
          setIsDraftStreaming(true);
          break;
        case "token":
          if (!isDraftStreamingRef.current) {
            fullTextRef.current += event.text;
            setStreamingText(fullTextRef.current);
          }
          break;
        case "done":
          resetStreamState();
          utils.message.list.invalidate({ sessionId });
          utils.session.get.invalidate({ sessionId });
          break;
      }
    },
    [sessionId, utils],
  );

  // TODO: 인라인 에러 메시지 + 재시도 버튼 UI 추가
  const handleStreamError = useCallback(
    (error: unknown) => {
      console.error("[useSendMessage] streaming error:", error);
      resetStreamState();
      utils.message.list.invalidate({ sessionId });
      utils.session.get.invalidate({ sessionId });
    },
    [sessionId, utils],
  );

  trpc.message.chat.useSubscription(
    streamInput && !isSessionCreating ? streamInput : skipToken,
    {
      onData: handleStreamEvent,
      onError: handleStreamError,
    },
  );

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
    resetStreamState();
    utils.message.list.invalidate({ sessionId });
  }, [sessionId, utils]);

  return {
    send,
    cancel,
    isStreaming,
    isDraftStreaming,
    streamingText,
    streamStartedAt,
  };
}
