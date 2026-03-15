import { Suspense } from "react";

import { FileText } from "@nema-io/weave/icons";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import { useChatStream } from "@web/features/session/contexts/ChatStreamContext";
import { useCancelDraft } from "@web/features/session/hooks/useCancelDraft";
import { useSessionDraft } from "@web/features/session/hooks/useSessionDraft";
import { useSessionId } from "@web/features/session/hooks/useSessionId";

import { DraftTabContent } from "./DraftTabContent";
import type { SidePanelTab } from "./SidePanel";
import { SidePanel } from "./SidePanel";

function SessionSidePanelInner() {
  const sessionId = useSessionId();
  const draft = useSessionDraft({ sessionId });
  const cancelDraft = useCancelDraft({ sessionId });
  const { streamingPhase } = useChatStream();

  const hasDraft = draft || streamingPhase === "draft";

  const tabs: SidePanelTab[] = [];
  if (hasDraft) {
    tabs.push({
      id: "draft",
      labelKey: "session.draft",
      icon: FileText,
      content: <DraftTabContent />,
      onClose: draft ? () => cancelDraft.mutate({ sessionId }) : undefined,
    });
  }

  return <SidePanel tabs={tabs} />;
}

export function SessionSidePanel() {
  return (
    <ErrorBoundary fallback={null}>
      <Suspense fallback={<SidePanel tabs={[]} />}>
        <SessionSidePanelInner />
      </Suspense>
    </ErrorBoundary>
  );
}
