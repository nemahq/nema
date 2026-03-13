import { useMemo } from "react";
import { useParams } from "@tanstack/react-router";

import type { Message } from "@nema-io/shared";

import { ChatInput } from "@web/features/session/components/ChatInput";
import { DraftPanel } from "@web/features/session/components/DraftPanel";
import { MessageList } from "@web/features/session/components/MessageList";
import { useDraftActions } from "@web/features/session/hooks/useDraftActions";
import { useSendMessage } from "@web/features/session/hooks/useSendMessage";
import { useSessionDraft } from "@web/features/session/hooks/useSessionDraft";
import { useTranslation } from "@web/lib/tolgee";

const STREAMING_MESSAGE_ID = "streaming";

export function ChatPage() {
  const { t } = useTranslation();
  const { sessionId } = useParams({
    from: "/_authenticated/_sidebar/context/$sessionId",
  });

  const { send, isStreaming, streamingText, streamStartedAt } = useSendMessage({
    sessionId,
  });
  const draft = useSessionDraft({ sessionId });
  const draftActions = useDraftActions({ sessionId });

  const streamingMessage = useMemo<Message | undefined>(() => {
    if (!isStreaming || !streamingText) {
      return undefined;
    }

    return {
      id: STREAMING_MESSAGE_ID,
      role: "assistant",
      type: "text",
      content: streamingText,
      createdAt: streamStartedAt,
    };
  }, [isStreaming, streamingText, streamStartedAt]);

  const isPending =
    isStreaming ||
    draftActions.save.isPending ||
    draftActions.cancel.isPending;

  function handleSubmit(content: string) {
    send(content);
  }

  return (
    <div className="flex flex-1 min-w-0">
      <main className="flex flex-1 flex-col bg-surface-card min-w-0">
        <MessageList
          sessionId={sessionId}
          streamingMessage={streamingMessage}
        />
        <div className="mx-auto w-full max-w-2xl px-6 pb-6 pt-2">
          <ChatInput
            placeholder={t("session.input_placeholder")}
            disabled={isPending}
            onSubmit={handleSubmit}
          />
        </div>
      </main>

      {draft && (
        <DraftPanel
          draft={draft}
          onSave={() => draftActions.save.mutate({ sessionId })}
          onCancel={() => draftActions.cancel.mutate({ sessionId })}
          isPending={draftActions.save.isPending}
        />
      )}
    </div>
  );
}
