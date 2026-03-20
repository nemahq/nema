import { Suspense, useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";

import {
  HOME_TO_SESSION_INITIAL_MESSAGE_KEY,
  HOME_TO_SESSION_INITIAL_MODE_KEY,
} from "@web/app/constants/routeState";
import { getRouteState } from "@web/app/utils/routeState";
import { useChatStream } from "@web/features/session/contexts/ChatStreamContext";
import { useScrollAnchor } from "@web/features/session/hooks/useScrollAnchor";
import { useSessionId } from "@web/features/session/hooks/useSessionId";
import { useSessionMessages } from "@web/features/session/hooks/useSessionMessages";

import { ChatComposer } from "./ChatComposer";
import { MessageList } from "./MessageList";
import { MessageListSkeleton } from "./MessageListSkeleton";
import { SidePanel } from "./SidePanel";

function ChatPanelContent() {
  const messages = useSessionMessages();
  const { scrollRef, scrollToLastUserMessage } = useScrollAnchor({ messages });

  useLayoutEffect(
    function syncPanelHeightAndInitialScroll() {
      const el = scrollRef.current;
      if (!el) {
        return;
      }

      el.style.setProperty("--panel-height", `${el.clientHeight}px`);
      // minHeight: var(--panel-height)가 적용되도록 레이아웃 강제 재계산
      void el.offsetHeight;
      scrollToLastUserMessage("instant");

      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) {
          return;
        }
        el.style.setProperty("--panel-height", `${entry.contentRect.height}px`);
      });
      observer.observe(el);
      return function cleanup() {
        observer.disconnect();
        el.style.removeProperty("--panel-height");
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
  const sessionId = useSessionId();
  const navigate = useNavigate();
  const initialMessage = useLocation({
    select: (loc) =>
      getRouteState(loc.state, HOME_TO_SESSION_INITIAL_MESSAGE_KEY),
  });
  const initialMode = useLocation({
    select: (loc) => getRouteState(loc.state, HOME_TO_SESSION_INITIAL_MODE_KEY),
  });
  const { send } = useChatStream();

  const sentRef = useRef(false);
  useEffect(
    function sendInitialMessage() {
      if (!initialMessage || sentRef.current) {
        return;
      }
      sentRef.current = true;
      send(initialMessage, initialMode === "ask" ? "ask" : "remember");
      navigate({ replace: true, state: {} });
    },
    [initialMessage, initialMode, navigate, send],
  );

  return (
    <SidePanel>
      <Suspense key={sessionId} fallback={<MessageListSkeleton />}>
        <ChatPanelContent />
      </Suspense>
    </SidePanel>
  );
}
