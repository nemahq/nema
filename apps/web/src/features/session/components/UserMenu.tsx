import { useNavigate } from "@tanstack/react-router";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@nema-io/weave";
import { LogOut } from "@nema-io/weave/icons";

import { useAuth } from "@web/features/auth/hooks/useAuth";
import { supabase } from "@web/lib/supabase";
import { useTranslation } from "@web/lib/tolgee";

function Avatar({
  url,
  initial,
}: {
  url: string | undefined;
  initial: string;
}) {
  return url ? (
    <img
      src={url}
      alt=""
      className="size-7 shrink-0 rounded-full"
      referrerPolicy="no-referrer"
    />
  ) : (
    <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-medium text-brand-fg">
      {initial}
    </div>
  );
}

export function UserMenu({ collapsed }: { collapsed: boolean }) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (!user) return null;

  const avatarUrl = user.user_metadata?.avatar_url as string | undefined;
  const givenName = user.user_metadata?.given_name as string | undefined;
  const familyName = user.user_metadata?.family_name as string | undefined;
  const name =
    givenName && familyName
      ? `${givenName} ${familyName}`
      : (user.user_metadata?.full_name as string) || user.email || "";
  const initial = (givenName ?? name).charAt(0).toUpperCase();

  async function handleSignOut() {
    await supabase.auth.signOut();
    await navigate({ to: "/signin", search: { redirect: undefined } });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {collapsed ? (
          <button
            type="button"
            className="flex w-full items-center justify-center py-2.5 cursor-pointer outline-none transition-opacity duration-fast hover:opacity-80 data-[state=open]:opacity-80"
          >
            <Avatar url={avatarUrl} initial={initial} />
          </button>
        ) : (
          <button
            type="button"
            className="mx-1.5 my-1 flex w-[calc(100%-0.75rem)] cursor-pointer items-center gap-2.5 rounded-md px-3 py-2.5 text-left transition-colors duration-fast outline-none hover:bg-surface-raised-hover data-[state=open]:bg-surface-raised-hover"
          >
            <Avatar url={avatarUrl} initial={initial} />
            <span className="truncate text-sm font-semibold text-fg-primary animate-in fade-in slide-in-from-left-2 duration-normal">
              {name}
            </span>
          </button>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side="top"
        align={collapsed ? "start" : "center"}
        alignOffset={collapsed ? 8 : 0}
        sideOffset={collapsed ? 2 : 8}
        className="w-60 !animate-none"
      >
        <DropdownMenuItem
          onClick={handleSignOut}
          className="cursor-pointer data-[highlighted]:bg-surface-raised-hover"
        >
          <LogOut />
          {t("settings.sign_out")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
