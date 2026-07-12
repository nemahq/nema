import { useState } from "react";

import { BookMarked, MessagesSquare } from "@nema-io/weave/icons";

import { NavItem } from "@web/components/layout/NavItem";
import { Sidebar } from "@web/components/layout/Sidebar";
import { useTranslation } from "@web/lib/tolgee";

import { LnbSection } from "./LnbSection";
import { SpaceList } from "./SpaceList";
import { SpaceModal } from "./SpaceModal";
import { WorkspaceMenuSlot } from "./WorkspaceMenuSlot";

const NAV_ICON_CLASS = "size-4";

export function WorkspaceSidebar() {
  const { t } = useTranslation();
  const [createSpaceOpen, setCreateSpaceOpen] = useState(false);

  return (
    <Sidebar
      hideToggle
      logo={<WorkspaceMenuSlot mode="expanded" />}
      topSlot={<WorkspaceMenuSlot mode="collapsed" />}
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
          onAdd={() => setCreateSpaceOpen(true)}
          addLabel={t("workspace.new_space")}
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
