import { Suspense } from "react";

import { useChatStream } from "@web/features/session/contexts/ChatStreamContext";
import { useSessionId } from "@web/features/session/hooks/useSessionId";
import { useSessionSuspenseQuery } from "@web/features/session/hooks/useSessionQuery";
import { useBufferedStream } from "@web/hooks/useBufferedStream";

import { MarkdownRenderer } from "./MarkdownRenderer";
import { StreamErrorMessage } from "./StreamErrorMessage";
import { WritingCursor } from "./WritingCursor";

function RetrievalTabContentInner() {
  const sessionId = useSessionId();
  const [retrieval] = useSessionSuspenseQuery(
    { sessionId },
    { select: (session) => session.retrieval },
  );
  const { streamingPhase, streamingRetrievalText, streamError } =
    useChatStream();

  const isStreaming = streamingPhase === "retrieval";
  const smoothText = useBufferedStream(
    isStreaming ? streamingRetrievalText : "",
  );
  const body = isStreaming ? smoothText : retrieval?.body;

  return (
    <div>
      {body && <MarkdownRenderer content={body} />}
      {!body && isStreaming && !streamError && <WritingCursor />}
      {streamingPhase === "retrieval" && <StreamErrorMessage />}
    </div>
  );
}

export function RetrievalTabContent() {
  return (
    <Suspense>
      <RetrievalTabContentInner />
    </Suspense>
  );
}
