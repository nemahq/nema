import { FileText } from "@nema-io/weave/icons";

import { useChatLifecycle } from "@web/features/session/contexts/ChatLifecycleContext";
import { useSessionId } from "@web/features/session/hooks/useSessionId";
import { useSessionSuspenseQuery } from "@web/features/session/hooks/useSessionQuery";
import { useTranslation } from "@web/lib/tolgee";

export function SearchResultsList() {
  const { t } = useTranslation();
  const { searchResultDocs } = useChatLifecycle();
  const sessionId = useSessionId();
  const [session] = useSessionSuspenseQuery({ sessionId });

  const documents =
    searchResultDocs.length > 0
      ? searchResultDocs
      : (session.retrieval?.documents ?? []);

  if (documents.length === 0) {
    return null;
  }

  return (
    <div className="mb-3 animate-in fade-in rounded-lg bg-bg-secondary p-3 shadow-sm duration-normal">
      <span className="text-xs font-medium text-fg-secondary">
        {t("session.status_search_results_title")} ({documents.length})
      </span>
      <ul className="mt-2 space-y-1">
        {documents.map((doc) => (
          <li
            key={doc.id}
            className="flex items-center gap-1.5 text-xs text-fg-tertiary"
          >
            <FileText className="size-3 shrink-0" />
            <span className="truncate">{doc.title}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
