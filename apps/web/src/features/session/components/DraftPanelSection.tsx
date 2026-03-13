import { Suspense } from "react";

import { FileText } from "@nema-io/weave/icons";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import type { useCancelDraft } from "@web/features/session/hooks/useCancelDraft";
import type { useSaveDraft } from "@web/features/session/hooks/useSaveDraft";
import { useSessionDraft } from "@web/features/session/hooks/useSessionDraft";

import { DraftTabContent } from "./DraftTabContent";
import type { SidePanelTab } from "./SidePanel";
import { SidePanel } from "./SidePanel";

function DraftPanelSectionContent({
  sessionId,
  saveDraft,
  cancelDraft,
}: DraftPanelSectionProps) {
  const draft = useSessionDraft({ sessionId });

  if (!draft) {
    return null;
  }

  const tabs: SidePanelTab[] = [
    {
      id: "draft",
      labelKey: "session.draft",
      icon: FileText,
      content: (
        <DraftTabContent
          draft={draft}
          onSave={() => saveDraft.mutate({ sessionId })}
          isPending={saveDraft.isPending}
        />
      ),
      onClose: () => cancelDraft.mutate({ sessionId }),
    },
  ];

  return <SidePanel tabs={tabs} />;
}

interface DraftPanelSectionProps {
  sessionId: string;
  saveDraft: ReturnType<typeof useSaveDraft>;
  cancelDraft: ReturnType<typeof useCancelDraft>;
}

export function DraftPanelSection(props: DraftPanelSectionProps) {
  return (
    <ErrorBoundary fallback={null}>
      <Suspense>
        <DraftPanelSectionContent {...props} />
      </Suspense>
    </ErrorBoundary>
  );
}
