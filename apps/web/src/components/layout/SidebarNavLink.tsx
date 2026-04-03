import { type ReactNode } from "react";
import { Link, type LinkProps } from "@tanstack/react-router";

import { Tooltip, TooltipContent, TooltipTrigger } from "@nema-io/weave";

import { useSidebar } from "./Sidebar";

interface SidebarNavLinkProps {
  icon: ReactNode;
  label: string;
  to: LinkProps["to"];
  showActive?: boolean;
}

export function SidebarNavLink({
  icon,
  label,
  to,
  showActive = true,
}: SidebarNavLinkProps) {
  const { collapsed } = useSidebar();
  const activeProps = showActive
    ? { className: "bg-surface-raised-hover font-medium" }
    : undefined;

  if (collapsed) {
    return (
      <div className="flex justify-center py-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              to={to}
              aria-label={label}
              className="flex size-9 items-center justify-center rounded-md transition-colors duration-fast hover:bg-surface-raised-hover"
              activeProps={activeProps}
            >
              {icon}
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {label}
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="px-1.5 py-0.5">
      <Link
        to={to}
        className="flex h-9 w-full items-center gap-2 rounded-md px-1.5 text-sm font-normal transition-colors duration-fast hover:bg-surface-raised-hover"
        activeProps={activeProps}
      >
        {icon}
        {label}
      </Link>
    </div>
  );
}
