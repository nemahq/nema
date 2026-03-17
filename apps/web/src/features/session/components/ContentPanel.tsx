import { Suspense } from "react";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import { useDraftTab } from "@web/features/session/hooks/useDraftTab";
import { useHelpTab } from "@web/features/session/hooks/useHelpTab";

import type { TabbedPanelTab } from "./TabbedPanel";
import { TabbedPanel } from "./TabbedPanel";

function ContentPanelInner() {
  const draftTab = useDraftTab();
  const helpTab = useHelpTab();

  const tabs: TabbedPanelTab[] = [draftTab, helpTab].filter(
    (tab): tab is TabbedPanelTab => tab !== undefined,
  );

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
