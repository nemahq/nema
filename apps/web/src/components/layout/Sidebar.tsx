import { createContext, type ReactNode, useContext, useState } from "react";
import { Link } from "@tanstack/react-router";

import {
  Button,
  cn,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@nema-io/weave";
import { PanelLeft } from "@nema-io/weave/icons";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import { SectionErrorFallback } from "@web/app/error/SectionErrorFallback";
import NemaLogo from "@web/assets/nema-logo.svg";
import { useRegisterAction } from "@web/lib/command/shortcut/useRegisterAction";
import { useTranslation } from "@web/lib/tolgee";
import { getStorage, setStorage } from "@web/utils/localStorage";

interface SidebarState {
  collapsed: boolean;
  toggle: () => void;
}

const SidebarContext = createContext<SidebarState>({
  collapsed: false,
  toggle: () => {},
});
export function useSidebar() {
  return useContext(SidebarContext);
}

const DEFAULT_LOGO = (
  <Link to="/">
    <img src={NemaLogo} alt="Nema" className="h-4 nema-logo" />
  </Link>
);

interface SidebarProps {
  logo?: ReactNode;
  // 펼침 상태에서만 숨긴다(접힘은 그 자리에 로고가 안 떠 토글이 계속 필요) — logo가
  // 자체적으로 토글을 품고 있는 소비자(useSidebar().toggle())를 위한 자리.
  hideToggle?: boolean;
  topSlot?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
}

export function Sidebar({
  logo = DEFAULT_LOGO,
  hideToggle = false,
  topSlot,
  children,
  footer,
}: SidebarProps) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(
    () => getStorage("sidebarCollapsed") === "true",
  );

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    setStorage("sidebarCollapsed", next ? "true" : "false");
  }

  useRegisterAction("sidebar.toggle", { execute: toggle });

  return (
    <SidebarContext value={{ collapsed, toggle }}>
      <aside
        className={cn(
          "flex h-full flex-col overflow-y-auto overscroll-none border-r border-border/50 bg-surface-raised dark:bg-surface-base",
          collapsed ? "w-12" : "w-64",
        )}
      >
        <div className="sticky top-0 z-10 bg-surface-raised dark:bg-surface-base">
          <div
            className={cn(
              "flex h-12 items-center",
              collapsed ? "justify-center" : "justify-between px-3",
            )}
          >
            {!collapsed && logo}
            {(collapsed || !hideToggle) && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    // 접힘 상태에서 LNB 아이템(size-7)과 크기를 맞춘다 — 펼침은 기존 icon-sm(size-8) 유지.
                    className={cn(collapsed && "size-7")}
                    onClick={toggle}
                    aria-label={t(
                      collapsed
                        ? "layout.expand_sidebar"
                        : "layout.collapse_sidebar",
                    )}
                  >
                    <PanelLeft
                      strokeWidth={1.5}
                      className={cn(collapsed && "rotate-180")}
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent
                  side={collapsed ? "right" : "bottom"}
                  sideOffset={collapsed ? 12 : 3}
                >
                  {t(
                    collapsed
                      ? "layout.expand_sidebar"
                      : "layout.collapse_sidebar",
                  )}
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          {topSlot}
        </div>

        <ErrorBoundary
          boundaryName="sidebar"
          fallbackRender={(props) => <SectionErrorFallback {...props} />}
        >
          <div className="flex-1">{children}</div>
        </ErrorBoundary>

        {footer && (
          <div
            className={cn(
              "sticky bottom-0 bg-surface-raised dark:bg-surface-base",
              !collapsed && "border-t border-border/50",
            )}
          >
            {footer}
          </div>
        )}
      </aside>
    </SidebarContext>
  );
}
