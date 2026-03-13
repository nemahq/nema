import { Suspense } from "react";

import { FileText } from "@nema-io/weave/icons";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import { useCancelDraft } from "@web/features/session/hooks/useCancelDraft";
import { useSessionDraft } from "@web/features/session/hooks/useSessionDraft";
import { useSessionId } from "@web/features/session/hooks/useSessionId";

import { DraftTabContent } from "./DraftTabContent";
import type { SidePanelTab } from "./SidePanel";
import { SidePanel } from "./SidePanel";

function ContextSidePanelInner() {
  const sessionId = useSessionId();
  const draft = useSessionDraft({ sessionId });
  const cancelDraft = useCancelDraft({ sessionId });

  const tabs: SidePanelTab[] = [];
  if (draft) {
    tabs.push({
      id: "draft",
      labelKey: "session.draft",
      icon: FileText,
      content: <DraftTabContent />,
      onClose: () => cancelDraft.mutate({ sessionId }),
    });
  }

  return <SidePanel tabs={tabs} />;
}

export function ContextSidePanel() {
  return (
    <ErrorBoundary fallback={null}>
      <Suspense>
        <ContextSidePanelInner />
      </Suspense>
    </ErrorBoundary>
  );
}
