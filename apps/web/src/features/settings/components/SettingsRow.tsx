import type { ReactNode } from "react";

import { cn, Text } from "@nema-io/weave";

interface SettingsRowProps {
  label: string;
  description?: string;
  htmlFor?: string;
  // 서로 붙어있어야 할 관련 행 쌍(예: App/Content language) 사이에선 false로 끈다.
  divider?: boolean;
  children: ReactNode;
}

export function SettingsRow({
  label,
  description,
  htmlFor,
  divider = true,
  children,
}: SettingsRowProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-6 py-4 first:pt-0 last:pb-0",
        divider && "border-b border-border last:border-b-0",
      )}
    >
      <div className="flex flex-col gap-0.5 pr-4">
        {htmlFor ? (
          <Text as="label" htmlFor={htmlFor} size="base" weight="medium">
            {label}
          </Text>
        ) : (
          <Text as="span" size="base" weight="medium">
            {label}
          </Text>
        )}
        {description && (
          <Text size="sm" color="tertiary">
            {description}
          </Text>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
