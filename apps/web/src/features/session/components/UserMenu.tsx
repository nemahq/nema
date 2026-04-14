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
import { LogOut } from "@nema-io/weave/icons";

import { useSidebar } from "@web/components/layout/Sidebar";
import { SettingsModal } from "@web/features/settings";
import { useAuth } from "@web/hooks/useAuth";
import { trackEvent } from "@web/lib/posthog/trackEvent";
import { supabase } from "@web/lib/supabase";
import { useTranslation } from "@web/lib/tolgee";
import { getDisplayName } from "@web/utils/user";

import { SettingsMenuItem } from "./SettingsMenuItem";

export function UserMenu() {
  const { collapsed } = useSidebar();
  const { user } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (!user) {
    return null;
  }

  const avatarUrl = user.user_metadata?.avatar_url as string | undefined;
  const name = getDisplayName(user);
  const initial = name.charAt(0).toUpperCase();

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
              className="flex w-full items-center justify-center py-2.5 cursor-pointer outline-none transition-opacity duration-fast hover:opacity-80 data-[state=open]:opacity-80"
            >
              <Avatar src={avatarUrl} fallback={initial} />
            </button>
          ) : (
            <button
              type="button"
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-md py-2.5 pl-2.5 pr-3 text-left transition-colors duration-fast outline-none hover:bg-surface-raised-hover data-[state=open]:bg-surface-raised-hover"
            >
              <Avatar src={avatarUrl} fallback={initial} />
              <span className="truncate text-sm text-fg-primary animate-in fade-in slide-in-from-left-2 duration-normal">
                {name}
              </span>
            </button>
          )}
        </DropdownMenuTrigger>

        <DropdownMenuContent
          side="top"
          align={collapsed ? "start" : "center"}
          alignOffset={collapsed ? 8 : 0}
          sideOffset={collapsed ? 2 : 4}
          className="w-60 border-0 bg-surface-card dark:bg-surface-raised-hover !animate-none"
        >
          <SettingsMenuItem onClick={() => setSettingsOpen(true)} />
          <DropdownMenuSeparator />
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
