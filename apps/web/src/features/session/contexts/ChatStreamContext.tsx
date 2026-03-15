import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { skipToken, useIsMutating } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";

import type { ChatInput, ChatStreamEvent, Message } from "@nema-io/shared";

import { useTrackEvent } from "@web/hooks/useTrackEvent";
import { useTranslation } from "@web/lib/tolgee";
import { trpc } from "@web/lib/trpc";

import { useGenerateTitle } from "../hooks/useGenerateTitle";
import { addOptimisticMessage } from "../hooks/useMessageList";
import { useSessionId } from "../hooks/useSessionId";

type StreamingPhase = "idle" | "text" | "draft";

const STREAMING_MESSAGE_ID = "streaming";

interface ChatStreamContextValue {
  send: (content: string) => void;
  cancel: () => void;
  streamingPhase: StreamingPhase;
  streamingMessage: Message | undefined;
}

const ChatStreamContext = createContext<ChatStreamContextValue | null>(null);

export function ChatStreamProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const sessionId = useSessionId();
  const utils = trpc.useUtils();
  const trackEvent = useTrackEvent();
  const { mutate: generateTitle } = useGenerateTitle();

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
      console.error("[ChatStream] streaming error:", error);
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
        generateTitle({ sessionId, content });
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

  const streamingMessage = useMemo<Message | undefined>(() => {
    switch (streamingPhase) {
      case "idle":
        return undefined;
      case "draft":
        return {
          id: STREAMING_MESSAGE_ID,
          role: "assistant",
          type: "status",
          content: t("session.draft_creating"),
          createdAt: streamStartedAt,
        };
      case "text":
        return streamingText
          ? {
              id: STREAMING_MESSAGE_ID,
              role: "assistant",
              type: "text",
              content: streamingText,
              createdAt: streamStartedAt,
            }
          : undefined;
    }
  }, [streamingPhase, streamingText, streamStartedAt, t]);

  const value = useMemo<ChatStreamContextValue>(
    () => ({ send, cancel, streamingPhase, streamingMessage }),
    [send, cancel, streamingPhase, streamingMessage],
  );

  return <ChatStreamContext value={value}>{children}</ChatStreamContext>;
}

export function useChatStream() {
  const ctx = useContext(ChatStreamContext);
  if (!ctx) {
    throw new Error(
      "useChatStream은 ChatStreamProvider 내부에서만 사용할 수 있습니다.",
    );
  }
  return ctx;
}
