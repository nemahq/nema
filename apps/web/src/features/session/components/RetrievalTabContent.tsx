import { Suspense } from "react";

import { useSessionId } from "@web/features/session/hooks/useSessionId";
import { useSessionSuspenseQuery } from "@web/features/session/hooks/useSessionQuery";

import { MarkdownRenderer } from "./MarkdownRenderer";
import { SearchResultsList } from "./SearchResultsList";

interface RetrievalTabContentProps {
  retrievalId: string;
}

function RetrievalTabContentInner({ retrievalId }: RetrievalTabContentProps) {
  const sessionId = useSessionId();
  const [session] = useSessionSuspenseQuery({ sessionId });
  const retrieval = session.retrievals.find((r) => r.id === retrievalId);

  if (!retrieval) {
    return null;
  }

  return (
    <div>
      <SearchResultsList documents={retrieval.documents} />
      {retrieval.body && <MarkdownRenderer content={retrieval.body} />}
    </div>
  );
}

export function RetrievalTabContent({ retrievalId }: RetrievalTabContentProps) {
  return (
    <Suspense>
      <RetrievalTabContentInner retrievalId={retrievalId} />
    </Suspense>
  );
}
