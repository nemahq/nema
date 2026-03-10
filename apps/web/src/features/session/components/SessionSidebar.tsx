import { Plus } from "@nema-io/weave/icons";

import { Sidebar } from "@web/components/layout/Sidebar";
import { SidebarActionButton } from "@web/components/layout/SidebarActionButton";
import { useTranslation } from "@web/lib/tolgee";

import { UserMenu } from "./UserMenu";

function NewContextIcon() {
  return (
    <div className="flex size-6 items-center justify-center rounded-full bg-brand/15 text-brand dark:bg-fg-primary/10 dark:text-fg-primary">
      <Plus strokeWidth={1.5} className="size-4" />
    </div>
  );
}

export function SessionSidebar() {
  const { t } = useTranslation();

  return (
    <Sidebar footer={(collapsed) => <UserMenu collapsed={collapsed} />}>
      {(collapsed) => (
        <SidebarActionButton
          collapsed={collapsed}
          icon={<NewContextIcon />}
          label={t("session.new_context")}
          onClick={() => {
            // TODO: 세션 생성 API 연결
          }}
        />
      )}
    </Sidebar>
  );
}
