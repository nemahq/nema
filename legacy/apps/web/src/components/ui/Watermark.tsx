import { NemaMarkIcon } from "./NemaMarkIcon";

export function Watermark() {
  return (
    <NemaMarkIcon
      width={64}
      height={76}
      fill="currentColor"
      className="text-fg-primary opacity-[0.06] [animation:fade-in_800ms_var(--ease-out)] dark:opacity-[0.08]"
    />
  );
}
