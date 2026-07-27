import { useState } from "react";

import {
  HoverIcon,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@nema-io/weave";
import {
  BookOpenText,
  Home,
  MessageCircleQuestionMark,
  Plus,
} from "@nema-io/weave/icons";

import { LnbSection } from "@web/components/layout/LnbSection";
import { NavItem } from "@web/components/layout/NavItem";
import { Sidebar } from "@web/components/layout/Sidebar";
import { DraftsNavItem } from "@web/features/intake";
import { useTranslation } from "@web/lib/tolgee";

import { SpaceCreateModal } from "./SpaceCreateModal";
import { SpaceList } from "./SpaceList";
import {
  WorkspaceMenuSlotCollapsed,
  WorkspaceMenuSlotExpanded,
} from "./WorkspaceMenuSlot";

const NAV_ICON_CLASS = "size-4 shrink-0";

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
          icon={<Home strokeWidth={2} className={NAV_ICON_CLASS} />}
          label={t("common.home")}
          to="/"
        />

        <NavItem
          icon={
            <MessageCircleQuestionMark
              strokeWidth={2}
              className={NAV_ICON_CLASS}
            />
          }
          label={t("workspace.ask")}
          disabledHint={t("workspace.coming_soon")}
        />

        <DraftsNavItem />

        <LnbSection label={t("workspace.section_workspace")}>
          <NavItem
            icon={<BookOpenText strokeWidth={2} className={NAV_ICON_CLASS} />}
            label={t("workspace.references")}
            to="/wiki"
          />
        </LnbSection>

        <LnbSection
          label={t("workspace.section_spaces")}
          trailingAction={
            <Tooltip>
              <TooltipTrigger asChild>
                <HoverIcon
                  onClick={() => setCreateSpaceOpen(true)}
                  aria-label={t("space.create_title")}
                  className="absolute right-3.5 group-hover/section:opacity-100"
                >
                  <Plus className="size-4" />
                </HoverIcon>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {t("space.create_title")}
              </TooltipContent>
            </Tooltip>
          }
        >
          <SpaceList />
        </LnbSection>
      </div>

      <SpaceCreateModal
        open={createSpaceOpen}
        onOpenChange={setCreateSpaceOpen}
      />
    </Sidebar>
  );
}
