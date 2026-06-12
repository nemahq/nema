import { useChatLifecycle } from "@web/features/session/contexts/ChatLifecycleContext";
import { useBufferedStream } from "@web/hooks/useBufferedStream";
import { useTranslation } from "@web/lib/tolgee";

import { MarkdownRenderer } from "./MarkdownRenderer";
import { SearchResultsList } from "./SearchResultsList";
import { StatusIndicator } from "./StatusIndicator";
import { WritingCursor } from "./WritingCursor";

export function StreamingRetrievalTabContent() {
  const { t } = useTranslation();
  const {
    streamingPhase,
    streamingRetrievalText,
    searchResultDocs,
    searchEntities,
  } = useChatLifecycle();

  const isRetrieval = streamingPhase === "retrieval";
  const smoothText = useBufferedStream(
    isRetrieval ? streamingRetrievalText : "",
  );

  return (
    <div>
      {streamingPhase === "searching" && (
        <StatusIndicator
          label={
            searchEntities.length > 0
              ? t("session.status_searching_with_entities", {
                  entities: searchEntities.join(", "),
                })
              : t("session.status_searching")
          }
          status="in-progress"
        />
      )}
      <SearchResultsList documents={searchResultDocs} />
      {isRetrieval &&
        (smoothText ? (
          <MarkdownRenderer content={smoothText} />
        ) : (
          <WritingCursor />
        ))}
    </div>
  );
}
