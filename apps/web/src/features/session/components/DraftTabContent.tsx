import { Suspense } from "react";

import { Button, Kbd } from "@nema-io/weave";

import { useChatLifecycle } from "@web/features/session/contexts/ChatLifecycleContext";
import { useCancelDraft } from "@web/features/session/hooks/useCancelDraft";
import { useSaveDraft } from "@web/features/session/hooks/useSaveDraft";
import { useSessionId } from "@web/features/session/hooks/useSessionId";
import { useSessionSuspenseQuery } from "@web/features/session/hooks/useSessionQuery";
import { useBufferedStream } from "@web/hooks/useBufferedStream";
import { formatKeySegments } from "@web/lib/command/shortcut/formatKey";
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
  const saveDraft = useSaveDraft({ sessionId });
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
  // Esc가 stream.stop과 draft.cancel에 동시 바인딩되어 있어
  // 스트리밍 중 draft.cancel이 활성화되면 Esc 한 번에 두 액션이 모두 발동한다.
  const canCancel = canAct && streamingPhase === "idle";

  useRegisterAction("draft.save", {
    execute: () => saveDraft.mutate({ sessionId }),
    enabled: canAct && !saveDraft.isPending,
  });

  useRegisterAction("draft.cancel", {
    execute: () => cancelDraft.mutate({ sessionId }),
    enabled: canCancel && !cancelDraft.isPending,
  });

  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        {body && <MarkdownRenderer content={body} />}
        {!body && isDraftStreaming && !streamError && <WritingCursor />}
        {streamingPhase === "draft" && <StreamErrorMessage />}
      </div>

      {!isDraftStreaming && body && (
        <div className="sticky top-0 shrink-0">
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => cancelDraft.mutate({ sessionId })}
              disabled={!canCancel || cancelDraft.isPending}
            >
              {t("common.cancel")}
              <Kbd>Esc</Kbd>
            </Button>
            <Button
              variant="primary"
              size="xs"
              onClick={() => saveDraft.mutate({ sessionId })}
              disabled={!canAct || saveDraft.isPending}
            >
              {t("session.draft_save")}
              {formatKeySegments("mod+s").map((key) => (
                <Kbd key={key}>{key}</Kbd>
              ))}
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
