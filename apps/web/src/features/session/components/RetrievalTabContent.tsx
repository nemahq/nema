import { Suspense } from "react";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import { SectionErrorFallback } from "@web/app/error/SectionErrorFallback";
import { useChatStream } from "@web/features/session/contexts/ChatStreamContext";
import { useSessionId } from "@web/features/session/hooks/useSessionId";
import { useSessionRetrieval } from "@web/features/session/hooks/useSessionRetrieval";
import { useBufferedStream } from "@web/hooks/useBufferedStream";

import { MarkdownRenderer } from "./MarkdownRenderer";
import { StreamErrorMessage } from "./StreamErrorMessage";
import { WritingCursor } from "./WritingCursor";

function RetrievalTabContentInner() {
  const sessionId = useSessionId();
  const retrieval = useSessionRetrieval({ sessionId });
  const {
    streamingPhase,
    streamingRetrievalText,
    streamError,
    retryStream,
    dismissStreamError,
  } = useChatStream();

  const isStreaming = streamingPhase === "retrieval";
  const smoothText = useBufferedStream(
    isStreaming ? streamingRetrievalText : "",
  );
  const body = isStreaming ? smoothText : retrieval?.body;

  return (
    <div>
      {body && <MarkdownRenderer content={body} />}
      {!body && isStreaming && !streamError && <WritingCursor />}
      {streamError && streamingPhase === "retrieval" && (
        <StreamErrorMessage
          message={streamError}
          onRetry={retryStream}
          onDismiss={dismissStreamError}
        />
      )}
    </div>
  );
}

export function RetrievalTabContent() {
  return (
    <ErrorBoundary
      boundaryName="retrieval-tab"
      fallbackRender={(props) => <SectionErrorFallback {...props} />}
    >
      <Suspense>
        <RetrievalTabContentInner />
      </Suspense>
    </ErrorBoundary>
  );
}
