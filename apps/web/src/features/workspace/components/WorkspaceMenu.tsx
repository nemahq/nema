import { useRef, useState } from "react";
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

import { useSidebar } from "@web/components/layout/Sidebar";
import { SettingsModal } from "@web/features/settings";
import { useUser } from "@web/lib/auth";
import { trackEvent } from "@web/lib/posthog/trackEvent";
import { supabase } from "@web/lib/supabase";
import { useTranslation } from "@web/lib/tolgee";

interface WorkspaceMenuProps {
  workspaceName: string;
}

// Radix 트리거 폭은 토글 버튼을 뺀 스위처 버튼만 잰다 — wrapper 자체 px-1.5
// (12px)+gap-1(4px)+토글 버튼(p-1×2+size-4=24px)을 더해야 pill 전체 폭과 같아진다.
const DROPDOWN_TOGGLE_AREA_WIDTH_PX = 40;

export function WorkspaceMenu({ workspaceName }: WorkspaceMenuProps) {
  const { collapsed, toggle } = useSidebar();
  const user = useUser();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const closedViaEscapeRef = useRef(false);

  const userInitial = user.displayName.charAt(0).toUpperCase();
  const workspaceInitial = workspaceName.charAt(0).toUpperCase();

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
      // -6: 트리거 버튼(x=12)이 아니라 -mx-1.5로 넓어진 호버 배경 박스(x=6)에 맞춘다.
      alignOffset={collapsed ? 0 : -6}
      // 10: 배경 박스가 버튼보다 py-1.5(6px) 더 내려가 있어, 그 아래에 여유 4px를 더한다.
      sideOffset={collapsed ? 4 : 10}
      onEscapeKeyDown={() => {
        closedViaEscapeRef.current = true;
      }}
      onCloseAutoFocus={(event) => {
        // Radix는 닫힐 때 트리거에 포커스를 되돌리는데, 이 프로그래매틱 focus가
        // 마우스로 닫힌 모든 경우(바깥 클릭, 메뉴 아이템 클릭으로 다른 UI를 여는
        // 경우 포함)에 focus-visible 링이나 호버 배경 잔상을 남긴다 — 실제
        // 키보드로 닫은 경우(Escape)만 트리거 재포커스를 허용한다.
        if (!closedViaEscapeRef.current) {
          event.preventDefault();
        }
        closedViaEscapeRef.current = false;
      }}
      style={
        collapsed
          ? undefined
          : {
              width: `calc(var(--radix-dropdown-menu-trigger-width) + ${DROPDOWN_TOGGLE_AREA_WIDTH_PX}px)`,
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
  );

  return (
    <>
      {collapsed ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={workspaceName}
              className="flex w-full items-center justify-center rounded-md py-1 outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <span className="flex size-8 items-center justify-center rounded-md bg-surface-raised-hover text-sm font-medium text-fg-primary dark:bg-fg-primary/10">
                {workspaceInitial}
              </span>
            </button>
          </DropdownMenuTrigger>
          {accountContent}
        </DropdownMenu>
      ) : (
        // 스위처(드롭다운 트리거)와 접기 토글이 한 pill 안에 같이 산다 — 각자
        // 배경을 갖지 않고 이 wrapper의 hover 배경 하나를 공유해야 노션 웹처럼
        // 하나로 뭉쳐 보인다(따로 배경을 가지면 두 영역으로 쪼개져 보임).
        // -mx-1.5: 부모 헤더 row의 px-3을 상쇄해, 아래 LNB 아이템 행(px-1.5)과
        // 하이라이트 박스 좌우 인셋을 맞춘다.
        <div className="group/switcher -mx-1.5 flex min-w-0 flex-1 items-center gap-1 rounded-lg px-1.5 py-1.5 hover:bg-surface-raised-hover has-[[data-state=open]]:bg-surface-raised-hover">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                // 열림 상태는 위 wrapper의 has-[[data-state=open]] 배경이 pill 전체에
                // 이미 퍼져 있으니, 트리거 자체 포커스링은 열렸을 때만 지워 배경과
                // 안 겹치게 한다(닫힌 채 Tab으로 포커스됐을 땐 그대로 보임).
                className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-brand data-[state=open]:!ring-0"
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-surface-raised-hover text-xs font-medium text-fg-primary dark:bg-fg-primary/10">
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
          <button
            type="button"
            onClick={handleToggleSidebar}
            aria-label={t("layout.collapse_sidebar")}
            className="shrink-0 rounded-md p-1 opacity-0 outline-none transition-opacity duration-fast focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-brand group-hover/switcher:opacity-100"
          >
            <PanelLeft strokeWidth={1.5} className="size-4" />
          </button>
        </div>
      )}
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
