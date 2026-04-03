import { Suspense } from "react";

import { cn } from "@nema-io/weave";
import { FileText, PanelRight, Search } from "@nema-io/weave/icons";

import { useChatLifecycle } from "@web/features/session/contexts/ChatLifecycleContext";
import { useContentTab } from "@web/features/session/contexts/ContentTabContext";
import { useSessionId } from "@web/features/session/hooks/useSessionId";
import { useSessionSuspenseQuery } from "@web/features/session/hooks/useSessionQuery";
import { useTranslation } from "@web/lib/tolgee";

import { StatusIndicator } from "./StatusIndicator";

const MAX_VISIBLE_ENTITIES = 2;

interface RetrievalMessageProps {
  retrievalId: string | null;
  content: string;
  query: string;
}

function formatSearchingLabel(
  entities: string[],
  t: ReturnType<typeof useTranslation>["t"],
): string {
  if (entities.length === 0) {
    return t("session.status_searching");
  }
  const visible = entities.slice(0, MAX_VISIBLE_ENTITIES).join(", ");
  const overflow = entities.length - MAX_VISIBLE_ENTITIES;
  const formatted =
    overflow > 0
      ? `${visible} ${t("common.overflow_count", { count: overflow })}`
      : visible;
  return t("session.status_searching_with_entities", { entities: formatted });
}

function RetrievalMessageInner({
  retrievalId,
  content,
  query,
}: RetrievalMessageProps) {
  const { t } = useTranslation();
  const { streamingPhase, searchEntities, searchResultDocs } =
    useChatLifecycle();
  const { openRetrievalTabs, openRetrievalTab, closeRetrievalTab, tabOrder } =
    useContentTab();
  const sessionId = useSessionId();
  const [session] = useSessionSuspenseQuery({ sessionId });

  const isStreaming = retrievalId === null;
  const retrieval = isStreaming
    ? null
    : (session.retrievals.find((r) => r.id === retrievalId) ?? null);
  const isRetrievalLoading = !isStreaming && retrieval === null;
  const docCount = isStreaming
    ? searchResultDocs.length
    : (retrieval?.documents.length ?? searchResultDocs.length);

  const isTabOpen = retrievalId !== null && openRetrievalTabs.has(retrievalId);
  const canToggleTab = !isStreaming && !isRetrievalLoading && docCount > 0;
  const tabIndex = isTabOpen
    ? tabOrder.indexOf(`retrieval-${retrievalId}`) + 1
    : 0;

  function handleToggleTab() {
    if (!retrievalId) {
      return;
    }
    if (isTabOpen) {
      closeRetrievalTab(retrievalId);
    } else {
      openRetrievalTab(retrievalId);
    }
  }

  return (
    <div className="space-y-1.5 rounded-r-xl border-l-2 border-l-brand bg-surface-card p-3 shadow-sm dark:bg-surface-raised">
      <div className="flex items-start gap-2">
        <Search
          className="mt-0.5 size-4 shrink-0 text-fg-tertiary"
          aria-hidden
        />
        <span className="line-clamp-2 flex-1 text-sm text-fg-secondary">
          &ldquo;{query}&rdquo;
        </span>
        {canToggleTab && (
          <button
            type="button"
            onClick={handleToggleTab}
            className={cn(
              "relative shrink-0 rounded p-0.5 transition-colors",
              isTabOpen
                ? "text-amber-600 dark:text-amber-500"
                : "text-fg-quaternary hover:text-fg-secondary",
            )}
            aria-label={t(
              isTabOpen
                ? "session.retrieval_close_tab"
                : "session.retrieval_open_tab",
            )}
          >
            <PanelRight className="size-4" />
            {tabIndex > 0 && (
              <span className="absolute -right-1 -top-1 flex size-3.5 items-center justify-center rounded-full bg-amber-600 text-[9px] font-bold leading-none text-white dark:bg-amber-500">
                {tabIndex}
              </span>
            )}
          </button>
        )}
      </div>

      {isStreaming && streamingPhase === "searching" && (
        <StatusIndicator
          label={formatSearchingLabel(searchEntities, t)}
          status="in-progress"
        />
      )}

      {isStreaming && streamingPhase === "retrieval" && (
        <>
          {docCount > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-fg-tertiary">
              <FileText className="size-3 shrink-0" aria-hidden />
              <span>
                {t("session.retrieval_doc_count", { count: docCount })}
              </span>
            </div>
          )}
          <StatusIndicator
            label={t("session.retrieval_generating")}
            status="in-progress"
          />
        </>
      )}

      {!isStreaming && docCount > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-fg-tertiary">
          <FileText className="size-3 shrink-0" aria-hidden />
          <span>{t("session.retrieval_doc_count", { count: docCount })}</span>
        </div>
      )}

      {!isStreaming && content && (
        <p className="line-clamp-2 text-xs text-fg-tertiary">{content}</p>
      )}
    </div>
  );
}

export function RetrievalMessage(props: RetrievalMessageProps) {
  return (
    <Suspense
      fallback={
        <div className="space-y-1.5 rounded-r-xl border-l-2 border-l-brand bg-surface-card p-3 shadow-sm dark:bg-surface-raised">
          <div className="flex items-start gap-2">
            <Search
              className="mt-0.5 size-4 shrink-0 text-fg-tertiary"
              aria-hidden
            />
            <span className="line-clamp-2 flex-1 text-sm text-fg-secondary">
              &ldquo;{props.query}&rdquo;
            </span>
          </div>
        </div>
      }
    >
      <RetrievalMessageInner {...props} />
    </Suspense>
  );
}
