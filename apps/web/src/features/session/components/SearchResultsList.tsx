import type { SearchResultDoc } from "@nema-io/shared";
import { Text } from "@nema-io/weave";
import { FileText } from "@nema-io/weave/icons";

import { useTranslation } from "@web/lib/tolgee";

interface SearchResultsListProps {
  documents: SearchResultDoc[];
}

export function SearchResultsList({ documents }: SearchResultsListProps) {
  const { t } = useTranslation();

  if (documents.length === 0) {
    return null;
  }

  return (
    <div className="mb-3 rounded-lg border border-border/40 bg-surface-card p-3 shadow-sm">
      <Text as="span" size="xs" bold color="secondary">
        {t("session.status_search_results_title")} ({documents.length})
      </Text>
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
