import "./searching-pulse.css";

import { Suspense } from "react";

import { Search } from "@nema-io/weave/icons";

import { useChatLifecycle } from "@web/features/session/contexts/ChatLifecycleContext";
import { useSessionId } from "@web/features/session/hooks/useSessionId";
import { useSessionSuspenseQuery } from "@web/features/session/hooks/useSessionQuery";
import { useBufferedStream } from "@web/hooks/useBufferedStream";

import { MarkdownRenderer } from "./MarkdownRenderer";
import { SearchResultsList } from "./SearchResultsList";
import { StreamErrorMessage } from "./StreamErrorMessage";
import { WritingCursor } from "./WritingCursor";

const SEARCHING_PULSE_STYLE = {
  animation: "searching-pulse 1.4s ease-in-out infinite",
};

function SearchingIndicator() {
  return (
    <Search
      className="size-5 text-fg-secondary"
      style={SEARCHING_PULSE_STYLE}
      aria-hidden
    />
  );
}

function RetrievalTabContentInner() {
  const sessionId = useSessionId();
  const [session] = useSessionSuspenseQuery({ sessionId });
  const retrieval = session.retrieval;
  const { streamingPhase, streamingRetrievalText, streamError } =
    useChatLifecycle();

  const isSearching = streamingPhase === "searching";
  const isStreaming = streamingPhase === "retrieval";
  const smoothText = useBufferedStream(
    isStreaming ? streamingRetrievalText : "",
  );
  const body = isStreaming ? smoothText : retrieval?.body;

  return (
    <div>
      <SearchResultsList />
      {isSearching && !streamError && <SearchingIndicator />}
      {body && <MarkdownRenderer content={body} />}
      {!body && isStreaming && !streamError && <WritingCursor />}
      {(streamingPhase === "retrieval" || streamingPhase === "searching") && (
        <StreamErrorMessage />
      )}
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
