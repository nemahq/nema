import { Suspense, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import type { TabbedPanelTab } from "@web/components/ui/TabbedPanel";
import { TabbedPanel } from "@web/components/ui/TabbedPanel";
import { useDraftTab } from "@web/features/session/hooks/useDraftTab";
import { useHelpTab } from "@web/features/session/hooks/useHelpTab";
import { useRetrievalTab } from "@web/features/session/hooks/useRetrievalTab";
import { useRegisterAction } from "@web/lib/command/shortcut/useRegisterAction";

const MAX_TAB_SHORTCUT = 9;

const TAB_HOTKEYS = Array.from(
  { length: MAX_TAB_SHORTCUT },
  (_, i) => `meta+${i + 1}, ctrl+${i + 1}`,
).join(", ");

function ContentPanelInner() {
  const draftTab = useDraftTab();
  const retrievalTab = useRetrievalTab();
  const helpTab = useHelpTab();

  const allTabs = [draftTab, retrievalTab, helpTab];
  const tabs: TabbedPanelTab[] = allTabs.filter(
    (tab): tab is TabbedPanelTab => tab !== undefined,
  );

  const [activeTab, setActiveTab] = useState(tabs[0]?.id ?? "");
  const [tabOrder, setTabOrder] = useState<string[]>(() =>
    tabs.map((tab) => tab.id),
  );

  const currentIds = new Set(tabs.map((tab) => tab.id));
  const newIds = tabs.map((t) => t.id).filter((id) => !tabOrder.includes(id));
  const kept = tabOrder.filter((id) => currentIds.has(id));
  const needsUpdate = newIds.length > 0 || kept.length !== tabOrder.length;

  if (needsUpdate) {
    const nextOrder = [...kept, ...newIds];
    setTabOrder(nextOrder);
    if (newIds.length > 0) {
      setActiveTab(newIds[newIds.length - 1]);
    }
  }

  const orderedTabs = tabOrder
    .map((id) => tabs.find((tab) => tab.id === id))
    .filter((tab): tab is TabbedPanelTab => tab !== undefined);

  const activeTabData =
    orderedTabs.find((tab) => tab.id === activeTab) ?? orderedTabs[0];

  useHotkeys(
    TAB_HOTKEYS,
    (e) => {
      e.preventDefault();
      const num = parseInt(e.key, 10);
      const tab = orderedTabs[num - 1];
      if (tab) {
        setActiveTab(tab.id);
      }
    },
    {
      enabled: orderedTabs.length > 1,
      enableOnFormTags: ["INPUT", "TEXTAREA", "SELECT"],
    },
  );

  useRegisterAction("tab.close", {
    execute: () => activeTabData?.onClose?.(),
    enabled: !!activeTabData?.onClose,
  });

  return (
    <TabbedPanel
      tabs={orderedTabs}
      activeTabId={activeTabData?.id ?? ""}
      onActiveTabChange={setActiveTab}
    />
  );
}

export function ContentPanel() {
  return (
    // TODO: ErrorBoundary에 componentDidCatch (Sentry 보고) + 의미 있는 fallback UI 추가
    <ErrorBoundary fallback={null}>
      <Suspense
        fallback={
          <TabbedPanel tabs={[]} activeTabId="" onActiveTabChange={() => {}} />
        }
      >
        <ContentPanelInner />
      </Suspense>
    </ErrorBoundary>
  );
}
