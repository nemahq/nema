import { createContext, type ReactNode, useContext, useState } from "react";
import { Link } from "@tanstack/react-router";

import { Button, cn } from "@nema-io/weave";
import { PanelLeft } from "@nema-io/weave/icons";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import { SectionErrorFallback } from "@web/app/error/SectionErrorFallback";
import NemaLogo from "@web/assets/nema-logo.svg";
import { useRegisterAction } from "@web/lib/command/shortcut/useRegisterAction";
import { useTranslation } from "@web/lib/tolgee";
import { getStorage, setStorage } from "@web/utils/localStorage";

interface SidebarState {
  collapsed: boolean;
}

const SidebarContext = createContext<SidebarState>({ collapsed: false });
export function useSidebar() {
  return useContext(SidebarContext);
}

interface SidebarProps {
  topSlot?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
}

export function Sidebar({ topSlot, children, footer }: SidebarProps) {
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
    <SidebarContext value={{ collapsed }}>
      <aside
        className={cn(
          "flex h-full flex-col overflow-y-auto border-r border-border/50 bg-surface-raised [scrollbar-width:thin] [scrollbar-color:var(--color-border)_transparent] dark:bg-surface-base",
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
            {!collapsed && (
              <Link to="/">
                <img src={NemaLogo} alt="Nema" className="h-4 nema-logo" />
              </Link>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={toggle}
              aria-label={t(
                collapsed ? "layout.expand_sidebar" : "layout.collapse_sidebar",
              )}
            >
              <PanelLeft
                strokeWidth={1.5}
                className={cn(collapsed && "rotate-180")}
              />
            </Button>
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
