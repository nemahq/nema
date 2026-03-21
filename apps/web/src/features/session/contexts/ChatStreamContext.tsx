import {
  createContext,
  type ReactNode,
  useContext,
  useRef,
  useState,
} from "react";
import * as Sentry from "@sentry/react";
import { skipToken, useIsMutating } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";

import {
  type ChatInput,
  type ChatMode,
  type ChatStreamEvent,
  type Message,
  type PhaseName,
  STATUS_LOG_TYPES,
} from "@nema-io/shared";

import { useGenerateTitle } from "@web/features/session/hooks/useGenerateTitle";
import { addOptimisticMessage } from "@web/features/session/hooks/useMessageList";
import { useSessionId } from "@web/features/session/hooks/useSessionId";
import { trackEvent } from "@web/lib/posthog";
import { trpc } from "@web/lib/trpc";

type StreamingPhase = "idle" | "text" | "draft" | "retrieval";

const STREAMING_MESSAGE_ID = "streaming";

export type ClientStatusType = "thinking" | PhaseName;

export interface ClientStatusMessage {
  id: string;
  role: "assistant";
  type: "status";
  content: ClientStatusType;
  createdAt: string;
}

export type DisplayMessage = Message | ClientStatusMessage;

interface ChatStreamContextValue {
  send: (content: string, mode: ChatMode) => void;
  cancel: () => void;
  streamingPhase: StreamingPhase;
  streamingMessage: DisplayMessage | undefined;
  streamingDraftText: string;
  streamingRetrievalText: string;
}

const ChatStreamContext = createContext<ChatStreamContextValue | null>(null);

interface ChatStreamProviderProps {
  children: ReactNode;
}

export function ChatStreamProvider({ children }: ChatStreamProviderProps) {
  const sessionId = useSessionId();
  const utils = trpc.useUtils();
  const { mutate: generateTitle } = useGenerateTitle();

  const isSessionCreating =
    useIsMutating({ mutationKey: getQueryKey(trpc.session.create) }) > 0;

  const isSettlingRef = useRef(false);
  const [streamInput, setStreamInput] = useState<ChatInput | null>(null);
  const [streamingPhase, setStreamingPhase] = useState<StreamingPhase>("idle");
  const streamingPhaseRef = useRef<StreamingPhase>("idle");
  const [streamingText, setStreamingText] = useState("");
  const [streamingDraftText, setStreamingDraftText] = useState("");
  const [streamingRetrievalText, setStreamingRetrievalText] = useState("");
  const [activePhase, setActivePhase] = useState<PhaseName | null>(null);
  const fullTextRef = useRef("");
  const fullDraftTextRef = useRef("");
  const fullRetrievalTextRef = useRef("");
  const [streamStartedAt, setStreamStartedAt] = useState("");

  function resetStreamState() {
    setStreamInput(null);
    setStreamingPhase("idle");
    streamingPhaseRef.current = "idle";
    setStreamingText("");
    setStreamingDraftText("");
    setStreamingRetrievalText("");
    setActivePhase(null);
    fullTextRef.current = "";
    fullDraftTextRef.current = "";
    fullRetrievalTextRef.current = "";
  }

  function settleStream() {
    if (isSettlingRef.current) {
      return;
    }
    isSettlingRef.current = true;
    setStreamInput(null);

    Promise.all([
      utils.message.list.invalidate({ sessionId }),
      utils.session.get.invalidate({ sessionId }),
    ])
      .catch((error) => {
        Sentry.captureException(error);
      })
      .finally(() => {
        resetStreamState();
        isSettlingRef.current = false;
      });
  }

  function handleStreamEvent(event: ChatStreamEvent) {
    switch (event.type) {
      case "draft_start":
        streamingPhaseRef.current = "draft";
        setStreamingPhase("draft");
        break;
      case "retrieval_start":
        streamingPhaseRef.current = "retrieval";
        setStreamingPhase("retrieval");
        break;
      case "token":
        if (streamingPhaseRef.current === "draft") {
          fullDraftTextRef.current += event.text;
          setStreamingDraftText(fullDraftTextRef.current);
        } else if (streamingPhaseRef.current === "retrieval") {
          fullRetrievalTextRef.current += event.text;
          setStreamingRetrievalText(fullRetrievalTextRef.current);
        } else {
          fullTextRef.current += event.text;
          setStreamingText(fullTextRef.current);
        }
        break;
      case "phase":
        setActivePhase(event.name);
        break;
      case "done":
        settleStream();
        break;
      default: {
        const _exhaustive: never = event;
        void _exhaustive;
      }
    }
  }

  // TODO: 인라인 에러 메시지 + 재시도 버튼 UI 추가
  function handleStreamError(error: unknown) {
    Sentry.captureException(error);
    settleStream();
  }

  trpc.message.chat.useSubscription(
    streamInput && !isSessionCreating ? streamInput : skipToken,
    {
      onData: handleStreamEvent,
      onError: handleStreamError,
    },
  );

  function send(content: string, mode: ChatMode) {
    if (streamingPhaseRef.current !== "idle") {
      return;
    }

    const messageId = crypto.randomUUID();

    trackEvent("message.send", sessionId, {
      content_length: content.length,
      mode,
    });

    const optimistic: Message = {
      id: messageId,
      role: "user",
      type: "text",
      content,
      createdAt: new Date().toISOString(),
    };

    addOptimisticMessage(utils, sessionId, optimistic);

    generateTitle({ sessionId, content });

    fullTextRef.current = "";
    setStreamStartedAt(new Date().toISOString());
    setStreamingText("");
    streamingPhaseRef.current = "text";
    setStreamingPhase("text");
    setStreamInput({ sessionId, content, mode, messageId });
  }

  function cancel() {
    setStreamInput(null);
    settleStream();
  }

  const streamingMessage: DisplayMessage | undefined = (() => {
    switch (streamingPhase) {
      case "idle":
        return undefined;
      case "draft":
        return {
          id: STREAMING_MESSAGE_ID,
          role: "assistant",
          type: "status",
          content: STATUS_LOG_TYPES.DRAFT_CREATING,
          createdAt: streamStartedAt,
        };
      case "retrieval":
        return {
          id: STREAMING_MESSAGE_ID,
          role: "assistant",
          type: "status",
          content: STATUS_LOG_TYPES.RETRIEVAL_ANSWERED,
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
          : ({
              id: STREAMING_MESSAGE_ID,
              role: "assistant",
              type: "status",
              content: activePhase ?? "thinking",
              createdAt: streamStartedAt,
            } satisfies ClientStatusMessage);
    }
  })();

  const contextValue: ChatStreamContextValue = {
    send,
    cancel,
    streamingPhase,
    streamingMessage,
    streamingDraftText,
    streamingRetrievalText,
  };

  return <ChatStreamContext value={contextValue}>{children}</ChatStreamContext>;
}

export function useChatStream() {
  const ctx = useContext(ChatStreamContext);
  if (!ctx) {
    throw new Error("useChatStream must be used within a ChatStreamProvider.");
  }
  return ctx;
}
