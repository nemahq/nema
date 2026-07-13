import { NemaMarkIcon } from "@web/components/ui/NemaMarkIcon";

export function SpaceEmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <NemaMarkIcon
        width={64}
        height={76}
        fill="currentColor"
        className="text-fg-primary opacity-[0.06] dark:opacity-[0.08]"
      />
    </div>
  );
}
