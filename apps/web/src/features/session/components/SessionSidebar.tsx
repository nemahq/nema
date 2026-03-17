import { useNavigate } from "@tanstack/react-router";

import { Plus } from "@nema-io/weave/icons";

import { Sidebar } from "@web/components/layout/Sidebar";
import { SidebarActionButton } from "@web/components/layout/SidebarActionButton";
import { useRegisterAction } from "@web/lib/command/shortcut/useRegisterAction";
import { useTranslation } from "@web/lib/tolgee";

import { SessionList } from "./SessionList";
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
  const navigate = useNavigate();

  useRegisterAction("navigation.newContext", {
    execute: () => navigate({ to: "/" }),
  });

  return (
    <Sidebar
      topSlot={(collapsed) => (
        <SidebarActionButton
          collapsed={collapsed}
          icon={<NewContextIcon />}
          label={t("session.new_context")}
          onClick={() => navigate({ to: "/" })}
        />
      )}
      footer={(collapsed) => <UserMenu collapsed={collapsed} />}
    >
      {(collapsed) => !collapsed && <SessionList />}
    </Sidebar>
  );
}
