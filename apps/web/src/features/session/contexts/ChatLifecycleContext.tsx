import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import * as Sentry from "@sentry/react";
import { skipToken, useIsMutating } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";

import {
  type ChatInput,
  type ChatMode,
  type ChatStartInput,
  type ChatStreamEvent,
  type Message,
  type PhaseName,
  type SearchResultDoc,
  STATUS_LOG_TYPES,
  type StatusLogType,
} from "@nema-io/shared";

import { useGenerateTitle } from "@web/features/session/hooks/useGenerateTitle";
import { addOptimisticMessage } from "@web/features/session/hooks/useMessageListQuery";
import { useSessionId } from "@web/features/session/hooks/useSessionId";
import { getErrorMessage } from "@web/lib/getErrorMessage";
import { trackEvent } from "@web/lib/posthog/trackEvent";
import { trpc } from "@web/lib/trpc";

type StreamingPhase = "idle" | "text" | "searching" | "draft" | "retrieval";

const STREAMING_MESSAGE_ID = "streaming";
const RESUME_TIMEOUT_MS = 30_000;

export type ClientStatusType = "thinking" | PhaseName | StatusLogType;

export interface ClientStatusMessage {
  id: string;
  role: "assistant";
  type: "status";
  content: ClientStatusType;
  createdAt: string;
}

export type DisplayMessage = Message | ClientStatusMessage;

interface ChatLifecycleContextValue {
  send: (content: string, mode: ChatMode) => void;
  cancel: () => void;
  streamingPhase: StreamingPhase;
  streamingMessage: DisplayMessage | undefined;
  streamingDraftText: string;
  streamingRetrievalText: string;
  searchQueries: string[];
  searchEntities: string[];
  searchResultDocs: SearchResultDoc[];
  clearSearchResults: () => void;
  streamError: string | null;
  retryStream: () => void;
  dismissStreamError: () => void;
}

const ChatLifecycleContext = createContext<ChatLifecycleContextValue | null>(
  null,
);

function buildStreamingMessage({
  streamError,
  streamingPhase,
  streamStartedAt,
  streamingText,
  activePhase,
}: {
  streamError: string | null;
  streamingPhase: StreamingPhase;
  streamStartedAt: string;
  streamingText: string;
  activePhase: PhaseName | null;
}): DisplayMessage | undefined {
  if (streamError) {
    return undefined;
  }
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
    case "searching":
      return {
        id: STREAMING_MESSAGE_ID,
        role: "assistant",
        type: "status",
        content: "searching" satisfies PhaseName,
        createdAt: streamStartedAt,
      } satisfies ClientStatusMessage;
    case "retrieval":
      return {
        id: STREAMING_MESSAGE_ID,
        role: "assistant",
        type: "status",
        content: activePhase ?? STATUS_LOG_TYPES.RETRIEVAL_ANSWERED,
        createdAt: streamStartedAt,
      } satisfies ClientStatusMessage;
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
}

interface ChatLifecycleProviderProps {
  children: ReactNode;
}

