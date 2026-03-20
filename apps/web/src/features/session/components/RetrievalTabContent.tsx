import { Suspense } from "react";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import { useChatStream } from "@web/features/session/contexts/ChatStreamContext";
import { useSessionId } from "@web/features/session/hooks/useSessionId";
import { useSessionRetrieval } from "@web/features/session/hooks/useSessionRetrieval";
import { useBufferedStream } from "@web/hooks/useBufferedStream";

import { MarkdownRenderer } from "./MarkdownRenderer";
import { WritingCursor } from "./WritingCursor";

function RetrievalTabContentInner() {
  const sessionId = useSessionId();
  const retrieval = useSessionRetrieval({ sessionId });
  const { streamingPhase, streamingRetrievalText } = useChatStream();

  const isStreaming = streamingPhase === "retrieval";
  const smoothText = useBufferedStream(
    isStreaming ? streamingRetrievalText : "",
  );
  const body = isStreaming ? smoothText : retrieval?.body;

  return (
    <div>
      {body && <MarkdownRenderer content={body} />}
      {!body && isStreaming && <WritingCursor />}
    </div>
  );
}

export function RetrievalTabContent() {
  return (
    <ErrorBoundary fallback={null}>
      <Suspense>
        <RetrievalTabContentInner />
      </Suspense>
    </ErrorBoundary>
  );
}
