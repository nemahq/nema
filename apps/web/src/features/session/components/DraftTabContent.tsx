import { Suspense } from "react";

import { Button, Kbd } from "@nema-io/weave";

import { useChatLifecycle } from "@web/features/session/contexts/ChatLifecycleContext";
import { useCancelDraft } from "@web/features/session/hooks/useCancelDraft";
import { useSessionId } from "@web/features/session/hooks/useSessionId";
import { useSessionSuspenseQuery } from "@web/features/session/hooks/useSessionQuery";
import { useBufferedStream } from "@web/hooks/useBufferedStream";
import { useRegisterAction } from "@web/lib/command/shortcut/useRegisterAction";
import { useTranslation } from "@web/lib/tolgee";

import { MarkdownRenderer } from "./MarkdownRenderer";
import { StreamErrorMessage } from "./StreamErrorMessage";
import { WritingCursor } from "./WritingCursor";

function DraftTabContentInner() {
  const { t } = useTranslation();
  const sessionId = useSessionId();
  const [session] = useSessionSuspenseQuery({ sessionId });
  const draft = session.draft;
  const cancelDraft = useCancelDraft({ sessionId });
  const {
    streamingPhase,
    streamingDraftText,
    streamError,
    pendingConfirmation,
  } = useChatLifecycle();

  const isDraftStreaming = streamingPhase === "draft";
  const smoothText = useBufferedStream(
    isDraftStreaming ? streamingDraftText : "",
  );
  const body = isDraftStreaming ? smoothText : draft?.body;

  const canAct = !isDraftStreaming && !!body && !pendingConfirmation;

  // 저장 버튼·단축키는 v1 저장 파이프와 함께 철거 — 넣기 엔진(v2)이 새 저장 흐름을 단다

  const { isShortcutOverridden: isCancelOverridden } = useRegisterAction(
    "draft.cancel",
    {
      execute: () => cancelDraft.mutate({ sessionId }),
      enabled: canAct && !cancelDraft.isPending,
    },
  );

  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        {body && <MarkdownRenderer content={body} />}
        {!body && isDraftStreaming && !streamError && <WritingCursor />}
        {isDraftStreaming && <StreamErrorMessage />}
      </div>

      {!isDraftStreaming && body && (
        <div className="sticky top-0 shrink-0">
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => cancelDraft.mutate({ sessionId })}
              disabled={!canAct || cancelDraft.isPending || isCancelOverridden}
            >
              {t("common.cancel")}
              <Kbd>Esc</Kbd>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function DraftTabContent() {
  return (
    <Suspense>
      <DraftTabContentInner />
    </Suspense>
  );
}
