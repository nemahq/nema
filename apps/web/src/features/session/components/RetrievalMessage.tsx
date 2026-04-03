import { Suspense } from "react";

import { Button } from "@nema-io/weave";
import { FileText, Search } from "@nema-io/weave/icons";

import { useChatLifecycle } from "@web/features/session/contexts/ChatLifecycleContext";
import { useSessionId } from "@web/features/session/hooks/useSessionId";
import { useSessionSuspenseQuery } from "@web/features/session/hooks/useSessionQuery";
import { useTranslation } from "@web/lib/tolgee";

import { StatusIndicator } from "./StatusIndicator";

const MAX_VISIBLE_ENTITIES = 2;

interface RetrievalMessageProps {
  retrievalId: string | null;
  content: string;
  query: string;
  onOpenTab?: (retrievalId: string) => void;
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

interface QueryHeaderProps {
  query: string;
}

function QueryHeader({ query }: QueryHeaderProps) {
  return (
    <div className="flex items-start gap-2">
      <Search className="mt-0.5 size-4 shrink-0 text-fg-tertiary" aria-hidden />
      <span className="line-clamp-2 text-sm text-fg-secondary">
        &ldquo;{query}&rdquo;
      </span>
    </div>
  );
}

function RetrievalMessageInner({
  retrievalId,
  content,
  query,
  onOpenTab,
}: RetrievalMessageProps) {
  const { t } = useTranslation();
  const { streamingPhase, searchEntities, searchResultDocs } =
    useChatLifecycle();
  const sessionId = useSessionId();
  const [session] = useSessionSuspenseQuery({ sessionId });

  const isStreaming = retrievalId === null;
  const retrieval = isStreaming
    ? null
    : (session.retrievals.find((r) => r.id === retrievalId) ?? null);
  const isRetrievalLoading = !isStreaming && retrieval === null;
  const docCount = isStreaming
    ? searchResultDocs.length
    : (retrieval?.documents.length ?? 0);

  return (
    <div className="space-y-1.5 rounded-xl bg-bg-secondary p-3 shadow-sm">
      <QueryHeader query={query} />

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

      {!isStreaming && !isRetrievalLoading && docCount === 0 && (
        <p className="text-xs text-fg-tertiary">
          {t("session.retrieval_no_results")}
        </p>
      )}

      {!isStreaming && !isRetrievalLoading && docCount > 0 && (
        <>
          <div className="flex items-center gap-1.5 text-xs text-fg-tertiary">
            <FileText className="size-3 shrink-0" aria-hidden />
            <span className="truncate">
              {t("session.retrieval_doc_count", { count: docCount })} &middot;{" "}
              {content}
            </span>
          </div>
          {onOpenTab && retrievalId && (
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="xs"
                onClick={() => onOpenTab(retrievalId)}
              >
                {t("session.retrieval_open_tab")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function RetrievalMessage(props: RetrievalMessageProps) {
  return (
    <Suspense
      fallback={
        <div className="space-y-1.5 rounded-xl bg-bg-secondary p-3 shadow-sm">
          <QueryHeader query={props.query} />
        </div>
      }
    >
      <RetrievalMessageInner {...props} />
    </Suspense>
  );
}
