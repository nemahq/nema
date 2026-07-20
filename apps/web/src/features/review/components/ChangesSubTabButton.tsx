import { Button, cn } from "@nema-io/weave";

interface ChangesSubTabButtonProps {
  active: boolean;
  onClick: () => void;
  children: string;
}

export function ChangesSubTabButton({
  active,
  onClick,
  children,
}: ChangesSubTabButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      onClick={onClick}
      className={cn(
        "font-medium",
        active
          ? "bg-surface-raised-hover text-fg-primary"
          : "text-fg-tertiary hover:text-fg-secondary",
      )}
    >
      {children}
    </Button>
  );
}
