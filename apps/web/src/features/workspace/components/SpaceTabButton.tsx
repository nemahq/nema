import { cn } from "@nema-io/weave";

interface SpaceTabButtonProps {
  active: boolean;
  onClick: () => void;
  children: string;
}

export function SpaceTabButton({
  active,
  onClick,
  children,
}: SpaceTabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px border-b-2 px-3 py-2 text-sm transition-colors duration-fast",
        active
          ? "border-fg-primary font-medium text-fg-primary"
          : "border-transparent text-fg-tertiary hover:text-fg-secondary",
      )}
    >
      {children}
    </button>
  );
}
