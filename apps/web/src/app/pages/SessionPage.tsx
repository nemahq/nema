import { AutoOpenRetrievalTab } from "@web/features/session/components/AutoOpenRetrievalTab";
import { ChatPanel } from "@web/features/session/components/ChatPanel";
import { ContentPanel } from "@web/features/session/components/ContentPanel";
import { ChatLifecycleProvider } from "@web/features/session/contexts/ChatLifecycleContext";
import { ContentTabProvider } from "@web/features/session/contexts/ContentTabContext";

export function SessionPage() {
  return (
    <ContentTabProvider>
      <ChatLifecycleProvider>
        <AutoOpenRetrievalTab />
        <div className="flex flex-1 min-w-0">
          <ContentPanel />
          <ChatPanel />
        </div>
      </ChatLifecycleProvider>
    </ContentTabProvider>
  );
}
