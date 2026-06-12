import { AutoOpenRetrievalTab } from "@web/features/session/components/AutoOpenRetrievalTab";
import { ChatPanel } from "@web/features/session/components/ChatPanel";
import { ContentPanel } from "@web/features/session/components/ContentPanel";
import { ChatLifecycleProvider } from "@web/features/session/contexts/ChatLifecycleContext";
import { ContentTabProvider } from "@web/features/session/contexts/ContentTabContext";
import { SplitPaneProvider } from "@web/features/session/contexts/SplitPaneContext";

export function SessionPage() {
  return (
    <ContentTabProvider>
      <SplitPaneProvider>
        <ChatLifecycleProvider>
          <AutoOpenRetrievalTab />
          <div className="flex flex-1 min-w-0">
            <ContentPanel />
            <ChatPanel />
          </div>
        </ChatLifecycleProvider>
      </SplitPaneProvider>
    </ContentTabProvider>
  );
}
