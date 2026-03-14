import { useMemo } from "react";
import { useIsMutating } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";

import type { Message } from "@nema-io/shared";

import { ChatInput } from "@web/features/session/components/ChatInput";
import { MessageList } from "@web/features/session/components/MessageList";
import { SessionSidePanel } from "@web/features/session/components/SessionSidePanel";
import { useSendMessage } from "@web/features/session/hooks/useSendMessage";
import { useSessionId } from "@web/features/session/hooks/useSessionId";
import { useTranslation } from "@web/lib/tolgee";
import { trpc } from "@web/lib/trpc";

const STREAMING_MESSAGE_ID = "streaming";

export function SessionPage() {
  const { t } = useTranslation();
  const sessionId = useSessionId();

  const { send, isStreaming, streamingText, streamStartedAt } = useSendMessage({
    sessionId,
  });

  const saveDraftMutating = useIsMutating({
    mutationKey: getQueryKey(trpc.message.saveDraft),
  });
  const cancelDraftMutating = useIsMutating({
    mutationKey: getQueryKey(trpc.message.cancelDraft),
  });
  const isPending =
    isStreaming || saveDraftMutating > 0 || cancelDraftMutating > 0;

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

  function handleSubmit(content: string) {
    send(content);
  }

  return (
    <div className="flex flex-1 min-w-0">
      <main className="flex flex-1 flex-col bg-surface-card min-w-0">
        <MessageList streamingMessage={streamingMessage} />
        <div className="mx-auto w-full max-w-2xl px-6 pb-6 pt-2">
          <ChatInput
            placeholder={t("session.input_placeholder")}
            disabled={isPending}
            onSubmit={handleSubmit}
          />
        </div>
      </main>

      <SessionSidePanel />
    </div>
  );
}
