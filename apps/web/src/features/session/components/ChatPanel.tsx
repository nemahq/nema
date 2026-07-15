import { Suspense, useLayoutEffect } from "react";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import { SectionErrorFallback } from "@web/app/error/SectionErrorFallback";
import { SidePanel } from "@web/components/ui/SidePanel";
import { useScrollAnchor } from "@web/features/session/hooks/useScrollAnchor";
import { useSessionMessages } from "@web/features/session/hooks/useSessionMessages";

import { ChatComposer } from "./ChatComposer";
import { MessageList } from "./MessageList";
import { MessageListSkeleton } from "./MessageListSkeleton";

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
        className="flex-1 min-h-0 overflow-y-auto"
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
  return (
    <SidePanel>
      <ErrorBoundary
        boundaryName="chat-panel"
        fallbackRender={(props) => <SectionErrorFallback {...props} />}
      >
        <Suspense fallback={<MessageListSkeleton />}>
          <ChatPanelContent />
        </Suspense>
      </ErrorBoundary>
    </SidePanel>
  );
}
