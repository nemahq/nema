import { Suspense, useState } from "react";

import { FileText } from "@nema-io/weave/icons";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import { useChatStream } from "@web/features/session/contexts/ChatStreamContext";
import { useSessionDraft } from "@web/features/session/hooks/useSessionDraft";
import { useSessionId } from "@web/features/session/hooks/useSessionId";

import type { ContentPanelTab } from "./ContentPanel";
import { ContentPanel } from "./ContentPanel";
import { DraftTabContent } from "./DraftTabContent";

function SessionContentPanelInner() {
  const sessionId = useSessionId();
  const draft = useSessionDraft({ sessionId });
  const { streamingPhase } = useChatStream();

  const [draftTabOpen, setDraftTabOpen] = useState(true);
  const hasDraft = draft || streamingPhase === "draft";

  const tabs: ContentPanelTab[] = [];
  if (hasDraft && draftTabOpen) {
    tabs.push({
      id: "draft",
      labelKey: "session.draft",
      icon: FileText,
      content: <DraftTabContent />,
      onClose: () => setDraftTabOpen(false),
    });
  }

  return <ContentPanel tabs={tabs} />;
}

export function SessionContentPanel() {
  return (
    // TODO: ErrorBoundary에 componentDidCatch (Sentry 보고) + 의미 있는 fallback UI 추가
    <ErrorBoundary fallback={null}>
      <Suspense fallback={<ContentPanel tabs={[]} />}>
        <SessionContentPanelInner />
      </Suspense>
    </ErrorBoundary>
  );
}
