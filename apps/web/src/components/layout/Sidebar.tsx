import { type ReactNode, useState } from "react";

import { Button, cn } from "@nema-io/weave";
import { PanelLeft } from "@nema-io/weave/icons";

import NemaLogo from "@web/assets/nema-logo.svg";
import { useTranslation } from "@web/lib/tolgee";
import { getStorage, setStorage } from "@web/utils/localStorage";

export function Sidebar({
  children,
  footer,
}: {
  children?: ReactNode;
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
          "flex h-12 items-center px-3",
          collapsed ? "justify-center" : "justify-between",
        )}
      >
        {!collapsed && (
          <img src={NemaLogo} alt="Nema" className="h-4 nema-logo" />
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

      <div
        className={cn(
          "flex flex-1 flex-col overflow-hidden",
          collapsed && "hidden",
        )}
      >
        {children}
      </div>

      {footer && (
        <div
          className={cn(
            collapsed
              ? "mt-auto flex justify-center pb-3"
              : "border-t border-border",
          )}
        >
          {footer(collapsed)}
        </div>
      )}
    </aside>
  );
}
