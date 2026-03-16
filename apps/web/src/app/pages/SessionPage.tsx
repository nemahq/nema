import { ChatPanel } from "@web/features/session/components/ChatPanel";
import { ContentPanel } from "@web/features/session/components/ContentPanel";
import { ChatStreamProvider } from "@web/features/session/contexts/ChatStreamContext";

export function SessionPage() {
  return (
    <ChatStreamProvider>
      <div className="flex flex-1 min-w-0">
        <ContentPanel />
        <ChatPanel />
      </div>
    </ChatStreamProvider>
  );
}
