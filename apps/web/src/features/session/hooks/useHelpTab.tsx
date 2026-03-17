import { CircleHelp } from "@nema-io/weave/icons";

import { HelpTabContent } from "@web/features/session/components/HelpTabContent";
import type { TabbedPanelTab } from "@web/features/session/components/TabbedPanel";
import { useContentTab } from "@web/features/session/contexts/ContentTabContext";

export function useHelpTab(): TabbedPanelTab | undefined {
  const { helpTabOpen, closeHelpTab } = useContentTab();

  if (!helpTabOpen) {
    return undefined;
  }

  return {
    id: "help",
    labelKey: "session.help",
    icon: CircleHelp,
    content: <HelpTabContent />,
    onClose: closeHelpTab,
  };
}
