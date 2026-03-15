import { useCallback, useRef, useState } from "react";
import { skipToken, useIsMutating } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";

import type { ChatInput, ChatStreamEvent, Message } from "@nema-io/shared";

import { useTrackEvent } from "@web/hooks/useTrackEvent";
import { trpc } from "@web/lib/trpc";

import { useGenerateTitle } from "./useGenerateTitle";
import { addOptimisticMessage } from "./useMessageList";

type StreamingPhase = "idle" | "text" | "draft";

export function useSendMessage({ sessionId }: { sessionId: string }) {
  const utils = trpc.useUtils();
  const trackEvent = useTrackEvent();
  const generateTitle = useGenerateTitle();

  const isSessionCreating =
    useIsMutating({ mutationKey: getQueryKey(trpc.session.create) }) > 0;

  const [streamInput, setStreamInput] = useState<ChatInput | null>(null);
  const [streamingPhase, setStreamingPhase] = useState<StreamingPhase>("idle");
  const streamingPhaseRef = useRef<StreamingPhase>("idle");
  const [streamingText, setStreamingText] = useState("");
  const fullTextRef = useRef("");
  const [streamStartedAt, setStreamStartedAt] = useState("");

  function resetStreamState() {
    setStreamInput(null);
    setStreamingPhase("idle");
    streamingPhaseRef.current = "idle";
    setStreamingText("");
    fullTextRef.current = "";
  }

  const handleStreamEvent = useCallback(
    (event: ChatStreamEvent) => {
      switch (event.type) {
        case "draft_start":
          streamingPhaseRef.current = "draft";
          setStreamingPhase("draft");
          break;
        case "token":
          if (streamingPhaseRef.current !== "draft") {
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
      if (streamingPhase !== "idle") {
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

      addOptimisticMessage(utils, sessionId, optimistic);

      const cachedSession = utils.session.get.getData({ sessionId });
      if (!cachedSession?.title) {
        generateTitle.mutate({ sessionId, content });
      }

      fullTextRef.current = "";
      setStreamStartedAt(new Date().toISOString());
      setStreamingText("");
      streamingPhaseRef.current = "text";
      setStreamingPhase("text");
      setStreamInput({ sessionId, content });
    },
    [streamingPhase, sessionId, trackEvent, utils, generateTitle],
  );

  const cancel = useCallback(() => {
    resetStreamState();
    utils.message.list.invalidate({ sessionId });
  }, [sessionId, utils]);

  return {
    send,
    cancel,
    streamingPhase,
    streamingText,
    streamStartedAt,
  };
}
