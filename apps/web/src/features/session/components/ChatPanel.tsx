import { Suspense, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";

import { Button } from "@nema-io/weave";
import { ChevronDown } from "@nema-io/weave/icons";

import { HOME_TO_SESSION_INITIAL_MESSAGE_KEY } from "@web/app/constants/routeState";
import { getRouteState } from "@web/app/utils/routeState";
import { useChatStream } from "@web/features/session/contexts/ChatStreamContext";
import { useAutoScroll } from "@web/features/session/hooks/useAutoScroll";
import { useSessionMessages } from "@web/features/session/hooks/useSessionMessages";
import { useTranslation } from "@web/lib/tolgee";

import { ChatComposer } from "./ChatComposer";
import { MessageList } from "./MessageList";
import { MessageListSkeleton } from "./MessageListSkeleton";
import { SidePanel } from "./SidePanel";

function ChatPanelContent() {
  const { t } = useTranslation();

  const messages = useSessionMessages();
  const { scrollRef, showNewMessageButton, scrollToBottom } = useAutoScroll({
    messages,
  });

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
              <ChatComposer />
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
