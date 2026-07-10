import { NemaMarkIcon } from "@web/components/ui/NemaMarkIcon";

interface SpaceEmptyStateProps {
  message: string;
}

export function SpaceEmptyState({ message }: SpaceEmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <NemaMarkIcon
        width={64}
        height={76}
        fill="currentColor"
        className="text-fg-primary opacity-[0.06] dark:opacity-[0.08]"
      />
      <p className="text-sm text-fg-tertiary">{message}</p>
    </div>
  );
}
