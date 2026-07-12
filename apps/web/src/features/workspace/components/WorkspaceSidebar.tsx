import { useState } from "react";

import { BookMarked, MessagesSquare, Plus } from "@nema-io/weave/icons";

import { LnbHoverIcon } from "@web/components/layout/LnbHoverIcon";
import { NavItem } from "@web/components/layout/NavItem";
import { Sidebar } from "@web/components/layout/Sidebar";
import { useTranslation } from "@web/lib/tolgee";

import { LnbSection } from "./LnbSection";
import { SpaceList } from "./SpaceList";
import { SpaceModal } from "./SpaceModal";
import {
  WorkspaceMenuSlotCollapsed,
  WorkspaceMenuSlotExpanded,
} from "./WorkspaceMenuSlot";

const NAV_ICON_CLASS = "size-4";

export function WorkspaceSidebar() {
  const { t } = useTranslation();
  const [createSpaceOpen, setCreateSpaceOpen] = useState(false);

  return (
    <Sidebar
      hideToggle
      logo={<WorkspaceMenuSlotExpanded />}
      topSlot={<WorkspaceMenuSlotCollapsed />}
    >
      <div className="flex flex-col py-1">
        <NavItem
          icon={<MessagesSquare strokeWidth={1.5} className={NAV_ICON_CLASS} />}
          label={t("workspace.ask")}
          disabledHint={t("workspace.coming_soon")}
        />

        <LnbSection label={t("workspace.section_workspace")}>
          <NavItem
            icon={<BookMarked strokeWidth={1.5} className={NAV_ICON_CLASS} />}
            label={t("workspace.references")}
            disabledHint={t("workspace.coming_soon")}
          />
        </LnbSection>

        <LnbSection
          label={t("workspace.section_spaces")}
          trailingAction={
            <LnbHoverIcon
              onClick={() => setCreateSpaceOpen(true)}
              aria-label={t("workspace.new_space")}
              className="absolute right-3.5 text-fg-tertiary hover:text-fg-primary group-hover/section:opacity-100"
            >
              <Plus className="size-4" />
            </LnbHoverIcon>
          }
        >
          <SpaceList />
        </LnbSection>
      </div>

      <SpaceModal
        mode="create"
        open={createSpaceOpen}
        onOpenChange={setCreateSpaceOpen}
      />
    </Sidebar>
  );
}
