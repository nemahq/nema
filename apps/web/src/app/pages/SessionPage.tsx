import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";

import { HOME_TO_SESSION_INITIAL_MESSAGE_KEY } from "@web/app/constants/routeState";
import { getRouteState } from "@web/app/utils/routeState";
import { ChatPanel } from "@web/features/session/components/ChatPanel";
import { SessionContentPanel } from "@web/features/session/components/SessionContentPanel";
import {
  ChatStreamProvider,
  useChatStream,
} from "@web/features/session/contexts/ChatStreamContext";

function SessionContent() {
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
    <div className="flex flex-1 min-w-0">
      <SessionContentPanel />
      <ChatPanel />
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
