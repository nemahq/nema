import { Suspense } from "react";

import { Button, Kbd, TextShimmer } from "@nema-io/weave";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import { useChatStream } from "@web/features/session/contexts/ChatStreamContext";
import { useCancelDraft } from "@web/features/session/hooks/useCancelDraft";
import { useSaveDraft } from "@web/features/session/hooks/useSaveDraft";
import { useSessionDraft } from "@web/features/session/hooks/useSessionDraft";
import { useSessionId } from "@web/features/session/hooks/useSessionId";
import { useBufferedStream } from "@web/hooks/useBufferedStream";
import { formatKeySegments } from "@web/lib/command/shortcut/formatKey";
import { useRegisterAction } from "@web/lib/command/shortcut/useRegisterAction";
import { useTranslation } from "@web/lib/tolgee";

import { MarkdownRenderer } from "./MarkdownRenderer";

function DraftTabContentInner() {
  const { t } = useTranslation();
  const sessionId = useSessionId();
  const draft = useSessionDraft({ sessionId });
  const saveDraft = useSaveDraft({ sessionId });
  const cancelDraft = useCancelDraft({ sessionId });
  const { streamingPhase, streamingDraftText } = useChatStream();

  const isStreaming = streamingPhase === "draft";
  const smoothText = useBufferedStream(isStreaming ? streamingDraftText : "");
  const body = isStreaming ? smoothText : draft?.body;

  const canAct = streamingPhase === "idle" && !!body;

  useRegisterAction("draft.save", {
    execute: () => saveDraft.mutate({ sessionId }),
    enabled: canAct && !saveDraft.isPending,
  });

  useRegisterAction("draft.cancel", {
    execute: () => cancelDraft.mutate({ sessionId }),
    enabled: canAct && !cancelDraft.isPending,
  });

  return (
    <div className="relative">
      {!isStreaming && body && (
        <div className="absolute right-0 top-0 flex gap-2">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => cancelDraft.mutate({ sessionId })}
            disabled={cancelDraft.isPending}
          >
            {t("common.cancel")}
            <Kbd>Esc</Kbd>
          </Button>
          <Button
            variant="primary"
            size="xs"
            onClick={() => saveDraft.mutate({ sessionId })}
            disabled={saveDraft.isPending}
          >
            {t("session.draft_save")}
            {formatKeySegments("mod+s").map((key) => (
              <Kbd key={key}>{key}</Kbd>
            ))}
          </Button>
        </div>
      )}
      <div className="pt-10">
        {body ? (
          <MarkdownRenderer content={body} />
        ) : isStreaming ? (
          <TextShimmer />
        ) : null}
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
