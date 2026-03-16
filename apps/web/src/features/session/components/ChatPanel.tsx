import { Suspense, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";

import { HOME_TO_SESSION_INITIAL_MESSAGE_KEY } from "@web/app/constants/routeState";
import { getRouteState } from "@web/app/utils/routeState";
import { useChatStream } from "@web/features/session/contexts/ChatStreamContext";
import { useScrollAnchor } from "@web/features/session/hooks/useScrollAnchor";
import { useSessionMessages } from "@web/features/session/hooks/useSessionMessages";

import { ChatComposer } from "./ChatComposer";
import { MessageList } from "./MessageList";
import { MessageListSkeleton } from "./MessageListSkeleton";
import { SidePanel } from "./SidePanel";

function ChatPanelContent() {
  const messages = useSessionMessages();
  const { scrollRef, scrollToLastUserMessage } = useScrollAnchor({ messages });
  const initialScrollDoneRef = useRef(false);

  useEffect(
    function syncPanelHeight() {
      const el = scrollRef.current;
      if (!el) {
        return;
      }
      const observer = new ResizeObserver(([entry]) => {
        el.style.setProperty("--panel-height", `${entry.contentRect.height}px`);
        if (!initialScrollDoneRef.current) {
          initialScrollDoneRef.current = true;
          requestAnimationFrame(() => {
            requestAnimationFrame(() => scrollToLastUserMessage("instant"));
          });
        }
      });
      observer.observe(el);
      return function cleanup() {
        observer.disconnect();
      };
    },
    [scrollRef, scrollToLastUserMessage],
  );

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <div
        ref={scrollRef}
        data-scroll-container
        className="flex-1 min-h-0 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:var(--color-border)_transparent]"
      >
        <MessageList />
      </div>

      <div className="bg-surface-base shadow-[0_-8px_16px_-4px_var(--color-surface-base)]">
        <div className="mx-auto w-full max-w-2xl px-6 pb-6 pt-2">
          <ChatComposer />
        </div>
      </div>
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
