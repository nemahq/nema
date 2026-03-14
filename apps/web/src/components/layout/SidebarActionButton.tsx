import { type ReactNode } from "react";

import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@nema-io/weave";

interface SidebarActionButtonProps {
  collapsed: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}

export function SidebarActionButton({
  collapsed,
  icon,
  label,
  onClick,
}: SidebarActionButtonProps) {
  if (collapsed) {
    return (
      <div className="flex justify-center py-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="flex size-9 items-center justify-center cursor-pointer rounded-md transition-colors duration-fast hover:bg-surface-raised-hover"
              onClick={onClick}
            >
              {icon}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {label}
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="px-1.5 py-2">
      <Button
        variant="ghost"
        className="w-full justify-start gap-2 pl-1.5 text-sm font-normal"
        onClick={onClick}
      >
        {icon}
        {label}
      </Button>
    </div>
  );
}
