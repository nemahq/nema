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

  const isStreaming = streamingPhase === "draft";
  const smoothText = useBufferedStream(isStreaming ? streamingDraftText : "");
  const body = isStreaming ? smoothText : draft?.body;

  const canAct = streamingPhase === "idle" && !!body && !pendingConfirmation;

  useRegisterAction("draft.save", {
    execute: () => saveDraft.mutate({ sessionId }),
    enabled: canAct && !saveDraft.isPending,
  });

  useRegisterAction("draft.cancel", {
    execute: () => cancelDraft.mutate({ sessionId }),
    enabled: canAct && !cancelDraft.isPending,
  });

  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        {body && <MarkdownRenderer content={body} />}
        {!body && isStreaming && !streamError && <WritingCursor />}
        {streamingPhase === "draft" && <StreamErrorMessage />}
      </div>

      {!isStreaming && body && (
        <div className="sticky top-0 shrink-0">
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => cancelDraft.mutate({ sessionId })}
              disabled={!canAct || cancelDraft.isPending}
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
