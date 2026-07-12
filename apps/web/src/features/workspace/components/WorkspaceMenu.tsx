import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  Avatar,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@nema-io/weave";
import { ChevronDown, LogOut, PanelLeft, Settings } from "@nema-io/weave/icons";

import { LnbHoverIcon } from "@web/components/layout/LnbHoverIcon";
import { useSidebar } from "@web/components/layout/Sidebar";
import { SettingsModal } from "@web/features/settings";
import { getWorkspaceAvatarColorClass } from "@web/features/workspace/workspaceAvatarColor";
import { useUser } from "@web/lib/auth";
import { trackEvent } from "@web/lib/posthog/trackEvent";
import { supabase } from "@web/lib/supabase";
import { useTranslation } from "@web/lib/tolgee";

interface WorkspaceMenuProps {
  workspaceId: string;
  workspaceName: string;
}

// 트리거는 pill의 px-1.5(6px×2) 안쪽 컨텐츠 폭만 재므로, 드롭다운이 pill
// 배경 박스 전체 폭과 같아지려면 그만큼 더해야 한다.
const PILL_HORIZONTAL_PADDING_PX = 12;

export function WorkspaceMenu({
  workspaceId,
  workspaceName,
}: WorkspaceMenuProps) {
  const { collapsed, toggle } = useSidebar();
  const user = useUser();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const userInitial = user.displayName.charAt(0).toUpperCase();
  const workspaceInitial = workspaceName.charAt(0).toUpperCase();
  const avatarColorClass = getWorkspaceAvatarColorClass(workspaceId);

  async function handleSignOut() {
    trackEvent("auth.signout");
    await supabase.auth.signOut();
    await navigate({ to: "/signin", search: { redirect: undefined } });
  }

  function handleToggleSidebar() {
    trackEvent("sidebar.toggle");
    toggle();
  }

  const accountContent = (
    <DropdownMenuContent
      side="bottom"
      align="start"
      // 접힘: 버튼 자체가 아바타 크기(size-7)라 트리거 모서리=아바타 모서리, 보정 불필요.
      // -6(펼침): 트리거 버튼이 아니라 -mx-1로 넓어진 호버 배경 박스에 맞춘다 —
      // 배경 박스와 트리거 사이 거리(pill 내부 px-1.5=6px)는 -mx 값과 무관하게
      // 고정이라 오프셋도 항상 -6으로 고정.
      alignOffset={collapsed ? 0 : -6}
      // 트리거 버튼이 이제 pill과 같은 높이(h-8)라 배경 박스 모서리 = 버튼 모서리 —
      // 접힘·펼침 모두 보정 없이 여유 4px만 둔다.
      sideOffset={4}
      style={
        collapsed
          ? undefined
          : {
              width: `calc(var(--radix-dropdown-menu-trigger-width) + ${PILL_HORIZONTAL_PADDING_PX}px)`,
            }
      }
      className={cn(
        "border-0 bg-surface-card dark:bg-surface-raised-hover !animate-none",
        collapsed && "w-60",
      )}
    >
      <div className="flex items-center gap-2.5 px-2 py-1.5">
        <Avatar src={user.avatarUrl} fallback={userInitial} />
        <div className="min-w-0">
          <div className="truncate text-sm text-fg-primary">
            {user.displayName}
          </div>
          <div className="truncate text-xs text-fg-tertiary">{user.email}</div>
        </div>
      </div>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onClick={() => setSettingsOpen(true)}
        className="cursor-pointer data-[highlighted]:bg-surface-raised-hover/75 dark:data-[highlighted]:bg-fg-primary/10"
      >
        <Settings />
        {t("settings.settings")}
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={handleSignOut}
        className="cursor-pointer data-[highlighted]:bg-surface-raised-hover/75 dark:data-[highlighted]:bg-fg-primary/10"
      >
        <LogOut />
        {t("settings.sign_out")}
      </DropdownMenuItem>
    </DropdownMenuContent>
  );

  return (
    <>
      {collapsed ? (
        // 버튼을 다른 접힘 LNB 아이템과 같은 크기(size-7)로 맞춰 포커스 링이 아바타를 꽉 감싸게 한다.
        <div className="flex justify-center py-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={workspaceName}
                className={cn(
                  "flex size-7 items-center justify-center rounded-md text-sm font-medium text-white",
                  avatarColorClass,
                )}
              >
                {workspaceInitial}
              </button>
            </DropdownMenuTrigger>
            {accountContent}
          </DropdownMenu>
        </div>
      ) : (
        // 트리거 클릭/포커스 영역이 접기 토글 자리까지 포함한 pill 전체다 — 토글은
        // 그 위에 겹쳐진 절대 위치 아이콘(SpaceItemMenu "..."와 동일 패턴)이라
        // 트리거의 pr-8이 토글 자리만큼 공간을 비워둔다.
        // -mx-1: 부모 헤더 row의 px-3을 상쇄해, 아래 LNB 아이템 행(px-2)과
        // 하이라이트 박스 좌우 인셋을 맞춘다.
        <div className="group/switcher relative -mx-1 flex min-w-0 flex-1 items-center rounded-lg px-1.5 hover:bg-surface-raised-hover/75 has-[[data-state=open]]:bg-surface-raised-hover/75 has-[:focus-visible]:bg-surface-raised-hover/75">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                // 열림 상태는 위 wrapper의 has-[[data-state=open]] 배경이 pill 전체에
                // 이미 퍼져 있으니, 트리거 자체 포커스 아웃라인은 열렸을 때만 지워
                // 배경과 안 겹치게 한다(닫힌 채 Tab으로 포커스됐을 땐 그대로 보임).
                className="flex h-8 w-full min-w-0 items-center gap-1.5 rounded-md pr-8 text-left data-[state=open]:focus-visible:outline-none"
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-medium text-white",
                    avatarColorClass,
                  )}
                >
                  {workspaceInitial}
                </span>
                <span className="min-w-0 truncate text-sm font-medium text-fg-primary">
                  {workspaceName}
                </span>
                <ChevronDown className="size-3.5 shrink-0 text-fg-tertiary" />
              </button>
            </DropdownMenuTrigger>
            {accountContent}
          </DropdownMenu>
          <LnbHoverIcon
            onClick={handleToggleSidebar}
            aria-label={t("layout.collapse_sidebar")}
            className="absolute right-2.5 group-hover/switcher:opacity-100"
          >
            <PanelLeft strokeWidth={1.5} className="size-4" />
          </LnbHoverIcon>
        </div>
      )}
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
