import { Suspense, useEffect, useMemo, useRef } from "react";
import { useIsMutating } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { getQueryKey } from "@trpc/react-query";

import { Button } from "@nema-io/weave";
import { ChevronDown } from "@nema-io/weave/icons";

import { HOME_TO_SESSION_INITIAL_MESSAGE_KEY } from "@web/app/constants/routeState";
import { getRouteState } from "@web/app/utils/routeState";
import { useChatStream } from "@web/features/session/contexts/ChatStreamContext";
import { useAutoScroll } from "@web/features/session/hooks/useAutoScroll";
import { useMessageList } from "@web/features/session/hooks/useMessageList";
import { useSessionId } from "@web/features/session/hooks/useSessionId";
import { useTranslation } from "@web/lib/tolgee";
import { trpc } from "@web/lib/trpc";

import { ChatInput } from "./ChatInput";
import { MessageList } from "./MessageList";
import { MessageListSkeleton } from "./MessageListSkeleton";
import { SidePanel } from "./SidePanel";

export function ChatPanel() {
  const navigate = useNavigate();
  const initialMessage = useLocation({
    select: (loc) =>
      getRouteState(loc.state, HOME_TO_SESSION_INITIAL_MESSAGE_KEY),
  });
  const { send } = useChatStream();

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

  return (
    <SidePanel>
      <Suspense fallback={<MessageListSkeleton />}>
        <ChatPanelContent />
      </Suspense>
    </SidePanel>
  );
}

function ChatPanelContent() {
  const { t } = useTranslation();
  const sessionId = useSessionId();
  const { send, streamingPhase, streamingMessage } = useChatStream();

  const serverMessages = useMessageList({ sessionId });
  const messages = useMemo(
    () =>
      streamingMessage ? [...serverMessages, streamingMessage] : serverMessages,
    [serverMessages, streamingMessage],
  );
  const { scrollRef, showNewMessageButton, scrollToBottom } = useAutoScroll({
    messages,
  });

  const saveDraftMutating =
    useIsMutating({ mutationKey: getQueryKey(trpc.message.saveDraft) }) > 0;
  const cancelDraftMutating =
    useIsMutating({ mutationKey: getQueryKey(trpc.message.cancelDraft) }) > 0;
  const isChatInputDisabled =
    streamingPhase !== "idle" || saveDraftMutating || cancelDraftMutating;

  return (
    <div className="relative flex-1">
      <div
        ref={scrollRef}
        className="absolute inset-0 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:var(--color-border)_transparent]"
      >
        <div className="flex min-h-full flex-col">
          <div className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-6 py-6">
            <MessageList />
          </div>

          <div className="sticky bottom-0 bg-surface-base">
            <div className="mx-auto w-full max-w-2xl px-6 pb-6 pt-2">
              <ChatInput
                placeholder={t("session.input_placeholder")}
                disabled={isChatInputDisabled}
                onSubmit={send}
              />
            </div>
          </div>
        </div>
      </div>

      {showNewMessageButton && (
        <div className="absolute bottom-24 left-1/2 z-10 -translate-x-1/2">
          <Button
            variant="neutral"
            size="sm"
            onClick={() => scrollToBottom("smooth")}
            className="shadow-md"
          >
            <ChevronDown className="size-4" />
            {t("session.new_messages")}
          </Button>
        </div>
      )}
    </div>
  );
}
