import { useEffect, useRef } from "react";
import { useIsMutating } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { getQueryKey } from "@trpc/react-query";

import { HOME_TO_SESSION_INITIAL_MESSAGE_KEY } from "@web/app/constants/routeState";
import { getRouteState } from "@web/app/utils/routeState";
import { ChatInput } from "@web/features/session/components/ChatInput";
import { ChatPanel } from "@web/features/session/components/ChatPanel";
import { MessageList } from "@web/features/session/components/MessageList";
import { SessionContentPanel } from "@web/features/session/components/SessionContentPanel";
import {
  ChatStreamProvider,
  useChatStream,
} from "@web/features/session/contexts/ChatStreamContext";
import { useTranslation } from "@web/lib/tolgee";
import { trpc } from "@web/lib/trpc";

function SessionContent() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const initialMessage = useLocation({
    select: (loc) =>
      getRouteState(loc.state, HOME_TO_SESSION_INITIAL_MESSAGE_KEY),
  });

  const { send, streamingPhase } = useChatStream();

  const saveDraftMutating =
    useIsMutating({ mutationKey: getQueryKey(trpc.message.saveDraft) }) > 0;
  const cancelDraftMutating =
    useIsMutating({ mutationKey: getQueryKey(trpc.message.cancelDraft) }) > 0;
  const isChatInputDisabled =
    streamingPhase !== "idle" || saveDraftMutating || cancelDraftMutating;

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
    <div className="flex flex-1 min-w-0">
      <SessionContentPanel />

      <ChatPanel>
        <MessageList
          footer={
            <div className="mx-auto w-full max-w-2xl px-6 pb-6 pt-2">
              <ChatInput
                placeholder={t("session.input_placeholder")}
                disabled={isChatInputDisabled}
                onSubmit={send}
              />
            </div>
          }
        />
      </ChatPanel>
    </div>
  );
}

export function SessionPage() {
  return (
    <ChatStreamProvider>
      <SessionContent />
    </ChatStreamProvider>
  );
}
