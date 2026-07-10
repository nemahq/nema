import { type ReactNode } from "react";

import { type BootstrapSpace } from "@nema-io/shared";
import { Skeleton } from "@nema-io/weave";
import { BookMarked, Hash, MessagesSquare, Plus } from "@nema-io/weave/icons";

import { Sidebar, useSidebar } from "@web/components/layout/Sidebar";
import { SidebarNavLink } from "@web/components/layout/SidebarNavLink";
import { useWorkspaceBootstrapQuery } from "@web/features/workspace/hooks/useWorkspaceBootstrapQuery";
import { useTranslation } from "@web/lib/tolgee";

import { LnbPlaceholderItem } from "./LnbPlaceholderItem";
import { WorkspaceMenu } from "./WorkspaceMenu";

const NAV_ICON_CLASS = "size-4";

export function WorkspaceSidebar() {
  const { t } = useTranslation();
  const { data, isLoading } = useWorkspaceBootstrapQuery();

  return (
    <Sidebar
      topSlot={
        <div className="pb-1">
          <WorkspaceMenuSlot data={data} isLoading={isLoading} />
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
          <SpaceList spaces={data?.spaces ?? []} isLoading={isLoading} />
          <LnbPlaceholderItem
            icon={<Plus strokeWidth={1.5} className={NAV_ICON_CLASS} />}
            label={t("workspace.new_space")}
          />
        </LnbSection>
      </div>
    </Sidebar>
  );
}

interface WorkspaceMenuSlotProps {
  data: ReturnType<typeof useWorkspaceBootstrapQuery>["data"];
  isLoading: boolean;
}

// 에러(!isLoading && !data)일 땐 가짜 로딩 스켈레톤을 계속 보이지 않는다.
function WorkspaceMenuSlot({ data, isLoading }: WorkspaceMenuSlotProps) {
  if (isLoading) {
    return <Skeleton className="mx-1.5 h-9" />;
  }
  if (!data) {
    return null;
  }
  return <WorkspaceMenu workspaceName={data.workspace.name} />;
}

interface LnbSectionProps {
  label: string;
  children: ReactNode;
}

function LnbSection({ label, children }: LnbSectionProps) {
  const { collapsed } = useSidebar();

  return (
    <div className="mt-2 flex flex-col gap-0.5">
      {!collapsed && (
        <div className="px-3 pb-0.5 text-xs font-medium tracking-wide text-fg-tertiary/70">
          {label}
        </div>
      )}
      {children}
    </div>
  );
}

interface SpaceListProps {
  spaces: BootstrapSpace[];
  isLoading: boolean;
}

function SpaceList({ spaces, isLoading }: SpaceListProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-1 px-1.5 py-0.5">
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
      </div>
    );
  }

  return (
    <>
      {spaces.map(function renderSpaceLink(space) {
        return (
          <SidebarNavLink
            key={space.id}
            icon={<Hash strokeWidth={1.5} className={NAV_ICON_CLASS} />}
            label={space.name}
            to="/space/$spaceId"
            params={{ spaceId: space.id }}
          />
        );
      })}
    </>
  );
}
