import { useEffect, useRef } from "react";
import { useIsMutating } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { getQueryKey } from "@trpc/react-query";

import { HOME_TO_SESSION_INITIAL_MESSAGE_KEY } from "@web/app/constants/routeState";
import { getRouteState } from "@web/app/utils/routeState";
import { useChatStream } from "@web/features/session/contexts/ChatStreamContext";
import { useTranslation } from "@web/lib/tolgee";
import { trpc } from "@web/lib/trpc";

import { ChatInput } from "./ChatInput";
import { MessageList } from "./MessageList";
import { SidePanel } from "./SidePanel";

export function ChatPanel() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const initialMessage = useLocation({
    select: (loc) =>
      getRouteState(loc.state, HOME_TO_SESSION_INITIAL_MESSAGE_KEY),
  });
  const { send, streamingPhase } = useChatStream();

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

  const saveDraftMutating =
    useIsMutating({ mutationKey: getQueryKey(trpc.message.saveDraft) }) > 0;
  const cancelDraftMutating =
    useIsMutating({ mutationKey: getQueryKey(trpc.message.cancelDraft) }) > 0;
  const isChatInputDisabled =
    streamingPhase !== "idle" || saveDraftMutating || cancelDraftMutating;

  return (
    <SidePanel>
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
    </SidePanel>
  );
}
