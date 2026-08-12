import { Sidebar } from "@web/components/layout/Sidebar";
import {
  WorkspaceMenuSlotCollapsed,
  WorkspaceMenuSlotExpanded,
} from "@web/components/layout/WorkspaceMenuSlot";

export function AppSidebar() {
  return (
    <Sidebar
      hideToggle
      logo={<WorkspaceMenuSlotExpanded />}
      topSlot={<WorkspaceMenuSlotCollapsed />}
    />
  );
}
