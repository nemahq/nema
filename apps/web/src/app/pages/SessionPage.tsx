import { useEffect, useMemo, useRef } from "react";
import { useIsMutating } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { getQueryKey } from "@trpc/react-query";

import type { Message } from "@nema-io/shared";

import { HOME_TO_SESSION_INITIAL_MESSAGE_KEY } from "@web/app/constants/routeState";
import { getRouteState } from "@web/app/utils/routeState";
import { ChatInput } from "@web/features/session/components/ChatInput";
import { MessageList } from "@web/features/session/components/MessageList";
import { useSendMessage } from "@web/features/session/hooks/useSendMessage";
import { useSessionId } from "@web/features/session/hooks/useSessionId";
import { useTranslation } from "@web/lib/tolgee";
import { trpc } from "@web/lib/trpc";

const STREAMING_MESSAGE_ID = "streaming";

export function SessionPage() {
  const { t } = useTranslation();
  const sessionId = useSessionId();

  const navigate = useNavigate();
  const initialMessage = useLocation({
    select: (loc) =>
      getRouteState(loc.state, HOME_TO_SESSION_INITIAL_MESSAGE_KEY),
  });
  const {
    send,
    isStreaming,
    isDraftStreaming,
    streamingText,
    streamStartedAt,
  } = useSendMessage({ sessionId });

  const sentRef = useRef(false);
  useEffect(
    function sendInitialMessage() {
      if (!initialMessage || sentRef.current) {
        return;
      }
      sentRef.current = true;
      send(initialMessage);
      navigate({ replace: true, state: {} });
    },
    [initialMessage, navigate, send],
  );

  const saveDraftMutating = useIsMutating({
    mutationKey: getQueryKey(trpc.message.saveDraft),
  });
  const cancelDraftMutating = useIsMutating({
    mutationKey: getQueryKey(trpc.message.cancelDraft),
  });
  const isPending =
    isStreaming || saveDraftMutating > 0 || cancelDraftMutating > 0;

  const streamingMessage = useMemo<Message | undefined>(() => {
    if (!isStreaming) {
      return undefined;
    }

    if (isDraftStreaming) {
      return {
        id: STREAMING_MESSAGE_ID,
        role: "assistant",
        type: "draft_status",
        content: t("session.draft_creating"),
        createdAt: streamStartedAt,
      };
    }

    if (!streamingText) {
      return undefined;
    }

    return {
      id: STREAMING_MESSAGE_ID,
      role: "assistant",
      type: "text",
      content: streamingText,
      createdAt: streamStartedAt,
    };
  }, [isStreaming, isDraftStreaming, streamingText, streamStartedAt, t]);

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

      {/* TODO: CRP 확인 후 복원 */}
      {/* <SessionSidePanel /> */}
    </div>
  );
}
