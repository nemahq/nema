import { Suspense, useState } from "react";

import { FileText } from "@nema-io/weave/icons";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import { useChatStream } from "@web/features/session/contexts/ChatStreamContext";
import { useSessionDraft } from "@web/features/session/hooks/useSessionDraft";
import { useSessionId } from "@web/features/session/hooks/useSessionId";

import { DraftTabContent } from "./DraftTabContent";
import type { TabbedPanelTab } from "./TabbedPanel";
import { TabbedPanel } from "./TabbedPanel";

function ContentPanelInner() {
  const sessionId = useSessionId();
  const draft = useSessionDraft({ sessionId });
  const { streamingPhase } = useChatStream();

  const [draftTabOpen, setDraftTabOpen] = useState(true);
  const hasDraft = !!(draft || streamingPhase === "draft");

  const [prevHasDraft, setPrevHasDraft] = useState(hasDraft);
  if (hasDraft !== prevHasDraft) {
    setPrevHasDraft(hasDraft);
    if (hasDraft) {
      setDraftTabOpen(true);
    }
  }

  const tabs: TabbedPanelTab[] = [];
  if (hasDraft && draftTabOpen) {
    tabs.push({
      id: "draft",
      labelKey: "session.draft",
      icon: FileText,
      content: <DraftTabContent />,
      onClose: () => setDraftTabOpen(false),
    });
  }

  return <TabbedPanel tabs={tabs} />;
}

export function ContentPanel() {
  return (
    // TODO: ErrorBoundary에 componentDidCatch (Sentry 보고) + 의미 있는 fallback UI 추가
    <ErrorBoundary fallback={null}>
      <Suspense fallback={<TabbedPanel tabs={[]} />}>
        <ContentPanelInner />
      </Suspense>
    </ErrorBoundary>
  );
}
