import { ChatPanel } from "@web/features/session/components/ChatPanel";
import { SessionContentPanel } from "@web/features/session/components/SessionContentPanel";
import { ChatStreamProvider } from "@web/features/session/contexts/ChatStreamContext";

export function SessionPage() {
  return (
    <ChatStreamProvider>
      <div className="flex flex-1 min-w-0">
        <SessionContentPanel />
        <ChatPanel />
      </div>
    </ChatStreamProvider>
  );
}
