import { CircleHelp } from "@nema-io/weave/icons";

import type { TabbedPanelTab } from "@web/components/ui/TabbedPanel";
import { HelpTabContent } from "@web/features/session/components/HelpTabContent";
import { useContentTab } from "@web/features/session/contexts/ContentTabContext";

export function useHelpTab(): TabbedPanelTab | undefined {
  const { openTabs, closeTab } = useContentTab();

  if (!openTabs.has("help")) {
    return undefined;
  }

  return {
    id: "help",
    labelKey: "session.help",
    icon: CircleHelp,
    content: <HelpTabContent />,
    onClose: () => closeTab("help"),
  };
}
