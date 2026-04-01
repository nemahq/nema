import { useState } from "react";

import { ChevronDown, ChevronUp, FileText } from "@nema-io/weave/icons";

import { useChatLifecycle } from "@web/features/session/contexts/ChatLifecycleContext";
import { useTranslation } from "@web/lib/tolgee";

interface SearchResultsListProps {
  collapsible: boolean;
}

export function SearchResultsList({ collapsible }: SearchResultsListProps) {
  const { t } = useTranslation();
  const { searchResultDocs } = useChatLifecycle();
  const [expanded, setExpanded] = useState(!collapsible);
  const [wasCollapsible, setWasCollapsible] = useState(collapsible);

  if (collapsible !== wasCollapsible) {
    setWasCollapsible(collapsible);
    if (collapsible) {
      setExpanded(false);
    }
  }

  if (searchResultDocs.length === 0) {
    return null;
  }

  return (
    <div className="mb-3 animate-in fade-in rounded-lg bg-bg-secondary p-3 shadow-sm duration-normal">
      <button
        type="button"
        className="flex w-full items-center justify-between text-xs font-medium text-fg-secondary"
        onClick={() => setExpanded((prev) => !prev)}
        disabled={!collapsible}
      >
        <span>
          {t("session.status_search_results_title")} ({searchResultDocs.length})
        </span>
        {collapsible &&
          (expanded ? (
            <ChevronUp className="size-3.5 text-fg-tertiary" />
          ) : (
            <ChevronDown className="size-3.5 text-fg-tertiary" />
          ))}
      </button>
      {expanded && (
        <ul className="mt-2 space-y-1">
          {searchResultDocs.map((doc) => (
            <li
              key={doc.id}
              className="flex items-center gap-1.5 text-xs text-fg-tertiary"
            >
              <FileText className="size-3 shrink-0" />
              <span className="truncate">{doc.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
