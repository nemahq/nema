import { ChatPanel } from "@web/features/session/components/ChatPanel";
import { ContentPanel } from "@web/features/session/components/ContentPanel";
import { ChatStreamProvider } from "@web/features/session/contexts/ChatStreamContext";
import { ContentTabProvider } from "@web/features/session/contexts/ContentTabContext";

export function SessionPage() {
  return (
    <ContentTabProvider>
      <ChatStreamProvider>
        <div className="flex flex-1 min-w-0">
          <ContentPanel />
          <ChatPanel />
        </div>
      </ChatStreamProvider>
    </ContentTabProvider>
  );
}
