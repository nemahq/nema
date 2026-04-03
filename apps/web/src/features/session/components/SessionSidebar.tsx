import { useNavigate } from "@tanstack/react-router";

import { Brain, Plus } from "@nema-io/weave/icons";

import { Sidebar } from "@web/components/layout/Sidebar";
import { SidebarNavLink } from "@web/components/layout/SidebarNavLink";
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

function MemoryIcon() {
  return (
    <div className="flex size-6 items-center justify-center">
      <Brain strokeWidth={1.5} className="size-4" />
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
      topSlot={
        <>
          <SidebarNavLink
            icon={<NewContextIcon />}
            label={t("session.new_context")}
            to="/"
            showActive={false}
          />
          <SidebarNavLink
            icon={<MemoryIcon />}
            label={t("memory.sidebar_label")}
            to="/memory"
          />
        </>
      }
      footer={<UserMenu />}
    >
      <SessionList />
    </Sidebar>
  );
}
