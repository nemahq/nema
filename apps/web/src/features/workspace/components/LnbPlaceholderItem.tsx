import { type ReactNode } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@nema-io/weave";

import { useSidebar } from "@web/components/layout/Sidebar";
import { useTranslation } from "@web/lib/tolgee";

interface LnbPlaceholderItemProps {
  icon: ReactNode;
  label: string;
}

// 진입점은 골격에 두되 대상 화면은 후속 슬라이스에서 붙는다 — 지금은 비활성 표시.
export function LnbPlaceholderItem({ icon, label }: LnbPlaceholderItemProps) {
  const { collapsed } = useSidebar();
  const { t } = useTranslation();

  if (collapsed) {
    return (
      <div className="flex justify-center py-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              aria-disabled
              className="flex size-8 cursor-default items-center justify-center rounded-lg text-fg-tertiary/60"
            >
              {icon}
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {label} · {t("workspace.coming_soon")}
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="px-1.5 py-0.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            aria-disabled
            className="flex h-8 w-full cursor-default items-center gap-1.5 rounded-lg px-2.5 text-xs text-fg-tertiary/60"
          >
            {icon}
            <span className="truncate">{label}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {t("workspace.coming_soon")}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