export function ChatLifecycleProvider({
  children,
}: ChatLifecycleProviderProps) {
  const sessionId = useSessionId();
  const utils = trpc.useUtils();
  const { mutate: generateTitle } = useGenerateTitle();

  const isSessionCreating =
    useIsMutating({ mutationKey: getQueryKey(trpc.session.create) }) > 0;

  const isSettlingRef = useRef(false);
  const [streamInput, setStreamInput] = useState<ChatInput | null>(null);
  const lastStreamInputRef = useRef<ChatStartInput | null>(null);
  const [streamingPhase, setStreamingPhase] = useState<StreamingPhase>("idle");
  const streamingPhaseRef = useRef<StreamingPhase>("idle");
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const cancelGenerationMutation = trpc.message.cancelGeneration.useMutation({
    onError(error) {
      Sentry.captureException(error, {
        tags: { component: "chat-stream-cancel" },
      });
    },
  });
  const [streamingText, setStreamingText] = useState("");
  const [streamingDraftText, setStreamingDraftText] = useState("");
  const [streamingRetrievalText, setStreamingRetrievalText] = useState("");
  const [activePhase, setActivePhase] = useState<PhaseName | null>(null);
  const fullTextRef = useRef("");
  const fullDraftTextRef = useRef("");
  const fullRetrievalTextRef = useRef("");
  const [streamStartedAt, setStreamStartedAt] = useState("");
  const [streamError, setStreamError] = useState<string | null>(null);
  const [searchQueries, setSearchQueries] = useState<string[]>([]);
  const [searchEntities, setSearchEntities] = useState<string[]>([]);
  const [searchResultDocs, setSearchResultDocs] = useState<SearchResultDoc[]>(
    [],
  );

  function transitionPhase(phase: StreamingPhase) {
    streamingPhaseRef.current = phase;
    setStreamingPhase(phase);
  }

  function resetTextBuffers() {
    fullTextRef.current = "";
    fullDraftTextRef.current = "";
    fullRetrievalTextRef.current = "";
    setStreamingText("");
    setStreamingDraftText("");
    setStreamingRetrievalText("");
  }

  function resetStreamState() {
    setStreamInput(null);
    transitionPhase("idle");
    resetTextBuffers();
    setActivePhase(null);
    setStreamError(null);
    setSearchQueries([]);
    setSearchEntities([]);
  }

  const settleStream = useCallback(
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
    },
    [sessionId, utils],
  );

  function handleStreamEvent(event: ChatStreamEvent) {
    switch (event.type) {
      case "draft_start":
        transitionPhase("draft");
        break;
      case "retrieval_start":
        transitionPhase("retrieval");
        break;
      case "token":
        if (streamingPhaseRef.current === "draft") {
          fullDraftTextRef.current += event.text;
          setStreamingDraftText(fullDraftTextRef.current);
        } else if (streamingPhaseRef.current === "retrieval") {
          fullRetrievalTextRef.current += event.text;
          setStreamingRetrievalText(fullRetrievalTextRef.current);
        } else if (streamingPhaseRef.current === "searching") {
          break;
        } else {
          fullTextRef.current += event.text;
          setStreamingText(fullTextRef.current);
        }
        break;
      case "phase":
        setActivePhase(event.name);
        if (
          event.name === "searching" &&
          streamingPhaseRef.current === "text"
        ) {
          transitionPhase("searching");
        }
        break;
      case "search_query":
        setSearchQueries(event.queries);
        setSearchEntities(event.entities);
        break;
      case "search_results":
        setSearchResultDocs(event.documents);
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

  function handleStreamError(error: unknown) {
    Sentry.captureException(error);
    setStreamError(getErrorMessage(error));
    setStreamInput(null);
  }

  function retryStream() {
    const lastInput = lastStreamInputRef.current;
    if (!lastInput) {
      return;
    }

    const messageId = crypto.randomUUID();
    const newInput: ChatStartInput = { ...lastInput, messageId };

    addOptimisticMessage(utils, sessionId, {
      id: messageId,
      role: "user",
      type: "text",
      content: lastInput.content,
      createdAt: new Date().toISOString(),
    });

    setStreamError(null);
    resetTextBuffers();
    setSearchQueries([]);
    setSearchEntities([]);
    setSearchResultDocs([]);
    lastStreamInputRef.current = newInput;
    setStreamInput(newInput);
  }

  function dismissStreamError() {
    setStreamError(null);
    settleStream();
  }

  trpc.message.chat.useSubscription(
    streamInput && !isSessionCreating ? streamInput : skipToken,
    {
      onData(event) {
        clearTimeout(resumeTimerRef.current);
        handleStreamEvent(event);
      },
      onError: handleStreamError,
    },
  );

  // 세션 마운트 시 진행 중인 생성이 있으면 자동 재연결
  // 세션 복귀 시 isGenerating 상태를 항상 서버에서 받아와야 auto-resume 판단 가능
  const { data: session } = trpc.session.get.useQuery(
    { sessionId },
    { staleTime: 0 },
  );

  // render-phase setState: useEffect 대신 동기 실행하여 불필요한 idle 렌더 사이클을 방지한다.
  // React 공식 "Adjusting state based on props" 패턴.
  if (session?.isGenerating && streamingPhase === "idle" && !streamInput) {
    setStreamingPhase("text");
    setStreamStartedAt(new Date().toISOString());
    setStreamInput({ type: "resume", sessionId });
  }

  const isResuming = streamInput?.type === "resume";

  useEffect(
    function watchResumeTimeout() {
      if (!isResuming) {
        return;
      }
      resumeTimerRef.current = setTimeout(() => {
        Sentry.captureMessage("Stream resume timed out", {
          extra: { sessionId },
        });
        settleStream();
      }, RESUME_TIMEOUT_MS);
      return () => clearTimeout(resumeTimerRef.current);
    },
    [isResuming, sessionId, settleStream],
  );

  const send = useCallback(
    (content: string, mode: ChatMode) => {
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
      setSearchResultDocs([]);
      transitionPhase("text");

      const input: ChatStartInput = {
        type: "start",
        sessionId,
        content,
        mode,
        messageId,
      };
      lastStreamInputRef.current = input;
      setStreamInput(input);
    },
    [sessionId, utils, generateTitle],
  );

  const cancel = useCallback(
    function cancel() {
      cancelGenerationMutation.mutate({ sessionId });
      setStreamInput(null);
      settleStream();
    },
    [sessionId, cancelGenerationMutation, settleStream],
  );

  const streamingMessage = buildStreamingMessage({
    streamError,
    streamingPhase,
    streamStartedAt,
    streamingText,
    activePhase,
  });

  const contextValue: ChatLifecycleContextValue = {
    send,
    cancel,
    streamingPhase,
    streamingMessage,
    streamingDraftText,
    streamingRetrievalText,
    searchQueries,
    searchEntities,
    searchResultDocs,
    clearSearchResults: useCallback(function clearSearchResults() {
      setSearchResultDocs([]);
    }, []),
    streamError,
    retryStream,
    dismissStreamError,
  };

  return (
    <ChatLifecycleContext value={contextValue}>{children}</ChatLifecycleContext>
  );
}

export function useChatLifecycle() {
  const ctx = useContext(ChatLifecycleContext);
  if (!ctx) {
    throw new Error(
      "useChatLifecycle must be used within a ChatLifecycleProvider.",
    );
  }
  return ctx;
}
