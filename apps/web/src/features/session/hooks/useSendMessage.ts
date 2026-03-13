import { useCallback, useRef, useState } from "react";
import { skipToken } from "@tanstack/react-query";

import type { ChatStreamEvent, Message } from "@nema-io/shared";

import { useTrackEvent } from "@web/hooks/useTrackEvent";
import { trpc } from "@web/lib/trpc";

interface StreamState {
  sessionId: string;
  content: string;
}

export function useSendMessage({ sessionId }: { sessionId: string }) {
  const utils = trpc.useUtils();
  const trackEvent = useTrackEvent();

  const [streamInput, setStreamInput] = useState<StreamState | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const fullTextRef = useRef("");

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
          break;
      }
    },
    [sessionId, utils],
  );

  const handleError = useCallback(() => {
    setStreamInput(null);
    setIsStreaming(false);
    setStreamingText("");
    fullTextRef.current = "";
    utils.message.list.invalidate({ sessionId });
  }, [sessionId, utils]);

  trpc.message.chat.useSubscription(streamInput ?? skipToken, {
    onData: handleData,
    onError: handleError,
  });

  const send = useCallback(
    (content: string) => {
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
      setStreamingText("");
      setIsStreaming(true);
      setStreamInput({ sessionId, content });
    },
    [sessionId, trackEvent, utils],
  );

  const cancel = useCallback(() => {
    setStreamInput(null);
    setIsStreaming(false);
    setStreamingText("");
    fullTextRef.current = "";
  }, []);

  return { send, cancel, isStreaming, streamingText };
}
