import { PanelLeft } from "lucide-react";
import { type ReactNode, useState } from "react";

import { Button } from "@web/components/ui/button";
import { cn } from "@web/lib/tailwind/utils";
import { useTranslation } from "@web/lib/tolgee/index";
import { getStorage, setStorage } from "@web/utils/localStorage";

export function Sidebar({ children }: { children?: ReactNode }) {
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
        "flex h-full flex-col overflow-hidden border-r transition-[width] duration-200",
        collapsed ? "w-12" : "w-64",
      )}
    >
      <div className="flex h-12 items-center justify-end border-b px-2">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={toggle}
          aria-label={t(
            collapsed ? "layout.expand_sidebar" : "layout.collapse_sidebar",
          )}
        >
          <PanelLeft
            className={cn(
              "transition-transform duration-200",
              collapsed && "rotate-180",
            )}
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
    </aside>
  );
}
