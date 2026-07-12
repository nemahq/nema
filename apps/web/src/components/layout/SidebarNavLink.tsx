import { type ReactNode } from "react";
import { Link, type LinkProps } from "@tanstack/react-router";

import { Tooltip, TooltipContent, TooltipTrigger } from "@nema-io/weave";

import { useSidebar } from "./Sidebar";

interface SidebarNavLinkProps {
  icon: ReactNode;
  label: string;
  to: LinkProps["to"];
  params?: LinkProps["params"];
  showActive?: boolean;
  activeOptions?: LinkProps["activeOptions"];
}

export function SidebarNavLink({
  icon,
  label,
  to,
  params,
  showActive = true,
  activeOptions,
}: SidebarNavLinkProps) {
  const { collapsed } = useSidebar();
  const activeProps = showActive
    ? { className: "bg-surface-raised-hover/75 font-medium" }
    : undefined;

  if (collapsed) {
    return (
      <div className="flex justify-center py-px">
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              to={to}
              params={params}
              aria-label={label}
              className="flex size-7 items-center justify-center rounded-lg transition-colors duration-fast hover:bg-surface-raised-hover/75"
              activeProps={activeProps}
              activeOptions={activeOptions}
            >
              {icon}
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={12}>
            {label}
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="px-2 py-px">
      <Link
        to={to}
        params={params}
        className="flex h-7 w-full items-center gap-1.5 rounded-lg px-2.5 text-xs font-normal transition-colors duration-fast hover:bg-surface-raised-hover/75"
        activeProps={activeProps}
        activeOptions={activeOptions}
      >
        {icon}
        {label}
      </Link>
    </div>
  );
}
