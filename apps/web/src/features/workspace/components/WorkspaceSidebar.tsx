import { BookMarked, MessagesSquare } from "@nema-io/weave/icons";

import { Sidebar } from "@web/components/layout/Sidebar";
import { useTranslation } from "@web/lib/tolgee";

import { LnbPlaceholderItem } from "./LnbPlaceholderItem";
import { LnbSection } from "./LnbSection";
import { NewSpaceButton } from "./NewSpaceButton";
import { SpaceList } from "./SpaceList";
import { WorkspaceMenuSlot } from "./WorkspaceMenuSlot";

const NAV_ICON_CLASS = "size-4";

export function WorkspaceSidebar() {
  const { t } = useTranslation();

  return (
    <Sidebar
      topSlot={
        <div className="pb-1">
          <WorkspaceMenuSlot />
        </div>
      }
    >
      <div className="flex flex-col gap-0.5 py-1">
        <LnbPlaceholderItem
          icon={<MessagesSquare strokeWidth={1.5} className={NAV_ICON_CLASS} />}
          label={t("workspace.ask")}
        />

        <LnbSection label={t("workspace.section_workspace")}>
          <LnbPlaceholderItem
            icon={<BookMarked strokeWidth={1.5} className={NAV_ICON_CLASS} />}
            label={t("workspace.references")}
          />
        </LnbSection>

        <LnbSection label={t("workspace.section_spaces")}>
          <SpaceList />
          <NewSpaceButton />
        </LnbSection>
      </div>
    </Sidebar>
  );
}
