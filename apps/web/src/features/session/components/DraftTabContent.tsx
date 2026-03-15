import { Suspense } from "react";

import { Button, Kbd } from "@nema-io/weave";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import { useChatStream } from "@web/features/session/contexts/ChatStreamContext";
import { useSaveDraft } from "@web/features/session/hooks/useSaveDraft";
import { useSessionDraft } from "@web/features/session/hooks/useSessionDraft";
import { useSessionId } from "@web/features/session/hooks/useSessionId";
import { useBufferedStream } from "@web/hooks/useBufferedStream";
import { useTranslation } from "@web/lib/tolgee";

import { MarkdownRenderer } from "./MarkdownRenderer";

function DraftTabContentInner() {
  const { t } = useTranslation();
  const sessionId = useSessionId();
  const draft = useSessionDraft({ sessionId });
  const saveDraft = useSaveDraft({ sessionId });
  const { streamingPhase, streamingDraftText } = useChatStream();

  const isStreaming = streamingPhase === "draft";
  const smoothText = useBufferedStream(isStreaming ? streamingDraftText : "");
  const body = isStreaming ? smoothText : draft?.body;

  return (
    <div className="relative">
      {!isStreaming && body && (
        <div className="absolute right-0 top-0">
          {/* TODO: ⌘+S 키보드 단축키 리스너 추가 */}
          <Button
            variant="primary"
            size="xs"
            onClick={() => saveDraft.mutate({ sessionId })}
            disabled={saveDraft.isPending}
            className="gap-1 dark:bg-fg-primary dark:text-surface-base dark:border-transparent dark:hover:opacity-80"
          >
            {t("session.draft_save")}
            <Kbd className="border-white/20 bg-white/10 text-inherit opacity-80">
              ⌘+S
            </Kbd>
          </Button>
        </div>
      )}
      <div className="pt-10">
        {body ? <MarkdownRenderer content={body} /> : null}
      </div>
    </div>
  );
}

export function DraftTabContent() {
  return (
    // TODO: ErrorBoundary에 componentDidCatch (Sentry 보고) + 의미 있는 fallback UI 추가
    <ErrorBoundary fallback={null}>
      <Suspense>
        <DraftTabContentInner />
      </Suspense>
    </ErrorBoundary>
  );
}
