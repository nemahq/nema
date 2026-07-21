import * as React from "react";

import { cn } from "../utils";

type TextSize = "xs" | "sm" | "base" | "lg" | "2xl" | "3xl";
type TextColor =
  | "primary"
  | "secondary"
  | "tertiary"
  | "quaternary"
  | "brand"
  | "success"
  | "warning"
  | "error"
  | "info";

const sizeClasses: Record<TextSize, string> = {
  xs: "text-[11px] leading-[1.4]",
  sm: "text-[13px] leading-[1.5]",
  base: "text-[15px] leading-[1.7]",
  lg: "text-[18px] leading-[1.4]",
  "2xl": "text-[24px] leading-[1.35]",
  "3xl": "text-[32px] leading-[1.3]",
};

const colorClasses: Record<TextColor, string> = {
  primary: "text-fg-primary",
  secondary: "text-fg-secondary",
  tertiary: "text-fg-tertiary",
  quaternary: "text-fg-quaternary",
  brand: "text-brand-accent",
  success: "text-status-success",
  warning: "text-status-warning",
  error: "text-status-error",
  info: "text-status-info",
};

type TextProps<T extends React.ElementType = "p"> = {
  as?: T;
  size?: TextSize;
  bold?: boolean;
  color?: TextColor;
} & Omit<React.ComponentPropsWithRef<T>, "as" | "color">;

function Text<T extends React.ElementType = "p">({
  as,
  size = "base",
  bold = false,
  color = "primary",
  className,
  ...props
}: TextProps<T>) {
  const Comp = as ?? "p";

  return (
    <Comp
      data-slot="text"
      className={cn(
        sizeClasses[size],
        colorClasses[color],
        bold && "font-bold",
        className,
      )}
      {...props}
    />
  );
}

export { Text, type TextColor, type TextProps, type TextSize };
