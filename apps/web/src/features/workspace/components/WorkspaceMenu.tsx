import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  Avatar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@nema-io/weave";
import { ChevronsUpDown, LogOut, Settings } from "@nema-io/weave/icons";

import { useSidebar } from "@web/components/layout/Sidebar";
import { SettingsModal } from "@web/features/settings";
import { useUser } from "@web/lib/auth";
import { trackEvent } from "@web/lib/posthog/trackEvent";
import { supabase } from "@web/lib/supabase";
import { useTranslation } from "@web/lib/tolgee";

interface WorkspaceMenuProps {
  workspaceName: string;
}

export function WorkspaceMenu({ workspaceName }: WorkspaceMenuProps) {
  const { collapsed } = useSidebar();
  const user = useUser();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const userInitial = user.displayName.charAt(0).toUpperCase();
  const workspaceInitial = workspaceName.charAt(0).toUpperCase();

  async function handleSignOut() {
    trackEvent("auth.signout");
    await supabase.auth.signOut();
    await navigate({ to: "/signin", search: { redirect: undefined } });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {collapsed ? (
            <button
              type="button"
              aria-label={workspaceName}
              className="flex w-full items-center justify-center py-1 outline-none"
            >
              <span className="flex size-8 items-center justify-center rounded-md bg-surface-raised-hover text-sm font-medium text-fg-primary dark:bg-fg-primary/10">
                {workspaceInitial}
              </span>
            </button>
          ) : (
            <button
              type="button"
              className="mx-1.5 flex items-center gap-2 rounded-md px-1.5 py-1.5 text-left outline-none transition-colors duration-fast hover:bg-surface-raised-hover data-[state=open]:bg-surface-raised-hover"
              style={{ width: "calc(100% - 0.75rem)" }}
            >
              <span className="flex-1 truncate text-sm font-medium text-fg-primary">
                {workspaceName}
              </span>
              <ChevronsUpDown className="size-4 shrink-0 text-fg-tertiary" />
            </button>
          )}
        </DropdownMenuTrigger>

        <DropdownMenuContent
          side="bottom"
          align="start"
          sideOffset={4}
          className="w-60 border-0 bg-surface-card dark:bg-surface-raised-hover !animate-none"
        >
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <Avatar src={user.avatarUrl} fallback={userInitial} />
            <div className="min-w-0">
              <div className="truncate text-sm text-fg-primary">
                {user.displayName}
              </div>
              <div className="truncate text-xs text-fg-tertiary">
                {user.email}
              </div>
            </div>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setSettingsOpen(true)}
            className="cursor-pointer data-[highlighted]:bg-surface-raised-hover dark:data-[highlighted]:bg-fg-primary/10"
          >
            <Settings />
            {t("settings.settings")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={handleSignOut}
            className="cursor-pointer data-[highlighted]:bg-surface-raised-hover dark:data-[highlighted]:bg-fg-primary/10"
          >
            <LogOut />
            {t("settings.sign_out")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
