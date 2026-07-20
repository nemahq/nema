import { Button, cn } from "@nema-io/weave";

interface ChangesetSubTabButtonProps {
  active: boolean;
  onClick: () => void;
  children: string;
}

export function ChangesetSubTabButton({
  active,
  onClick,
  children,
}: ChangesetSubTabButtonProps) {
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
