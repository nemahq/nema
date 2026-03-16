import { Suspense, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";

import { HOME_TO_SESSION_INITIAL_MESSAGE_KEY } from "@web/app/constants/routeState";
import { getRouteState } from "@web/app/utils/routeState";
import { useChatStream } from "@web/features/session/contexts/ChatStreamContext";

import { ChatPanelContent } from "./ChatPanelContent";
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
