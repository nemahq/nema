import { Suspense } from "react";

import { Button, Kbd } from "@nema-io/weave";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import { useChatStream } from "@web/features/session/contexts/ChatStreamContext";
import { useDismissRetrieval } from "@web/features/session/hooks/useDismissRetrieval";
import { useSessionId } from "@web/features/session/hooks/useSessionId";
import { useSessionRetrieval } from "@web/features/session/hooks/useSessionRetrieval";
import { useBufferedStream } from "@web/hooks/useBufferedStream";
import { useRegisterAction } from "@web/lib/command/shortcut/useRegisterAction";
import { useTranslation } from "@web/lib/tolgee";

import { MarkdownRenderer } from "./MarkdownRenderer";
import { WritingCursor } from "./WritingCursor";

function RetrievalTabContentInner() {
  const { t } = useTranslation();
  const sessionId = useSessionId();
  const retrieval = useSessionRetrieval({ sessionId });
  const dismissRetrieval = useDismissRetrieval({ sessionId });
  const { streamingPhase, streamingRetrievalText } = useChatStream();

  const isStreaming = streamingPhase === "retrieval";
  const smoothText = useBufferedStream(
    isStreaming ? streamingRetrievalText : "",
  );
  const body = isStreaming ? smoothText : retrieval?.body;

  const canAct = streamingPhase === "idle" && !!body;

  useRegisterAction("retrieval.dismiss", {
    execute: () => dismissRetrieval.mutate({ sessionId }),
    enabled: canAct && !dismissRetrieval.isPending,
  });

  return (
    <div className="relative">
      {!isStreaming && body && (
        <div className="absolute right-0 top-0 flex gap-2">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => dismissRetrieval.mutate({ sessionId })}
            disabled={dismissRetrieval.isPending}
          >
            {t("common.close")}
            <Kbd>Esc</Kbd>
          </Button>
        </div>
      )}
      <div className="pt-10">
        {body && <MarkdownRenderer content={body} />}
        {!body && isStreaming && <WritingCursor />}
      </div>
    </div>
  );
}

export function RetrievalTabContent() {
  return (
    <ErrorBoundary fallback={null}>
      <Suspense>
        <RetrievalTabContentInner />
      </Suspense>
    </ErrorBoundary>
  );
}
