import type { ReactNode } from "react";

interface SettingsRowProps {
  label: string;
  description?: string;
  htmlFor?: string;
  children: ReactNode;
}

export function SettingsRow({
  label,
  description,
  htmlFor,
  children,
}: SettingsRowProps) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-border py-4 first:pt-0 last:border-b-0 last:pb-0">
      <div className="flex flex-col gap-0.5 pr-4">
        {htmlFor ? (
          <label
            htmlFor={htmlFor}
            className="text-sm font-medium text-fg-primary"
          >
            {label}
          </label>
        ) : (
          <span className="text-sm font-medium text-fg-primary">{label}</span>
        )}
        {description && (
          <p className="text-xs text-fg-tertiary">{description}</p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
