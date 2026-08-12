import { LibraryBig } from "@nema-io/weave/icons";

import { NavItem } from "@web/components/layout/NavItem";
import { Sidebar } from "@web/components/layout/Sidebar";
import {
  WorkspaceMenuSlotCollapsed,
  WorkspaceMenuSlotExpanded,
} from "@web/components/layout/WorkspaceMenuSlot";
import { useTranslation } from "@web/lib/tolgee";

const NAV_ICON_CLASS = "size-4 shrink-0";

export function AppSidebar() {
  const { t } = useTranslation();

  return (
    <Sidebar
      hideToggle
      logo={<WorkspaceMenuSlotExpanded />}
      topSlot={<WorkspaceMenuSlotCollapsed />}
    >
      <div className="flex flex-col py-1">
        <NavItem
          icon={<LibraryBig strokeWidth={2} className={NAV_ICON_CLASS} />}
          label={t("digest.nav_label")}
          to="/"
        />
      </div>
    </Sidebar>
  );
}
