import { useMemo } from "react";
import { useParams } from "@tanstack/react-router";

import type { Message } from "@nema-io/shared";

import { ChatInput } from "@web/features/session/components/ChatInput";
import { DraftPanelSection } from "@web/features/session/components/DraftPanelSection";
import { MessageList } from "@web/features/session/components/MessageList";
import { useCancelDraft } from "@web/features/session/hooks/useCancelDraft";
import { useSaveDraft } from "@web/features/session/hooks/useSaveDraft";
import { useSendMessage } from "@web/features/session/hooks/useSendMessage";
import { useTranslation } from "@web/lib/tolgee";

const STREAMING_MESSAGE_ID = "streaming";

export function ContextPage() {
  const { t } = useTranslation();
  const { sessionId } = useParams({
    from: "/_authenticated/_sidebar/context/$sessionId",
  });

  const { send, isStreaming, streamingText, streamStartedAt } = useSendMessage({
    sessionId,
  });
  const saveDraft = useSaveDraft({ sessionId });
  const cancelDraft = useCancelDraft({ sessionId });

  const streamingMessage = useMemo<Message | undefined>(() => {
    if (!isStreaming || !streamingText) {
      return undefined;
    }

    // TODO: 서버에서 draft_start 이벤트를 보내 스트리밍 중에도 DraftCard로 렌더하고,
    // 사이드 패널에서 직접 스트리밍 표시. 완료 시 채팅에 DraftCard 삽입.
    // 취소된 드래프트는 접힌 상태 + "취소됨" 라벨로 이력 유지.
    return {
      id: STREAMING_MESSAGE_ID,
      role: "assistant",
      type: "text",
      content: streamingText,
      createdAt: streamStartedAt,
    };
  }, [isStreaming, streamingText, streamStartedAt]);

  const isPending = isStreaming || saveDraft.isPending || cancelDraft.isPending;

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

      <DraftPanelSection
        sessionId={sessionId}
        saveDraft={saveDraft}
        cancelDraft={cancelDraft}
      />
    </div>
  );
}
