import { type ReactNode, useState } from "react";

import { Link } from "@tanstack/react-router";

import { Button, cn } from "@nema-io/weave";
import { PanelLeft } from "@nema-io/weave/icons";

import NemaLogo from "@web/assets/nema-logo.svg";
import { useTranslation } from "@web/lib/tolgee";
import { getStorage, setStorage } from "@web/utils/localStorage";

export function Sidebar({
  children,
  footer,
}: {
  children?: ReactNode | ((collapsed: boolean) => ReactNode);
  footer?: (collapsed: boolean) => ReactNode;
}) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(
    () => getStorage("sidebarCollapsed") === "true",
  );

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    setStorage("sidebarCollapsed", next ? "true" : "false");
  }

  return (
    <aside
      className={cn(
        "flex h-full flex-col overflow-hidden bg-surface-raised dark:bg-surface-base",
        collapsed ? "w-12" : "w-64",
      )}
    >
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

      <div className="flex flex-1 flex-col overflow-hidden">
        {typeof children === "function" ? children(collapsed) : children}
      </div>

      {footer && (
        <div
          className={cn(
            collapsed
              ? "mt-auto"
              : "border-t border-border/50",
          )}
        >
          {footer(collapsed)}
        </div>
      )}
    </aside>
  );
}
